// Tests for the dashboard v2 on the server (server/worker.js, auth.js, auditlog.js, research.js, home.js, surveillance.js),
// on an in-memory node:sqlite stand-in for D1 with seeded fake data:
// - schema.sql runs again on a full database and keeps every row (it is applied on every deploy by server.yml);
// - the codebook names every field of every table;
// - sign-in: session cookie, old ?key= links, CSRF on every change, Origin check, sign-out, removed people, a new DASH_KEY;
// - roles: viewer, editor and owner see and download only what they may;
// - the audit log is append-only and records sign-ins, views, exports, edits, publishes, corrections and role changes, with
//   before and after;
// - exports: ISO epi weeks, suppression of small cells, SHA-256 that matches the file, DHIS2 shape;
// - every page answers 200, has no key in it, and every inline script carries the CSP nonce and the __name stub.
// Run: node tools/test_dashboard.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const W = (await import(ROOT + 'server/worker.js')).default;
const SV = await import(ROOT + 'server/surveillance.js');
const DATA = await import(ROOT + 'server/research.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const SCHEMA = readFileSync(ROOT + 'server/schema.sql', 'utf8');

const db = new DatabaseSync(':memory:');
db.exec(SCHEMA);
const wrap = (sql) => ({ _sql: sql, _a: [], bind(...a) { return { ...wrap(sql), _a: a }; },
  async first() { return db.prepare(this._sql).get(...this._a); }, async all() { return { results: db.prepare(this._sql).all(...this._a) }; },
  async run() { const r = db.prepare(this._sql).run(...this._a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } });
const env = { DASH_KEY: 'owner-secret-word', APP_URL: 'https://app.example', DB: { prepare: wrap, async batch(st) { const out = []; for (const s of st) out.push(await s.run()); return out; } } };
globalThis.fetch = async () => new Response('', { status: 404 }); // the app's address and the AI are not reached in these tests

const O = 'https://w.example';
class Jar { constructor() { this.c = {}; } take(r) { for (const h of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = h.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0/.test(h)) delete this.c[k]; else this.c[k] = v; } } get header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); } }
async function call(path, { method = 'GET', jar, body, headers = {}, form } = {}) {
  const h = new Headers(headers);
  if (jar && jar.header) h.set('Cookie', jar.header);
  let b;
  if (form) { b = new URLSearchParams(form).toString(); h.set('Content-Type', 'application/x-www-form-urlencoded'); }
  else if (body !== undefined) { b = typeof body === 'string' ? body : JSON.stringify(body); if (!h.has('Content-Type')) h.set('Content-Type', 'application/json'); }
  const r = await W.fetch(new Request(O + path, { method, headers: h, body: b, redirect: 'manual' }), env);
  if (jar) jar.take(r);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json, headers: r.headers };
}
async function signIn(key, remember) {
  const jar = new Jar(), r = await call('/signin', { method: 'POST', jar, form: { key, next: '/dashboard', lang: 'en', ...(remember ? { remember: '1' } : {}) }, headers: { Origin: O } });
  return { jar, r };
}
const csrfOf = (html) => (/name="csrf" value="([^"]+)"/.exec(html) || [])[1];

/* ---------------- fake data ---------------- */
const DAY = 864e5, dayOf = (ms) => new Date(ms).toISOString().slice(0, 10), NOW = Date.now();
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const up = (b) => W.fetch(new Request(O + '/u', { method: 'POST', body: JSON.stringify(b) }), env);
const places = ['aybak-city', 'aybak', 'dara-i-suf-payin', 'ruyi-du-ab'];
let nU = 0;
for (let back = 1; back <= 40; back++) for (const d of places) for (let i = 0; i < (d === 'ruyi-du-ab' ? 1 : 7); i++) {
  if (rnd() < 0.3) continue;
  const r = await up({ n: `test-${back}-${d}-${i}-abcdefgh`, day: dayOf(NOW - back * DAY), d, lang: 'fa', v: '2026.10.07-abc123', plat: 'android', sa: true, cv: '2026-10-08.1', pages: { home: [60, 1, 0, 0], 'topic/fever': [120, 1, 2, 0], _day: [180, 1, 2, 0] } });
  if (r.status === 200) nU++;
}
ok(nU > 400, 'usage seeded', nU);
let rid = 0, inst = 0;
const rep = (s, d, a, day) => ({ k: 'r', id: 'testrep-' + String(++rid).padStart(6, '0'), s, dv: s === 'measles' ? 1 : 2, d, a, day });
const send = (items) => SV.ingest(new Request(O + '/r', { method: 'POST', body: JSON.stringify({ iid: 'testinst-' + String(++inst).padStart(5, '0'), v: '2026.10.07-abc123', items }) }), env);
for (let back = 30; back >= 0; back--) for (const d of ['aybak', 'aybak-city']) for (let k = 0; k < 2; k++) await send([rep('awd', d, 'u5', dayOf(NOW - back * DAY))]);
await send([rep('measles', 'ruyi-du-ab', 'u5', dayOf(NOW - DAY))]);
await send([rep('measles', 'ruyi-du-ab', '5-14', dayOf(NOW - DAY))]);
const nRep = db.prepare('SELECT COUNT(*) n FROM surv_reports').get().n;
ok(nRep === rid, 'reports seeded', { nRep, rid });
await W.fetch(new Request(O + '/feedback', { method: 'POST', body: JSON.stringify({ lang: 'fa', page: 'home', text: 'سلام، این برنامه خوب است', v: 'x' }) }), env);

/* ---------------- schema.sql again on a full database ---------------- */
const counts = () => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => [t.name, db.prepare(`SELECT COUNT(*) n FROM "${t.name}"`).get().n]));
const before = counts();
db.exec(SCHEMA);
ok(JSON.stringify(counts()) === JSON.stringify(before), 'schema.sql again keeps every row', { before, after: counts() });

/* ---------------- the codebook names every field ---------------- */
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
for (const tb of tables) {
  const cols = db.prepare(`PRAGMA table_info("${tb}")`).all().map((c) => c.name), cb = DATA.TABLES.find((x) => x.name === tb);
  ok(!!cb, 'codebook has table ' + tb);
  if (cb) ok(JSON.stringify(cols) === JSON.stringify(cb.columns.map((c) => c.name)), 'codebook fields of ' + tb, { db: cols, codebook: cb.columns.map((c) => c.name) });
}
ok(DATA.TABLES.every((x) => tables.includes(x.name)), 'codebook names only real tables');

/* ---------------- sign-in ---------------- */
let r = await call('/dashboard');
ok(r.status === 303 && r.headers.get('Location') === '/signin?next=%2Fdashboard', 'a page without sign-in goes to the sign-in page', r.headers.get('Location'));
r = await call('/signin');
ok(r.status === 200 && r.text.includes('type="password"') && !r.text.includes('method="get"'), 'sign-in page posts the password (never a GET with the key)');
ok(/script-src 'nonce-/.test(r.headers.get('Content-Security-Policy') || '') && r.headers.get('X-Frame-Options') === 'DENY', 'security headers on pages');
r = await call('/stats.json');
ok(r.status === 401, 'an API without sign-in: 401', r.status);
let s = await signIn('wrong');
ok(s.r.status === 401 && !Object.keys(s.jar.c).length, 'wrong password: 401 and no cookie');
s = await call('/signin', { method: 'POST', form: { key: 'owner-secret-word' }, headers: { Origin: 'https://evil.example' } });
ok(s.status === 403, 'sign-in posted from another site is refused', s.status);
const owner = await signIn('owner-secret-word');
const setc = owner.r.headers.getSetCookie().find((c) => c.startsWith('__Host-sehat='));
ok(owner.r.status === 303 && owner.r.headers.get('Location') === '/dashboard' && setc && /HttpOnly/.test(setc) && /Secure/.test(setc) && /SameSite=Lax/.test(setc) && !/Max-Age/.test(setc), 'sign-in: session cookie, HttpOnly, Secure, SameSite', setc);
ok(!db.prepare('SELECT COUNT(*) n FROM sessions WHERE id_hash = ?').get(owner.jar.c['__Host-sehat']).n && db.prepare('SELECT COUNT(*) n FROM sessions').get().n === 1, 'only the hash of the cookie is stored');
const rem = await signIn('owner-secret-word', true);
ok(/Max-Age=1209600/.test(rem.r.headers.getSetCookie().join(';')), 'remember me: 14 days');
r = await call('/dashboard', { jar: owner.jar });
ok(r.status === 200 && r.text.includes('Overview'), 'overview with the cookie', r.status);
const ownerCsrf = csrfOf(r.text);
ok(!!ownerCsrf, 'pages carry the CSRF token for sign-out and forms');
ok(!r.text.includes('owner-secret-word') && !/[?&]key=/.test(r.text), 'no key in the page');
// old personal links
const link = new Jar();
r = await call('/watch?key=owner-secret-word&weeks=8', { jar: link });
ok(r.status === 303 && r.headers.get('Location') === '/watch?weeks=8' && link.c['__Host-sehat'], 'an old ?key= link signs in and drops the key from the address', r.headers.get('Location'));
r = await call('/watch?weeks=8', { jar: link });
ok(r.status === 200, 'then the page opens');
r = await call('/watch?key=nope');
ok(r.status === 401 && r.text.includes('did not work'), 'a wrong key in a link shows the sign-in page');
// CSRF
r = await call('/ai/summary', { method: 'POST', jar: owner.jar });
ok(r.status === 403, 'a change without the CSRF token is refused', r.status);
r = await call('/ai/summary', { method: 'POST', jar: owner.jar, headers: { 'X-CSRF-Token': 'x'.repeat(32) } });
ok(r.status === 403, 'a change with a wrong CSRF token is refused');
r = await call('/ai/summary', { method: 'POST', jar: owner.jar, headers: { 'X-CSRF-Token': ownerCsrf, Origin: 'https://evil.example' } });
ok(r.status === 403, 'a change from another origin is refused, even with the token');
r = await call('/ai/summary', { method: 'POST', jar: owner.jar, headers: { 'X-CSRF-Token': ownerCsrf, Origin: O } });
ok(r.status === 400 && /API key/.test(r.json.error), 'with the token: the request is handled (no AI key here)', r.json);
// the key itself (scripts, tools, older editor test): no cookie, no CSRF needed
r = await call('/watch/export.csv?kind=counts', { headers: { Authorization: 'Bearer owner-secret-word' } });
ok(r.status === 200 && r.text.startsWith('# Sehat disease watch export'), 'a Bearer key downloads an export');
r = await call('/admin/api/state?key=owner-secret-word');
ok(r.status === 200 && Array.isArray(r.json.units), 'the editor API with ?key= still answers (scripts)');

/* ---------------- people and roles ---------------- */
r = await call('/people/api/add', { method: 'POST', jar: owner.jar, body: { name: 'Sara', role: 'viewer' }, headers: { 'X-CSRF-Token': ownerCsrf, Origin: O } });
ok(r.status === 200 && r.json.key, 'owner adds a viewer');
const saraKey = r.json.key, saraId = r.json.id;
r = await call('/people/api/add', { method: 'POST', jar: owner.jar, body: { name: 'Ahmad', role: 'editor' }, headers: { 'X-CSRF-Token': ownerCsrf } });
const ahmadKey = r.json.key;
const sara = await signIn(saraKey), ahmad = await signIn(ahmadKey);
const saraCsrf = csrfOf((await call('/dashboard', { jar: sara.jar })).text), ahmadCsrf = csrfOf((await call('/dashboard', { jar: ahmad.jar })).text);
for (const p of ['/audit', '/people', '/audit/export.csv']) ok((await call(p, { jar: sara.jar })).status === 404, 'viewer cannot open ' + p);
ok((await call('/data/export.csv?dataset=usage&level=full', { jar: sara.jar })).status === 403, 'viewer: no full usage export');
ok((await call('/watch/export.csv?kind=dhis2&level=full', { jar: ahmad.jar })).status === 403, 'editor: no full DHIS2 export');
ok((await call('/data/export.csv?dataset=usage', { jar: sara.jar })).status === 200, 'viewer: shareable export');
r = await call('/admin/api/save', { method: 'POST', jar: sara.jar, body: { units: {} }, headers: { 'X-CSRF-Token': saraCsrf } });
ok(r.status === 403, 'viewer cannot save in the editor', r.status);
r = await call('/watch/correct', { method: 'POST', jar: ahmad.jar, form: { csrf: ahmadCsrf, target_type: 'report', target: 'testrep-000001', action: 'void', reason: 'test' } });
ok(r.status === 403, 'editor cannot correct reports', r.status);
// role change and removal take effect at once
r = await call('/people/api/role', { method: 'POST', jar: owner.jar, body: { id: saraId, role: 'editor' }, headers: { 'X-CSRF-Token': ownerCsrf } });
r = await call('/admin/api/save', { method: 'POST', jar: sara.jar, body: { units: {} }, headers: { 'X-CSRF-Token': saraCsrf } });
ok(r.status === 200, 'after the role change, the same sign-in can save', r);
r = await call('/people/api/revoke', { method: 'POST', jar: owner.jar, body: { id: saraId }, headers: { 'X-CSRF-Token': ownerCsrf } });
ok((await call('/dashboard', { jar: sara.jar })).status === 303, 'a removed person is signed out at once');
ok(db.prepare('SELECT COUNT(*) n FROM sessions WHERE person_id = ? AND ended IS NULL').get(saraId).n === 0, 'their sessions are ended');
// sign-out
r = await call('/signout', { method: 'POST', jar: ahmad.jar, form: { csrf: ahmadCsrf }, headers: { Origin: O } });
ok(r.status === 303 && (await call('/dashboard', { jar: ahmad.jar })).status === 303, 'sign-out ends the session');
// a new DASH_KEY ends the owner's sessions
const remJar = rem.jar;
env.DASH_KEY = 'a-new-owner-word';
ok((await call('/dashboard', { jar: remJar })).status === 303, 'a new DASH_KEY ends old owner sign-ins');
env.DASH_KEY = 'owner-secret-word';
ok((await call('/dashboard', { jar: owner.jar })).status === 200, 'and the same key again restores them (fingerprint of the key)');
// wrong passwords are throttled
for (let i = 0; i < 31; i++) await signIn('guess-' + i);
s = await signIn('owner-secret-word');
ok(s.r.status === 429, 'after 30 wrong passwords in 10 minutes: wait', s.r.status);
db.exec("DELETE FROM limits_daily WHERE k LIKE 'signin:%'");

/* ---------------- pages ---------------- */
const PAGES = ['/dashboard', '/dashboard?lang=fa', '/dashboard?lang=ps&district=aybak&days=7', '/usage', '/usage?district=ruyi-du-ab', '/watch', '/watch?share=1', '/watch/methods', '/inbox', '/data', '/admin', '/audit', '/audit?cat=export', '/people', '/about'];
for (const p of PAGES) {
  r = await call(p, { jar: owner.jar });
  const nonce = (/script-src 'nonce-([0-9a-f]+)'/.exec(r.headers.get('Content-Security-Policy') || '') || [])[1];
  const scripts = [...r.text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  ok(r.status === 200, 'page ' + p, r.status);
  ok(scripts.every((m) => m[1].includes(`nonce="${nonce}"`) && m[2].startsWith('var __name = (f) => f;')), 'scripts of ' + p + ' carry the nonce and the __name stub');
  ok(!/[?&]key=/.test(r.text.replace(/\/dashboard\?key=\$\{/g, '')) && !r.text.includes('owner-secret-word'), 'no key in ' + p);
  ok(!/\son[a-z]+="/.test(r.text.replace(/<script[\s\S]*?<\/script>/g, '')), 'no inline event handlers in ' + p);
}
r = await call('/dashboard?lang=fa', { jar: owner.jar });
ok(r.text.includes('dir="rtl"') && r.text.includes('نمای کلی'), 'Dari interface, right to left');
ok(/sehat_lang=fa/.test(r.headers.getSetCookie().join(';')), 'the language is remembered');
r = await call('/dashboard', { jar: owner.jar });
ok(!/>[1-4]</.test((/<section class="card"><h2>Disease watch by district[\s\S]*?<\/section>/.exec(r.text) || [''])[0].replace(/<title>[\s\S]*?<\/title>/g, '')), 'the overview map shows no count from 1 to 4');

/* ---------------- exports ---------------- */
const body = (t) => t.split('\n').filter((l) => !l.startsWith('#')).join('\n');
r = await call('/data/export.csv?dataset=usage&period=week&by=district&days=90', { jar: owner.jar });
const shaLine = /# sha256: ([0-9a-f]{64})/.exec(r.text);
ok(r.status === 200 && shaLine && sha(body(r.text)) === shaLine[1], 'usage CSV: the printed SHA-256 matches its rows');
const rowsCsv = body(r.text).trim().split('\n'), head = rowsCsv[0].split(',');
ok(head.join(',') === DATA.DATASETS.usage.columns.map((c) => c.name).join(','), 'usage CSV columns = codebook', head);
const csvSplit = (line) => { const out = []; let cur = '', q = false; for (let k = 0; k < line.length; k++) { const c = line[k]; if (q) { if (c === '"' && line[k + 1] === '"') { cur += '"'; k++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
const cell = (line, name) => csvSplit(line)[head.indexOf(name)];
const ruyi = rowsCsv.slice(1).filter((l) => cell(l, 'district_id') === 'ruyi-du-ab');
ok(ruyi.length && ruyi.every((l) => cell(l, 'suppressed') === '1' && cell(l, 'phone_days') === '' && cell(l, 'minutes') === ''), 'shareable: a district with under 5 phone-days a week is suppressed', ruyi.slice(0, 2));
const aybak = rowsCsv.slice(1).filter((l) => cell(l, 'district_id') === 'aybak-city' && cell(l, 'suppressed') === '0');
ok(aybak.length && aybak.every((l) => /^\d{4}-W\d{2}$/.test(cell(l, 'period')) && /^\d{4}-\d{2}-\d{2}$/.test(cell(l, 'week_start')) && cell(l, 'district_pcode') === 'AF2001'), 'epi weeks, ISO dates and the official code', aybak.slice(0, 1));
// the SQL epi week agrees with the JS one on every day of three years
const days = []; for (let t = Date.parse('2024-12-20'); t < Date.parse('2028-01-10'); t += DAY) days.push(dayOf(t));
const sqlWeeks = db.prepare(`SELECT d, ${DATA._test.WEEK_SQL('d')} w FROM (SELECT value d FROM json_each(?))`).all(JSON.stringify(days));
ok(sqlWeeks.every((x) => x.w === SV.isoWeek(x.d)), 'SQL epi week = ISO week', sqlWeeks.find((x) => x.w !== SV.isoWeek(x.d)));
r = await call('/data/export.csv?dataset=usage&period=week&by=district&days=90&level=full', { jar: owner.jar });
ok(body(r.text).split('\n').filter((l) => l.includes('ruyi-du-ab')).every((l) => l.endsWith(',0')), 'full export (owner): nothing suppressed');
r = await call('/data/export.json?dataset=installs&period=day', { jar: owner.jar });
ok(r.status === 200 && r.json.meta.sha256 === sha(JSON.stringify(r.json.rows)) && r.json.meta.columns.length, 'JSON export: meta, codebook columns and SHA-256 of rows');
r = await call('/data/codebook.csv', { jar: owner.jar });
ok(r.status === 200 && r.text.split('\n').length > 150, 'codebook CSV');
// DHIS2
r = await call('/watch/export.csv?kind=dhis2&level=full&weeks=6', { jar: owner.jar });
const dl = r.text.trim().split('\n');
ok(dl[0] === 'dataelement,period,orgunit,categoryoptioncombo,attributeoptioncombo,value,storedby,lastupdated,comment,followup', 'DHIS2 CSV header', dl[0]);
ok(dl.slice(1).every((l) => /^SEHAT_[A-Z_]+_SUSP,\d{4}W\d{2},[A-Z0-9_]+,SEHAT_AGE_[A-Z0-9_]+,,\d+,sehat,/.test(l)), 'DHIS2 rows', dl.slice(1, 3));
ok(!dl.some((l) => l.includes('SEHAT_AYBAK')) && dl.some((l) => l.includes(',AF2001,')), 'Aybak city and villages go to one official org unit (AF2001)');
const dhisCsv = r;
const af = dl.filter((l) => l.startsWith('SEHAT_AWD_SUSP,') && l.includes(',AF2001,SEHAT_AGE_U5,')).reduce((a, l) => a + +l.split(',')[5], 0);
const cnt = await call('/watch/export.json?kind=counts&level=full&weeks=6', { jar: owner.jar });
const both = cnt.json.rows.filter((x) => x.syndrome === 'awd' && x.age_group === 'u5' && ['aybak', 'aybak-city'].includes(x.place)).reduce((a, x) => a + x.reports, 0);
ok(af > 0 && af === both, 'AF2001 adds both Aybak places', { af, both });
r = dhisCsv;
ok(r.headers.get('X-Sehat-SHA256') === sha(r.text), 'DHIS2: SHA-256 in the header');
r = await call('/watch/export.json?kind=dhis2&weeks=6', { jar: owner.jar });
ok(Array.isArray(r.json.dataValues) && r.json.dataValues.every((v) => +v.value >= 5) && Object.keys(r.json).length === 1, 'DHIS2 shareable JSON: only dataValues, cells under 5 left out');

/* ---------------- corrections and the audit log ---------------- */
r = await call('/watch/correct', { method: 'POST', jar: owner.jar, form: { csrf: ownerCsrf, target_type: 'report', target: 'testrep-000001', action: 'void', reason: 'test phone' }, headers: { Origin: O } });
ok(r.status === 303 && r.headers.get('Location').startsWith('/watch?msg=Saved'), 'owner corrects a report (form with CSRF)', r.headers.get('Location'));
ok(db.prepare("SELECT COUNT(*) n FROM surv_reports WHERE rid = 'testrep-000001'").get().n === 1, 'the original report is kept');
const L = (q) => db.prepare(`SELECT * FROM audit_log WHERE ${q} ORDER BY seq DESC`).all();
const corr = L("category = 'correction'")[0];
ok(corr && corr.target === 'report:testrep-000001' && JSON.parse(corr.before).state === 'as received' && JSON.parse(corr.after).action === 'void' && JSON.parse(corr.after).reason === 'test phone', 'correction in the audit log with before and after', corr);
const role = L("action = 'change role'")[0];
ok(role && JSON.parse(role.before).role === 'viewer' && JSON.parse(role.after).role === 'editor', 'role change: before and after', role);
ok(L("action = 'remove access'").length === 1 && L("action = 'add person'").length === 2, 'people changes logged');
ok(L("category = 'sign-in' AND action = 'sign in'").length >= 4 && L("action = 'sign in failed'").length >= 30 && L("action = 'sign out'").length === 1, 'sign-ins, failures and sign-outs logged');
const ex = L("category = 'export' AND action = 'export usage csv'")[0];
ok(ex && ex.row_count > 0 && /^[0-9a-f]{64}$/.test(ex.sha256) && JSON.parse(ex.params).period === 'week' && ex.session && ex.who === 'Owner', 'export logged with filters, rows, SHA-256 and sign-in', ex);
ok(L("action LIKE 'export disease watch dhis2%'").length === 2, 'DHIS2 exports logged');
const views = L("action = 'view overview' AND who = 'Owner' AND params = '{\"days\":30,\"district\":\"all\"}'");
ok(views.length === 1, 'the same view within 10 minutes is logged once', views.length);
// editor save and publish
r = await call('/admin/api/save', { method: 'POST', jar: owner.jar, body: { units: { 'ui:app_name': { fa: 'صحت', ps: 'صحت', en: 'Sehat' } }, prev: {}, base: {} }, headers: { 'X-CSRF-Token': ownerCsrf } });
ok(r.status === 200, 'owner saves a change in the editor', r.json);
const sv = L("category = 'edit' AND action = 'save'")[0];
ok(sv && JSON.parse(sv.before)[0].saved === null && JSON.parse(sv.after)[0].fp && JSON.parse(sv.after)[0].k === 'ui:app_name', 'save: before and after with a fingerprint', sv);
r = await call('/admin/api/publish', { method: 'POST', jar: owner.jar, body: { audio: {} }, headers: { 'X-CSRF-Token': ownerCsrf } });
ok(r.status === 200, 'publish', r.json);
const pb = L("category = 'publish'")[0];
ok(pb && pb.before === null && JSON.parse(pb.after).version === r.json.version && /^[0-9a-f]{64}$/.test(JSON.parse(pb.after).sha256), 'publish logged with the new version and its SHA-256', pb);
// append-only
let refused = 0;
try { db.exec("UPDATE audit_log SET who = 'x'"); } catch { refused++; }
try { db.exec('DELETE FROM audit_log'); } catch { refused++; }
ok(refused === 2, 'the database refuses changes and deletions in audit_log');
r = await call('/audit/export.csv?cat=correction', { jar: owner.jar });
const ash = /# sha256: ([0-9a-f]{64})/.exec(r.text);
ok(r.status === 200 && ash && sha(body(r.text)) === ash[1] && body(r.text).trim().split('\n').length === 2, 'audit export: filtered, SHA-256 matches');
ok(L("action = 'export audit log csv'").length === 1, 'the audit export is logged too');
r = await call('/audit?q=test%20phone', { jar: owner.jar });
ok(r.status === 200 && r.text.includes('testrep-000001'), 'audit page search');
// the cron writes its own line
await W.scheduled({ scheduledTime: Date.now() }, env, null);
ok(L("category = 'system' AND action = 'retention clean-up'").length === 1, 'daily clean-up logged');

/* ---------------- older safety fixes still hold ---------------- */
await W.fetch(new Request(O + '/feedback', { method: 'POST', body: JSON.stringify({ lang: 'en', page: 'x', text: 'hi', type: 'audio/ogg', audio: Buffer.from('OggS' + 'x'.repeat(100)).toString('base64') }) }), env);
const fid = db.prepare('SELECT id FROM feedback WHERE audio IS NOT NULL').get().id;
r = await call('/fb-audio/' + fid, { jar: owner.jar });
ok(r.status === 200 && r.headers.get('Content-Type') === 'audio/ogg' && /sandbox/.test(r.headers.get('Content-Security-Policy')) && /attachment/.test(r.headers.get('Content-Disposition')), 'voice notes still served only as sound (H1)');
ok((await call('/fb-audio/' + fid)).status === 404, 'voice notes need sign-in');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
