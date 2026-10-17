// The website's check (WEBSITE.md 2.5), in Chromium through Playwright: every page tools/make_site.py rendered, in
// Dari, Pashto and English, at 360 and 1280 px, light and dark. It fails on:
//   - a request to another host, an <img>, an @font-face or @import, a page error or a CSP violation;
//   - a page over its weight budget (brotli, as Cloudflare sends it), or more than one request to show it;
//   - sideways scroll, a target under 44 px, text under 14 px, clipped text, contrast under 4.5:1 (3:1 large);
//   - a wrong lang, dir or hreflang, a missing language link, a middle dot touching a Persian digit (P10);
//   - a price tag more than 15% off the real size (the app's first open: its service worker's files, brotli);
//   - a home whose first year tile is not inside a 360x740 screen, or whose first paint on a cold, throttled line is
//     over 3.5 s (EDGE: 600 ms, 80 kbit/s) or 5.5 s (poor 2G: 900 ms, 35 kbit/s), three round trips added for DNS,
//     TCP and TLS;
//   - a forward that does not happen: /?join=CODE to /app/?join=CODE, a phone with a learner to /app/ (not with
//     ?site, which shows her picture instead), a Pashto phone or a saved choice from / to its home.
// It serves the folder itself (brotli when asked, and the folder's _headers, so the CSP is the real one); --base
// checks a running server instead (the hub, or staging). Run from tutor/:
//   python3 tools/make_site.py /tmp/site
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/site_check.mjs --root /tmp/site [--app app] [--out shots/] [--quick]
// --quick checks 360 px light only and skips the throttled runs. Exit code 1 when a check fails.

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const ROOT = args.root || 'site/build';
const APP = args.app || 'app';
const OUT = args.out || 'shots';
const QUICK = !!args.quick;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const report = JSON.parse(readFileSync(join(ROOT, 'site-report.json'), 'utf8'));
// WEBSITE.md 2.1 and 2.5: KB of brotli per page
const BUDGET = { home: 14, lessons: 30, m: 4, offline: 4, notfound: 4 };
const budget = (page) => BUDGET[page] || 20;

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
const br = (buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
mkdirSync(OUT, { recursive: true });

// the folder's _headers rules, applied as Workers static assets apply them (every matching rule adds up)
function headerRules() {
  const f = join(ROOT, '_headers');
  if (!existsSync(f)) return [];
  const rules = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
    else { const t = line.trim(); const i = t.indexOf(':'); rules.at(-1).headers.push([t.slice(0, i), t.slice(i + 1).trim()]); }
  }
  return rules.map((r) => ({ ...r, rx: new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') }));
}
const RULES = headerRules();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.opus': 'audio/ogg', '.woff2': 'font/woff2' };

let server = null;
let BASE = args.base;
if (!BASE) {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(ROOT, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not here'); return; }
    let body = readFileSync(f);
    const head = { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' };
    for (const r of RULES) if (r.rx.test(url.pathname)) for (const [k, v] of r.headers) head[k] = head[k] ? `${head[k]}, ${v}` : v;
    if (head['Content-Security-Policy']) {                     // two rules: two policies, both enforced
      const pols = RULES.filter((r) => r.rx.test(url.pathname)).flatMap((r) => r.headers.filter(([k]) => k === 'Content-Security-Policy').map(([, v]) => v));
      res.setHeader('Content-Security-Policy', pols);
      delete head['Content-Security-Policy'];
    }
    if (/\bbr\b/.test(req.headers['accept-encoding'] || '') && /html|javascript|css|json|svg/.test(head['content-type'])) {
      body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
      head['content-encoding'] = 'br';
    }
    head['content-length'] = body.length;
    res.writeHead(200, head);
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}
const HOST = new URL(BASE).host;

// runs in the page: what a screenshot alone can hide
function inspect(want) {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((u, v) => v - u); return (p + 0.05) / (q + 0.05); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !e.matches('h1 span')) return null;   // a gradient: judged by eye
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = over(c, base);
    return base;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const label = (el) => (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' +
    el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()) + (el.id ? '#' + el.id : '');
  const problems = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, script, style, #toast')) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own || !visible(el)) continue;
    const r0 = el.getBoundingClientRect();
    if (r0.bottom < 0 && el.matches('.skip')) continue;           // the skip link, until it has the focus
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < 14) problems.push(`text under 14 px (${size}) in ${label(el)} "${own.slice(0, 30)}"`);
    const bg = behind(el);
    if (bg) {
      const c = ratio(over(parse(cs.color), bg), bg);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (c < (large ? 3 : 4.5)) problems.push(`contrast ${c.toFixed(2)} on ${label(el)} "${own.slice(0, 30)}"`);
    }
    const clips = (v) => v === 'hidden' || v === 'clip';
    if ((clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)) {
      problems.push(`clipped text in ${label(el)} "${own.slice(0, 30)}"`);
    }
  }
  for (const el of document.querySelectorAll('a[href], button, summary, input, select, [role=button]')) {
    if (!visible(el) || el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (el.matches('.skip') && r.bottom < 0) continue;
    if (r.width < 43.5 || r.height < 43.5) problems.push(`target ${Math.round(r.width)}x${Math.round(r.height)} px: ${label(el)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`page is ${document.documentElement.scrollWidth}px wide on a ${innerWidth}px screen`);
  const html = document.documentElement;
  if (html.lang !== want.hl) problems.push(`lang is ${html.lang}, want ${want.hl}`);
  if (html.dir !== want.dir || getComputedStyle(document.body).direction !== want.dir) problems.push(`dir is ${html.dir}, want ${want.dir}`);
  const alt = [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => `${l.hreflang} ${l.getAttribute('href')}`).sort();
  if (JSON.stringify(alt) !== JSON.stringify([...want.alternates].sort())) problems.push(`hreflang: ${alt.join(', ')}`);
  const sw = [...document.querySelectorAll('.langs a')];
  if (sw.length !== 3 || sw.filter((a) => a.getAttribute('aria-current') === 'page').length !== 1) problems.push('the language switch is not three links with one current');
  if (document.images.length) problems.push(`${document.images.length} <img>`);
  for (const s of document.styleSheets) {
    for (const r of s.cssRules) if (r instanceof CSSFontFaceRule || r instanceof CSSImportRule) problems.push('a web font or @import');
  }
  const text = document.body.innerText;
  const dot = text.match(/[۰-۹][\s‌‏]*·|·[\s‌‏]*[۰-۹]/);
  if (dot) problems.push(`a middle dot touching a Persian digit: "${dot[0]}"`);
  if (want.dir === 'rtl') {                                       // Persian digits, except codes and Latin runs
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (/[0-9]/.test(n.textContent) && !n.parentElement.closest('bdi, [dir=ltr], .m, [lang=en], script, style, svg')) {
        problems.push(`Latin digits on a ${want.hl} page: "${n.textContent.trim().slice(0, 30)}"`);
        break;
      }
    }
  }
  const tile = document.querySelector('.tile');
  return { problems, tileTop: tile ? tile.getBoundingClientRect().top + scrollY : null };
}

const number = (s) => Number(String(s).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/٫/g, '.').match(/\d+(\.\d+)?/)?.[0]);
// the app's first open: every file its service worker keeps, as brotli
const appBytes = report.app_shell.reduce((n, f) => n + (existsSync(join(APP, f)) ? br(readFileSync(join(APP, f))) : 0), 0);
console.log(`the app's first open: ${(appBytes / 1e6).toFixed(2)} MB brotli (${report.app_shell.length} files)`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const HL = { prs: 'fa-AF', ps: 'ps-AF', en: 'en' };
const sizes = [];
for (const p of report.pages) {
  const raw = readFileSync(join(ROOT, p.file));
  const kb = br(raw) / 1024;
  sizes.push(`${p.url} ${kb.toFixed(1)} KB`);
  check(kb <= budget(p.page), `${p.url}: ${kb.toFixed(1)} KB brotli, budget ${budget(p.page)} KB`);
  const same = report.pages.filter((q) => q.page === p.page);
  const want = { hl: HL[p.lang], dir: p.lang === 'en' ? 'ltr' : 'rtl', alternates: same.map((q) => `${HL[q.lang]} ${q.url}`) };
  for (const width of QUICK ? [360] : [360, 1280]) {
    for (const scheme of QUICK ? ['light'] : ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 740 : 800 }, colorScheme: scheme,
        deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('request', (r) => { if (!r.url().startsWith('data:')) requests.push(r.url()); });
      await page.goto(BASE + p.url + (p.page === 'home' ? '?site' : ''), { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const r = await page.evaluate(inspect, want);
      const where = `${p.url} ${width} ${scheme}`;
      const foreign = requests.filter((u) => new URL(u).host !== HOST);
      const shown = requests.filter((u) => !/\/(sw\.js|manifest\.webmanifest)$/.test(new URL(u).pathname));
      check(!foreign.length, `${where}: no other host${foreign.length ? ': ' + foreign[0] : ''}`);
      check(shown.length === 1, `${where}: one request to show it (${shown.length}${shown.length > 1 ? ': ' + shown.slice(1).join(' ') : ''})`);
      check(!errors.length, `${where}: no page error or CSP violation${errors.length ? ': ' + errors[0].slice(0, 160) : ''}`);
      check(!r.problems.length, `${where}: layout, sizes, contrast, language${r.problems.length ? ': ' + r.problems.slice(0, 4).join('; ') : ''}`);
      if (p.page === 'home' && width === 360 && scheme === 'light') {
        check(r.tileTop !== null && r.tileTop + 64 <= 740, `${where}: the first year tile is inside the first screen (${Math.round(r.tileTop)} px)`);
        const tags = await page.$$eval('.way .tag, .cost span', (els) => els.map((e) => e.textContent));
        const stated = number(tags.find((t) => /[0-9۰-۹]/.test(t)) || '');
        check(Math.abs(stated * 1e6 - appBytes) / appBytes <= 0.15, `${where}: the price tag ${stated} MB is within 15% of ${(appBytes / 1e6).toFixed(2)} MB`);
        if (report.apk) {
          const apk = number(await page.$eval('.way:nth-child(2) .tag', (e) => e.textContent).catch(() => ''));
          check(Math.abs(apk * 1e6 - report.apk) / report.apk <= 0.15, `${where}: the APK's tag ${apk} MB is within 15% of its size`);
        }
      }
      await page.screenshot({ path: join(OUT, `site-${p.page}-${p.lang}-${width}-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  }
}

// the forwards in each home's head
async function landing(path, { learner = null, saved = null, locale = 'fa-AF' } = {}) {
  const ctx = await browser.newContext({ locale, serviceWorkers: 'block' });
  await ctx.addInitScript(([l, s]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (l) localStorage.setItem('qalam.v2', JSON.stringify({ v: 2, active: 'x', learners: [{ id: 'x', picture: l, band: 'p1', year: 3 }] }));
    if (s) localStorage.setItem('qalam.site.lang', s);
  }, [learner, saved]);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(300);
  const out = { url: new URL(page.url()), cont: await page.$eval('#cont', (e) => !e.hidden && e.innerText).catch(() => null) };
  await ctx.close();
  return out;
}
let f = await landing('/?join=AB12CD');
check(f.url.pathname === '/app/' && f.url.search === '?join=AB12CD', `forward: /?join= opens ${f.url.pathname}${f.url.search}`);
f = await landing('/', { learner: 'cup' });
check(f.url.pathname === '/app/', `forward: a phone with a learner opens ${f.url.pathname}`);
f = await landing('/?site', { learner: 'cup' });
check(f.url.pathname === '/' && /پیاله/.test(f.cont || ''), `forward: /?site stays and shows her picture (${(f.cont || '').replace(/\s+/g, ' ').slice(0, 40)})`);
f = await landing('/', { locale: 'ps-AF' });
check(f.url.pathname === '/ps/', `forward: a Pashto phone goes to ${f.url.pathname}`);
f = await landing('/', { locale: 'en-US' });
check(f.url.pathname === '/', `forward: an English phone stays on the Dari home (${f.url.pathname})`);
f = await landing('/', { locale: 'ps-AF', saved: 'prs' });
check(f.url.pathname === '/', `forward: a saved choice wins over the phone (${f.url.pathname})`);
f = await landing('/?site', { saved: 'en' });
check(f.url.pathname === '/en/' && f.url.search === '?site', `forward: a saved English choice goes to ${f.url.pathname}${f.url.search}`);

// first paint on a cold, throttled line (one request; three round trips added for DNS, TCP and TLS)
if (!QUICK) {
  for (const [name, latency, kbit, limit] of [['EDGE', 600, 80, 3500], ['poor 2G', 900, 35, 5500]]) {
    for (const p of report.pages.filter((q) => q.page === 'home')) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: kbit * 1000 / 8,
        uploadThroughput: kbit * 1000 / 8 });
      await page.goto(BASE + p.url + '?site', { waitUntil: 'load', timeout: 60000 });
      const fcp = await page.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0);
      const cold = fcp + 3 * latency;
      check(fcp > 0 && cold <= limit, `${p.url} on ${name}: first paint ${(fcp / 1000).toFixed(2)} s, ${(cold / 1000).toFixed(2)} s cold (at most ${limit / 1000} s)`);
      await ctx.close();
    }
  }
}

await browser.close();
if (server) server.close();
console.log(sizes.join('\n'));
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall site checks passed');
process.exit(problems.length ? 1 : 0);
