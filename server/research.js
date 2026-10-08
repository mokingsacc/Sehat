// "Data for research" (/data): the codebook (every table and field), data versions (which app build and consent wording each
// row came from), place codes, export history, and clean exports with ISO dates, stable codes and epi-week totals.
// Shareable exports (everyone signed in): any row where no day had 5 or more phones (or a cell under 5 reports) is left empty and marked
// suppressed = 1. Full exports (every number): the owner only. Every export is written in the audit log with its filters,
// row count and SHA-256, and the same SHA-256 is printed in the file.
import { esc, shell, htmlResponse, when, fmtN } from './ui.js';
import { t } from './i18n.js';
import { log, sha256 } from './auditlog.js';
import * as USAGE from './usage.js';
import { DEFS as SDEFS, isoWeek, weekStart } from './surveillance.js';
import { pcodeOf, provinceCodeOf, CODES_VERSION, PCODE_SOURCE, dhis2Names, AGE_CODE } from './codes.js';

const MIN = USAGE.MIN_CELL, MAX_ROWS = 50000, DAY = 864e5;
const nowMs = (env) => (env && Number.isFinite(+env.USAGE_NOW) && +env.USAGE_NOW > 0 ? +env.USAGE_NOW : Date.now());
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PLACE_LIST = SDEFS.places;
const PLACE = new Map(SDEFS.places.map((p) => [p.id, p]));
const placeEn = (id) => (id === 'none' ? 'District not chosen' : (PLACE.get(id) || {}).en || id);

/* ---------------- the codebook ---------------- */
// privacy: none = no information about a person; low = a count or a category; indirect = could help recognise a family when
// combined with other facts (shown only to signed-in people); secret = a hash of a password or token (never exported)
const C = (name, type, about, privacy = 'none', values) => ({ name, type, about, privacy, ...(values ? { values } : {}) });
const TS = 'integer: milliseconds since 1970-01-01 UTC';
export const TABLES = [
  { name: 'usage_daily', group: 'App use', about: 'Daily totals sent by each phone once a day (no install id). One row per day x district x language x phone type x app version x consent wording x page. Kept to see change over time.', columns: [
    C('day', 'text, ISO date YYYY-MM-DD', 'The day on the phone (its own calendar day).'), C('district', 'text, sehat place id', 'District the family chose in the app, or "none". See Place codes.', 'low'),
    C('lang', 'text', 'App language.', 'low', 'fa = Dari, ps = Pashto, en = English'), C('platform', 'text', 'Phone type.', 'low', 'android, ios, other'),
    C('version', 'text', 'App build (book version) on the phone, e.g. 2026.10.08-abc123.'), C('cv', 'text', 'Version of the consent wording the phone agreed to; "legacy" = folded in from an old app that sent raw events.'),
    C('page', 'text', 'Page id: topic/<id>, home, ask, tool/..., act/<action> (something done, e.g. a share), or _day (the whole app that day).'),
    C('seconds', 'integer', 'Seconds the page was on screen (stops 2 minutes after the last touch unless audio plays).'), C('opens', 'integer', 'Times the page was opened.'),
    C('plays', 'integer', 'Audio plays on the page.'), C('search_opens', 'integer', 'Opens that came from the symptom search (the typed words are never sent).'),
    C('devices', 'integer', 'Phone-days: phones that used this page on this day (each phone sends a day once).', 'low'), C('standalone', 'integer', 'Of those phone-days, opened from the home screen icon.', 'low')] },
  { name: 'installs_daily', group: 'App use', about: 'Installs: one message when the app is first used, with no id.', columns: [
    C('day', 'text, ISO date', 'Day the server received it (UTC).'), C('lang', 'text', 'App language.', 'low'), C('platform', 'text', 'Phone type.', 'low'), C('version', 'text', 'App build.'),
    C('n', 'integer', 'Installs.', 'low'), C('standalone', 'integer', 'Of those, installed to the home screen.', 'low')] },
  { name: 'surv_reports', group: 'Disease watch', about: 'One row per report from a phone: "someone in my home has this now". No names, GPS or free text. Append-only (the database refuses changes and deletions).', columns: [
    C('seq', 'integer', 'Order of arrival.'), C('rid', 'text', 'Random report id made on the phone.', 'indirect'), C('iid', 'text', "The app's random install id (changes every month on the phone).", 'indirect'),
    C('syndrome', 'text', 'Illness id (see the methods page for case definitions).'), C('def_version', 'integer', 'Version of the case definition on the phone.'),
    C('place', 'text, sehat place id', 'District or province chosen in the app.', 'low'), C('age', 'text', 'Age group of the sick person.', 'low', 'u5, 5-14, 15+'),
    C('day', 'text, ISO date', 'Day the report was made, on the phone (no time).', 'low'), C('week', 'text, ISO week YYYY-Www', 'ISO week of day (Monday to Sunday).'),
    C('app_version', 'text', 'App build that sent it.'), C('received_ts', TS, 'When the server stored it.'), C('dup_of', 'text', 'rid of an earlier counted report from the same install and illness within 14 days (then not counted).', 'indirect')] },
  { name: 'surv_signals', group: 'Disease watch', about: 'Symptom-finder searches that match an illness: a weaker signal, at most one per install, illness and day. Never added to reports. Append-only.', columns: [
    C('seq', 'integer', 'Order of arrival.'), C('iid', 'text', 'Random install id.', 'indirect'), C('syndrome', 'text', 'Illness id.'), C('def_version', 'integer', 'Definition version.'),
    C('place', 'text, sehat place id', 'District chosen earlier, if any.', 'low'), C('day', 'text, ISO date', 'Day on the phone.'), C('week', 'text, ISO week', 'ISO week of day.'),
    C('app_version', 'text', 'App build.'), C('received_ts', TS, 'When the server stored it.')] },
  { name: 'surv_corrections', group: 'Disease watch', about: 'Corrections are new rows, never edits: void or restore one report (report:<rid>) or every report of an install (install:<iid>). The original report is kept. The latest correction for a target wins. Append-only.', columns: [
    C('seq', 'integer', 'Order.'), C('ts', TS, 'When.'), C('who', 'text', 'Who made it ("automatic check" for the flood hold).'), C('role', 'text', 'Their role.'),
    C('target', 'text', 'report:<rid> or install:<iid>.', 'indirect'), C('action', 'text', 'void or restore.'), C('reason', 'text', 'Why (required, one line).')] },
  { name: 'surv_exports', group: 'Disease watch', about: 'Every disease-watch export downloaded. Append-only. (Also written in audit_log.)', columns: [
    C('seq', 'integer', 'Order.'), C('ts', TS, 'When.'), C('who', 'text', 'Who.'), C('role', 'text', 'Role.'), C('kind', 'text', 'counts, alerts, signals, raw, corrections, dhis2.'),
    C('level', 'text', 'shareable or full.'), C('params', 'text, JSON', 'The query.'), C('row_count', 'integer', 'Rows in the file.'), C('sha256', 'text', 'SHA-256 printed in the file.')] },
  { name: 'feedback', group: 'Feedback', about: 'Written ideas and voice notes people chose to send. Not linked to any phone. Phone numbers are removed from the text. Voice deleted after 90 days.', columns: [
    C('id', 'integer', 'Number.'), C('iid', 'text', 'Always empty now (older rows were cleared by the daily clean-up).', 'indirect'), C('ts', TS, 'When the server received it.'),
    C('lang', 'text', 'App language.'), C('version', 'text', 'App build.'), C('page', 'text', 'Page where Feedback was pressed.'), C('text', 'text', 'What they wrote (up to 2,000 characters).', 'indirect'),
    C('audio', 'binary', 'Voice note (audio only), deleted after 90 days.', 'indirect'), C('type', 'text', 'Audio type.'), C('status', 'text', 'Not used yet (always "new").')] },
  { name: 'audit_log', group: 'Audit', about: 'Who did what, when, with the state before and after: every sign-in, view, export, edit, publish, correction and change of access. Append-only (the database refuses changes and deletions). Owner only.', columns: [
    C('seq', 'integer', 'Order.'), C('ts', TS, 'When.'), C('who', 'text', 'Name of the person ("Owner" for the main password).'), C('who_id', 'integer', 'people.id; 0 = owner; empty = system or unknown.'),
    C('role', 'text', 'owner, editor, viewer, system, none (failed sign-in).'), C('category', 'text', 'sign-in, view, export, edit, publish, correction, people, system.'),
    C('action', 'text', 'Plain words, e.g. "save", "change role", "export usage csv".'), C('target', 'text', 'What it was about.'), C('before', 'text, JSON', 'State before (long values: length and SHA-256).'),
    C('after', 'text, JSON', 'State after.'), C('params', 'text, JSON', 'Filters of a view or export.'), C('row_count', 'integer', 'Exports: rows in the file.'), C('sha256', 'text', 'Exports: SHA-256 printed in the file.'),
    C('session', 'text', 'First 12 characters of the sign-in hash: links the actions of one sign-in. Not the cookie.')] },
  { name: 'sessions', group: 'Audit', about: 'Sign-ins. The cookie token is only in the browser; only its SHA-256 is kept. Never exported.', columns: [
    C('id_hash', 'text', 'SHA-256 of the cookie token.', 'secret'), C('person_id', 'integer', 'people.id, 0 = owner.'), C('owner_fp', 'text', 'Owner: fingerprint of the password at sign-in.', 'secret'),
    C('csrf', 'text', 'Random token every change must carry.', 'secret'), C('method', 'text', 'password or link.'), C('created', TS, 'Signed in.'), C('last_seen', TS, 'Last request (to 5 minutes).'),
    C('expires', TS, 'Ends at.'), C('ended', TS, 'Signed out at.')] },
  { name: 'people', group: 'Audit', about: 'People given their own key (/people). The owner is not a row. Only a SHA-256 of each key is kept.', columns: [
    C('id', 'integer', 'Number.'), C('name', 'text', 'Name the owner typed.'), C('role', 'text', 'editor or viewer.'), C('key_hash', 'text', 'SHA-256 of their key.', 'secret'),
    C('created', TS, 'Added.'), C('last_used', TS, 'Last used (to a minute).'), C('revoked', 'integer', '1 = access removed.')] },
  { name: 'audit', group: 'Audit', about: 'The first log (before 8 October 2026), kept read-only. Repeated views were merged into one line.', columns: [
    C('id', 'integer', 'Number.'), C('ts', TS, 'When.'), C('who', 'text', 'Name.'), C('role', 'text', 'Role.'), C('action', 'text', 'What.'), C('detail', 'text', 'Detail.')] },
  { name: 'content', group: 'Book editor', about: 'Published book: the row "overlay" is what phones download (only the editor\'s changes). Big texts are kept in pieces <name>#<id>#<n>.', columns: [
    C('name', 'text', 'overlay, or an old draft/base/published.'), C('body', 'text, JSON', 'The text.'), C('version', 'text', 'Version.'), C('built', 'text, ISO time', 'Made at.'), C('updated_ts', TS, 'Written at.')] },
  { name: 'edit_unit', group: 'Book editor', about: 'The editor\'s changes, one row per changed part of the book (docs/EDITOR_AND_RELEASES.md).', columns: [
    C('k', 'text', 'Part: topic:<id>, list:<name>, home, ui:<key>, say:<key>, facilities, search:<id>, or a note #retired/#rev/#legacy.'), C('v', 'text, JSON', 'The editor\'s version.'),
    C('base', 'text', 'Fingerprint of the app\'s version it was edited from.'), C('ts', TS, 'Saved at.'), C('say', 'text, JSON', 'Topics: spoken lines.'), C('err', 'text, JSON', 'The check of this part when saved.')] },
  { name: 'audio', group: 'Book editor', about: 'Narration clips uploaded in the editor (served at /a/<slot>/<id>).', columns: [
    C('lang', 'text', 'Slot: language and voice, e.g. fa-f.'), C('id', 'text', 'Line id.'), C('type', 'text', 'Audio type.'), C('hash', 'text', 'Short hash of the file.'),
    C('data', 'binary', 'The sound.'), C('size', 'integer', 'Bytes.'), C('ts', TS, 'Uploaded at.')] },
  { name: 'installs', group: 'Older app versions', about: 'Installs counted by app versions before October 2026 (random install id). Raw rows are deleted after 12 months.', columns: [
    C('iid', 'text', 'Random install id.', 'indirect'), C('first_ts', TS, 'First seen.'), C('last_ts', TS, 'Last seen.'), C('lang', 'text', 'Language.'), C('plat', 'text', 'Phone type.'),
    C('standalone', 'integer', 'Home screen.'), C('version', 'text', 'App build.')] },
  { name: 'events', group: 'Older app versions', about: 'Raw events from app versions before October 2026; deleted after 12 months. New phones send only daily totals.', columns: [
    C('id', 'integer', 'Number.'), C('iid', 'text', 'Random install id.', 'indirect'), C('t', 'text', 'Event type.'), C('p', 'text', 'Page or search.', 'indirect'), C('l', 'text', 'Language.'),
    C('ms', 'integer', 'Milliseconds (time events).'), C('ts', TS, 'When.'), C('day', 'text, ISO date', 'Day.')] },
  { name: 'usage_seen', group: 'Housekeeping', about: 'Random ids of single uploads, so a day sent twice counts once. Not stored with the counts; deleted after 7 days.', columns: [C('nonce', 'text', 'Upload id.'), C('ts', TS, 'Received.')] },
  { name: 'usage_rate', group: 'Housekeeping', about: 'Flood protection: posts per minute (old minutes deleted daily).', columns: [C('bucket', 'integer', 'Minute number.'), C('n', 'integer', 'Posts.')] },
  { name: 'limits_daily', group: 'Housekeeping', about: 'Flood protection by the day (and wrong passwords per 10 minutes). No id or address.', columns: [C('k', 'text', 'kind:day, e.g. r:2026-10-07.'), C('n', 'integer', 'Rows, bytes or tries used.')] },
];

// the columns of each research export (also in the file's own JSON meta)
export const DATASETS = {
  usage: { title: 'App use: daily or weekly totals by page', columns: [
    C('period_type', 'text', 'day or week.'), C('period', 'text', 'ISO date YYYY-MM-DD, or ISO week YYYY-Www.'), C('week_start', 'text, ISO date', 'Monday of the week (for days: the Monday of that day\'s week).'),
    C('district_id', 'text', 'Sehat place id (stable).'), C('district_name', 'text', 'English name.'), C('district_pcode', 'text', 'Official district code where confirmed (see Place codes).'), C('province_pcode', 'text', 'Official province code where confirmed.'),
    C('lang', 'text', 'fa, ps or en.'), C('platform', 'text', 'android, ios, other.'), C('app_version', 'text', 'App build.'), C('consent_version', 'text', 'Consent wording version.'),
    C('section', 'text', 'Section of the book the page belongs to.'), C('page', 'text', 'Page id; _day = the whole app.'), C('page_name', 'text', 'English page name.'),
    C('phone_days', 'integer', 'Phones that used the page in the period, counted once per day.'), C('minutes', 'number, 1 decimal', 'Minutes on screen.'), C('opens', 'integer', 'Opens.'),
    C('audio_plays', 'integer', 'Audio plays.'), C('opened_from_search', 'integer', 'Opens from the symptom search.'), C('home_screen_phone_days', 'integer', 'Phone-days opened from the home screen icon.'),
    C('suppressed', 'integer 0/1', `1 = no day in the period had ${MIN} or more phones, so the row could be about fewer than ${MIN} people: every number in the row is left empty (shareable export only).`)] },
  installs: { title: 'Installs by day or week', columns: [
    C('period_type', 'text', 'day or week.'), C('period', 'text', 'ISO date or ISO week.'), C('week_start', 'text, ISO date', 'Monday of the week.'), C('lang', 'text', 'Language.'),
    C('platform', 'text', 'Phone type.'), C('app_version', 'text', 'App build.'), C('installs', 'integer', 'Installs (not by district).'), C('home_screen', 'integer', 'Of those, to the home screen.'),
    C('suppressed', 'integer 0/1', `1 = fewer than ${MIN} installs: numbers left empty (shareable export only).`)] },
};
const SECTION = Object.fromEntries(USAGE.GROUPS);

/* ---------------- usage and installs exports ---------------- */
const DIMS = { district: 'district', lang: 'lang', platform: 'platform', version: 'version', cv: 'cv' };
const IDIMS = { lang: 'lang', platform: 'platform', version: 'version' };
// ISO week of a YYYY-MM-DD column, in SQL: the Thursday of the week decides the year
const WEEK_SQL = (col) => `printf('%s-W%02d', strftime('%Y', date(${col}, '-3 days', 'weekday 4')), (CAST(strftime('%j', date(${col}, '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1)`;
export function parseExport(url, env) {
  const p = url.searchParams, now = nowMs(env);
  const dataset = DATASETS[p.get('dataset')] ? p.get('dataset') : 'usage';
  const period = p.get('period') === 'day' ? 'day' : 'week';
  const allowed = dataset === 'installs' ? IDIMS : DIMS;
  const by = String(p.get('by') ?? 'district').split(',').filter((d) => allowed[d]);
  const unit = p.get('unit') === 'app' ? 'app' : 'page';
  let from = DAY_RE.test(p.get('from') || '') ? p.get('from') : '', to = DAY_RE.test(p.get('to') || '') ? p.get('to') : '';
  if (!to) to = dayOf(now);
  if (!from) { const days = [7, 30, 90, 365].includes(+p.get('days')) ? +p.get('days') : 90; from = dayOf(Date.parse(to + 'T00:00:00Z') - (days - 1) * DAY); }
  if (from > to) from = to;
  const d = p.get('district') || '';
  const district = d === 'none' || PLACE.has(d) ? d : '';
  const level = p.get('level') === 'full' ? 'full' : 'shareable';
  return { dataset, period, by: [...new Set(by)], unit, from, to, district, level };
}
export async function buildUsage(env, q) {
  const share = q.level !== 'full', per = q.period === 'week' ? WEEK_SQL('day') : 'day';
  const dims = q.by.map((d) => DIMS[d]);
  const sel = [`${per} period`, ...dims, 'page'].join(', ');
  const where = `day >= ? AND day <= ? AND ${q.unit === 'app' ? "page = '_day'" : "page <> '_day'"}${q.district ? ' AND district = ?' : ''}`;
  // inner query: one row per day (phones that day); outer: the period, with its busiest day ("peak"). A row is shareable only
  // when at least one day had MIN phones or more, so it cannot be about fewer than MIN people (a phone-day sum of 7 can be one phone).
  const g = ['period', ...dims, 'page'].join(', ');
  const res = await env.DB.prepare(`SELECT ${g}, SUM(d) dd, MAX(d) peak, SUM(s) s, SUM(o) o, SUM(p) p, SUM(f) f, SUM(sa) sa FROM
    (SELECT ${sel}, day, SUM(devices) d, SUM(seconds) s, SUM(opens) o, SUM(plays) p, SUM(search_opens) f, SUM(standalone) sa FROM usage_daily WHERE ${where} GROUP BY day, ${[...dims, 'page'].join(', ')})
    GROUP BY ${g} ORDER BY ${g} LIMIT ${MAX_ROWS + 1}`).bind(q.from, q.to, ...(q.district ? [q.district] : [])).all();
  const raw = (res && res.results) || [], truncated = raw.length > MAX_ROWS;
  const rows = raw.slice(0, MAX_ROWS).map((r) => {
    const dd = +r.dd || 0, hide = share && (+r.peak || 0) < MIN, n = (x) => (hide ? '' : x);
    const dist = q.by.includes('district') ? r.district : q.district || 'all';
    return {
      period_type: q.period, period: r.period, week_start: q.period === 'week' ? weekStart(r.period) : weekStart(isoWeek(r.period)),
      district_id: dist, district_name: dist === 'all' ? 'All districts' : placeEn(dist), district_pcode: pcodeOf(dist), province_pcode: provinceCodeOf(dist),
      lang: r.lang ?? 'all', platform: r.platform ?? 'all', app_version: r.version ?? 'all', consent_version: r.cv ?? 'all',
      section: r.page === '_day' ? 'whole app' : SECTION[USAGE.groupOf(r.page)] || USAGE.groupOf(r.page), page: r.page, page_name: r.page === '_day' ? 'Whole app (all pages)' : USAGE.pageName(r.page),
      phone_days: n(dd), minutes: n((Math.round((+r.s || 0) / 6) / 10).toFixed(1)), opens: n(+r.o || 0), audio_plays: n(+r.p || 0), opened_from_search: n(+r.f || 0), home_screen_phone_days: n(+r.sa || 0),
      suppressed: hide ? 1 : 0,
    };
  });
  return { rows, truncated, columns: DATASETS.usage.columns.map((c) => c.name) };
}
export async function buildInstalls(env, q) {
  const share = q.level !== 'full', per = q.period === 'week' ? WEEK_SQL('day') : 'day', dims = q.by.map((d) => IDIMS[d]);
  const res = await env.DB.prepare(`SELECT ${[`${per} period`, ...dims].join(', ')}, SUM(n) n, SUM(standalone) sa FROM installs_daily WHERE day >= ? AND day <= ?
    GROUP BY ${['period', ...dims].join(', ')} ORDER BY ${['period', ...dims].join(', ')} LIMIT ${MAX_ROWS + 1}`).bind(q.from, q.to).all();
  const raw = (res && res.results) || [];
  const rows = raw.slice(0, MAX_ROWS).map((r) => {
    const n = +r.n || 0, hide = share && n > 0 && n < MIN;
    return { period_type: q.period, period: r.period, week_start: q.period === 'week' ? weekStart(r.period) : weekStart(isoWeek(r.period)), lang: r.lang ?? 'all', platform: r.platform ?? 'all',
      app_version: r.version ?? 'all', installs: hide ? '' : n, home_screen: hide ? '' : +r.sa || 0, suppressed: hide ? 1 : 0 };
  });
  return { rows, truncated: raw.length > MAX_ROWS, columns: DATASETS.installs.columns.map((c) => c.name) };
}
const csvCell = (v) => { let s = String(v ?? '').replace(/[\r\n]+/g, ' '); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const csvBody = (columns, rows) => [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

export async function exportData(env, url, me, format, sid) {
  const q = parseExport(url, env);
  if (q.level === 'full' && me.role !== 'owner') return new Response(JSON.stringify({ error: 'Only the owner can download the full export. Shareable exports are open to everyone signed in.' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  let ex;
  try { ex = q.dataset === 'installs' ? await buildInstalls(env, q) : await buildUsage(env, q); }
  catch (e) { return new Response('The usage tables are not made yet: the next server update makes them (schema.sql).', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  const body = format === 'csv' ? csvBody(ex.columns, ex.rows) : JSON.stringify(ex.rows), hash = await sha256(body);
  const generated = new Date(nowMs(env)).toISOString();
  const query = { dataset: q.dataset, level: q.level, period: q.period, from: q.from, to: q.to, by: q.by.join(',') || 'none', unit: q.dataset === 'usage' ? q.unit : undefined, district: q.district || 'all' };
  await log(env, me, 'export', `export ${q.dataset} ${format}`, { target: q.dataset, params: query, rows: ex.rows.length, sha256: hash, session: sid });
  const suppression = q.level === 'full' ? 'none (full export, owner only, not for sharing)' : `rows where no day had ${MIN} or more phones (installs: fewer than ${MIN} installs) have their numbers left empty and suppressed=1`;
  const name = `sehat-${q.dataset}-${q.period}-${q.level}-${q.from}-to-${q.to}.${format}`;
  const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Content-Type-Options': 'nosniff' };
  const meta = { title: 'Sehat export: ' + DATASETS[q.dataset].title, generated_utc: generated, query, row_count: ex.rows.length, truncated: ex.truncated, suppression,
    consent_version_current: USAGE.CONSENT_VERSION || null, places_version: SDEFS.placesVersion, codes_version: CODES_VERSION, sha256: hash,
    caveats: ['Counts come only from phones whose family agreed to send them (see consent_version), and only once the phone goes online, so recent days fill in late.',
      'A phone-day is one phone that used the page on one day; the same phone on two days counts twice.', 'Weeks are ISO weeks, Monday to Sunday, by the day on the phone.',
      'Suppression is per row; totals you add up yourself may include hidden rows. Check before publishing tables.'] };
  if (format === 'csv') {
    const head = [`# ${meta.title}`, `# generated_utc: ${generated}`, `# query: ${Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('&')}`, `# row_count: ${ex.rows.length}${ex.truncated ? ' (truncated at ' + MAX_ROWS + ': narrow the query)' : ''}`,
      `# suppression: ${suppression}`, `# consent_version_current: ${meta.consent_version_current}`, `# places_version: ${meta.places_version} · codes_version: ${CODES_VERSION}`,
      `# codebook: /data/codebook.csv (columns of this file: dataset ${q.dataset})`, `# sha256: ${hash} (of every line below the # lines: grep -v "^#" file.csv | sha256sum)`,
      ...meta.caveats.map((c) => '# caveat: ' + c)].join('\n') + '\n';
    return new Response(head + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...headers } });
  }
  return new Response(JSON.stringify({ meta: { ...meta, sha256_of: 'the "rows" value written as compact JSON (jq -j -c .rows file.json | sha256sum)', columns: DATASETS[q.dataset].columns }, rows: ex.rows }, null, 1),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

/* ---------------- the codebook as a file ---------------- */
export async function codebookFile(env, me, format, sid) {
  const rows = [];
  for (const tb of TABLES) for (const c of tb.columns) rows.push({ kind: 'table', name: tb.name, group: tb.group, column: c.name, type: c.type, meaning: c.about, values: c.values || '', privacy: c.privacy });
  for (const [k, d] of Object.entries(DATASETS)) for (const c of d.columns) rows.push({ kind: 'export', name: 'dataset=' + k, group: d.title, column: c.name, type: c.type, meaning: c.about, values: c.values || '', privacy: c.privacy });
  for (const c of WATCH_EXPORT_COLUMNS) rows.push({ kind: 'export', name: '/watch/export ' + c[0], group: 'Disease watch', column: c[1], type: c[2], meaning: c[3], values: '', privacy: 'low' });
  const cols = ['kind', 'name', 'group', 'column', 'type', 'meaning', 'values', 'privacy'];
  await log(env, me, 'export', 'export codebook ' + format, { target: 'codebook', rows: rows.length, session: sid });
  const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="sehat-codebook.${format}"`, 'X-Content-Type-Options': 'nosniff' };
  if (format === 'csv') return new Response(csvBody(cols, rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...headers } });
  return new Response(JSON.stringify({ meta: { title: 'Sehat codebook', generated_utc: new Date(nowMs(env)).toISOString(), places_version: SDEFS.placesVersion, codes_version: CODES_VERSION,
    places: SDEFS.places.map((p) => ({ id: p.id, en: p.en, fa: p.fa || '', ps: p.ps || '', province: p.province, pcode: pcodeOf(p.id), province_pcode: provinceCodeOf(p.id) })),
    syndromes: SDEFS.syndromes.map((s) => ({ id: s.id, en: s.en, version: s.version, active: s.active })), age_groups: SDEFS.ageGroups.map((a) => ({ id: a.id, en: a.en })) }, rows }, null, 1),
  { headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
const WATCH_EXPORT_COLUMNS = [
  ['counts', 'week', 'text, ISO week', 'ISO week of the report day.'], ['counts', 'week_start', 'text, ISO date', 'Monday of the week.'], ['counts', 'syndrome', 'text', 'Illness id.'],
  ['counts', 'place', 'text', 'Sehat place id.'], ['counts', 'place_pcode', 'text', 'Official code where confirmed.'], ['counts', 'age_group', 'text', 'u5, 5-14, 15+.'], ['counts', 'reports', 'integer or "<5"', 'Counted reports (de-duplicated, not voided).'],
  ['alerts', 'baseline', 'number', 'Mean weekly count of the previous 4 weeks.'], ['alerts', 'rule', 'text', 'Alert rule id.'],
  ['dhis2', 'dataelement', 'text', 'DHIS2 data element code (SEHAT_<ILLNESS>_SUSP) or the HMIS UID from DHIS2_MAP.'], ['dhis2', 'period', 'text', 'DHIS2 weekly period, e.g. 2026W41.'],
  ['dhis2', 'orgunit', 'text', 'Official pcode where confirmed, else SEHAT_<PLACE>; or the HMIS UID from DHIS2_MAP.'], ['dhis2', 'categoryoptioncombo', 'text', 'Age group code (SEHAT_AGE_U5, SEHAT_AGE_5_14, SEHAT_AGE_15P).'],
  ['dhis2', 'value', 'integer', 'Counted reports. Shareable: cells under 5 are left out of the file.'],
];

/* ---------------- data versions ---------------- */
async function versions(env) {
  const all = async (sql) => { try { return ((await env.DB.prepare(sql).all()).results) || []; } catch { return []; } };
  const [usage, reports, inst] = await Promise.all([
    all("SELECT version, cv, SUM(devices) dd, MIN(day) d0, MAX(day) d1 FROM usage_daily WHERE page = '_day' GROUP BY version, cv ORDER BY d1 DESC, version DESC LIMIT 60"),
    all("SELECT COALESCE(app_version, '') v, COUNT(*) n, MIN(day) d0, MAX(day) d1, group_concat(DISTINCT syndrome || ' v' || def_version) defs FROM surv_reports GROUP BY v ORDER BY d1 DESC LIMIT 60"),
    all('SELECT version, SUM(n) n, MIN(day) d0, MAX(day) d1 FROM installs_daily GROUP BY version ORDER BY d1 DESC LIMIT 60'),
  ]);
  return { usage, reports, inst };
}

/* ---------------- the page ---------------- */
const sup = (n) => (n > 0 && n < MIN ? '&lt;5' : fmtN(+n || 0));
export async function page(env, url, me, ctx) {
  const lang = ctx.lang, v = await versions(env), owner = me.role === 'owner';
  const today = dayOf(nowMs(env)), d90 = dayOf(nowMs(env) - 89 * DAY);
  const levelSel = `<label>Access<select name="level"><option value="shareable">${esc(t(lang, 'shareable'))}</option>${owner ? `<option value="full">${esc(t(lang, 'full'))}</option>` : ''}</select></label>`;
  const fmtSel = `<label>Format<select name="fmt"><option value="csv">CSV (spreadsheet)</option><option value="json">JSON (with codebook)</option></select></label>`;
  const dates = `<label>From<input type="date" name="from" value="${d90}"></label><label>To<input type="date" name="to" value="${today}"></label>`;
  const per = `<label>Period<select name="period"><option value="week">Epi week (ISO, Mon-Sun)</option><option value="day">Day</option></select></label>`;
  const chk = (name, list, on) => `<fieldset style="border:1px solid var(--line);border-radius:10px;padding:6px 10px"><legend class="s">Split by</legend>${list.map(([v2, l]) => `<label style="flex-direction:row;gap:4px;display:inline-flex;margin-inline-end:10px"><input type="checkbox" name="${name}" value="${v2}"${on.includes(v2) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>`;
  const watchQs = (kind, lvl, fmt) => `/watch/export.${fmt}?kind=${kind}&level=${lvl}&weeks=12`;
  const W = (kind, label) => `<tr><td>${esc(label)}</td><td><a href="${watchQs(kind, 'shareable', 'csv')}">CSV</a> · <a href="${watchQs(kind, 'shareable', 'json')}">JSON</a></td><td>${owner ? `<a href="${watchQs(kind, 'full', 'csv')}">CSV</a> · <a href="${watchQs(kind, 'full', 'json')}">JSON</a>` : '<span class="muted">owner</span>'}</td></tr>`;
  const codeRows = SDEFS.places.filter((p) => p.province === 'Samangan').map((p) => { const dn = dhis2Names(env); return `<tr><td><code>${esc(p.id)}</code></td><td>${esc(p.en)}<div class="s rtlfont" dir="rtl">${esc(p.fa || '')}</div></td><td>${esc(pcodeOf(p.id)) || '<span class="muted">to confirm</span>'}</td><td>${esc(provinceCodeOf(p.id))}</td><td><code>${esc(dn.orgUnit(p.id))}</code></td></tr>`; }).join('');
  const dn = dhis2Names(env);
  const groups = [...new Set(TABLES.map((x) => x.group))];
  let body = `<h1>${esc(t(lang, 'data.title'))}</h1><p class="lead">${esc(t(lang, 'data.intro'))}</p>
<p class="noprint"><a href="#exports">${esc(t(lang, 'data.exports'))}</a> · <a href="#codebook">${esc(t(lang, 'data.codebook'))}</a> · <a href="#versions">${esc(t(lang, 'data.versions'))}</a> · <a href="#codes">${esc(t(lang, 'data.codes'))}</a> · <a href="#history">${esc(t(lang, 'data.history'))}</a></p>
<section class="card" id="exports"><h2>${esc(t(lang, 'data.exports'))}</h2>
<p class="s">Every file has ISO dates, stable district codes, a header stating the query, row count, suppression rule, consent and place versions and a SHA-256 of its rows. Shareable files leave empty any row where no day had ${MIN} or more phones (so it could be about fewer than ${MIN} people) and mark the row <code>suppressed=1</code>. ${owner ? 'Full files (every number) are for you only and are not for sharing.' : 'Full files are for the owner only.'} Every download is written in the audit log.</p>
<h3>App use (usage counts)</h3>
<form class="filt" method="get" action="/data/export"><input type="hidden" name="dataset" value="usage">${per}${dates}
<label>Rows<select name="unit"><option value="page">Each page</option><option value="app">Whole app only</option></select></label>
${chk('by', [['district', 'District'], ['lang', 'Language'], ['platform', 'Phone type'], ['version', 'App build'], ['cv', 'Consent wording']], ['district'])}${levelSel}${fmtSel}<button class="primary">${esc(t(lang, 'download'))}</button></form>
<h3>Installs</h3>
<form class="filt" method="get" action="/data/export"><input type="hidden" name="dataset" value="installs">${per}${dates}
${chk('by', [['lang', 'Language'], ['platform', 'Phone type'], ['version', 'App build']], [])}${levelSel}${fmtSel}<button class="primary">${esc(t(lang, 'download'))}</button></form>
<h3>Disease watch (last 12 epi weeks; choose other weeks on the Disease watch page)</h3>
<div class="tw"><table><tr><th>Table</th><th>${esc(t(lang, 'shareable'))}</th><th>${esc(t(lang, 'full'))}</th></tr>
${W('counts', 'Weekly counts by illness, district and age group')}${W('alerts', 'Alerts (rules applied to weekly counts)')}${W('signals', 'Symptom searches (weaker signal)')}${W('dhis2', 'DHIS2 import file (weekly counts, HMIS)')}
${owner ? `<tr><td>Every report as received (with corrections applied)</td><td class="muted">—</td><td><a href="${watchQs('raw', 'full', 'csv')}">CSV</a> · <a href="${watchQs('raw', 'full', 'json')}">JSON</a></td></tr><tr><td>Every correction (who, when, why)</td><td class="muted">—</td><td><a href="${watchQs('corrections', 'full', 'csv')}">CSV</a> · <a href="${watchQs('corrections', 'full', 'json')}">JSON</a></td></tr>` : ''}</table></div>
<p class="s"><b>DHIS2:</b> a dataValueSet for Afghanistan's HMIS. Weekly periods (<code>2026W41</code>), data elements <code>${esc(dn.dataElement('measles'))}</code> etc., org units by official code where confirmed, age groups as category option combos (<code>${esc(Object.values(AGE_CODE).join(', '))}</code>). Import in DHIS2 with <i>ID scheme: Code</i>${dn.custom ? ', or with the HMIS UIDs set in DHIS2_MAP (set)' : '. The HMIS team can give their own UIDs: set DHIS2_MAP in server/wrangler.toml (docs/DASHBOARD.md)'}. The shareable file leaves out cells under ${MIN}; the full file (owner) has every count.</p>
<h3>Codebook</h3><p><a class="btn" href="/data/codebook.csv">Codebook CSV</a> <a class="btn" href="/data/codebook.json">Codebook JSON (with places, illnesses, age groups)</a></p></section>`;
  body += `<section class="card" id="codebook"><h2>${esc(t(lang, 'data.codebook'))}</h2><p class="s">Privacy: <b>none</b> = says nothing about a person · <b>low</b> = a count or category · <b>indirect</b> = could help recognise a family together with other facts (never in shareable files) · <b>secret</b> = a hash of a password or token (never exported).</p>
${groups.map((g) => `<h3>${esc(g)}</h3>${TABLES.filter((x) => x.group === g).map((tb) => `<details class="box"><summary><code>${esc(tb.name)}</code> · ${tb.columns.length} fields</summary><p class="s">${esc(tb.about)}</p><div class="tw"><table><tr><th>Field</th><th>Type</th><th>Meaning</th><th>Privacy</th></tr>${tb.columns.map((c) => `<tr><td><code>${esc(c.name)}</code></td><td class="s">${esc(c.type)}</td><td>${esc(c.about)}${c.values ? `<div class="s">Values: ${esc(c.values)}</div>` : ''}</td><td class="s">${esc(c.privacy)}</td></tr>`).join('')}</table></div></details>`).join('')}`).join('')}
<h3>Exports</h3>${Object.entries(DATASETS).map(([k, d]) => `<details class="box"><summary>dataset=<code>${esc(k)}</code> · ${esc(d.title)}</summary><div class="tw"><table><tr><th>Column</th><th>Type</th><th>Meaning</th></tr>${d.columns.map((c) => `<tr><td><code>${esc(c.name)}</code></td><td class="s">${esc(c.type)}</td><td>${esc(c.about)}</td></tr>`).join('')}</table></div></details>`).join('')}
<p class="s">Disease-watch exports are described on the <a href="/watch/methods">methods page</a>.</p></section>`;
  body += `<section class="card" id="versions"><h2>${esc(t(lang, 'data.versions'))}</h2><p class="s">Each usage row keeps the app build and the consent wording it was sent under; each report keeps its app build and case-definition version. Current: consent wording <code>${esc(USAGE.CONSENT_VERSION || '?')}</code> · case definitions <code>${esc(SDEFS.version)}</code> · alert rules <code>${esc(SDEFS.alertRules.version)}</code> · places <code>${esc(SDEFS.placesVersion)}</code> · codes <code>${CODES_VERSION}</code>.</p>
<h3>Usage counts by app build and consent wording</h3>${v.usage.length ? `<div class="tw"><table><tr><th>App build</th><th>Consent wording</th><th class="n">Phone-days</th><th>First day</th><th>Last day</th></tr>${v.usage.map((r) => `<tr><td><code>${esc(r.version)}</code></td><td><code>${esc(r.cv)}</code>${r.cv === 'legacy' ? ' <span class="s">older app, no question asked</span>' : ''}</td><td class="n">${sup(+r.dd)}</td><td>${esc(r.d0)}</td><td>${esc(r.d1)}</td></tr>`).join('')}</table></div>` : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}
<h3>Illness reports by app build</h3>${v.reports.length ? `<div class="tw"><table><tr><th>App build</th><th class="n">Reports</th><th>Definitions</th><th>First day</th><th>Last day</th></tr>${v.reports.map((r) => `<tr><td><code>${esc(r.v || '(none)')}</code></td><td class="n">${sup(+r.n)}</td><td class="s">${esc(r.defs || '')}</td><td>${esc(r.d0)}</td><td>${esc(r.d1)}</td></tr>`).join('')}</table></div><p class="s">Reports do not carry the consent version themselves; the consent wording of each app build is in the table above.</p>` : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}
<h3>Installs by app build</h3>${v.inst.length ? `<div class="tw"><table><tr><th>App build</th><th class="n">Installs</th><th>First day</th><th>Last day</th></tr>${v.inst.map((r) => `<tr><td><code>${esc(r.version)}</code></td><td class="n">${sup(+r.n)}</td><td>${esc(r.d0)}</td><td>${esc(r.d1)}</td></tr>`).join('')}</table></div>` : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}</section>`;
  body += `<section class="card" id="codes"><h2>${esc(t(lang, 'data.codes'))}</h2><p class="s">The Sehat id never changes, so it is the stable key. Official codes are filled in only where checked (${esc(PCODE_SOURCE)}). Provinces outside Samangan are exported by their Sehat id (<code>p-balkh</code> etc.).</p>
<div class="tw"><table><tr><th>Sehat id</th><th>Name</th><th>District code</th><th>Province code</th><th>DHIS2 org unit in exports</th></tr>${codeRows}</table></div></section>`;
  // export history: the owner sees everyone's, others their own
  let hist = [];
  try {
    hist = ((await env.DB.prepare(`SELECT ts, who, role, action, params, row_count, sha256 FROM audit_log WHERE category = 'export'${owner ? '' : ' AND who_id IS ?'} ORDER BY seq DESC LIMIT 30`).bind(...(owner ? [] : [me.id])).all()).results) || [];
  } catch {}
  body += `<section class="card" id="history"><h2>${esc(t(lang, 'data.history'))}</h2><p class="s">${owner ? 'The last 30 downloads by anyone' : 'Your last 30 downloads'}: filters, rows and the SHA-256 printed in each file.${owner ? ' The full list is in the <a href="/audit?cat=export">audit log</a>.' : ''}</p>
${hist.length ? `<div class="tw"><table><tr><th>${esc(t(lang, 'audit.when'))}</th><th>${esc(t(lang, 'audit.who'))}</th><th>${esc(t(lang, 'audit.what'))}</th><th class="n">Rows</th><th>SHA-256</th></tr>${hist.map((h) => `<tr><td class="s">${esc(when(h.ts))}</td><td>${esc(h.who)}</td><td>${esc(h.action)}<div class="s"><code>${esc(String(h.params || '').slice(0, 160))}</code></div></td><td class="n">${h.row_count ?? ''}</td><td class="s"><code>${esc(String(h.sha256 || '').slice(0, 16))}</code></td></tr>`).join('')}</table></div>` : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}</section>`;
  return htmlResponse(shell({ ...ctx, url, me, title: t(lang, 'data.title'), body, script: DATA_SCRIPT }), ctx.nonce);
}
// the export forms: one address per format (the form's "fmt" picks .csv or .json)
const DATA_SCRIPT = `document.querySelectorAll('form[action="/data/export"]').forEach(function (f) {
  f.addEventListener('submit', function () { var s = f.querySelector('[name=fmt]'); f.action = '/data/export.' + (s ? s.value : 'csv'); if (s) s.disabled = true;
    var by = [].slice.call(f.querySelectorAll('input[name=by]:checked')).map(function (x) { return x.value; }).join(',');
    f.querySelectorAll('input[name=by]').forEach(function (x) { x.disabled = true; });
    var h = document.createElement('input'); h.type = 'hidden'; h.name = 'by'; h.value = by; f.appendChild(h);
    setTimeout(function () { if (s) s.disabled = false; f.querySelectorAll('input[name=by]').forEach(function (x) { x.disabled = false; }); h.remove(); }, 500); });
});`;
export { placeEn };
export const _test = { WEEK_SQL };
