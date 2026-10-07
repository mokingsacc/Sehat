// Disease watch (community syndromic surveillance) for the Sehat worker.
// Phones send reports ("someone in my home has this now") and weaker search signals to POST /r.
// Signed-in people see weekly counts, baselines and alerts at /watch, the methods at /watch/methods,
// and download auditable exports at /watch/export.csv and /watch/export.json.
// Definitions, alert rules and places come from content/src/syndromes.json and districts.json
// via server/surveillance-defs.js (written by tools/build.py; never edit it by hand).
//
// Auditability: surv_reports, surv_signals, surv_corrections and surv_exports are append-only
// (this file only ever INSERTs into them; schema.sql adds triggers that refuse UPDATE and DELETE).
// A wrong report is not changed: a correction row voids (or restores) it, with who, when and why.
import DEFS from './surveillance-defs.js';
import { spend } from './usage.js';

export { DEFS };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const DAY = 864e5;
const SYN = new Map(DEFS.syndromes.map((s) => [s.id, s]));
const ACTIVE = new Set(DEFS.syndromes.filter((s) => s.active).map((s) => s.id));
const PLACES = new Map(DEFS.places.map((p) => [p.id, p]));
const AGES = DEFS.ageGroups.map((a) => a.id);
const AGE_SET = new Set(AGES);
const MIN_CELL = (DEFS.suppression && DEFS.suppression.minCell) || 5;
const DEDUPE_DAYS = DEFS.dedupeDays || 14;
const RULES = DEFS.alertRules;
const MAX_BODY = 64_000, MAX_ITEMS = 100, MAX_AGE_DAYS = 90;
// Plausibility limits (the reports are anonymous, so anyone could send made-up ones; see the methods page):
// one install may send at most PHONE_DAY_MAX reports for one day of illness (more are refused); after PLACE_DAY_MAX reports from one
// district in one day, further reports are kept but held by an automatic correction until the owner restores them.
export const PHONE_DAY_MAX = 10, PLACE_DAY_MAX = 30;
const SYSTEM = { name: 'automatic check', role: 'system' };
const iso = (ms) => { const d = new Date(+ms); return isNaN(d) ? '' : d.toISOString(); };
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const R_KEYS = new Set(['k', 'id', 's', 'dv', 'd', 'a', 'day']);
const S_KEYS = new Set(['k', 's', 'dv', 'd', 'day']);

const nowMs = (env) => (env && Number.isFinite(+env.SURV_NOW) && +env.SURV_NOW > 0 ? +env.SURV_NOW : Date.now());
const pad = (n) => String(n).padStart(2, '0');
const e = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const jsonRes = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const NOT_FOUND = () => new Response('Not found', { status: 404 });

/* ---------------- ISO weeks (Monday to Sunday) ---------------- */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export function isoWeek(day) {
  const d = new Date(day + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // the Thursday of this week decides the year
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${pad(wk)}`;
}
export function weekStart(week) {
  const m = WEEK_RE.exec(week); if (!m) return null;
  const jan4 = new Date(Date.UTC(+m[1], 0, 4)), mon1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY;
  return dayOf(mon1 + (+m[2] - 1) * 7 * DAY);
}
export const addWeeks = (week, n) => isoWeek(dayOf(Date.parse(weekStart(week) + 'T00:00:00Z') + n * 7 * DAY));
const validWeek = (w) => typeof w === 'string' && WEEK_RE.test(w) && isoWeek(weekStart(w)) === w;
function weekRange(from, to) { const out = []; for (let w = from; w <= to && out.length < 520; w = addWeeks(w, 1)) out.push(w); return out; }
function validDay(day, now) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z'); if (!Number.isFinite(t) || dayOf(t) !== day) return false;
  return t >= Date.parse(dayOf(now - MAX_AGE_DAYS * DAY) + 'T00:00:00Z') && t <= now + DAY;
}

/* ---------------- POST /r: reports and search signals from phones ---------------- */
// Body: {iid, v, items: [{k:'r', id, s, dv, d, a, day} | {k:'s', s, dv, d, day}]}
// Each item is checked strictly; good items are stored, bad ones are listed back and dropped (the phone
// removes its whole batch on a 200, so a bad item cannot block the queue). A malformed body gets a 400.
export function checkItem(it, now) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return 'not an object';
  const keys = it.k === 'r' ? R_KEYS : it.k === 's' ? S_KEYS : null;
  if (!keys) return 'unknown kind';
  for (const k of Object.keys(it)) if (!keys.has(k)) return 'unexpected field ' + String(k).slice(0, 20); // no free text can slip in
  if (typeof it.s !== 'string' || !SYN.has(it.s)) return 'unknown syndrome';
  if (!ACTIVE.has(it.s)) return 'syndrome not collected';
  const syn = SYN.get(it.s);
  if (!Number.isInteger(it.dv) || it.dv < 1 || it.dv > syn.version) return 'unknown definition version';
  if (!validDay(it.day, now)) return 'bad day';
  if (it.k === 'r') {
    if (typeof it.id !== 'string' || !ID_RE.test(it.id)) return 'bad report id';
    if (typeof it.d !== 'string' || !PLACES.has(it.d)) return 'unknown district';
    if (typeof it.a !== 'string' || !AGE_SET.has(it.a)) return 'unknown age group';
  } else if (it.d != null && (typeof it.d !== 'string' || !PLACES.has(it.d))) return 'unknown district';
  return null;
}
// A whole post is a fixed handful of queries, however many items it has (the free plan allows 50 per request):
// the items go to the database as one JSON value each for reports, signals and holds.
export async function ingest(req, env) {
  let b;
  try { const txt = await req.text(); if (txt.length > MAX_BODY) throw 0; b = JSON.parse(txt); } catch { return new Response('bad', { status: 400, headers: CORS }); }
  if (!b || typeof b !== 'object' || typeof b.iid !== 'string' || !ID_RE.test(b.iid) || !Array.isArray(b.items) || !b.items.length || b.items.length > MAX_ITEMS) {
    return new Response('bad', { status: 400, headers: CORS });
  }
  const now = nowMs(env), app = typeof b.v === 'string' ? b.v.slice(0, 32) : null;
  const res = { ok: true, reports: 0, duplicates: 0, held: 0, signals: 0, rejected: [] };
  const reps = [], sigs = [];
  b.items.forEach((it, i) => {
    const why = checkItem(it, now);
    if (why) res.rejected.push({ i, why }); else (it.k === 'r' ? reps : sigs).push({ i, it });
  });
  if (!reps.length && !sigs.length) return jsonRes(res, 200, CORS);
  // a day's allowance for all phones together; when it is used up the phone keeps its queue and tries later
  if (!(await spend(env, 'r', reps.length + sigs.length, now))) return jsonRes({ ok: false, error: 'busy today, try later' }, 429, CORS);
  const day0 = Date.parse(dayOf(now) + 'T00:00:00Z');
  if (reps.length) {
    const ids = JSON.stringify(reps.map((x) => x.it.id)), places = JSON.stringify([...new Set(reps.map((x) => x.it.d))]), days = JSON.stringify([...new Set(reps.map((x) => x.it.day))]);
    const [seen, prior, mine, perPlace] = await Promise.all([
      env.DB.prepare('SELECT rid FROM surv_reports WHERE rid IN (SELECT value FROM json_each(?))').bind(ids).all(),
      // earlier counted reports of this install (not duplicates, not voided): a new one within 14 days is a duplicate
      env.DB.prepare(`SELECT rid, syndrome, day, seq FROM surv_reports WHERE iid = ? AND dup_of IS NULL AND ${NOT_VOIDED} ORDER BY day, seq`).bind(b.iid).all(),
      // reports this install already sent for the same days of illness (a phone that was offline for weeks sends many days at once)
      env.DB.prepare('SELECT day, COUNT(*) n FROM surv_reports WHERE iid = ? AND day IN (SELECT value FROM json_each(?)) GROUP BY day').bind(b.iid, days).all(),
      env.DB.prepare('SELECT place, COUNT(*) n FROM surv_reports WHERE received_ts >= ? AND place IN (SELECT value FROM json_each(?)) GROUP BY place').bind(day0, places).all(),
    ]);
    const known = new Set(((seen && seen.results) || []).map((r) => r.rid));
    const counted = ((prior && prior.results) || []).map((r) => ({ rid: r.rid, s: r.syndrome, day: r.day }));
    const placeN = new Map(((perPlace && perPlace.results) || []).map((r) => [r.place, +r.n]));
    const phoneN = new Map(((mine && mine.results) || []).map((r) => [r.day, +r.n]));
    const rows = [], holds = [];
    for (const { i, it } of reps) {
      if (known.has(it.id)) continue; // a resent report id changes nothing
      known.add(it.id);
      const pn = phoneN.get(it.day) || 0;
      if (pn >= PHONE_DAY_MAX) { res.rejected.push({ i, why: 'too many reports from this phone for one day' }); continue; }
      phoneN.set(it.day, pn + 1);
      const t = Date.parse(it.day + 'T00:00:00Z');
      const prev = counted.filter((c) => c.s === it.s && Math.abs(Date.parse(c.day + 'T00:00:00Z') - t) / DAY < DEDUPE_DAYS).sort((a, c) => (a.day < c.day ? -1 : a.day > c.day ? 1 : 0))[0];
      if (!prev) counted.push({ rid: it.id, s: it.s, day: it.day });
      rows.push({ rid: it.id, s: it.s, dv: it.dv, d: it.d, a: it.a, day: it.day, w: isoWeek(it.day), dup: prev ? prev.rid : null });
      const n = (placeN.get(it.d) || 0) + 1; placeN.set(it.d, n);
      if (prev) res.duplicates++; else if (n > PLACE_DAY_MAX) { res.held++; holds.push({ t: 'report:' + it.id, why: `more than ${PLACE_DAY_MAX} reports from ${placeName(it.d)} on ${dayOf(now)} (UTC): held for checking` }); } else res.reports++;
    }
    const stmts = [];
    if (rows.length) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO surv_reports (rid, iid, syndrome, def_version, place, age, day, week, app_version, received_ts, dup_of)
      SELECT json_extract(value, '$.rid'), ?, json_extract(value, '$.s'), json_extract(value, '$.dv'), json_extract(value, '$.d'), json_extract(value, '$.a'),
        json_extract(value, '$.day'), json_extract(value, '$.w'), ?, ?, json_extract(value, '$.dup') FROM json_each(?)`).bind(b.iid, app, now, JSON.stringify(rows)));
    if (holds.length) stmts.push(env.DB.prepare(`INSERT INTO surv_corrections (ts, who, role, target, action, reason)
      SELECT ?, ?, ?, json_extract(value, '$.t'), 'void', json_extract(value, '$.why') FROM json_each(?)`).bind(now, SYSTEM.name, SYSTEM.role, JSON.stringify(holds)));
    if (stmts.length) await env.DB.batch(stmts);
  }
  if (sigs.length) {
    const rows = sigs.map(({ it }) => ({ s: it.s, dv: it.dv, d: it.d || null, day: it.day, w: isoWeek(it.day) }));
    const r = await env.DB.prepare(`INSERT OR IGNORE INTO surv_signals (iid, syndrome, def_version, place, day, week, app_version, received_ts)
      SELECT ?, json_extract(value, '$.s'), json_extract(value, '$.dv'), json_extract(value, '$.d'), json_extract(value, '$.day'), json_extract(value, '$.w'), ?, ? FROM json_each(?)`)
      .bind(b.iid, app, now, JSON.stringify(rows)).run();
    res.signals = changes(r);
  }
  return jsonRes(res, 200, CORS);
}
const changes = (r) => !r || !r.meta ? (r && Number.isFinite(r.changes) ? r.changes : 1) : r.meta.changes;

/* ---------------- counting ---------------- */
// Reports that count: not voided by the latest correction for that report or that install, and not a duplicate,
// unless the report it duplicates was voided (then it counts in its place: a wrong tap followed by a real case).
const VOIDED_RIDS = `SELECT substr(target, 8) FROM surv_corrections c WHERE target LIKE 'report:%' AND action = 'void'
    AND seq = (SELECT MAX(seq) FROM surv_corrections c2 WHERE c2.target = c.target)`;
const VOIDED_IIDS = `SELECT substr(target, 9) FROM surv_corrections c WHERE target LIKE 'install:%' AND action = 'void'
    AND seq = (SELECT MAX(seq) FROM surv_corrections c2 WHERE c2.target = c.target)`;
const NOT_VOIDED = `rid NOT IN (${VOIDED_RIDS}) AND iid NOT IN (${VOIDED_IIDS})`;
// reports whose latest correction is a hold by the automatic check (too many from one district in one day)
const HELD_RIDS = `SELECT substr(target, 8) FROM surv_corrections c WHERE target LIKE 'report:%' AND action = 'void' AND role = 'system'
    AND seq = (SELECT MAX(seq) FROM surv_corrections c2 WHERE c2.target = c.target)`;
async function heldList(env) {
  try {
    return ((await env.DB.prepare(`SELECT date(received_ts / 1000, 'unixepoch') d, place, COUNT(*) n FROM surv_reports WHERE rid IN (${HELD_RIDS})
      GROUP BY d, place ORDER BY d DESC, n DESC LIMIT 30`).all()).results || []).map((r) => ({ ...r, n: +r.n }));
  } catch { return []; }
}
const COUNTED = `${NOT_VOIDED}
  AND (dup_of IS NULL OR dup_of IN (${VOIDED_RIDS}))`;

export function parseQuery(url, env) {
  const p = url.searchParams, cur = isoWeek(dayOf(nowMs(env)));
  const to = validWeek(p.get('to')) ? p.get('to') : cur;
  let weeks = Math.min(Math.max(parseInt(p.get('weeks') || '12', 10) || 12, 1), 104);
  let from = validWeek(p.get('from')) ? p.get('from') : addWeeks(to, -(weeks - 1));
  if (from > to) from = to;
  const syndrome = SYN.has(p.get('syndrome')) ? p.get('syndrome') : null;
  const place = PLACES.has(p.get('place')) ? p.get('place') : null;
  return { from, to, syndrome, place };
}
const filt = (q) => (q.syndrome ? ' AND syndrome = ?' : '') + (q.place ? ' AND place = ?' : '');
const fargs = (q) => [...(q.syndrome ? [q.syndrome] : []), ...(q.place ? [q.place] : [])];

// weekly counts by syndrome x place x age; also the baseline weeks before "from"
export async function weekly(env, q) {
  const start = addWeeks(q.from, -RULES.baselineWeeks);
  const rows = (await env.DB.prepare(`SELECT week, syndrome, place, age, COUNT(*) n FROM surv_reports WHERE week >= ? AND week <= ? AND ${COUNTED}${filt(q)}
    GROUP BY week, syndrome, place, age ORDER BY week, syndrome, place, age`).bind(start, q.to, ...fargs(q)).all()).results || [];
  const sig = (await env.DB.prepare(`SELECT week, syndrome, COALESCE(place, 'unknown') place, COUNT(*) n FROM surv_signals WHERE week >= ? AND week <= ?${filt(q)}
    GROUP BY week, syndrome, COALESCE(place, 'unknown') ORDER BY week, syndrome, place`).bind(q.from, q.to, ...fargs(q)).all()).results || [];
  return { rows: rows.map((r) => ({ ...r, n: +r.n })), signals: sig.map((r) => ({ ...r, n: +r.n })) };
}

// alerts per syndrome x place x week (all ages together), with the baseline = mean of the previous N weeks
export function alerts(rows, q) {
  const tot = new Map(); // "syndrome|place" -> Map(week -> n)
  for (const r of rows) {
    const k = r.syndrome + '|' + r.place; if (!tot.has(k)) tot.set(k, new Map());
    const m = tot.get(k); m.set(r.week, (m.get(r.week) || 0) + r.n);
  }
  const out = [], N = RULES.baselineWeeks;
  for (const [k, m] of tot) {
    const [syndrome, place] = k.split('|');
    for (const week of weekRange(q.from, q.to)) {
      const n = m.get(week) || 0; if (!n) continue;
      let prev = 0; for (let i = 1; i <= N; i++) prev += m.get(addWeeks(week, -i)) || 0;
      const baseline = prev / N;
      for (const rule of RULES.rules) {
        if (rule.syndromes !== '*' && !rule.syndromes.includes(syndrome)) continue;
        const hit = rule.kind === 'any' ? n >= rule.min : rule.kind === 'rise' ? n >= rule.min && n >= rule.ratio * baseline : false;
        if (hit) out.push({ week, syndrome, place, reports: n, baseline: Math.round(baseline * 100) / 100, baseline_sum: prev, rule: rule.id, rule_text: rule.text });
      }
    }
  }
  return out.sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.syndrome.localeCompare(b.syndrome) || a.place.localeCompare(b.place)));
}

/* ---------------- small-number suppression ---------------- */
export const sup = (n) => (n > 0 && n < MIN_CELL ? '<' + MIN_CELL : n);

/* ---------------- exports ---------------- */
const synName = (id) => (SYN.get(id) || {}).en || id;
const placeName = (id) => (PLACES.get(id) || {}).en || (id === 'unknown' ? 'District not given' : id);
const provinceOf = (id) => (PLACES.get(id) || {}).province || '';
function versions() {
  return {
    definitions: DEFS.version,
    syndromes: Object.fromEntries(DEFS.syndromes.map((s) => [s.id, s.version])),
    alertRules: RULES.version,
    places: DEFS.placesVersion,
  };
}
export const CAVEATS = [
  'Reports from app users, not confirmed cases.',
  'Not representative of the whole population: only people who have the app, choose to answer and whose phone later goes online.',
  'Searches are a weaker signal than reports and are never added to them.',
  'Recent weeks fill in late, because phones send reports only when they have internet.',
];
const KINDS = { counts: 'Weekly counts by syndrome, district and age group', alerts: 'Alerts (rules applied to weekly counts)', signals: 'Searches in the symptom finder that match a syndrome (weaker signal)', raw: 'Every report as received (owner only)', corrections: 'Every correction (owner only)' };
const OWNER_ONLY = new Set(['raw', 'corrections']);

export async function buildExport(env, q, kind, level) {
  const share = level !== 'full';
  let columns, rows;
  if (kind === 'counts' || kind === 'alerts') {
    const w = await weekly(env, q);
    if (kind === 'counts') {
      columns = ['week', 'week_start', 'syndrome', 'syndrome_name', 'place', 'place_name', 'province', 'age_group', 'reports'];
      rows = w.rows.filter((r) => r.week >= q.from).map((r) => ({ week: r.week, week_start: weekStart(r.week), syndrome: r.syndrome, syndrome_name: synName(r.syndrome), place: r.place, place_name: placeName(r.place), province: provinceOf(r.place), age_group: r.age, reports: share ? sup(r.n) : r.n }));
    } else {
      columns = ['week', 'week_start', 'syndrome', 'syndrome_name', 'place', 'place_name', 'reports', 'baseline', 'rule', 'rule_text'];
      rows = alerts(w.rows, q).map((a) => ({ week: a.week, week_start: weekStart(a.week), syndrome: a.syndrome, syndrome_name: synName(a.syndrome), place: a.place, place_name: placeName(a.place), reports: share ? sup(a.reports) : a.reports,
        baseline: share && a.baseline_sum > 0 && a.baseline_sum < MIN_CELL ? 'suppressed' : a.baseline, rule: a.rule, rule_text: a.rule_text }));
    }
  } else if (kind === 'signals') {
    const w = await weekly(env, q);
    columns = ['week', 'week_start', 'syndrome', 'syndrome_name', 'place', 'place_name', 'searches'];
    rows = w.signals.map((r) => ({ week: r.week, week_start: weekStart(r.week), syndrome: r.syndrome, syndrome_name: synName(r.syndrome), place: r.place, place_name: placeName(r.place), searches: share ? sup(r.n) : r.n }));
  } else if (kind === 'raw') {
    columns = ['seq', 'rid', 'iid', 'syndrome', 'def_version', 'place', 'age_group', 'day', 'week', 'app_version', 'received_utc', 'dup_of', 'counted'];
    const counted = new Set(((await env.DB.prepare(`SELECT rid FROM surv_reports WHERE week >= ? AND week <= ? AND ${COUNTED}`).bind(q.from, q.to).all()).results || []).map((r) => r.rid));
    rows = (((await env.DB.prepare(`SELECT * FROM surv_reports WHERE week >= ? AND week <= ?${filt(q)} ORDER BY seq`).bind(q.from, q.to, ...fargs(q)).all()).results) || [])
      .map((r) => ({ seq: r.seq, rid: r.rid, iid: r.iid, syndrome: r.syndrome, def_version: r.def_version, place: r.place, age_group: r.age, day: r.day, week: r.week, app_version: r.app_version || '', received_utc: iso(r.received_ts), dup_of: r.dup_of || '', counted: counted.has(r.rid) ? 'yes' : r.dup_of ? 'no (duplicate)' : 'no (voided)' }));
  } else if (kind === 'corrections') {
    columns = ['seq', 'time_utc', 'who', 'role', 'target', 'action', 'reason'];
    rows = (((await env.DB.prepare('SELECT * FROM surv_corrections ORDER BY seq').all()).results) || []).map((r) => ({ seq: r.seq, time_utc: iso(r.ts), who: r.who, role: r.role || '', target: r.target, action: r.action, reason: r.reason }));
  } else return null;
  return { columns, rows, share };
}
// line breaks inside a cell become spaces, so every row is one line and `grep -v "^#"` keeps every row
const csvCell = (v) => { let s = String(v ?? '').replace(/[\r\n]+/g, ' '); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const csvBody = (columns, rows) => [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

export async function exportData(env, url, me, format) {
  const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : 'counts';
  const level = url.searchParams.get('level') === 'full' ? 'full' : 'shareable';
  if ((level === 'full' || OWNER_ONLY.has(kind)) && me.role !== 'owner') return jsonRes({ error: 'Only the owner can download the full export. Shareable exports are open to everyone signed in.' }, 403);
  const q = parseQuery(url, env), ex = await buildExport(env, q, kind, OWNER_ONLY.has(kind) ? 'full' : level);
  const generated = new Date(nowMs(env)).toISOString();
  const query = { kind, level: OWNER_ONLY.has(kind) ? 'full' : level, from: q.from, to: q.to, syndrome: q.syndrome || 'all', place: q.place || 'all' };
  const suppression = ex.share ? `counts from 1 to ${MIN_CELL - 1} are shown as "<${MIN_CELL}"` : 'none (full export, not for sharing)';
  const body = format === 'csv' ? csvBody(ex.columns, ex.rows) : JSON.stringify(ex.rows);
  const hash = await sha256(body);
  try {
    await env.DB.prepare('INSERT INTO surv_exports (ts, who, role, kind, level, params, row_count, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(nowMs(env), me.name, me.role, kind, query.level, JSON.stringify(query), ex.rows.length, hash).run();
  } catch {} // the export still works if the log table is missing
  const name = `sehat-watch-${kind}-${query.level}-${q.from}-to-${q.to}.${format}`;
  const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${name}"` };
  if (format === 'csv') {
    const v = versions(), meta = [
      'Sehat disease watch export: ' + KINDS[kind],
      'generated_utc: ' + generated,
      'query: ' + Object.entries(query).map(([k, x]) => `${k}=${x}`).join('&'),
      'row_count: ' + ex.rows.length,
      `case_definitions: ${v.definitions} (${Object.entries(v.syndromes).map(([k, x]) => `${k} v${x}`).join(', ')})`,
      'alert_rules: ' + v.alertRules,
      'places: ' + v.places,
      'suppression: ' + suppression,
      'sha256: ' + hash + ' (SHA-256 of every line below the # lines, i.e. grep -v "^#" file.csv | sha256sum)',
      ...CAVEATS.map((c) => 'caveat: ' + c),
    ];
    return new Response(meta.map((m) => '# ' + m.replace(/[\r\n]+/g, ' ')).join('\n') + '\n' + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...headers } });
  }
  return new Response(JSON.stringify({ meta: { title: 'Sehat disease watch export', kind, description: KINDS[kind], generated_utc: generated, query, row_count: ex.rows.length,
    versions: versions(), alert_rules: RULES.rules, suppression, sha256: hash, sha256_of: 'the "rows" value written as compact JSON (jq -j -c .rows file.json | sha256sum)', columns: ex.columns, caveats: CAVEATS }, rows: ex.rows }, null, 1),
  { headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

/* ---------------- corrections (owner only): append a row, never change a report ---------------- */
export async function correct(req, env, url, me) {
  if (me.role !== 'owner') return jsonRes({ error: 'Only the owner can correct reports.' }, 403);
  let b = {};
  const type = req.headers.get('Content-Type') || '';
  if (type.includes('application/json')) b = await req.json().catch(() => ({}));
  else { const f = await req.formData().catch(() => null); if (f) for (const [k, v] of f) b[k] = String(v); }
  const kind = b.target_type === 'install' ? 'install' : b.target_type === 'report' ? 'report' : b.target_type === 'received' ? 'received' : null;
  const id = String(b.target || '').trim(), action = b.action === 'restore' ? 'restore' : b.action === 'void' ? 'void' : null;
  // one line of plain text: control characters (line breaks) would break the corrections CSV
  const reason = String(b.reason || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300);
  const back = (msg, status = 400) => (type.includes('application/json') ? jsonRes(msg.error ? msg : { ok: true, ...msg }, status)
    : new Response(null, { status: 303, headers: { Location: `/watch?key=${encodeURIComponent(url.searchParams.get('key') || '')}&msg=${encodeURIComponent(msg.error || msg.done)}` } }));
  if (kind === 'received') {
    // many reports at once: every report received on one day (UTC), optionally only one place, one syndrome or only those held by the automatic check
    if (!DAY_RE.test(id) || !action || reason.length < 3) return back({ error: 'Give the day the reports arrived (YYYY-MM-DD), void or restore, and a reason.' });
    const t0 = Date.parse(id + 'T00:00:00Z');
    if (!Number.isFinite(t0)) return back({ error: 'That day does not exist.' });
    const place = PLACES.has(b.place) ? b.place : null, syndrome = SYN.has(b.syndrome) ? b.syndrome : null, heldOnly = b.held === '1' || b.held === true;
    const where = `received_ts >= ? AND received_ts < ?${place ? ' AND place = ?' : ''}${syndrome ? ' AND syndrome = ?' : ''}${heldOnly ? ` AND rid IN (${HELD_RIDS})` : ''}`;
    const args = [t0, t0 + DAY, ...(place ? [place] : []), ...(syndrome ? [syndrome] : [])];
    const r = await env.DB.prepare(`INSERT INTO surv_corrections (ts, who, role, target, action, reason) SELECT ?, ?, ?, 'report:' || rid, ?, ? FROM surv_reports WHERE ${where} ORDER BY seq`)
      .bind(nowMs(env), me.name, me.role, action, reason, ...args).run();
    const n = changes(r);
    if (!n) return back({ error: 'No report matches that day and choice.' });
    return back({ done: `Saved: ${action} ${n} report${n === 1 ? '' : 's'} received on ${id}${place ? ' from ' + placeName(place) : ''}${syndrome ? ' (' + synName(syndrome) + ')' : ''}.` }, 200);
  }
  if (!kind || !ID_RE.test(id) || !action || reason.length < 3) return back({ error: 'Give a report id or install id, void or restore, and a reason.' });
  const col = kind === 'report' ? 'rid' : 'iid';
  const found = await env.DB.prepare(`SELECT COUNT(*) n FROM surv_reports WHERE ${col} = ?`).bind(id).first();
  if (!found || !found.n) return back({ error: `No report has that ${kind} id.` });
  await env.DB.prepare('INSERT INTO surv_corrections (ts, who, role, target, action, reason) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(nowMs(env), me.name, me.role, `${kind}:${id}`, action, reason).run();
  return back({ done: `Saved: ${action} ${kind} ${id} (${found.n} report${found.n === 1 ? '' : 's'}).` }, 200);
}

/* ---------------- pages ---------------- */
const STYLE = `<style>body{font-family:system-ui,sans-serif;background:#FBFAF7;color:#22201D;margin:0;padding:24px;max-width:1200px;margin:auto}h1{font-size:22px}h2{font-size:18px;margin:22px 0 8px}
.c{background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:14px;margin-top:12px;overflow-x:auto}.l{font-size:13px;color:#6B655E}.s{font-size:12.5px;color:#6B655E}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:5px 6px;border-top:1px solid #E6E1D8;white-space:nowrap}th{color:#6B655E;font-weight:600}td.n,th.n{text-align:right}
a{color:#B6322D}.warn{background:#FBF0D2;border-color:#E9D49A}.alert{background:#F7E3E1;border-color:#E3B6B2}.al{padding:6px 0;border-top:1px solid #E3B6B2}.al:first-child{border-top:0}
td.hot{background:#F7E3E1;font-weight:700;color:#8E2622}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.mini{display:flex;align-items:flex-end;gap:2px;height:60px;margin-top:6px}.mini i{flex:1;background:#1F6F7A;border-radius:2px 2px 0 0;min-height:1px}.mini i.hot{background:#B6322D}.mini i.z{background:#E6E1D8}
.v{font-size:26px;font-weight:700;color:#1F6F7A}ul{margin:6px 0;padding-left:20px}li{margin:3px 0}input,select,button{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid #E6E1D8}button{background:#1F6F7A;color:#fff;border-color:#1F6F7A}
code{background:#F1EEE8;padding:1px 4px;border-radius:4px}</style>`;
const signedIn = (me) => (me.role === 'owner' ? 'the owner' : `${me.name} · ${me.role}`);
const head = (title) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(title)}</title>${STYLE}`;
const caveatBox = () => `<div class="c warn"><b>Read this first.</b><ul>${CAVEATS.map((c) => `<li>${e(c)}</li>`).join('')}<li>Each phone counts once per illness per ${DEDUPE_DAYS} days, so a second sick person in the same home is not counted.</li></ul></div>`;

export async function watchPage(env, url, me) {
  const key = url.searchParams.get('key') || '', k = encodeURIComponent(key);
  const q = parseQuery(url, env), share = url.searchParams.get('share') === '1', show = share ? sup : (n) => n;
  const w = await weekly(env, q), weeks = weekRange(q.from, q.to), al = alerts(w.rows, q);
  const hot = new Set(al.map((a) => `${a.syndrome}|${a.place}|${a.week}`));
  // syndrome x place -> week -> {n, ages}
  const grid = new Map();
  for (const r of w.rows) {
    if (r.week < q.from) continue;
    const id = r.syndrome + '|' + r.place; if (!grid.has(id)) grid.set(id, { syndrome: r.syndrome, place: r.place, weeks: {}, ages: {}, total: 0 });
    const g = grid.get(id); g.weeks[r.week] = (g.weeks[r.week] || 0) + r.n; g.ages[r.age] = (g.ages[r.age] || 0) + r.n; g.total += r.n;
  }
  const sigBy = new Map(); for (const s of w.signals) sigBy.set(s.syndrome, (sigBy.get(s.syndrome) || 0) + s.n);
  // in the shareable view a hidden count (1 to 4) gets one fixed bar height, so the bar does not give the number away
  const barH = (n, max) => (!n ? 2 : share && sup(n) !== n ? 30 : Math.max(6, (n / max) * 100));
  const held = await heldList(env);
  const lines = [...grid.values()].sort((a, b) => a.syndrome.localeCompare(b.syndrome) || b.total - a.total);
  const shown = weeks.slice(-12);
  const qs = (extra) => `?key=${k}&from=${q.from}&to=${q.to}${q.syndrome ? '&syndrome=' + q.syndrome : ''}${q.place ? '&place=' + q.place : ''}${extra || ''}`;
  // per syndrome: weekly totals for a small chart
  const perSyn = DEFS.syndromes.filter((s) => s.active).map((s) => {
    const by = weeks.map((wk) => [...grid.values()].filter((g) => g.syndrome === s.id).reduce((t, g) => t + (g.weeks[wk] || 0), 0));
    const alertWeeks = new Set(al.filter((a) => a.syndrome === s.id).map((a) => a.week));
    const max = Math.max(1, ...by);
    return `<div class="c"><div class="l">${e(s.en)}</div><div class="v">${e(show(by.reduce((a, b) => a + b, 0)))}</div><div class="s">reports, ${e(q.from)} to ${e(q.to)} · ${e(show(sigBy.get(s.id) || 0))} searches</div>
      <div class="mini" title="reports per week">${by.map((n, i) => `<i class="${n ? (alertWeeks.has(weeks[i]) ? 'hot' : '') : 'z'}" style="height:${barH(n, max)}%" title="${e(weeks[i])}: ${e(show(n))}"></i>`).join('')}</div></div>`;
  }).join('');
  const msg = url.searchParams.get('msg');
  const exp = (fmt, kind, level) => `<a href="/watch/export.${fmt}${qs(`&kind=${kind}&level=${level}`)}">${fmt.toUpperCase()}</a>`;
  const placeOpts = ['<option value="">All places</option>', ...DEFS.places.map((p) => `<option value="${e(p.id)}"${q.place === p.id ? ' selected' : ''}>${e(p.en)}</option>`)].join('');
  const synOpts = ['<option value="">All syndromes</option>', ...DEFS.syndromes.filter((s) => s.active).map((s) => `<option value="${e(s.id)}"${q.syndrome === s.id ? ' selected' : ''}>${e(s.en)}</option>`)].join('');
  return new Response(`${head('Sehat · disease watch')}
<h1>Sehat · disease watch</h1>
<p class="s">Signed in as <b>${e(signedIn(me))}</b> · <a href="/dashboard?key=${k}">← Usage dashboard</a> · <a href="/watch/methods?key=${k}">Methods and definitions →</a></p>
${msg ? `<div class="c"><b>${e(msg)}</b></div>` : ''}
${caveatBox()}
<form class="c" method="get" action="/watch"><input type="hidden" name="key" value="${e(key)}">
<label class="l">From week <input name="from" value="${e(q.from)}" size="9" pattern="\\d{4}-W\\d{2}"></label> <label class="l">to <input name="to" value="${e(q.to)}" size="9" pattern="\\d{4}-W\\d{2}"></label>
<select name="syndrome">${synOpts}</select> <select name="place">${placeOpts}</select> <label class="l"><input type="checkbox" name="share" value="1"${share ? ' checked' : ''}> shareable view (counts under ${MIN_CELL} hidden)</label> <button>Show</button>
<div class="s">ISO weeks, Monday to Sunday, by the day the report was made on the phone. Definitions ${e(DEFS.version)} · alert rules ${e(RULES.version)}.</div></form>
${held.length ? `<div class="c warn"><b>Held by the automatic check.</b> When more than ${PLACE_DAY_MAX} reports arrive from one district in one day, the extra reports are kept but not counted until the owner looks at them (someone may be sending made-up reports).<ul>${held.map((h) => `<li>${e(h.d)} · ${e(placeName(h.place))}: ${e(h.n)} report${h.n === 1 ? '' : 's'} held</li>`).join('')}</ul>${me.role === 'owner' ? '<div class="s">If they are real, restore them below ("Reports received on a day", tick "only held reports").</div>' : ''}</div>` : ''}
<h2>Alerts</h2>
<div class="c alert">${al.length ? al.map((a) => `<div class="al"><b>${e(a.week)}</b> (from ${e(weekStart(a.week))}) · <b>${e(synName(a.syndrome))}</b> · ${e(placeName(a.place))}: ${e(show(a.reports))} ${share && sup(a.reports) !== a.reports ? 'report(s)' : a.reports === 1 ? 'report' : 'reports'}, baseline ${e(share && a.baseline_sum > 0 && a.baseline_sum < MIN_CELL ? 'suppressed' : a.baseline)}<div class="s">Rule "${e(a.rule)}": ${e(a.rule_text)}</div></div>`).join('') : '<span class="s">No alerts in these weeks.</span>'}
<div class="s" style="margin-top:8px">An alert means "look into this": call the district health team or the clinic to check. It is not a confirmed outbreak.</div></div>
<h2>Reports per week</h2><div class="g">${perSyn}</div>
<h2>By syndrome and place (latest ${shown.length} weeks)</h2>
<div class="c"><table><tr><th>Syndrome</th><th>Place</th>${shown.map((wk) => `<th class="n" title="from ${e(weekStart(wk))}">${e(wk.slice(5))}</th>`).join('')}<th class="n">Total</th>${AGES.map((a) => `<th class="n">${e(a)}</th>`).join('')}</tr>
${lines.length ? lines.map((g) => `<tr><td>${e(synName(g.syndrome))}</td><td>${e(placeName(g.place))}</td>${shown.map((wk) => `<td class="n${hot.has(`${g.syndrome}|${g.place}|${wk}`) ? ' hot' : ''}">${g.weeks[wk] ? e(show(g.weeks[wk])) : ''}</td>`).join('')}<td class="n"><b>${e(show(g.total))}</b></td>${AGES.map((a) => `<td class="n">${g.ages[a] ? e(show(g.ages[a])) : ''}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${shown.length + 3 + AGES.length}" class="s">No reports in these weeks.</td></tr>`}</table>
<div class="s">Age groups: ${DEFS.ageGroups.map((a) => `${e(a.id)} = ${e(a.en)}`).join(' · ')}. Red cells: an alert rule was met.</div></div>
<h2>Searches (weaker signal, never added to reports)</h2>
<div class="c"><table><tr><th>Week</th><th>Syndrome</th><th>Place</th><th class="n">Searches</th></tr>${w.signals.length ? w.signals.slice().reverse().slice(0, 200).map((s) => `<tr><td>${e(s.week)}</td><td>${e(synName(s.syndrome))}</td><td>${e(placeName(s.place))}</td><td class="n">${e(show(s.n))}</td></tr>`).join('') : '<tr><td colspan="4" class="s">No searches in these weeks.</td></tr>'}</table>
<div class="s">A person tapping the "rash" picture or searching for a matching word, once per illness per phone per day. Place is the district the person chose earlier, if any.</div></div>
<h2>Download</h2>
<div class="c"><b>Shareable</b> (counts under ${MIN_CELL} hidden, safe to send to the health authorities): weekly counts ${exp('csv', 'counts', 'shareable')} ${exp('json', 'counts', 'shareable')} · alerts ${exp('csv', 'alerts', 'shareable')} ${exp('json', 'alerts', 'shareable')} · searches ${exp('csv', 'signals', 'shareable')} ${exp('json', 'signals', 'shareable')}
${me.role === 'owner' ? `<div style="margin-top:8px"><b>Full, owner only</b> (all numbers, not for sharing): weekly counts ${exp('csv', 'counts', 'full')} ${exp('json', 'counts', 'full')} · alerts ${exp('csv', 'alerts', 'full')} ${exp('json', 'alerts', 'full')} · every report ${exp('csv', 'raw', 'full')} ${exp('json', 'raw', 'full')} · corrections ${exp('csv', 'corrections', 'full')} ${exp('json', 'corrections', 'full')}</div>` : ''}
<div class="s" style="margin-top:6px">Every file states the query, when it was made, the number of rows, the definition and rule versions, and a SHA-256 of its rows, so anyone can check it was not changed. Each download is logged.</div></div>
${me.role === 'owner' ? `<h2>Correct a report (owner only)</h2>
<form class="c" method="post" action="/watch/correct?key=${e(k)}"><div class="s">Reports are never changed or deleted. A correction is a new row that voids (or restores) one report, or every report from one install (for example a test phone). Corrections are listed in their own export.</div>
<select name="target_type"><option value="report">Report id</option><option value="install">Install id</option></select> <input name="target" placeholder="id" size="38" required> <select name="action"><option value="void">Void</option><option value="restore">Restore</option></select> <input name="reason" placeholder="Reason (required)" size="30" required minlength="3"> <button>Save correction</button></form>
<form class="c" method="post" action="/watch/correct?key=${e(k)}"><input type="hidden" name="target_type" value="received"><div class="s"><b>Reports received on a day</b> (many at once, for example a flood of made-up reports): every report that arrived on that day (UTC), from one place and of one illness if you choose.</div>
<input name="target" placeholder="YYYY-MM-DD" size="11" required pattern="\\d{4}-\\d{2}-\\d{2}"> <select name="place">${placeOpts}</select> <select name="syndrome">${synOpts}</select> <label class="l"><input type="checkbox" name="held" value="1"> only held reports</label> <select name="action"><option value="void">Void</option><option value="restore">Restore</option></select> <input name="reason" placeholder="Reason (required)" size="30" required minlength="3"> <button>Save correction</button></form>` : ''}`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function methodsPage(url, me) {
  const k = encodeURIComponent(url.searchParams.get('key') || '');
  const rows = DEFS.syndromes.map((s) => `<tr><td><b>${e(s.en)}</b><div class="s"><code>${e(s.id)}</code> v${e(s.version)}${s.active ? '' : ' · <b>not asked in the app yet</b>'}</div></td><td style="white-space:normal">${e(s.definition)}<div class="s">The app asks: "${e(s.ask)}" then "Does someone in your home have this now?"</div></td>
    <td style="white-space:normal">${s.topics.length ? 'Topic pages: ' + s.topics.map(e).join(', ') : ''}${s.symptoms.length ? '<br>Symptom finder: ' + s.symptoms.map(e).join(', ') : ''}</td><td style="white-space:normal"><a href="${e(s.source.url)}" rel="noopener">${e(s.source.title)}</a></td></tr>`).join('');
  return new Response(`${head('Sehat · disease watch methods')}
<h1>Disease watch: methods and definitions</h1>
<p class="s">Signed in as <b>${e(signedIn(me))}</b> · <a href="/watch?key=${k}">← Disease watch</a> · Case definitions ${e(DEFS.version)} · Alert rules ${e(RULES.version)} · Places ${e(DEFS.placesVersion)}</p>
${caveatBox()}
<h2>What is collected</h2><div class="c"><ul>
<li>On some topic pages (for example Measles) and under matching symptom-finder results, the app shows a sign in plain words and asks "Does someone in your home have this now?" with Yes and No. Everything is spoken aloud.</li>
<li>After Yes, the app asks once which district the family lives in (Samangan's districts and Aybak city, or another province) and keeps it on the phone. It then asks the sick person's age group: child under 5, older child (5 to 14) or adult (15 and over).</li>
<li>One report = the syndrome, its definition version, the district, the age group, the day (no time), the app version, a random report id and the app's random install id. <b>No names, no phone numbers, no GPS, no free text.</b> The server refuses any other field.</li>
<li>Searches: when someone taps a symptom picture or searches words that match a syndrome's symptoms, the phone sends a "search" signal (syndrome, day, the chosen district if any), at most once per syndrome per phone per day. Searches are shown separately and never added to reports.</li>
<li>Nothing is sent if the person switches off "Usage counts" or "Help watch for outbreaks" in Settings; switching either off also deletes reports still waiting on the phone. Reports wait on the phone without internet and are sent later.</li></ul></div>
<h2>Case definitions</h2><div class="c"><table><tr><th>Syndrome</th><th>Case definition (and the words the app uses)</th><th>Where the question appears</th><th>Source</th></tr>${rows}</table>
<div class="s">These are lay reports against simplified versions of standard case definitions (WHO and the Afghanistan Disease Early Warning System). Families cannot count breaths, measure fever or test blood, so each report is at most a "suspected" case. When a definition, its wording or its triggers change, its version number goes up; every report keeps the version it was made under (see the "every report" export).</div></div>
<h2>Weeks, baseline and alert rules (version ${e(RULES.version)})</h2><div class="c"><ul>
<li>Counting unit: ${e(RULES.unit)}.</li>
<li>Baseline: the mean weekly count of the previous ${e(RULES.baselineWeeks)} weeks for the same syndrome and place (weeks with no reports count as 0).</li>
${RULES.rules.map((r) => `<li><b>${e(r.id)}</b>: ${e(r.text)}</li>`).join('')}
</ul><div class="s">An alert is a prompt to check with the district health team or clinic, not a confirmed outbreak. Rules are kept in content/src/syndromes.json and versioned.</div></div>
<h2>De-duplication</h2><div class="c"><ul>
<li>On the phone: the same syndrome from the same phone is reported at most once per ${DEDUPE_DAYS} days (the question is not shown again in that time).</li>
<li>On the server: a report with the same install id and syndrome within ${DEDUPE_DAYS} days of an earlier counted report is stored but marked as a duplicate and not counted. A report id that was already received (the phone sent it twice) is ignored.</li>
<li>A duplicate of a report that was later voided counts in its place (for example a wrong tap followed by a real case from the same phone).</li>
<li>Corrections: reports are never edited or deleted (the database refuses it). The owner can add a correction row that voids or restores one report, every report from one install, or every report received on one day (optionally one place and one illness), with a reason. The latest correction for a report or install wins. All corrections are exported with who, when and why.</li></ul></div>
<h2>Checks against made-up reports</h2><div class="c"><ul>
<li>Reports are anonymous, so anyone could send well-formed but made-up ones. Each field must come from the fixed lists, and the server refuses anything else.</li>
<li>One install (the phone's random id, which changes every month) can send at most ${PHONE_DAY_MAX} reports for any one day of illness; more are refused.</li>
<li>When more than ${PLACE_DAY_MAX} reports arrive from one district in one day (UTC), the extra reports are kept but held by an automatic correction (who: "automatic check") and not counted. The watch page lists them, and the owner can restore them all at once if they are real.</li>
<li>All phones together can send a fixed number of reports and searches a day; above that the server answers "busy" and phones keep their reports and try again later.</li>
<li>The server keeps no internet address, so there is no limit per address.</li></ul></div>
<h2>Small numbers</h2><div class="c"><ul><li>${e((DEFS.suppression || {}).text || '')}</li><li>In shareable alert exports a baseline built from fewer than ${MIN_CELL} reports is shown as "suppressed".</li>
<li>The page itself shows exact counts to signed-in people; tick "shareable view" before taking a screenshot to share. Full exports (owner only) show every number and are not for sharing.</li>
<li>Limitation: totals and neighbouring cells are suppressed independently, so in rare cases a hidden cell could be worked out from others. Check before publishing tables.</li></ul></div>
<h2>Checking an export</h2><div class="c"><ul><li>Every export states its query, the time it was made (UTC), the number of rows, the definition, place and alert-rule versions, and a SHA-256 of its rows. Each download is also logged on the server (who, when, what, row count, hash).</li>
<li>CSV: <code>grep -v '^#' file.csv | sha256sum</code> must equal the sha256 line. JSON: <code>jq -j -c .rows file.json | sha256sum</code> must equal meta.sha256.</li>
<li>The same query run later can give more rows: phones send late, and corrections can void reports. Compare by generation time.</li></ul></div>
<h2>Limitations</h2><div class="c"><ul>
<li>Not confirmed cases: no examination or laboratory test. Some people will answer Yes to the wrong sign, or to see what happens.</li>
<li>Not representative: only families with a smartphone and the app, who choose to answer, are counted. Use of the app grows and falls with promotion, which changes counts without any change in illness.</li>
<li>Undercounting in homes: one phone counts each illness once per ${DEDUPE_DAYS} days, whatever the number of sick people.</li>
<li>Late and wrong dates: phones send when they get internet (sometimes days later), and the day comes from the phone's clock (reports more than ${MAX_AGE_DAYS} days old or in the future are refused).</li>
<li>Place is the district the person chose, not where the illness was caught. People can choose wrongly or move.</li>
<li>Small numbers: weekly counts per district are small, so a change of one or two reports can trigger or clear an alert.</li></ul></div>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ---------------- one entry point for every /watch path (the worker checks the key first) ---------------- */
// viewer, editor and owner: /watch, /watch/methods, shareable exports. Owner only: full and raw exports, corrections.
export async function handle(req, env, url, me) {
  const path = url.pathname;
  if (!me || !['owner', 'editor', 'viewer'].includes(me.role)) return NOT_FOUND();
  if (path === '/watch' && req.method === 'GET') return watchPage(env, url, me);
  if (path === '/watch/methods' && req.method === 'GET') return methodsPage(url, me);
  if (path === '/watch/export.csv' && req.method === 'GET') return exportData(env, url, me, 'csv');
  if (path === '/watch/export.json' && req.method === 'GET') return exportData(env, url, me, 'json');
  if (path === '/watch/correct' && req.method === 'POST') return correct(req, env, url, me);
  return NOT_FOUND();
}
