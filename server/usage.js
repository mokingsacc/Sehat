// Usage counts v2 for the Sehat worker: what people use the app for, and where, without an install id.
// Phones add up their own day (seconds on screen, opens and audio plays per page) and send each finished day once
// to POST /u. Installs are counted by a one-time POST /i that carries no id. Old app versions still post raw events
// to /e: they are folded into the same daily totals here and nothing else is kept (no install id, no typed text).
// The dashboard shows totals by section, page and district; any cell built from fewer than 5 phone-days shows "<5".
// The daily cron (wrangler.toml [triggers]) deletes voice notes after 90 days and old raw events after 12 months.
import DEFS from './usage-defs.js';
import { DEFS as SDEFS } from './surveillance.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const DAY = 864e5;
export const MIN_CELL = 5; // fewer phone-days than this: shown as "<5"
export const AUDIO_DAYS = 90, RAW_DAYS = 365, SEEN_DAYS = 7;
const MAX_BODY = 16_000, MAX_PAGES = 80, MAX_SECS = 86_400, MAX_OPENS = 1000, MAX_PLAYS = 5000, MAX_AGE_DAYS = 62;
const PAGE_RE = /^(?:_day|[a-z0-9-]{1,30}(?:\/[a-z0-9-]{1,40}){0,2})$/;
const VER_RE = /^[0-9A-Za-z._-]{1,40}$/, CV_RE = /^[0-9A-Za-z._-]{1,20}$/, NONCE_RE = /^[A-Za-z0-9-]{16,40}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANGS = new Set(['fa', 'ps', 'en']), PLATS = new Set(['android', 'ios', 'other']);
const U_KEYS = new Set(['n', 'day', 'd', 'lang', 'v', 'plat', 'sa', 'cv', 'pages']);
const I_KEYS = new Set(['v', 'lang', 'plat', 'sa']);
export const PLACES = new Map(SDEFS.places.map((p) => [p.id, p]));

const nowMs = (env) => (env && Number.isFinite(+env.USAGE_NOW) && +env.USAGE_NOW > 0 ? +env.USAGE_NOW : Date.now());
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const reply = (status, o) => new Response(typeof o === 'string' ? o : JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': typeof o === 'string' ? 'text/plain' : 'application/json; charset=utf-8' } });
const changes = (r) => (!r ? 1 : r.meta && Number.isFinite(r.meta.changes) ? r.meta.changes : Number.isFinite(r.changes) ? r.changes : 1);
async function readJson(req, max) {
  try { const txt = await req.text(); if (txt.length > max) return null; return JSON.parse(txt); } catch { return null; }
}
function validDay(day, now) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z'); if (!Number.isFinite(t) || dayOf(t) !== day) return false;
  return t >= Date.parse(dayOf(now - MAX_AGE_DAYS * DAY) + 'T00:00:00Z') && t <= now + DAY;
}

/* ---------------- sections of the book: which group each page belongs to ---------------- */
// Same rule in JS (groupOf) and in SQL (GRP_SQL); tests check they agree.
const URGENT = [...new Set(DEFS.urgent || [])];
const SECS = DEFS.sections || {};
const KIT = SECS.kit || [];
const TOPIC_SEC = new Map();
for (const sec of ['children', 'women', 'everyone']) for (const t of SECS[sec] || []) if (!TOPIC_SEC.has(t)) TOPIC_SEC.set(t, sec);
const TOOL_PAGES = ['family', 'ask', 'near', 'kit', 'breaths', 'growth'], TOOL_PREFIX = ['tool', 'reading', 'kit', 'growth'];
const APP_PAGES = ['home', 'children', 'adults', 'settings', 'feedback', 'privacy', 'consent', 'welcome', 'voice', 'studio', 'share'];
export const GROUPS = [
  ['emergencies', 'Emergencies and danger signs'], ['children', 'Children'], ['women', 'Women and pregnancy'], ['everyone', 'Everyone (adults)'],
  ['tools', 'Tools (family record, search, clinic map, home kit)'], ['app', 'Home, menus and settings'], ['other', 'Other pages'],
];
const GROUP_NAME = Object.fromEntries(GROUPS);
export function groupOf(page) {
  if (page === '_day') return '_day';
  if (page.startsWith('act/')) return 'actions';
  if (page.startsWith('topic/')) { const t = page.slice(6); return URGENT.includes(t) ? 'emergencies' : KIT.includes(t) ? 'tools' : TOPIC_SEC.get(t) || 'other'; }
  const head = page.split('/')[0];
  if (head === 'emergency') return 'emergencies'; // the Emergency screen and its age lists
  if (TOOL_PAGES.includes(page) || (page.includes('/') && TOOL_PREFIX.includes(head))) return 'tools';
  return APP_PAGES.includes(head) ? 'app' : 'other';
}
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const inList = (a) => (a.length ? a.map(sq).join(', ') : "''");
const TOPIC_OF = "substr(page, 7)", HEAD = "(CASE WHEN instr(page, '/') > 0 THEN substr(page, 1, instr(page, '/') - 1) ELSE page END)";
const secList = (sec) => [...TOPIC_SEC].filter(([, s]) => s === sec).map(([t]) => t);
export const GRP_SQL = `(CASE WHEN page = '_day' THEN '_day' WHEN substr(page, 1, 4) = 'act/' THEN 'actions'
  WHEN substr(page, 1, 6) = 'topic/' THEN (CASE WHEN ${TOPIC_OF} IN (${inList(URGENT)}) THEN 'emergencies' WHEN ${TOPIC_OF} IN (${inList(KIT)}) THEN 'tools'
    WHEN ${TOPIC_OF} IN (${inList(secList('children'))}) THEN 'children' WHEN ${TOPIC_OF} IN (${inList(secList('women'))}) THEN 'women'
    WHEN ${TOPIC_OF} IN (${inList(secList('everyone'))}) THEN 'everyone' ELSE 'other' END)
  WHEN ${HEAD} = 'emergency' THEN 'emergencies'
  WHEN page IN (${inList(TOOL_PAGES)}) OR (instr(page, '/') > 0 AND ${HEAD} IN (${inList(TOOL_PREFIX)})) THEN 'tools'
  WHEN ${HEAD} IN (${inList(APP_PAGES)}) THEN 'app' ELSE 'other' END)`;

const APP_NAMES = {
  home: 'Home', children: 'Children: list of topics', adults: 'Adults: list of topics', family: 'My family: vaccine card and weights', ask: 'Ask: symptom search',
  emergency: 'Emergency button: who needs help?', 'emergency/newborn': 'Emergency: newborn', 'emergency/baby': 'Emergency: baby under 1', 'emergency/child': 'Emergency: child', 'emergency/adult': 'Emergency: adult or teenager',
  near: 'Nearest clinic and map', kit: 'Home health kit', breaths: 'Breathing counter', 'tool/breaths': 'Breathing counter', settings: 'Settings', feedback: 'Send feedback', privacy: 'Privacy page',
  consent: 'First-open question about counts', welcome: 'Choose language', voice: 'Choose voice', studio: 'Recording studio',
  growth: 'Growth tracker: charts', 'growth/add': 'Growth tracker: add a measurement', 'growth/result': 'Growth tracker: result', 'growth/measure': 'How to measure at home', share: 'Share Sehat',
};
const ACT_NAMES = {
  'act/share': 'Shared the app link', 'act/sendapp': 'Sent the app file', 'act/a2hs': 'Added to home screen', 'act/kid': 'Added a child', 'act/dose': 'Marked a vaccine given',
  'act/tool-share-nearby': 'Sent the app file: nearby phones', 'act/tool-share-whatsapp': 'Sent the app file: WhatsApp', 'act/tool-share-telegram': 'Sent the app file: Telegram', 'act/tool-share-imo': 'Sent the app file: IMO',
  'act/tool-share-messenger': 'Sent the app file: Messenger', 'act/tool-share-other': 'Sent the app file: other app', 'act/tool-share-link': 'Shared the link', 'act/tool-share-copy': 'Copied the link',
  'act/tool-growth-add': 'Added a growth measurement',
  'act/feedback': 'Sent feedback', 'act/near': 'Found their place for the clinic list', 'act/voice': 'Changed voice', 'act/lang': 'Changed language',
};
export function pageName(p) {
  if (p.startsWith('topic/')) return (DEFS.titles && DEFS.titles[p.slice(6)]) || p.slice(6);
  if (APP_NAMES[p] || ACT_NAMES[p]) return APP_NAMES[p] || ACT_NAMES[p];
  const m = /^(?:tool\/)?reading\/([a-z0-9-]+)$/.exec(p); if (m) return 'Reading: ' + m[1];
  return p;
}
export const placeName = (id) => (id === 'none' ? 'Not chosen' : (PLACES.get(id) || {}).en || id);

/* ---------------- flood protection: at most N posts a minute to /u, /i and /e together ---------------- */
async function underLimit(env, now) {
  const lim = +env.USAGE_MAX_PER_MIN > 0 ? +env.USAGE_MAX_PER_MIN : 600;
  const r = await env.DB.prepare('INSERT INTO usage_rate (bucket, n) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET n = n + 1 RETURNING n').bind(Math.floor(now / 60000)).first();
  return !r || r.n <= lim;
}
const UPSERT = `INSERT INTO usage_daily (day, district, lang, platform, version, cv, page, seconds, opens, plays, search_opens, devices, standalone)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, district, lang, platform, version, cv, page) DO UPDATE SET
  seconds = seconds + excluded.seconds, opens = opens + excluded.opens, plays = plays + excluded.plays, search_opens = search_opens + excluded.search_opens,
  devices = devices + excluded.devices, standalone = standalone + excluded.standalone`;
const INSTALL = `INSERT INTO installs_daily (day, lang, platform, version, n, standalone) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(day, lang, platform, version) DO UPDATE SET n = n + excluded.n, standalone = standalone + excluded.standalone`;

/* ---------------- POST /u: one finished day from one phone ---------------- */
// Body: {n, day, d, lang, v, plat, sa, cv, pages: {"<page id>": [seconds, opens, plays, opened from search]}}
// n is a random id for this upload only (a resend after a lost answer is not counted twice); it is not stored with the counts.
export function checkUpload(b, now) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'not an object';
  for (const k of Object.keys(b)) if (!U_KEYS.has(k)) return 'unexpected field'; // nothing else (no free text, no id) can slip in
  if (b.n != null && (typeof b.n !== 'string' || !NONCE_RE.test(b.n))) return 'bad upload id';
  if (!validDay(b.day, now)) return 'bad day';
  if (b.d != null && b.d !== 'none' && !(typeof b.d === 'string' && PLACES.has(b.d))) return 'unknown district';
  if (!LANGS.has(b.lang)) return 'bad language';
  if (typeof b.v !== 'string' || !VER_RE.test(b.v)) return 'bad version';
  if (!PLATS.has(b.plat)) return 'bad platform';
  if (typeof b.sa !== 'boolean') return 'bad standalone';
  if (typeof b.cv !== 'string' || !CV_RE.test(b.cv)) return 'bad consent version';
  if (!b.pages || typeof b.pages !== 'object' || Array.isArray(b.pages)) return 'no pages';
  const ids = Object.keys(b.pages);
  if (!ids.length || ids.length > MAX_PAGES) return 'bad number of pages';
  let total = 0;
  for (const id of ids) {
    if (!PAGE_RE.test(id)) return 'bad page id';
    const v = b.pages[id];
    if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => Number.isInteger(x) && x >= 0)) return 'bad counts';
    if (v[0] > MAX_SECS || v[1] > MAX_OPENS || v[2] > MAX_PLAYS || v[3] > v[1]) return 'counts out of range';
    if (id !== '_day') total += v[0];
  }
  if (total > MAX_SECS) return 'more than a day of time';
  return null;
}
export async function upload(req, env) {
  const b = await readJson(req, MAX_BODY);
  if (b === null) return reply(400, { error: 'bad body' });
  const now = nowMs(env), why = checkUpload(b, now);
  if (why) return reply(400, { error: why }); // the phone drops a refused day and does not send it again
  try {
    if (!(await underLimit(env, now))) return reply(429, { error: 'busy, try later' });
    if (b.n) { const r = await env.DB.prepare('INSERT OR IGNORE INTO usage_seen (nonce, ts) VALUES (?, ?)').bind(b.n, now).run(); if (!changes(r)) return reply(200, { ok: true, duplicate: true }); }
    const pages = { ...b.pages };
    if (!pages._day) { // older phones may not send the day total: make it from the pages
      const v = Object.values(pages); pages._day = [Math.min(MAX_SECS, v.reduce((a, x) => a + x[0], 0)), 1, v.reduce((a, x) => a + x[2], 0), 0];
    }
    const key = [b.day, b.d && b.d !== 'none' ? b.d : 'none', b.lang, b.plat, b.v, b.cv];
    const stmts = Object.entries(pages).filter(([id, v]) => id === '_day' || v.some((x) => x > 0))
      .map(([id, v]) => env.DB.prepare(UPSERT).bind(...key, id, v[0], v[1], v[2], v[3], 1, b.sa ? 1 : 0));
    await env.DB.batch(stmts);
    return reply(200, { ok: true, pages: stmts.length });
  } catch (e) { return reply(503, { error: 'not ready: ' + (e && e.message) }); } // tables not made yet: the phone tries again later
}

/* ---------------- POST /i: one install, no id ---------------- */
export async function install(req, env) {
  const b = await readJson(req, 2000);
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some((k) => !I_KEYS.has(k)) || !LANGS.has(b.lang) || !PLATS.has(b.plat)
    || typeof b.v !== 'string' || !VER_RE.test(b.v) || typeof b.sa !== 'boolean') return reply(400, { error: 'bad body' });
  const now = nowMs(env);
  try {
    if (!(await underLimit(env, now))) return reply(429, { error: 'busy, try later' });
    await env.DB.prepare(INSTALL).bind(dayOf(now), b.lang, b.plat, b.v, 1, b.sa ? 1 : 0).run();
    return reply(200, { ok: true });
  } catch (e) { return reply(503, { error: 'not ready' }); }
}

/* ---------------- POST /e from old app versions: folded into the daily totals, the install id is dropped ---------------- */
const LEGACY_ACTS = new Set(['share', 'a2hs', 'kid', 'dose', 'feedback', 'near', 'voice', 'lang', 'sendapp']);
export function foldLegacy(b, now) {
  // returns {days: {day: {page: [s, o, p, f]}}, installs: {day: n}}; each (day, page) of one post counts as one phone-day
  const days = {}, installs = {};
  const rec = (day, page) => ((days[day] = days[day] || {})[page] = days[day][page] || [0, 0, 0, 0]);
  for (const e of (Array.isArray(b.events) ? b.events : []).slice(0, 200)) {
    if (!e || typeof e !== 'object' || typeof e.t !== 'string') continue;
    const ts = Number.isFinite(e.ts) && e.ts > now - RAW_DAYS * DAY && e.ts < now + DAY ? e.ts : now;
    const day = dayOf(ts);
    if (e.t === 'install') { installs[day] = (installs[day] || 0) + 1; continue; }
    if (e.t === 'open') { rec(day, '_day')[1]++; continue; }
    if (e.t === 'time' && Number.isFinite(e.ms)) { const r = rec(day, '_day'); r[0] = Math.min(MAX_SECS, r[0] + Math.round(Math.min(Math.max(e.ms, 0), 4 * 3600e3) / 1000)); continue; }
    if (e.t === 'view' && typeof e.p === 'string' && PAGE_RE.test(e.p) && e.p !== '_day') { rec(day, e.p)[1]++; continue; }
    if (e.t === 'play' && typeof e.id === 'string') {
      rec(day, '_day')[2]++;
      const tid = e.id.split('.')[0];
      if (!e.id.startsWith('ui.') && /^[a-z0-9-]{1,40}$/.test(tid)) rec(day, 'topic/' + tid)[2]++;
      continue;
    }
    if (LEGACY_ACTS.has(e.t)) rec(day, 'act/' + e.t)[1]++;
    // 'ask' carried the typed search: dropped. Anything else: ignored.
  }
  return { days, installs };
}
export async function legacy(req, env) {
  const b = await readJson(req, 200_000);
  if (!b || typeof b !== 'object' || !Array.isArray(b.events)) return reply(400, 'bad');
  const now = nowMs(env), { days, installs } = foldLegacy(b, now);
  const lang = LANGS.has(b.lang) ? b.lang : 'fa', plat = PLATS.has(b.plat) ? b.plat : 'other', v = typeof b.v === 'string' && VER_RE.test(b.v) ? b.v : 'old', sa = b.standalone ? 1 : 0;
  const stmts = [];
  for (const [day, pages] of Object.entries(days)) {
    if (!pages._day) pages._day = [0, 0, 0, 0];
    for (const [page, c] of Object.entries(pages)) stmts.push(env.DB.prepare(UPSERT).bind(day, 'none', lang, plat, v, 'legacy', page, c[0], c[1], c[2], c[3], 1, sa));
  }
  for (const [day, n] of Object.entries(installs)) stmts.push(env.DB.prepare(INSTALL).bind(day, lang, plat, v, n, sa * n));
  try {
    if (!(await underLimit(env, now))) return reply(429, 'busy');
    if (stmts.length) await env.DB.batch(stmts);
  } catch { return reply(503, 'not ready'); }
  return reply(200, 'ok');
}

/* ---------------- the daily clean-up (cron) ---------------- */
export async function cleanup(env, now = nowMs(env)) {
  const out = {};
  const run = async (name, sql, ...a) => { try { out[name] = changes(await env.DB.prepare(sql).bind(...a).run()); } catch (e) { out[name] = 'error: ' + (e && e.message); } };
  await run('voiceNotesDeleted', 'UPDATE feedback SET audio = NULL WHERE audio IS NOT NULL AND ts < ?', now - AUDIO_DAYS * DAY);
  await run('feedbackUnlinked', 'UPDATE feedback SET iid = NULL WHERE iid IS NOT NULL');
  await run('rawEventsDeleted', 'DELETE FROM events WHERE ts < ?', now - RAW_DAYS * DAY);
  await run('uploadIdsDeleted', 'DELETE FROM usage_seen WHERE ts < ?', now - SEEN_DAYS * DAY);
  await run('rateRowsDeleted', 'DELETE FROM usage_rate WHERE bucket < ?', Math.floor(now / 60000) - 120);
  return out;
}

/* ---------------- dashboard: reading the totals ---------------- */
export function parseQuery(url, env) {
  const p = url.searchParams, now = nowMs(env);
  const days = [7, 30, 90, 365].includes(+p.get('days')) ? +p.get('days') : 30;
  const d = p.get('district') || '';
  const district = d === 'none' || PLACES.has(d) ? d : '';
  return { days, district, from: dayOf(now - (days - 1) * DAY), to: dayOf(now + DAY), today: dayOf(now), now };
}
export async function load(env, q) {
  const all = async (sql, ...a) => ((await env.DB.prepare(sql).bind(...a).all()).results || []);
  const dF = q.district ? ' AND district = ?' : '', dA = q.district ? [q.district] : [];
  try {
    const [rows, grpD, grpA, daily, langs, plats, versions, cvs, inst] = await Promise.all([
      all(`SELECT district, page, SUM(seconds) s, SUM(opens) o, SUM(plays) p, SUM(search_opens) f, SUM(devices) dd FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY district, page`, q.from, q.to),
      // phone-days of a whole section: on each day at least as many phones as its busiest page (a safe lower bound)
      all(`SELECT district, grp, SUM(mx) dd FROM (SELECT day, district, grp, MAX(dv) mx FROM (SELECT day, district, page, ${GRP_SQL} grp, SUM(devices) dv FROM usage_daily
        WHERE day >= ? AND day <= ? GROUP BY day, district, page) GROUP BY day, district, grp) GROUP BY district, grp`, q.from, q.to),
      all(`SELECT grp, SUM(mx) dd FROM (SELECT day, grp, MAX(dv) mx FROM (SELECT day, page, ${GRP_SQL} grp, SUM(devices) dv FROM usage_daily
        WHERE day >= ? AND day <= ? GROUP BY day, page) GROUP BY day, grp) GROUP BY grp`, q.from, q.to),
      all(`SELECT day, SUM(devices) dd, SUM(seconds) s, SUM(opens) o, SUM(plays) p, SUM(standalone) sa FROM usage_daily WHERE page = '_day' AND day >= ? AND day <= ?${dF} GROUP BY day ORDER BY day`, q.from, q.to, ...dA),
      all(`SELECT lang k, SUM(devices) n FROM usage_daily WHERE page = '_day' AND day >= ? AND day <= ?${dF} GROUP BY lang ORDER BY n DESC`, q.from, q.to, ...dA),
      all(`SELECT platform k, SUM(devices) n FROM usage_daily WHERE page = '_day' AND day >= ? AND day <= ?${dF} GROUP BY platform ORDER BY n DESC`, q.from, q.to, ...dA),
      all(`SELECT version k, SUM(devices) n FROM usage_daily WHERE page = '_day' AND day >= ? AND day <= ?${dF} GROUP BY version ORDER BY n DESC LIMIT 8`, q.from, q.to, ...dA),
      all(`SELECT cv k, SUM(devices) n FROM usage_daily WHERE page = '_day' AND day >= ? AND day <= ?${dF} GROUP BY cv ORDER BY n DESC`, q.from, q.to, ...dA),
      all(`SELECT day, SUM(n) n, SUM(standalone) sa FROM installs_daily GROUP BY day ORDER BY day`),
    ]);
    return { ok: true, rows: rows.map(numify), grpD: grpD.map(numify), grpA: grpA.map(numify), daily: daily.map(numify), langs, plats, versions, cvs, inst: inst.map(numify) };
  } catch (e) { return { ok: false, error: String(e && e.message) }; } // the new tables are not made yet (schema.sql not run again)
}
const numify = (r) => { const o = { ...r }; for (const k of ['s', 'o', 'p', 'f', 'dd', 'n', 'sa']) if (k in o) o[k] = +o[k] || 0; return o; };

/* ---------------- small numbers: "<5" ---------------- */
export const LT = '<5';
const small = (dd) => dd < MIN_CELL;
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const fmtMin = (sec) => (sec >= 600 ? fmtN(sec / 60) : (Math.round(sec / 6) / 10).toFixed(1));
const fmtPct = (x) => (x >= 0.095 ? Math.round(x * 100) + '%' : (Math.round(x * 1000) / 10).toFixed(1) + '%');
export const cell = (dd, text) => (small(dd) ? LT : text);
const LTH = '&lt;5', hc = (dd, html) => (small(dd) ? LTH : html); // the same, inside HTML

// Everything the dashboard and the exports show, with small cells already replaced by "<5".
export function view(raw, q) {
  const byD = new Map(), every = new Map();
  const add = (m, page, r) => { const x = m.get(page) || { page, s: 0, o: 0, p: 0, f: 0, dd: 0 }; x.s += r.s; x.o += r.o; x.p += r.p; x.f += r.f; x.dd += r.dd; m.set(page, x); };
  for (const r of raw.rows) { if (!byD.has(r.district)) byD.set(r.district, new Map()); add(byD.get(r.district), r.page, r); add(every, r.page, r); }
  const grpDD = (district, g) => { const x = district ? raw.grpD.find((r) => r.district === district && r.grp === g) : raw.grpA.find((r) => r.grp === g); return x ? x.dd : 0; };
  const content = (m) => [...m.values()].filter((x) => !['_day', 'actions'].includes(groupOf(x.page)));
  const total = (m) => content(m).reduce((a, x) => a + x.s, 0);
  function groups(district) {
    const m = district ? byD.get(district) || new Map() : every, T = total(m);
    return GROUPS.map(([g, name]) => {
      const pages = content(m).filter((x) => groupOf(x.page) === g).sort((a, b) => b.s - a.s);
      const s = pages.reduce((a, x) => a + x.s, 0), o = pages.reduce((a, x) => a + x.o, 0), p = pages.reduce((a, x) => a + x.p, 0), f = pages.reduce((a, x) => a + x.f, 0);
      return { g, name, s, o, p, f, dd: grpDD(district, g), share: T ? s / T : 0, pages: pages.map((x) => ({ ...x, name: pageName(x.page), share: T ? x.s / T : 0 })) };
    }).filter((x) => x.pages.length).sort((a, b) => b.s - a.s);
  }
  const areaDD = (district) => { const m = district ? byD.get(district) : every; const d = m && m.get('_day'); return d ? d.dd : 0; };
  const sel = q.district || '';
  const scope = sel ? byD.get(sel) || new Map() : every;
  const secs = groups(sel);
  const allPages = content(scope).sort((a, b) => b.s - a.s).map((x) => ({ ...x, name: pageName(x.page), group: groupOf(x.page), share: total(scope) ? x.s / total(scope) : 0 }));
  const actions = [...scope.values()].filter((x) => groupOf(x.page) === 'actions').sort((a, b) => b.o - a.o).map((x) => ({ ...x, name: pageName(x.page) }));
  // areas: every district with any phone-days, busiest first; "everywhere" first
  const areas = [...byD.keys()].map((d) => ({ id: d, name: placeName(d), dd: areaDD(d) })).sort((a, b) => b.dd - a.dd || a.name.localeCompare(b.name));
  const everyGroups = groups('');
  const matrix = { areas: [{ id: '', name: 'Everywhere', dd: areaDD('') }, ...areas], rows: GROUPS.map(([g, name]) => ({ g, name })).filter((r) => everyGroups.some((x) => x.g === r.g)) };
  const areaGroups = new Map(matrix.areas.map((a) => [a.id, new Map(groups(a.id).map((x) => [x.g, x]))]));
  const topPages = areas.map((a) => {
    const m = byD.get(a.id), T = total(m);
    return { ...a, minutes: content(m).reduce((s, x) => s + x.s, 0), top: content(m).filter((x) => !small(x.dd)).sort((x, y) => y.s - x.s).slice(0, 3).map((x) => ({ name: pageName(x.page), share: T ? x.s / T : 0 })) };
  });
  let compare = null;
  if (sel) {
    const eG = new Map(everyGroups.map((x) => [x.g, x])), eT = total(every);
    compare = {
      groups: secs.map((x) => ({ name: x.name, dd: x.dd, here: x.share, there: (eG.get(x.g) || { share: 0 }).share })),
      pages: allPages.filter((x) => !small(x.dd)).slice(0, 12).map((x) => ({ name: x.name, dd: x.dd, here: x.share, there: eT ? ((every.get(x.page) || { s: 0 }).s / eT) : 0 })),
    };
  }
  const d7 = dayOf(q.now - 6 * DAY);
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const dd = sum(raw.daily, 'dd');
  const kpi = {
    phoneDays: dd, phoneDays7: sum(raw.daily.filter((r) => r.day >= d7), 'dd'), perDay: dd / q.days,
    seconds: sum(raw.daily, 's'), opens: sum(raw.daily, 'o'), plays: sum(raw.daily, 'p'), standalone: sum(raw.daily, 'sa'),
    installs: sum(raw.inst, 'n'), newInstalls: sum(raw.inst.filter((r) => r.day >= q.from), 'n'), shares: (scope.get('act/share') || { o: 0 }).o,
  };
  return { q, kpi, daily: raw.daily, secs, allPages, actions, matrix, areaGroups, topPages, compare, langs: raw.langs, plats: raw.plats, versions: raw.versions, cvs: raw.cvs,
    installsPerDay: raw.inst.filter((r) => r.day >= q.from), every, byD };
}

/* ---------------- dashboard HTML (server-rendered, no page script) ---------------- */
const e = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CSS = `.filt{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;margin:6px 0 12px}.filt label{font-size:13px;color:#6B655E;display:flex;flex-direction:column;gap:3px}
.filt select,.filt button{font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;border:1px solid #CFC8BC;background:#fff;color:#22201D}.filt button{background:#1F6F7A;border-color:#1F6F7A;color:#fff;font-weight:700}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}th.num{text-align:right}
.hb{display:inline-block;height:9px;border-radius:5px;background:#1F6F7A;vertical-align:middle;min-width:2px}.hbw{display:inline-block;width:90px;background:#EEF4F3;border-radius:5px;vertical-align:middle;margin-right:6px}
details.sec{border-top:1px solid #E6E1D8;padding:6px 0}details.sec>summary{cursor:pointer;font-weight:600;padding:4px 0;list-style-position:inside}details.sec[open]>summary{color:#1F6F7A}
.mx td,.mx th{text-align:center;white-space:nowrap}.mx td:first-child,.mx th:first-child{text-align:left;white-space:normal;min-width:120px}.mx td.hi{font-weight:700;color:#14535B}.mx td.lo{color:#8C857B}
.dv{display:inline-block;position:relative;width:80px;height:10px;background:#F3EFE8;border-radius:5px;vertical-align:middle;margin-left:6px}.dv i{position:absolute;top:0;bottom:0;border-radius:5px}.dv .z{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#8C857B}
.small{font-size:12px;color:#6B655E}.k .v.lt{color:#8C857B}.warnbox{background:#FFF6E0;border:1px solid #EBCB7A;border-radius:12px;padding:10px;font-size:14px}
.b.lt i{background:repeating-linear-gradient(45deg,#C9DCDA 0 3px,#fff 3px 6px)}`;

export function filterForm(q, key) {
  const opts = [['', 'All districts'], ...[...PLACES.values()].filter((p) => p.province === 'Samangan').map((p) => [p.id, p.en]), ['none', 'Not chosen'],
    ...[...PLACES.values()].filter((p) => p.province !== 'Samangan').map((p) => [p.id, p.en])];
  return `<form class="filt" method="get" action="/dashboard"><input type="hidden" name="key" value="${e(key)}">
<label>Period<select name="days" onchange="this.form.submit()">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year']].map(([v, l]) => `<option value="${v}"${q.days === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
<label>District<select name="district" onchange="this.form.submit()">${opts.map(([v, l]) => `<option value="${e(v)}"${q.district === v ? ' selected' : ''}>${e(l)}</option>`).join('')}</select></label>
<button type="submit">Show</button></form>`;
}
export function kpiTiles(v, kpi) {
  const k = v.kpi, dd = k.phoneDays, pd = dd ? k.seconds / 60 / dd : 0;
  const t = (l, val, sub, lt) => kpi(l, lt ? LT : val, sub); // kpi() escapes the value
  return t('Installs (all time)', fmtN(k.installs), `+${small(k.newInstalls) && k.newInstalls ? LTH : fmtN(k.newInstalls)} in this period · not by district`, small(k.installs) && k.installs > 0)
    + t('Phones a day (average)', (Math.round(k.perDay * 10) / 10).toString(), `${hc(dd, fmtN(dd))} phone-days in this period · ${hc(k.phoneDays7, fmtN(k.phoneDays7))} in the last 7 days`, small(dd) && dd > 0)
    + t('Times opened', fmtN(k.opens), '', small(dd) && dd > 0)
    + t('Minutes on screen', fmtN(k.seconds / 60), `about ${small(dd) ? LTH : (Math.round(pd * 10) / 10)} minutes per phone a day`, small(dd) && dd > 0)
    + t('Audio plays', fmtN(k.plays), '', small(dd) && dd > 0)
    + t('On home screen', dd ? Math.round((100 * k.standalone) / dd) + '%' : '–', `of phone-days · ${hc(dd, fmtN(k.shares))} shares`, small(dd) && dd > 0);
}
export function dailyChart(v) {
  const max = Math.max(MIN_CELL, ...v.daily.map((r) => r.dd));
  return v.daily.map((r) => small(r.dd)
    ? `<div class="b lt" title="${e(r.day)}: fewer than 5 phones"><i style="height:${(MIN_CELL / max) * 100}%"></i><span>${e(r.day.slice(5))}</span></div>`
    : `<div class="b" title="${e(r.day)}: ${r.dd} phones"><i style="height:${(r.dd / max) * 100}%"></i><span>${e(r.day.slice(5))}</span></div>`).join('');
}
export function smallTable(rows, h1, h2, name = (x) => x) {
  return `<table><tr><th>${h1}</th><th class="num">${h2}</th></tr>${rows.map((r) => `<tr><td>${e(name(r.k))}</td><td class="num">${hc(+r.n, fmtN(+r.n))}</td></tr>`).join('')}</table>`;
}
const bar = (x, max) => `<span class="hbw"><span class="hb" style="width:${Math.max(2, Math.round((x / (max || 1)) * 90))}px"></span></span>`;
function pageRows(pages, withGroup) {
  return pages.map((x) => `<tr><td>${e(x.name)}${withGroup ? `<div class="small">${e(GROUP_NAME[x.group] || x.group)}</div>` : ''}</td><td class="num">${hc(x.dd, fmtMin(x.s))}</td><td class="num">${hc(x.dd, fmtPct(x.share))}</td><td class="num">${hc(x.dd, fmtN(x.o))}</td>
<td class="num">${hc(x.dd, x.o ? fmtMin(x.s / x.o) : '–')}</td><td class="num">${hc(x.dd, fmtN(x.p))}</td><td class="num">${hc(x.dd, fmtN(x.f))}</td><td class="num">${hc(x.dd, fmtN(x.dd))}</td></tr>`).join('');
}
const PAGE_HEAD = '<tr><th>Page</th><th class="num">Minutes</th><th class="num">Share</th><th class="num">Opens</th><th class="num">Min per open</th><th class="num">Plays</th><th class="num">From search</th><th class="num">Phone-days</th></tr>';
const diffBar = (d) => { const w = Math.min(40, Math.abs(d) * 100 * 1.3); return `<span class="dv"><span class="z"></span><i style="${d >= 0 ? `left:50%;width:${w}px;background:#1F6F7A` : `right:50%;width:${w}px;background:#B6322D`}"></i></span>`; };

export function section(v, key) {
  const q = v.q, where = q.district ? placeName(q.district) : 'all districts';
  const maxS = Math.max(1, ...v.secs.map((x) => x.s));
  const k = encodeURIComponent(key);
  let h = `<div class="c" id="use" style="margin-top:12px"><div class="l" style="font-size:16px;font-weight:700;color:#22201D">What people use · ${e(where)} · last ${q.days} days</div>
<p class="s">Minutes count only while a page is on the screen, and stop 2 minutes after the last touch unless audio is playing. Phones send each finished day once, so the last day or two fill in late.
<b>&lt;5</b> = fewer than 5 phone-days (one phone on one day), hidden so that no family can be recognised. A "phone-day" is one phone that used the page on one day.</p>`;
  if (!v.secs.length) h += '<p class="s">No counts from the new app yet for this choice.</p>';
  else {
    h += `<div class="tw"><table><tr><th>Section</th><th class="num">Minutes</th><th class="num">Share of time</th><th class="num">Opens</th><th class="num">Min per open</th><th class="num">Plays</th><th class="num">Phone-days</th></tr>
${v.secs.map((x) => `<tr><td><a href="#sec-${x.g}">${e(x.name)}</a></td><td class="num">${small(x.dd) ? LTH : bar(x.s, maxS) + fmtMin(x.s)}</td><td class="num">${hc(x.dd, fmtPct(x.share))}</td><td class="num">${hc(x.dd, fmtN(x.o))}</td><td class="num">${hc(x.dd, x.o ? fmtMin(x.s / x.o) : '–')}</td><td class="num">${hc(x.dd, fmtN(x.p))}</td><td class="num">${hc(x.dd, fmtN(x.dd))}${small(x.dd) ? '' : '+'}</td></tr>`).join('')}</table></div>
<p class="small">Section phone-days are a safe minimum (on each day, the phones on its busiest page), hence the "+".</p>
<div class="l" style="margin-top:12px">Pages in each section (tap to open)</div>
${v.secs.map((x, i) => `<details class="sec" id="sec-${x.g}"${i === 0 ? ' open' : ''}><summary>${e(x.name)} · ${hc(x.dd, fmtMin(x.s) + ' min')} · ${x.pages.length} page${x.pages.length === 1 ? '' : 's'}</summary><div class="tw"><table>${PAGE_HEAD}${pageRows(x.pages)}</table></div></details>`).join('')}
<div class="l" style="margin-top:14px">All pages, most minutes first</div><div class="tw"><table>${PAGE_HEAD}${pageRows(v.allPages.slice(0, 30), true)}</table></div>
${v.allPages.length > 30 ? `<p class="small">${v.allPages.length - 30} more pages in the download.</p>` : ''}`;
  }
  // by area
  const areas = v.matrix.areas.filter((a) => a.dd > 0 || a.id === '');
  if (areas.length > 1) {
    const eg = v.areaGroups.get('');
    h += `<div class="l" style="margin-top:16px;font-size:15px;color:#22201D">By area: how each district splits its time</div>
<p class="s">Each column adds up to 100%: the share of that area's minutes spent in each section. <b>Bold</b> = at least 1.5 times the share everywhere; grey = half or less.</p>
<div class="tw"><table class="mx"><tr><th>Section</th>${areas.map((a) => `<th>${a.id ? `<a href="/dashboard?key=${k}&days=${q.days}&district=${encodeURIComponent(a.id)}#use">${e(a.name)}</a>` : e(a.name)}<div class="small">${hc(a.dd, fmtN(a.dd))} phone-days</div></th>`).join('')}</tr>
${v.matrix.rows.map((r) => `<tr><td>${e(r.name)}</td>${areas.map((a) => {
    const x = v.areaGroups.get(a.id).get(r.g), base = (eg.get(r.g) || { share: 0 }).share;
    if (!x) return '<td class="lo">–</td>';
    if (small(x.dd) || small(a.dd)) return `<td class="lo">${LTH}</td>`;
    const cls = a.id && base && x.share >= base * 1.5 ? 'hi' : a.id && x.share <= base * 0.5 ? 'lo' : '';
    return `<td class="${cls}">${fmtPct(x.share)}</td>`;
  }).join('')}</tr>`).join('')}</table></div>
<div class="l" style="margin-top:14px">Top pages in each district</div>
<div class="tw"><table><tr><th>District</th><th class="num">Phone-days</th><th class="num">Minutes</th><th>Most used (share of the district's time)</th></tr>
${v.topPages.map((a) => `<tr><td><a href="/dashboard?key=${k}&days=${q.days}&district=${encodeURIComponent(a.id)}#use">${e(a.name)}</a></td><td class="num">${hc(a.dd, fmtN(a.dd))}</td><td class="num">${hc(a.dd, fmtN(a.minutes / 60))}</td>
<td>${small(a.dd) ? LTH : a.top.map((t) => `${e(t.name)} <span class="small">${fmtPct(t.share)}</span>`).join(' · ') || '<span class="small">pages each under 5 phone-days</span>'}</td></tr>`).join('')}</table></div>`;
  }
  if (v.compare) {
    h += `<div class="l" style="margin-top:16px;font-size:15px;color:#22201D">${e(placeName(q.district))} compared with everywhere</div>
<p class="s">Share of time in ${e(placeName(q.district))} next to the share everywhere (all districts together). Green: used more here; red: used less here.</p>
<div class="tw"><table><tr><th>Section or page</th><th class="num">Here</th><th class="num">Everywhere</th><th class="num">Difference</th></tr>
${[...v.compare.groups.map((x) => ({ ...x, b: true })), ...v.compare.pages].map((x) => { const d = x.here - x.there; return `<tr><td>${x.b ? `<b>${e(x.name)}</b>` : '&nbsp;&nbsp;' + e(x.name)}</td><td class="num">${hc(x.dd, fmtPct(x.here))}</td><td class="num">${fmtPct(x.there)}</td><td class="num">${small(x.dd) ? LTH : `${Math.round(d * 100) > 0 ? '+' : Math.round(d * 100) < 0 ? '−' : ''}${Math.abs(Math.round(d * 100))} pts${diffBar(d)}`}</td></tr>`; }).join('')}</table></div>`;
  }
  if (v.actions.length) {
    h += `<div class="l" style="margin-top:14px">Things people did</div><div class="tw"><table><tr><th>Action</th><th class="num">Times</th><th class="num">Phone-days</th></tr>
${v.actions.map((x) => `<tr><td>${e(x.name)}</td><td class="num">${hc(x.dd, fmtN(x.o))}</td><td class="num">${hc(x.dd, fmtN(x.dd))}</td></tr>`).join('')}</table></div>`;
  }
  h += `<p style="margin-top:12px"><a href="/usage.csv?key=${k}&days=${q.days}${q.district ? '&district=' + encodeURIComponent(q.district) : ''}" style="font-weight:700">Download as a spreadsheet (CSV) →</a> <span class="small">Same "&lt;5" rule. Every download is written in the access log.</span></p></div>`;
  return h;
}

/* ---------------- CSV export (same suppression) ---------------- */
const csvCell = (x) => { const s = String(x ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function csv(v) {
  const q = v.q, head = ['period_from', 'period_to', 'district_id', 'district', 'section', 'page', 'page_name', 'phone_days', 'minutes', 'opens', 'minutes_per_open', 'audio_plays', 'opened_from_search'];
  const out = [head.join(',')];
  const areas = q.district ? [[q.district, v.byD.get(q.district) || new Map()]] : [['all', v.every], ...[...v.byD.entries()].sort((a, b) => placeName(a[0]).localeCompare(placeName(b[0])))];
  let rows = 0;
  for (const [id, m] of areas) {
    const list = [...m.values()].sort((a, b) => (a.page === '_day' ? -1 : b.page === '_day' ? 1 : b.s - a.s || a.page.localeCompare(b.page)));
    for (const x of list) {
      const g = groupOf(x.page), c = (t) => cell(x.dd, t);
      out.push([q.from, q.to, id, id === 'all' ? 'All districts' : placeName(id), g === '_day' ? 'all pages' : GROUP_NAME[g] || g, x.page === '_day' ? '(whole app)' : x.page, x.page === '_day' ? 'Whole app (all pages)' : pageName(x.page),
        c(x.dd), c((Math.round(x.s / 6) / 10).toFixed(1)), c(x.o), c(x.o ? (Math.round(x.s / 6 / x.o) / 10).toFixed(1) : ''), c(x.p), c(x.f)].map(csvCell).join(','));
      rows++;
    }
  }
  return { text: out.join('\r\n') + '\r\n', rows };
}

/* ---------------- the privacy page (public: /privacy) ---------------- */
export function privacyPage(dashKey) {
  const P = (DEFS.privacy && DEFS.privacy.text) || {}, ids = (DEFS.privacy && DEFS.privacy.ids) || Object.keys(P);
  const lang = (lg, dir, title) => `<section lang="${lg}" dir="${dir}" class="c"><h2>${title}</h2>${ids.map((id) => `<p>${e(P[id] && P[id][lg])}</p>`).join('')}</section>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sehat · privacy</title>
<style>body{font-family:system-ui,sans-serif;background:#FBFAF7;color:#22201D;margin:0;padding:16px;max-width:860px;margin:auto;font-size:17px;line-height:1.55}h1{font-size:24px;margin:6px 0}h2{font-size:18px;margin:0 0 6px}
.c{background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:14px 16px;margin-top:12px}.s{font-size:14px;color:#6B655E}a{color:#B6322D}ul{padding-left:20px}li{margin:6px 0}
[dir=rtl]{font-family:"Noto Naskh Arabic",Tahoma,system-ui,sans-serif;font-size:19px;line-height:1.9}</style>
${dashKey ? `<p class="s"><a href="/dashboard?key=${e(encodeURIComponent(dashKey))}">← Dashboard</a></p>` : ''}
<h1>Sehat · privacy</h1>
<p class="s">Sehat (صحت) is a free family health book for phones, for villages in Samangan, Afghanistan. This page says, in plain words, what the app sends, what it keeps, and who can see it. The same words are in the app (Settings → Privacy), with a speaker button to hear them.</p>
<div class="c"><h2>In short</h2><ul>
<li><b>On the phone only:</b> your language, your children's names, birth dates, vaccines and weights, and your settings. These are never sent.</li>
<li><b>Usage counts, only if you agree</b> (you can switch them off in Settings at any time; the app works the same without them): each day the phone adds up which pages were opened, for how many minutes, and how many times audio was played. Once a day it sends those totals with your district (if you chose one), the language, the type of phone and the app version. There is <b>no name, no phone number, no location from the phone and no number that identifies the phone</b>. Searches are not sent; only which page was opened from a search.</li>
<li><b>Installs</b> are counted with one message when the app is first used, with no id.</li>
<li><b>Disease watch</b> (if you say someone at home has an illness that spreads): the illness, the district, an age group and the day. The phone uses a random number that changes every month so a report sent twice is not counted twice.</li>
<li><b>Voice and written ideas</b> you send: the app asks before recording. They are not linked to you or your phone. Phone numbers are removed from writing. Voice recordings are deleted from the server after ${AUDIO_DAYS} days.</li>
<li><b>Who can see it:</b> only the Sehat team, each with their own link. Every time someone opens the dashboard, listens to a voice note or downloads data, it is written in an access log (who, what, when).</li>
<li><b>Small numbers are hidden:</b> any number made from fewer than ${MIN_CELL} phone-days is shown as "&lt;${MIN_CELL}", because small numbers in a village can identify a family.</li>
<li><b>How long:</b> daily totals are kept to see change over time. Older detailed records from earlier versions of the app are deleted after 12 months.</li>
</ul></div>
${lang('fa', 'rtl', 'دری')}${lang('ps', 'rtl', 'پښتو')}${lang('en', 'ltr', 'English (what the app says)')}
<p class="s">Questions: ask the health worker who gave you the app, or the Sehat team.</p></html>`;
}

/* ---------------- /stats.json: the same view as data, small cells already hidden ---------------- */
export function toJson(v) {
  const k = v.kpi, r1 = (x) => Math.round(x * 10) / 10, pct = (x) => Math.round(x * 1000) / 10;
  const page = (x) => ({ page: x.page, name: x.name, phoneDays: cell(x.dd, x.dd), minutes: cell(x.dd, r1(x.s / 60)), sharePct: cell(x.dd, pct(x.share)), opens: cell(x.dd, x.o), plays: cell(x.dd, x.p), openedFromSearch: cell(x.dd, x.f) });
  return {
    from: v.q.from, to: v.q.to, days: v.q.days, district: v.q.district || 'all', note: `"${LT}" = fewer than ${MIN_CELL} phone-days`,
    totals: { phoneDays: cell(k.phoneDays, k.phoneDays), minutes: cell(k.phoneDays, Math.round(k.seconds / 60)), opens: cell(k.phoneDays, k.opens), plays: cell(k.phoneDays, k.plays),
      installsAllTime: k.installs > 0 && k.installs < MIN_CELL ? LT : k.installs },
    sections: v.secs.map((x) => ({ section: x.g, name: x.name, phoneDaysAtLeast: cell(x.dd, x.dd), minutes: cell(x.dd, r1(x.s / 60)), sharePct: cell(x.dd, pct(x.share)), opens: cell(x.dd, x.o), plays: cell(x.dd, x.p), pages: x.pages.map(page) })),
    actions: v.actions.map((x) => ({ action: x.page, name: x.name, times: cell(x.dd, x.o), phoneDays: cell(x.dd, x.dd) })),
    districts: v.topPages.map((a) => ({ district: a.id, name: a.name, phoneDays: cell(a.dd, a.dd), minutes: cell(a.dd, Math.round(a.minutes / 60)), top: small(a.dd) ? [] : a.top.map((t) => ({ name: t.name, sharePct: pct(t.share) })) })),
  };
}
