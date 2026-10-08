// Who is signed in, for every dashboard page and API.
// - The sign-in page posts the password (the owner's DASH_KEY or a person's own key) once. The server answers with a session
//   cookie (HttpOnly, Secure, SameSite=Lax) and the key never appears in a page address again. Only a SHA-256 of the cookie's
//   token is stored (table sessions). A removed person, a changed role or a new DASH_KEY take effect on the next request.
// - An old link with ?key=... still works: the server signs the person in, sets the cookie and sends the browser to the same
//   page without the key (so it leaves the address bar and the browser history).
// - Scripts and tools may send the key itself (Authorization: Bearer <key>, or ?key= on an API or export address): that request
//   carries its own proof, so it needs no CSRF token, and no session is made.
// - Every change made with a cookie (POST) must carry the session's CSRF token (header X-CSRF-Token or form field csrf), and its
//   Origin, when the browser sends one, must be this server.
const ROLES = { editor: 'Editor', viewer: 'Viewer' }; // the owner is not a row in "people": it is DASH_KEY
export const ROLE_NAMES = ROLES;
const SESSION_HOURS = 12, REMEMBER_DAYS = 14, LINK_DAYS = 14;
const FAIL_LIMIT = 30; // wrong passwords per 10 minutes, all people together (keys are 256-bit random, so this is extra insurance)
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const rand = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// compares two strings of the same length without stopping at the first difference
export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const nowMs = (env) => (env && Number.isFinite(+env.AUTH_NOW) && +env.AUTH_NOW > 0 ? +env.AUTH_NOW : Date.now());
const ownerFp = async (env) => (await sha256('owner-session:' + String(env.DASH_KEY || '').trim())).slice(0, 16);

// the person a key belongs to, or null
export async function keyPerson(env, key) {
  key = String(key || '').trim(); // a pasted password often carries a space or line break
  if (!key || key.length > 200) return null;
  const h = await sha256(key);
  // hashes are always 64 characters, so comparing them takes the same time whatever the key is
  if (env.DASH_KEY && sameText(h, await sha256(String(env.DASH_KEY).trim()))) return { id: 0, name: 'Owner', role: 'owner' };
  let row;
  try { row = await env.DB.prepare('SELECT id, name, role, key_hash, last_used FROM people WHERE key_hash = ? AND revoked = 0').bind(h).first(); }
  catch { return null; } // the people table is not made yet: only the owner can sign in
  if (!row || !sameText(row.key_hash, h) || !ROLES[row.role]) return null;
  const now = nowMs(env);
  if (!row.last_used || now - row.last_used > 60_000) { // at most one write a minute per person
    try { await env.DB.prepare('UPDATE people SET last_used = ? WHERE id = ?').bind(now, row.id).run(); } catch {}
  }
  return { id: row.id, name: row.name, role: row.role };
}

export function cookieName(url) { return url.protocol === 'https:' ? '__Host-sehat' : 'sehat'; }
function readCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  for (const part of c.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1); }
  return null;
}
export const langCookie = (req) => readCookie(req, 'sehat_lang');
// plain http is only allowed for a test server on this computer; the live server is always https
const secureFlag = (url) => (url.protocol === 'https:' ? '; Secure' : '');
export function setLangCookie(url, lang) { return `sehat_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag(url)}`; }

// make a session for this person; returns { cookie, csrf, sid }
export async function startSession(env, url, person, method, remember) {
  const token = rand(32), idHash = await sha256(token), csrf = rand(24), now = nowMs(env);
  const life = method === 'link' ? LINK_DAYS * 864e5 : remember ? REMEMBER_DAYS * 864e5 : SESSION_HOURS * 3600e3;
  await env.DB.prepare('INSERT INTO sessions (id_hash, person_id, owner_fp, csrf, method, created, last_seen, expires, ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
    .bind(idHash, person.id, person.role === 'owner' ? await ownerFp(env) : null, csrf, method, now, now, now + life).run();
  const keep = method === 'link' || remember ? `; Max-Age=${Math.floor(life / 1000)}` : '';
  return { cookie: `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag(url)}${keep}`, csrf, sid: idHash.slice(0, 12) };
}
export function clearCookie(url) { return `${cookieName(url)}=; Path=/; HttpOnly; SameSite=Lax${secureFlag(url)}; Max-Age=0`; }

// the session in this request's cookie, checked against the person's current access; null when there is none
export async function fromCookie(req, env, url) {
  const token = readCookie(req, cookieName(url));
  if (!token || token.length > 100) return null;
  const idHash = await sha256(token), now = nowMs(env);
  let s;
  try {
    s = await env.DB.prepare(`SELECT s.id_hash, s.person_id, s.owner_fp, s.csrf, s.expires, s.last_seen, s.ended, p.name, p.role, p.revoked
      FROM sessions s LEFT JOIN people p ON p.id = s.person_id AND s.person_id > 0 WHERE s.id_hash = ?`).bind(idHash).first();
  } catch { return null; } // the sessions table is not made yet
  if (!s || !sameText(s.id_hash, idHash) || s.ended || !(s.expires > now)) return null;
  let me;
  if (s.person_id === 0) {
    if (!env.DASH_KEY || !sameText(String(s.owner_fp || ''), await ownerFp(env))) return null; // DASH_KEY was changed
    me = { id: 0, name: 'Owner', role: 'owner' };
  } else {
    if (!s.name || s.revoked || !ROLES[s.role]) return null;
    me = { id: s.person_id, name: s.name, role: s.role };
  }
  if (!s.last_seen || now - s.last_seen > 5 * 60_000) { // at most one write every 5 minutes
    try { await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').bind(now, idHash).run(); } catch {}
  }
  return { me, csrf: s.csrf, sid: idHash.slice(0, 12), idHash };
}
export async function endSession(env, idHash) {
  try { await env.DB.prepare('UPDATE sessions SET ended = ? WHERE id_hash = ?').bind(nowMs(env), idHash).run(); } catch {}
}
// end every open sign-in of one person (access removed)
export async function endSessionsOf(env, personId) {
  try { await env.DB.prepare('UPDATE sessions SET ended = ? WHERE person_id = ? AND ended IS NULL').bind(nowMs(env), personId).run(); } catch {}
}

// a change sent from a page must come from this server's own page and carry the session's token
export function sameOrigin(req, url) {
  const o = req.headers.get('Origin');
  if (o && o !== url.origin) return false;
  const site = req.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}
export async function csrfOk(req, url, csrf) {
  if (!sameOrigin(req, url)) return false;
  let tok = req.headers.get('X-CSRF-Token');
  if (!tok) {
    const type = req.headers.get('Content-Type') || '';
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      try { const f = await req.clone().formData(); tok = f.get('csrf'); } catch { tok = null; }
    }
  }
  return typeof tok === 'string' && sameText(tok, csrf);
}

// wrong passwords: a count per 10 minutes for everyone together (no address or id is kept)
const failKey = (now) => 'signin:' + new Date(now).toISOString().slice(0, 15); // e.g. signin:2026-10-08T10:3
export async function tooManyFails(env) {
  try { const r = await env.DB.prepare('SELECT n FROM limits_daily WHERE k = ?').bind(failKey(nowMs(env))).first(); return !!r && +r.n >= FAIL_LIMIT; } catch { return false; }
}
export async function noteFail(env) {
  try { await env.DB.prepare('INSERT INTO limits_daily (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1').bind(failKey(nowMs(env))).run(); } catch {}
}
// a "next" address after sign-in: only our own pages
export function safeNext(next) {
  const s = String(next || '');
  return /^\/(?!\/)[A-Za-z0-9/_.-]*(?:\?[A-Za-z0-9=&%_.:+-]*)?$/.test(s) && !s.startsWith('/signin') && !s.startsWith('/signout') ? s : '/dashboard';
}
export function newKey() { return rand(32); } // 256 random bits
