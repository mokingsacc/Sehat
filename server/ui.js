// The frame every signed-in dashboard page shares: header, navigation, language switch (English, Dari, Pashto), sign-out,
// colours (light and dark), and small charts drawn as SVG on the server (no chart library, fast on a slow connection).
// Pages are plain HTML; the few page scripts carry a per-request nonce, and the Content-Security-Policy refuses any other script.
import { t, LANGS, LANG_NAME, RTL } from './i18n.js';

export const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON that is safe inside a <script> tag
export const scriptJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
export const fmtN = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n ?? ''));
export const isoTime = (ts) => { const d = new Date(+ts); return isNaN(d) ? '?' : d.toISOString(); };
// numbers, weeks, dates and codes keep their left-to-right order inside Dari and Pashto text
export const ltr = (x) => `<bdi dir="ltr">${esc(x)}</bdi>`;
export const when = (ts) => (ts ? isoTime(ts).slice(0, 16).replace('T', ' ') : '');

export function newNonce() { return [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join(''); }

// security headers for every page: only our own nonce'd scripts run, nothing loads from elsewhere (except the app's own
// address for the editor), no framing, no sniffing. Referrer: same-origin, because with no-referrer browsers send
// "Origin: null" on form posts and the CSRF check could not tell our own pages from others (no key is in any address now).
export function pageHeaders(nonce, extra = {}) {
  const app = extra.appUrl ? ' ' + extra.appUrl : '';
  const csp = [`default-src 'self'`, `script-src 'nonce-${nonce}'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:${app}`, `media-src 'self' blob:${app}`,
    `connect-src 'self'${app}`, `font-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`].join('; ');
  return { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'X-Robots-Tag': 'noindex' };
}
export const htmlResponse = (html, nonce, status = 200, extra = {}) => new Response(html, { status, headers: { ...pageHeaders(nonce, extra), ...(extra.headers || {}) } });

export const CSS = `:root{--bg:#F7F5F0;--card:#fff;--ink:#1F1D1A;--ink2:#5C574F;--ink3:#857F75;--line:#E4DED3;--brand:#1F6F7A;--brand2:#14535B;--brandBg:#E6F1EF;
--red:#B42318;--redBg:#FDECEA;--amber:#8A5A00;--amberBg:#FFF4D6;--good:#1B6E3A;--goodBg:#E6F4EA;--seq1:#E6F1EF;--seq2:#B5D8D2;--seq3:#6FB1A8;--seq4:#2E8A80;--seq5:#14535B;--focus:#C2410C}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#151514;--card:#1F1F1D;--ink:#F2F0EB;--ink2:#C6C1B7;--ink3:#9A948A;--line:#383632;--brand:#5FB3AA;--brand2:#8FD0C7;--brandBg:#1D3532;
--red:#F07A6E;--redBg:#3A1E1B;--amber:#E5B455;--amberBg:#3A2E14;--good:#7CC994;--goodBg:#183021;--seq1:#1D3532;--seq2:#245049;--seq3:#2E7A70;--seq4:#4FA79B;--seq5:#8FD0C7}}
:root[data-theme="dark"]{--bg:#151514;--card:#1F1F1D;--ink:#F2F0EB;--ink2:#C6C1B7;--ink3:#9A948A;--line:#383632;--brand:#5FB3AA;--brand2:#8FD0C7;--brandBg:#1D3532;--red:#F07A6E;--redBg:#3A1E1B;--amber:#E5B455;--amberBg:#3A2E14;--good:#7CC994;--goodBg:#183021;--seq1:#1D3532;--seq2:#245049;--seq3:#2E7A70;--seq4:#4FA79B;--seq5:#8FD0C7}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
[dir=rtl] body,[dir=rtl] .rtlfont{font-family:"Noto Naskh Arabic",Tahoma,system-ui,sans-serif}
a{color:var(--brand)}a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.skip{position:absolute;top:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.skip:focus{width:auto;height:auto;clip:auto;top:8px;background:var(--card);padding:8px;z-index:10}
header.top{background:var(--card);border-bottom:1px solid var(--line)}.bar{max-width:1240px;margin:auto;padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.brand{font-weight:700;font-size:18px;color:var(--ink);text-decoration:none;display:flex;gap:8px;align-items:center}.brand b{color:#B6322D}
.who{margin-inline-start:auto;font-size:13px;color:var(--ink2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.langs{display:flex;gap:2px}.langs a{padding:4px 8px;border-radius:8px;text-decoration:none;color:var(--ink2);font-size:14px}.langs a[aria-current]{background:var(--brandBg);color:var(--brand2);font-weight:700}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--brandBg);color:var(--brand2)}.badge.owner{background:var(--amberBg);color:var(--amber)}.badge.editor{background:var(--redBg);color:var(--red)}
nav.tabs{max-width:1240px;margin:auto;padding:0 12px;display:flex;gap:2px;overflow-x:auto;scrollbar-width:thin}
nav.tabs a{padding:10px 12px;white-space:nowrap;text-decoration:none;color:var(--ink2);border-bottom:3px solid transparent;font-size:15px}nav.tabs a[aria-current]{color:var(--ink);border-bottom-color:var(--brand);font-weight:700}
main{max-width:1240px;margin:auto;padding:16px}h1{font-size:24px;margin:4px 0 4px}h2{font-size:18px;margin:0 0 8px}h3{font-size:16px;margin:12px 0 6px}
.lead{color:var(--ink2);margin:0 0 14px;max-width:70ch}.s,.small{font-size:13px;color:var(--ink2)}.muted{color:var(--ink3)}
.card,.c{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0;margin-bottom:14px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}.grid>.card{margin-bottom:0}.span2{grid-column:1/-1}
.kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}.kpi .l{font-size:13px;color:var(--ink2);font-weight:600}.kpi .v{font-size:30px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
.kpi .v.lt{color:var(--ink3)}.kpi .sub{font-size:12px;color:var(--ink2)}.kpi.alert{border-color:var(--red);background:var(--redBg)}.kpi.alert .v{color:var(--red)}
.filt{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;margin:0 0 14px}.filt label{font-size:13px;color:var(--ink2);display:flex;flex-direction:column;gap:3px}
select,input,textarea,button,.btn{font:inherit;font-size:15px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);max-width:100%}
button,.btn{cursor:pointer;display:inline-block;text-decoration:none}button.primary,.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:700}
[data-theme] button.primary{color:#fff}@media (prefers-color-scheme: dark){button.primary,.btn.primary{color:#0E1F1D}}
button.link{border:0;background:none;color:var(--brand);padding:4px;text-decoration:underline;font-size:13px}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:start;padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}
th{color:var(--ink2);font-weight:600;font-size:13px}.num,td.n,th.n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.empty{padding:18px;text-align:center;color:var(--ink2);border:1px dashed var(--line);border-radius:12px}
.msg{padding:12px;border-radius:12px;margin:0 0 12px}.msg.bad{background:var(--redBg);color:var(--red)}.msg.good{background:var(--goodBg);color:var(--good)}.msg.warn,.warnbox{background:var(--amberBg);color:var(--amber);padding:12px;border-radius:12px}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700}.pill.red{background:var(--redBg);color:var(--red)}.pill.grey{background:var(--line);color:var(--ink2)}
.hbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;margin:8px 0}.hbar .track{grid-column:1/-1;height:10px;background:var(--seq1);border-radius:5px;overflow:hidden}.hbar .track i{display:block;height:100%;background:var(--brand);border-radius:5px}
.hbar .name{font-size:14px}td.wk{white-space:nowrap}.hbar .val{font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums}
svg.chart{width:100%;height:auto;display:block;max-width:760px;direction:ltr}svg.chart text{font-family:system-ui,sans-serif}svg.chart .ax{fill:var(--ink2);font-size:12px}svg.chart .grid{stroke:var(--line)}svg.chart .bar{fill:var(--brand)}svg.chart .bar.lt{fill:url(#stripe)}svg.chart .bar:hover{opacity:.8}svg.chart .hotdot{fill:var(--red)}
.tiles .t{stroke:var(--card);stroke-width:3}.tiles .ring{fill:none;stroke:var(--red);stroke-width:4}.tiles .lab{font-size:19px;font-weight:600}.tiles .val{font-size:24px;font-weight:700}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin-top:4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-inline-end:4px}
details>summary{cursor:pointer;color:var(--brand);font-weight:600}details.box{border-top:1px solid var(--line);padding:8px 0}
code{background:var(--brandBg);padding:1px 5px;border-radius:5px;font-size:13px;word-break:break-all}
footer.foot{max-width:1240px;margin:0 auto;padding:8px 16px 32px;font-size:12px;color:var(--ink3)}
.k,.c .l{font-size:13px}.k{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}.k .l{color:var(--ink2)}.k .v{font-size:28px;font-weight:700;color:var(--brand)}.k .s{font-size:12px}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:12px}.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:12px;margin-top:12px}
.chartdiv{display:flex;align-items:flex-end;gap:3px;height:160px;margin-top:10px}.b{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;font-size:9px;color:var(--ink2);text-align:center;min-width:0;overflow:hidden}.b i{display:block;background:var(--brand);border-radius:4px 4px 0 0;min-height:2px}
@media (max-width:640px){main{padding:12px}h1{font-size:21px}.kpi .v{font-size:26px}.bar{padding:8px 12px}.hide-sm{display:none}}
@media print{header.top,nav.tabs,.noprint,form.filt{display:none}body{background:#fff}.card,.kpi{break-inside:avoid;border-color:#bbb}}`;

const NAV = [
  ['/dashboard', 'nav.home', () => true],
  ['/usage', 'nav.usage', () => true],
  ['/watch', 'nav.watch', () => true],
  ['/inbox', 'nav.inbox', () => true],
  ['/data', 'nav.data', () => true],
  ['/admin', 'nav.editor', () => true],
  ['/audit', 'nav.audit', (me) => me.role === 'owner'],
  ['/people', 'nav.people', (me) => me.role === 'owner'],
  ['/about', 'nav.about', () => true],
];

// the current address with another language (other filters kept)
function langHref(url, lg) {
  const u = new URL(url); u.searchParams.delete('key'); u.searchParams.set('lang', lg);
  return u.pathname + u.search;
}

// One page: { url, me, lang, title, active, body, nonce, csrf, script, wide }
export function shell(o) {
  const { me, lang, url, nonce } = o;
  const dir = RTL[lang] ? 'rtl' : 'ltr';
  const active = o.active || url.pathname;
  const nav = NAV.filter(([, , ok]) => ok(me)).map(([href, k]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${esc(t(lang, k))}</a>`).join('');
  const role = `<span class="badge ${esc(me.role)}">${esc(t(lang, 'role.' + me.role))}</span>`;
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : lang === 'fa' ? 'fa-AF' : 'ps-AF'}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${esc(o.title)} · Sehat</title><style>${CSS}${o.css || ''}</style></head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="bar"><a class="brand" href="/dashboard"><b>صحت</b> ${esc(t(lang, 'brand'))}</a>
<div class="who"><span>${esc(t(lang, 'signedInAs', { who: me.role === 'owner' ? t(lang, 'role.owner') : me.name }))}</span>${role}
<span class="langs" aria-label="${esc(t(lang, 'language'))}">${LANGS.map((lg) => `<a href="${esc(langHref(url, lg))}" lang="${lg}"${lg === lang ? ' aria-current="true"' : ''}>${esc(LANG_NAME[lg])}</a>`).join('')}</span>
<form method="post" action="/signout" class="noprint" style="margin:0"><input type="hidden" name="csrf" value="${esc(o.csrf || '')}"><button class="link" type="submit">${esc(t(lang, 'signout'))}</button></form></div></div>
<nav class="tabs" aria-label="${esc(t(lang, 'nav.menu'))}">${nav}</nav></header>
<main id="main">${o.body}</main>
<footer class="foot">${esc(t(lang, 'footer'))} ${esc(t(lang, 'logged'))}</footer>
${o.script ? `<script nonce="${nonce}">var __name = (f) => f;\n${o.script}</script>` : ''}</body></html>`;
}

/* ---------------- small charts ---------------- */
// Vertical bars, one series. points: [{x: label, y: number, lt: true when hidden (1 to 4), hot: true for an alert}]
// A hidden count gets a fixed striped bar (its height does not give the number away). Each bar has a tooltip and the
// same numbers are in a table below for screen readers and for copying.
export function barChart(points, o = {}) {
  const lang = o.lang || 'en', W = 420, H = o.height || 170, padL = 30, padB = 20, padT = 14;
  if (!points.length || points.every((p) => !p.y && !p.lt)) return `<div class="empty">${esc(t(lang, 'nodata'))}</div>`;
  const ys = points.map((p) => (p.lt ? 5 : +p.y || 0)), max = Math.max(5, ...ys);
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p; return 10 * p; })();
  const n = points.length, bw = (W - padL) / n, gap = Math.min(4, bw * 0.25);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const every = Math.ceil(n / Math.floor((W - padL) / 54));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}"><defs><pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--seq2)"/><rect width="3" height="6" fill="var(--card)"/></pattern></defs>`;
  for (const v of [0, nice / 2, nice]) s += `<line class="grid" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 5}" y="${y(v) + 4}" text-anchor="end">${fmtN(v)}</text>`;
  points.forEach((p, i) => {
    const v = p.lt ? 5 : +p.y || 0, x = padL + i * bw + gap / 2, w = Math.max(1, bw - gap), top = y(v), h = Math.max(0, H - padB - top), r = Math.min(4, w / 2, h);
    const label = `${p.x}: ${p.lt ? '<5' : fmtN(v)}${p.note ? ' · ' + p.note : ''}`;
    if (h > 0) s += `<path class="bar${p.lt ? ' lt' : ''}" d="M${x},${H - padB}V${top + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${H - padB}Z"><title>${esc(label)}</title></path>`;
    else s += `<rect x="${x}" y="${H - padB - 1}" width="${w}" height="1" style="fill:var(--line)"><title>${esc(label)}</title></rect>`;
    // a week with an alert: a red dot above its bar (the bar keeps its colour, so the count still reads the same way)
    if (p.hot) s += `<circle class="hotdot" cx="${x + w / 2}" cy="${Math.max(6, top - 7)}" r="4"><title>${esc(label)}</title></circle>`;
    if (i % every === 0) s += `<text class="ax" x="${x + w / 2}" y="${H - 5}" text-anchor="middle">${esc(p.short || p.x)}</text>`;
  });
  s += '</svg>';
  const legend = points.some((p) => p.lt) || points.some((p) => p.hot) ? `<div class="legend">${points.some((p) => p.lt) ? `<span><i style="background:repeating-linear-gradient(45deg,var(--seq2) 0 3px,var(--card) 3px 6px)"></i>${esc(t(lang, 'lt5short'))}</span>` : ''}${points.some((p) => p.hot) ? `<span><i style="background:var(--red);border-radius:50%"></i>${esc(o.hotLabel || t(lang, 'alert'))}</span>` : ''}</div>` : '';
  const table = `<details class="noprint"><summary class="s">${esc(t(lang, 'asTable'))}</summary><div class="tw"><table><tr><th>${esc(o.xName || '')}</th><th class="n">${esc(o.yName || '')}</th></tr>${points.map((p) => `<tr><td>${esc(p.x)}</td><td class="n">${p.lt ? '&lt;5' : esc(fmtN(+p.y || 0))}</td></tr>`).join('')}</table></div></details>`;
  return s + legend + table;
}

// Horizontal bars for a ranked list: rows [{name, value, text}]
export function hbars(rows, lang = 'en') {
  if (!rows.length) return `<div class="empty">${esc(t(lang, 'nodata'))}</div>`;
  const max = Math.max(1, ...rows.map((r) => +r.value || 0));
  return rows.map((r) => `<div class="hbar"><span class="name">${esc(r.name)}</span><span class="val">${r.textHtml || ltr(r.text)}</span><span class="track" aria-hidden="true"><i style="width:${r.lt ? 0 : Math.max(1, Math.round(((+r.value || 0) / max) * 100))}%"></i></span></div>`).join('');
}

// Samangan's districts as a schematic tile map (roughly where each district lies; not a real map, not to scale).
// cells: { id: { n: number, lt: bool, alert: bool, label } }, names: id -> name
export const TILE_LAYOUT = [
  ['feroz-nakhchir', 1, 0], ['hazrat-i-sultan', 2, 0],
  ['dara-i-suf-payin', 0, 1], ['aybak', 1, 1], ['aybak-city', 2, 1], ['khuram-wa-sarbagh', 3, 1],
  ['dara-i-suf-bala', 0, 2], ['ruyi-du-ab', 2, 2],
];
export function tileMap(cells, names, o = {}) {
  const lang = o.lang || 'en', cw = 150, ch = 88, g = 6;
  const max = Math.max(1, ...Object.values(cells).map((c) => (c.lt ? 0 : +c.n || 0)));
  const fill = (c) => { if (!c || (!c.n && !c.lt)) return 'var(--seq1)'; if (c.lt) return 'var(--seq2)'; const f = c.n / max; return f > 0.75 ? 'var(--seq5)' : f > 0.5 ? 'var(--seq4)' : f > 0.25 ? 'var(--seq3)' : 'var(--seq2)'; };
  const ink = (c) => (c && !c.lt && c.n / max > 0.5 ? '#fff' : 'var(--ink)'); // set as style: a CSS rule would beat a fill attribute
  let s = `<svg class="chart tiles" viewBox="0 0 ${4 * cw + 3 * g} ${3 * ch + 2 * g}" role="img" aria-label="${esc(o.label || '')}">`;
  for (const [id, cx, cy] of TILE_LAYOUT) {
    const c = cells[id], x = cx * (cw + g), y = cy * (ch + g), name = names(id), val = !c || (!c.n && !c.lt) ? '0' : c.lt ? '<5' : fmtN(c.n);
    s += `<g><title>${esc(name)}: ${esc(val)} ${esc(t(lang, 'reports'))}${c && c.alert ? ' · ' + esc(t(lang, 'alert')) : ''}</title><rect class="t" x="${x}" y="${y}" width="${cw}" height="${ch}" rx="12" fill="${fill(c)}"/>`;
    if (c && c.alert) s += `<rect class="ring" x="${x + 3}" y="${y + 3}" width="${cw - 6}" height="${ch - 6}" rx="10"/><circle cx="${x + cw - 20}" cy="${y + ch - 20}" r="12" style="fill:var(--red)"/><text x="${x + cw - 20}" y="${y + ch - 14}" text-anchor="middle" style="fill:#fff;font-weight:800;font-size:17px">!</text>`;
    const lines = wrap2(name, 13);
    s += lines.map((ln, j) => `<text class="lab" x="${x + cw / 2}" y="${y + (lines.length > 1 ? 24 : 32) + j * 20}" text-anchor="middle" style="fill:${ink(c)}">${esc(ln)}</text>`).join('') + `<text class="val" x="${x + cw / 2}" y="${y + 74}" text-anchor="middle" style="fill:${ink(c)}">${esc(val)}</text></g>`;
  }
  return s + '</svg>';
}
// a name on at most two lines of about n characters (the second line cut with … if needed)
function wrap2(s, n) {
  s = String(s).replace(/\s*\(.*\)$/, ''); // "Aybak district (villages)" -> "Aybak district"
  if (s.length <= n) return [s];
  const words = s.split(/\s+/), a = [];
  let line = '';
  for (const w of words) { if (line && (line + ' ' + w).length > n && a.length === 0) { a.push(line); line = w; } else line = line ? line + ' ' + w : w; }
  a.push(line.length > n + 3 ? line.slice(0, n + 2) + '…' : line);
  return a.slice(0, 2);
}

// period and district choice used by the overview and the usage page
export function periodForm(action, q, lang, places, extraHidden = '') {
  const opts = [['', t(lang, 'allDistricts')], ...places.filter((p) => p.province === 'Samangan').map((p) => [p.id, p.name]), ['none', t(lang, 'notChosen')], ...places.filter((p) => p.province !== 'Samangan').map((p) => [p.id, p.name])];
  return `<form class="filt noprint" method="get" action="${action}">${extraHidden}
<label>${esc(t(lang, 'period'))}<select name="days">${[7, 30, 90, 365].map((v) => `<option value="${v}"${q.days === v ? ' selected' : ''}>${esc(t(lang, 'days.' + v))}</option>`).join('')}</select></label>
<label>${esc(t(lang, 'district'))}<select name="district">${opts.map(([v, l]) => `<option value="${esc(v)}"${q.district === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
<button class="primary" type="submit">${esc(t(lang, 'show'))}</button></form>`;
}
