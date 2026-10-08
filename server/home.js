// The overview (/dashboard): the first page after sign-in. One screen that answers "how is the app used, and is anything
// happening?": key numbers, disease-watch alerts and reports by district on a schematic Samangan map with a ranked list,
// use over the last 12 epi weeks, and the most-read sections. Every number built from fewer than 5 is shown as "<5", so the
// page is safe to screenshot and share.
import { esc, ltr, shell, htmlResponse, barChart, hbars, tileMap, periodForm, fmtN, when } from './ui.js';
import { t, nameIn } from './i18n.js';
import * as USAGE from './usage.js';
import * as SURV from './surveillance.js';
import { log } from './auditlog.js';
import { _test as R } from './research.js';

const MIN = USAGE.MIN_CELL, DAY = 864e5;
const PLACES = new Map(SURV.DEFS.places.map((p) => [p.id, p]));
const SYN = new Map(SURV.DEFS.syndromes.map((s) => [s.id, s]));
const small = (n) => n > 0 && n < MIN;
const show = (n) => (small(n) ? '<5' : fmtN(n));
const showT = (n) => '\u2066' + show(n) + '\u2069'; // inside a sentence: an isolated left-to-right run, so "<5" stays "<5" in Dari and Pashto

async function safe(p, dflt) { try { return await p; } catch { return dflt; } }

export async function overview(env, url, me, ctx) {
  const lang = ctx.lang, q = USAGE.parseQuery(url, env), now = q.now;
  const placeName = (id) => (id === 'none' ? t(lang, 'notChosen') : nameIn(lang, PLACES.get(id)) || id);
  const synName = (id) => nameIn(lang, SYN.get(id)) || id;
  const cur = SURV.isoWeek(new Date(now).toISOString().slice(0, 10)), from12 = SURV.addWeeks(cur, -11), w4 = SURV.addWeeks(cur, -3), w2 = SURV.addWeeks(cur, -1);
  const one = (sql, ...a) => safe(env.DB.prepare(sql).bind(...a).first(), null);
  const all = (sql, ...a) => safe(env.DB.prepare(sql).bind(...a).all().then((r) => r.results || []), []);
  const dF = q.district ? ' AND district = ?' : '', dA = q.district ? [q.district] : [];
  const [raw, weeksUse, legacyInst, fb, fresh, wk] = await Promise.all([
    USAGE.load(env, q),
    all(`SELECT ${R.WEEK_SQL('day')} wk, SUM(devices) dd FROM usage_daily WHERE page = '_day' AND day >= ?${dF} GROUP BY wk ORDER BY wk`, SURV.weekStart(from12), ...dA),
    one('SELECT COUNT(*) n FROM installs'),
    one('SELECT COUNT(*) n FROM feedback WHERE ts >= ?', now - q.days * DAY),
    Promise.all([one("SELECT MAX(day) d FROM usage_daily WHERE page = '_day'"), one('SELECT MAX(received_ts) t FROM surv_reports'), one('SELECT MAX(ts) t FROM feedback')]),
    safe(SURV.weekly(env, { from: from12, to: cur, syndrome: null, place: null }), { rows: [], signals: [] }),
  ]);
  const v = raw.ok ? USAGE.view(raw, q) : null;
  const k = v ? v.kpi : null;
  const al = SURV.alerts(wk.rows, { from: from12, to: cur });
  const recent = al.filter((a) => a.week >= w2);
  // reports per place in the last 4 weeks, and per week for the chart
  const per = {}, perWeek = {};
  for (const r of wk.rows) {
    if (r.week < from12) continue;
    perWeek[r.week] = (perWeek[r.week] || 0) + r.n;
    if (r.week >= w4) per[r.place] = (per[r.place] || 0) + r.n;
  }
  const alertPlaces = new Set(recent.map((a) => a.place));
  const cells = {};
  for (const p of SURV.DEFS.places) if (per[p.id] || alertPlaces.has(p.id)) cells[p.id] = { n: per[p.id] || 0, lt: small(per[p.id] || 0), alert: alertPlaces.has(p.id) };
  const reports4 = Object.values(per).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(per).sort((a, b) => b[1] - a[1] || placeName(a[0]).localeCompare(placeName(b[0])));
  const weeks12 = []; for (let w = from12; w <= cur && weeks12.length < 12; w = SURV.addWeeks(w, 1)) weeks12.push(w);
  const useBy = Object.fromEntries(weeksUse.map((r) => [r.wk, +r.dd || 0]));
  const alertWeeks = new Set(al.map((a) => a.week));

  // key numbers
  const kpi = (label, val, sub, cls = '', href = '') => `<div class="kpi ${cls}">${href ? `<a href="${href}" style="color:inherit;text-decoration:none">` : ''}<div class="l">${esc(label)}</div><div class="v${val === '<5' ? ' lt' : ''}">${ltr(val)}</div><div class="sub">${esc(sub)}</div>${href ? '</a>' : ''}</div>`;
  const installs = k ? k.installs + ((legacyInst && +legacyInst.n) || 0) : (legacyInst && +legacyInst.n) || 0;
  let body = `<h1>${esc(t(lang, 'home.title'))}${q.district ? ' · ' + esc(placeName(q.district)) : ''}</h1><p class="lead">${esc(t(lang, 'home.intro'))}</p>
${periodForm('/dashboard', q, lang, SURV.DEFS.places.map((p) => ({ id: p.id, name: placeName(p.id), province: p.province })))}
${v ? '' : '<div class="msg warn">The tables for the usage counts are not in the database yet. The next server update makes them (schema.sql).</div>'}
<div class="kpis">
${kpi(t(lang, 'kpi.phonesDay'), k && !small(k.phoneDays) ? (Math.round(k.perDay * 10) / 10).toString() : k && k.phoneDays ? '<5' : '0', t(lang, 'kpi.phonesDaySub', { n: k ? showT(k.phoneDays) : 0 }), '', '/usage')}
${kpi(t(lang, 'kpi.installs'), show(installs), t(lang, 'kpi.installsSub', { n: k ? showT(k.newInstalls) : 0 }))}
${kpi(t(lang, 'kpi.minutes'), k ? (small(k.phoneDays) ? '<5' : fmtN(k.seconds / 60)) : '0', t(lang, 'kpi.minutesSub', { n: k ? (small(k.phoneDays) ? showT(1) : fmtN(k.plays)) : 0 }))}
${kpi(t(lang, 'kpi.alerts'), String(recent.length), t(lang, 'kpi.alertsSub'), recent.length ? 'alert' : '', '/watch')}
${kpi(t(lang, 'kpi.reports'), show(reports4), t(lang, 'kpi.reportsSub'), '', '/watch')}
${kpi(t(lang, 'kpi.feedback'), fmtN((fb && +fb.n) || 0), t(lang, 'kpi.feedbackSub'), '', '/inbox')}
</div>`;
  // alerts and the map
  body += `<div class="grid">
<section class="card"><h2>${esc(t(lang, 'home.map'))}</h2>${tileMap(cells, placeName, { lang, label: t(lang, 'home.map') })}<p class="s">${esc(t(lang, 'home.mapNote'))}</p>
<h3>${esc(t(lang, 'home.ranked'))}</h3>${ranked.length ? hbars(ranked.slice(0, 10).map(([id, n]) => ({ name: placeName(id), value: small(n) ? 0 : n, lt: small(n), textHtml: `${ltr(show(n))}${alertPlaces.has(id) ? ` <span class="pill red">! ${esc(t(lang, 'alert'))}</span>` : ''}` })), lang) : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}</section>
<section class="card"><h2>${esc(t(lang, 'home.alerts'))}</h2>${recent.length ? `<div class="tw"><table><tr><th>${esc(t(lang, 'week'))}</th><th>${esc(t(lang, 'illness'))}</th><th>${esc(t(lang, 'district'))}</th><th class="n">${esc(t(lang, 'reports'))}</th></tr>
${recent.slice(0, 12).map((a) => `<tr><td class="wk">${ltr(a.week)}</td><td><span class="pill red">!</span> ${esc(synName(a.syndrome))}</td><td>${esc(placeName(a.place))}</td><td class="n">${ltr(show(a.reports))}</td></tr>`).join('')}</table></div>` : `<div class="empty">${esc(t(lang, 'home.noAlerts'))}</div>`}
<p class="s">${esc(t(lang, 'home.alertNote'))} <a href="/watch">${esc(t(lang, 'home.more'))} →</a></p>
<h3>${esc(t(lang, 'home.reportsTrend'))}</h3>${barChart(weeks12.map((w) => ({ x: w, short: w.slice(5), y: perWeek[w] || 0, lt: small(perWeek[w] || 0), hot: alertWeeks.has(w) })), { lang, height: 150, label: t(lang, 'home.reportsTrend'), xName: t(lang, 'week'), yName: t(lang, 'reports'), hotLabel: t(lang, 'alertWeek') })}</section>
<section class="card"><h2>${esc(t(lang, 'home.trend'))}</h2>${barChart(weeks12.map((w) => ({ x: w, short: w.slice(5), y: useBy[w] || 0, lt: small(useBy[w] || 0) })), { lang, label: t(lang, 'home.trend'), xName: t(lang, 'week'), yName: 'phone-days' })}<p class="s">${esc(t(lang, 'home.trendNote'))} ${esc(t(lang, 'lt5'))}.</p></section>
<section class="card"><h2>${esc(t(lang, 'home.sections'))}</h2>${v && v.secs.length ? hbars(v.secs.map((x) => ({ name: t(lang, 'sec.' + x.g), value: small(x.dd) ? 0 : x.s, lt: small(x.dd), text: small(x.dd) ? '<5' : Math.round(x.share * 100) + '% · ' + fmtN(x.s / 60) + ' min' })), lang) : `<div class="empty">${esc(t(lang, 'nodata'))}</div>`}
<p class="s">${esc(t(lang, 'home.sectionsNote'))} <a href="/usage?days=${q.days}${q.district ? '&district=' + encodeURIComponent(q.district) : ''}">${esc(t(lang, 'home.more'))} →</a></p></section>
</div>`;
  // freshness and quick links
  const [fu, fr, ff] = fresh;
  body += `<div class="grid" style="margin-top:14px"><section class="card"><h2>${esc(t(lang, 'home.fresh'))}</h2><ul class="s" style="margin:0;padding-inline-start:18px">
<li>${esc(t(lang, 'home.freshUsage'))}: <b>${fu && fu.d ? ltr(fu.d) : esc(t(lang, 'never'))}</b></li><li>${esc(t(lang, 'home.freshReports'))}: <b>${fr && fr.t ? ltr(when(fr.t) + ' UTC') : esc(t(lang, 'never'))}</b></li><li>${esc(t(lang, 'home.freshFeedback'))}: <b>${ff && ff.t ? ltr(when(ff.t) + ' UTC') : esc(t(lang, 'never'))}</b></li></ul></section>
<section class="card"><h2>${esc(t(lang, 'home.quick'))}</h2><p style="display:flex;flex-wrap:wrap;gap:8px;margin:0"><a class="btn" href="/data#exports">${esc(t(lang, 'nav.data'))}</a><a class="btn" href="/watch">${esc(t(lang, 'nav.watch'))}</a><a class="btn" href="/inbox">${esc(t(lang, 'nav.inbox'))}</a>${me.role === 'owner' ? `<a class="btn" href="/audit">${esc(t(lang, 'nav.audit'))}</a>` : ''}<a class="btn" href="/admin">${esc(t(lang, 'nav.editor'))}</a></p></section></div>`;
  await log(env, me, 'view', 'view overview', { params: { days: q.days, district: q.district || 'all' }, session: ctx.sid });
  return htmlResponse(shell({ ...ctx, url, me, title: t(lang, 'home.title'), body }), ctx.nonce);
}
