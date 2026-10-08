// The audit log: who did what, when, and what it was before and after. Table audit_log is append-only (this file only INSERTs,
// and schema.sql has triggers that refuse UPDATE and DELETE). The older table "audit" (before 8 October 2026) is kept and shown.
// Owner only: /audit (the page, with filters) and /audit/export.csv or .json (the same filters; the export is itself logged).
import { esc, shell, htmlResponse, when, isoTime } from './ui.js';
import { t } from './i18n.js';

export const CATEGORIES = ['sign-in', 'view', 'export', 'edit', 'publish', 'correction', 'people', 'system'];
const MAX_JSON = 3000;
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const nowMs = (env) => (env && Number.isFinite(+env.AUTH_NOW) && +env.AUTH_NOW > 0 ? +env.AUTH_NOW : Date.now());

// a value for the before/after columns: short JSON in full, long JSON as its length and SHA-256
export async function brief(v) {
  if (v === undefined || v === null) return null; // nothing before (or after): an empty column
  const s = JSON.stringify(v);
  if (s.length <= MAX_JSON) return s;
  return JSON.stringify({ long: true, chars: s.length, sha256: await sha256(s), start: s.slice(0, 200) });
}

// Write one line. me: {id, name, role}; o: {target, before, after, params, rows, sha256, session}. Never throws: a failed
// log write must not stop the work (it is reported on the audit page as a gap in nothing but the log itself).
// Views of the same page with the same filters by the same person within 10 minutes are written once.
export async function log(env, me, category, action, o = {}) {
  try {
    const now = nowMs(env), params = o.params === undefined ? null : JSON.stringify(o.params).slice(0, 1000);
    const whoId = me && Number.isInteger(me.id) ? me.id : null, role = (me && me.role) || 'none', who = String((me && me.name) || 'unknown').slice(0, 80);
    if (category === 'view') {
      const last = await env.DB.prepare('SELECT seq FROM audit_log WHERE ts > ? AND who_id IS ? AND role = ? AND action = ? AND params IS ? LIMIT 1')
        .bind(now - 600_000, whoId, role, action, params).first();
      if (last) return;
    }
    await env.DB.prepare(`INSERT INTO audit_log (ts, who, who_id, role, category, action, target, before, after, params, row_count, sha256, session)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(now, who, whoId, role, category, String(action).slice(0, 80), o.target == null ? null : String(o.target).slice(0, 300),
      await brief(o.before), await brief(o.after), params, Number.isInteger(o.rows) ? o.rows : null, o.sha256 || null, o.session || null).run();
  } catch {} // the table is not made yet (schema.sql not run again), or the database is busy
}

/* ---------------- reading the log ---------------- */
export function parseQuery(url) {
  const p = url.searchParams, day = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : '');
  return { cat: CATEGORIES.includes(p.get('cat')) ? p.get('cat') : '', who: String(p.get('who') || '').slice(0, 60), q: String(p.get('q') || '').slice(0, 60),
    from: day(p.get('from')), to: day(p.get('to')), before: /^\d{1,12}$/.test(p.get('before') || '') ? +p.get('before') : 0 };
}
function where(q) {
  const w = [], a = [], like = (x) => '%' + x.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  if (q.cat) { w.push('category = ?'); a.push(q.cat); }
  if (q.who) { w.push("who LIKE ? ESCAPE '\\'"); a.push(like(q.who)); }
  if (q.q) { w.push('(' + ['action', 'target', 'before', 'after', 'params'].map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); for (let i = 0; i < 5; i++) a.push(like(q.q)); }
  if (q.from) { w.push('ts >= ?'); a.push(Date.parse(q.from + 'T00:00:00Z')); }
  if (q.to) { w.push('ts < ?'); a.push(Date.parse(q.to + 'T00:00:00Z') + 864e5); }
  return { sql: w.length ? ' WHERE ' + w.join(' AND ') : '', args: a };
}
export async function rows(env, q, limit = 100) {
  const w = where(q), extra = q.before ? (w.sql ? ' AND seq < ?' : ' WHERE seq < ?') : '';
  try {
    return ((await env.DB.prepare(`SELECT * FROM audit_log${w.sql}${extra} ORDER BY seq DESC LIMIT ?`).bind(...w.args, ...(q.before ? [q.before] : []), limit).all()).results) || [];
  } catch { return null; }
}
async function oldRows(env, limit = 200) {
  try { return ((await env.DB.prepare('SELECT id, ts, who, role, action, detail FROM audit ORDER BY id DESC LIMIT ?').bind(limit).all()).results) || []; } catch { return []; }
}

const COLS = ['seq', 'time_utc', 'who', 'who_id', 'role', 'category', 'action', 'target', 'before', 'after', 'params', 'row_count', 'sha256', 'session'];
const cell = (v) => { let s = String(v ?? '').replace(/[\r\n]+/g, ' '); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const asRow = (r) => ({ seq: r.seq, time_utc: isoTime(r.ts), who: r.who, who_id: r.who_id, role: r.role, category: r.category, action: r.action, target: r.target || '', before: r.before || '', after: r.after || '', params: r.params || '', row_count: r.row_count ?? '', sha256: r.sha256 || '', session: r.session || '' });

export async function exportLog(env, url, me, format, sid) {
  const q = parseQuery(url), list = (await rows(env, { ...q, before: 0 }, 50000)) || [];
  const data = list.map(asRow), body = format === 'csv' ? [COLS.join(','), ...data.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n') + '\n' : JSON.stringify(data);
  const hash = await sha256(body), params = { cat: q.cat || 'all', who: q.who, q: q.q, from: q.from, to: q.to };
  await log(env, me, 'export', 'export audit log ' + format, { target: 'audit_log', params, rows: data.length, sha256: hash, session: sid });
  const name = `sehat-audit-log-${new Date(nowMs(env)).toISOString().slice(0, 10)}.${format}`;
  const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Content-Type-Options': 'nosniff' };
  const meta = { title: 'Sehat audit log', generated_utc: new Date(nowMs(env)).toISOString(), query: params, row_count: data.length, sha256: hash, columns: COLS,
    note: 'Append-only: the database refuses changes and deletions. before/after are JSON; long values are given as their length and SHA-256.' };
  if (format === 'csv') {
    const head = [`# ${meta.title}`, `# generated_utc: ${meta.generated_utc}`, `# query: ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')}`, `# row_count: ${data.length}`,
      `# sha256: ${hash} (of every line below the # lines: grep -v "^#" file.csv | sha256sum)`, `# ${meta.note}`].join('\n') + '\n';
    return new Response(head + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...headers } });
  }
  return new Response(JSON.stringify({ meta: { ...meta, sha256_of: 'the "rows" value written as compact JSON (jq -j -c .rows file.json | sha256sum)' }, rows: data }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

// "before → after" in plain text
function change(r) {
  const show = (s) => { if (!s) return ''; try { const v = JSON.parse(s); if (v && v.long) return `(${v.chars} characters, sha256 ${String(v.sha256).slice(0, 12)}…)`; return typeof v === 'string' ? v : JSON.stringify(v); } catch { return s; } };
  const b = show(r.before), a = show(r.after);
  if (!b && !a) return '';
  return `${b ? `<span class="muted">${esc(b.slice(0, 300))}</span> → ` : ''}${esc(a.slice(0, 300))}`;
}

export async function page(env, url, me, ctx) {
  const lang = ctx.lang, q = parseQuery(url), list = await rows(env, q, 100);
  const qs = (o) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ cat: q.cat, who: q.who, q: q.q, from: q.from, to: q.to, ...o })) if (v) u.set(k, v); const s = u.toString(); return s ? '?' + s : ''; };
  let body = `<h1>${esc(t(lang, 'audit.title'))}</h1><p class="lead">${esc(t(lang, 'audit.intro'))}</p>
<form class="filt noprint" method="get" action="/audit">
<label>${esc(t(lang, 'audit.category'))}<select name="cat"><option value="">${esc(t(lang, 'all'))}</option>${CATEGORIES.map((c) => `<option value="${c}"${q.cat === c ? ' selected' : ''}>${esc(t(lang, 'cat.' + c))}</option>`).join('')}</select></label>
<label>${esc(t(lang, 'audit.who'))}<input name="who" value="${esc(q.who)}" size="12"></label>
<label>${esc(t(lang, 'audit.search'))}<input name="q" value="${esc(q.q)}" size="14"></label>
<label>From<input type="date" name="from" value="${esc(q.from)}"></label><label>To<input type="date" name="to" value="${esc(q.to)}"></label>
<button class="primary">${esc(t(lang, 'show'))}</button></form>
<p class="noprint"><a class="btn" href="/audit/export.csv${qs({})}">${esc(t(lang, 'download'))} CSV</a> <a class="btn" href="/audit/export.json${qs({})}">${esc(t(lang, 'download'))} JSON</a> <span class="s">Same filters. The download is itself written in the log, with its row count and SHA-256.</span></p>`;
  if (list === null) body += `<div class="msg warn">The audit table is not in the database yet. It is made by the next server update (schema.sql).</div>`;
  else if (!list.length) body += `<div class="empty">${esc(t(lang, 'nodata'))}</div>`;
  else {
    body += `<div class="card tw"><table><tr><th>#</th><th>${esc(t(lang, 'audit.when'))}</th><th>${esc(t(lang, 'audit.who'))}</th><th>${esc(t(lang, 'audit.what'))}</th><th>${esc(t(lang, 'audit.change'))}</th></tr>
${list.map((r) => `<tr><td class="n s">${r.seq}</td><td class="s" style="white-space:nowrap">${esc(when(r.ts))}</td><td>${esc(r.who)}<div class="s">${esc(r.role)}${r.session ? ' · ' + esc(r.session) : ''}</div></td>
<td><span class="pill grey">${esc(t(lang, 'cat.' + r.category))}</span> ${esc(r.action)}${r.target ? `<div class="s">${esc(r.target)}</div>` : ''}${r.params ? `<div class="s"><code>${esc(r.params.slice(0, 200))}</code></div>` : ''}${r.row_count != null ? `<div class="s">${r.row_count} rows${r.sha256 ? ' · sha256 ' + esc(r.sha256.slice(0, 16)) + '…' : ''}</div>` : ''}</td>
<td class="s" style="max-width:420px;overflow-wrap:anywhere">${change(r)}</td></tr>`).join('')}</table></div>`;
    if (list.length === 100) body += `<p><a class="btn" href="/audit${qs({ before: list[list.length - 1].seq })}">${esc(t(lang, 'audit.more'))} →</a></p>`;
  }
  const old = await oldRows(env);
  if (old.length) body += `<details class="card"><summary>${esc(t(lang, 'audit.older'))} · ${old.length}</summary><p class="s">The first log, kept as it was. It wrote only names and actions, and repeated views were merged.</p><div class="tw"><table><tr><th>${esc(t(lang, 'audit.when'))}</th><th>${esc(t(lang, 'audit.who'))}</th><th>${esc(t(lang, 'audit.what'))}</th></tr>${old.map((x) => `<tr><td class="s">${esc(when(x.ts))}</td><td>${esc(x.role === 'owner' ? 'Owner' : x.who)}</td><td>${esc(x.action)}${x.detail ? ': ' + esc(x.detail) : ''}</td></tr>`).join('')}</table></div></details>`;
  return htmlResponse(shell({ ...ctx, url, me, title: t(lang, 'audit.title'), body }), ctx.nonce);
}
