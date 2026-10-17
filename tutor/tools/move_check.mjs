// The move's own check (WEBSITE.md 2.2, phase W2): a phone that has today's app, with its service worker at /sw.js,
// meets the new tree on the same address. One local server serves the old tree, then the new one, on one port, as
// Workers static assets do (ETag, `max-age=0, must-revalidate`, the _headers rules, /app to /app/); /api/ and /v/ go
// to a hub. In Chromium through Playwright:
//   1. The old tree: Welcome, year 1, a lesson with pictures; a voice clip is put in the old worker's cache, as a
//      phone that heard one has it.
//   2. The new tree: the phone opens / and the site's worker takes over. It keeps her learners; the old shell-* cache
//      is gone and the clip is in media-v1; / opens /app/ for her; the lesson's pictures and the clip are not
//      downloaded again (no 200 for them after the move: a 304 is a check, not a download); no 404 under /app/.
//   3. An old class QR (/?join=CODE) still opens Welcome with the code; the staff pages load with their CSP and
//      every file they name; offline, the app opens from its own worker, a site page she saw opens, a page she never
//      saw gives /offline/; a new phone offline that never had the app is told "not on this phone yet".
// Build the two trees with worker/build.py (the old one from the last commit before the move), start a hub, then:
//   PLAYWRIGHT=… CHROMIUM=… node tools/move_check.mjs --old OLD/public --new NEW/public --hub http://127.0.0.1:8001
// Exit code 1 when a check fails.

import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
for (const k of ['old', 'new']) if (!args[k] || !existsSync(join(args[k], 'index.html'))) { console.error(`move_check: --${k} is not a built tree`); process.exit(2); }
const HUB = new URL(args.hub || 'http://127.0.0.1:8001');
const OUT = args.out || 'shots';
const LESSON = args.lesson || 'dari-1-sheen';
const CLIP = '/audio/prs/0000move.opus';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
mkdirSync(OUT, { recursive: true });

let ROOT = args.old;
let DOWN = false;                                         // the network gone: every connection dropped
let phase = 'old';
const log = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.opus': 'audio/ogg', '.woff2': 'font/woff2',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.qvoice': 'application/octet-stream' };
function rules() {
  const f = join(ROOT, '_headers');
  const out = [];
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) out.push({ rx: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: [] });
    else { const t = line.trim(); const i = t.indexOf(':'); out.at(-1).headers.push([t.slice(0, i), t.slice(i + 1).trim()]); }
  }
  return out;
}

const server = createServer((req, res) => {
  if (DOWN) { req.socket.destroy(); return; }
  const url = new URL(req.url, 'http://x');
  if (/^\/(api|v)(\/|$)/.test(url.pathname)) {                     // the Worker's own routes: the hub's
    const up = httpRequest({ host: HUB.hostname, port: HUB.port, path: req.url, method: req.method,
      headers: { ...req.headers, host: HUB.host } }, (r) => {
      log.push({ phase, path: url.pathname, status: r.statusCode, bytes: Number(r.headers['content-length'] || 0) });
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
    return;
  }
  const p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) {
    if (!url.pathname.endsWith('/')) {                             // assets' auto-trailing-slash
      log.push({ phase, path: url.pathname, status: 307, bytes: 0 });
      res.writeHead(307, { location: url.pathname + '/' + url.search }); res.end(); return;
    }
    f = join(f, 'index.html');
  }
  if (!existsSync(f) || /(^|\/)_headers$/.test(p)) {
    log.push({ phase, path: url.pathname, status: 404, bytes: 0 });
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not here'); return;
  }
  const body = readFileSync(f);
  const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 20) + '"';
  const head = { 'content-type': TYPES[extname(f)] || 'application/octet-stream', etag,
    'cache-control': 'public, max-age=0, must-revalidate' };
  const csp = [];
  for (const r of rules()) {
    if (!r.rx.test(url.pathname)) continue;
    for (const [k, v] of r.headers) {
      if (k === 'Content-Security-Policy') csp.push(v);
      else head[k] = head[k] ? `${head[k]}, ${v}` : v;
    }
  }
  if (csp.length) res.setHeader('Content-Security-Policy', csp);
  if (req.headers['if-none-match'] === etag) {
    log.push({ phase, path: url.pathname, status: 304, bytes: 0 });
    res.writeHead(304, { etag, 'cache-control': head['cache-control'] }); res.end(); return;
  }
  log.push({ phase, path: url.pathname, status: 200, bytes: body.length });
  res.writeHead(200, { ...head, 'content-length': body.length });
  res.end(body);
});
await new Promise((r) => server.listen(Number(args.port || 0), '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${phase}: ${e}`));
const hashIs = (want, ms = 15000) => page.waitForFunction((w) => location.hash.startsWith(w) && document.querySelector('#app .screen'), want, { timeout: ms });
const caches = () => page.evaluate(async () => {
  const out = {};
  for (const k of await self.caches.keys()) out[k] = (await (await self.caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
  return out;
});
const learners = () => page.evaluate(() => JSON.parse(localStorage.getItem('qalam.v2') || '{"learners":[]}').learners);
const until = async (fn, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await page.waitForTimeout(250)) if (await fn().catch(() => false)) return true;
  return false;
};

// 1. the old tree
await page.goto(BASE + '/');
await hashIs('#/welcome');
await page.click('.yearbox.primary .years button >> nth=0');                       // year 1
await hashIs('#/home');
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {    // the first visit is not yet under it
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await hashIs('#/home');
}
check(await page.evaluate(() => !!navigator.serviceWorker.controller), "the old tree: today's worker at /sw.js controls the page");
await page.goto(`${BASE}/#/lesson/${LESSON}`);
await hashIs('#/lesson/');
await page.waitForTimeout(2500);
await page.evaluate(async (clip) => {                     // a voice clip she has heard, as the old worker kept it
  const shell = (await self.caches.keys()).find((k) => k.startsWith('shell-'));
  await (await self.caches.open(shell)).put(clip, new Response(new Uint8Array(64), { headers: { 'content-type': 'audio/ogg' } }));
}, CLIP);
const before = { learners: await learners(), caches: await caches() };
const oldShell = Object.keys(before.caches).find((k) => k.startsWith('shell-'));
const pictures = (before.caches['media-v1'] || []).filter((p) => p.startsWith('/packs/'));
check(!!oldShell && before.learners.length === 1, `the old tree: one learner, the worker's ${oldShell}`);
check(pictures.length > 0, `the old tree: ${pictures.length} lesson picture(s) kept in media-v1`);
await page.screenshot({ path: join(OUT, 'move-1-old.png') });

// 2. the new tree on the same address
ROOT = args.new;
phase = 'new';
await page.goto(BASE + '/');                              // the old worker answers once; the browser fetches /sw.js
const took = await until(async () => { const c = await caches(); return Object.keys(c).some((k) => k.startsWith('site-')) && !Object.keys(c).some((k) => k.startsWith('shell-')); });
check(took, "the site's worker takes over: a site-* cache, and the old shell-* is gone");
await page.goto(BASE + '/');
await page.waitForURL((u) => u.pathname === '/app/', { timeout: 15000 }).catch(() => {});
check(new URL(page.url()).pathname === '/app/', `/ opens /app/ for her (${new URL(page.url()).pathname})`);
await hashIs('#/home').catch(() => {});
const after = await learners();
check(JSON.stringify(after) === JSON.stringify(before.learners), 'her learners are kept as they were');
await until(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/app/'))?.active));
await page.goto(`${BASE}/app/#/lesson/${LESSON}`);
await page.reload();                                      // now under the app's own worker
await hashIs('#/lesson/');
await page.waitForTimeout(2500);
const now = await caches();
check((now['media-v1'] || []).includes(CLIP), 'the voice clip moved from the old cache into media-v1');
check(pictures.every((p) => (now['media-v1'] || []).includes(p)), 'every picture is still in media-v1');
check(Object.keys(now).some((k) => k.startsWith('app-shell-')), "the app's worker at /app/sw.js keeps its own app-shell-*");
const again = log.filter((r) => r.phase === 'new' && r.status === 200 && (pictures.includes(r.path) || r.path === CLIP));
check(!again.length, `no picture or clip downloaded again${again.length ? ': ' + again.map((r) => r.path).join(' ') : ''}`);
const lost = log.filter((r) => r.phase === 'new' && r.status === 404 && r.path.startsWith('/app'));
check(!lost.length, `no 404 under /app/${lost.length ? ': ' + [...new Set(lost.map((r) => r.path))].join(' ') : ''}`);
const shell = log.filter((r) => r.phase === 'new' && r.status === 200 && r.path.startsWith('/app/')).reduce((n, r) => n + r.bytes, 0);
console.log(`     the one-time cost: ${(shell / 1e6).toFixed(2)} MB of app files under /app/ (uncompressed)`);
await page.screenshot({ path: join(OUT, 'move-2-new.png') });

// 3. an old class QR, the staff pages, offline
const fresh = await browser.newContext({ viewport: { width: 360, height: 740 } });
const q = await fresh.newPage();
await q.goto(BASE + '/?join=K7QM-4PRT');
await q.waitForFunction(() => location.pathname === '/app/' && location.hash.startsWith('#/welcome') && document.querySelector('#app .screen'), null, { timeout: 15000 }).catch(() => {});
check(new URL(q.url()).pathname === '/app/' && await q.evaluate(() => sessionStorage.getItem('qalam.joincode')) === 'K7QM4PRT',
  `an old class QR /?join= opens Welcome in /app/ with the code (${new URL(q.url()).pathname}${new URL(q.url()).hash})`);
for (const staff of ['/teacher/', '/admin/', '/review/']) {
  const seen = [];
  const bad = [];
  const sp = await fresh.newPage();
  sp.on('response', (r) => seen.push([new URL(r.url()).pathname, r.status()]));
  sp.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) bad.push(m.text()); });
  const r = await sp.goto(BASE + staff);
  await sp.waitForTimeout(1200);
  const csp = (r.headers()['content-security-policy'] || '');
  const missing = seen.filter(([p, s]) => s === 404 && !p.startsWith('/api/'));
  check(r.status() === 200 && /frame-ancestors 'none'/.test(csp) && !missing.length && !bad.length,
    `${staff} loads with its CSP and every file it names${missing.length ? ': 404 ' + missing.map((x) => x[0]).join(' ') : ''}${bad[0] ? ': ' + bad[0].slice(0, 120) : ''}`);
  await sp.close();
}
await page.goto(BASE + '/en/?site');                    // a site page she sees online, kept for later
await page.waitForTimeout(800);
DOWN = true;                                              // (Playwright's offline does not reach a worker's fetch)
await page.goto(`${BASE}/app/#/home`);
await page.reload();
await hashIs('#/home', 15000).catch(() => {});
check(!!(await page.$('#app .screen')), 'offline: the app opens from its own worker');
await page.goto(BASE + '/en/?site').catch(() => {});
check(/lang="en"/.test(await page.content()) && !!(await page.$('.tile')), 'offline: the English home she saw opens from the site cache');
await page.goto(BASE + '/ps/privacy/').catch(() => {});
check(!!(await page.$('.multi')), 'offline: a page she never saw gives /offline/');
DOWN = false;
const third = await browser.newContext({ viewport: { width: 360, height: 740 } });
const n = await third.newPage();                          // a new phone: the site once, then offline before the app
await n.goto(BASE + '/');
const ready = await n.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true),
  new Promise((r) => setTimeout(() => r(false), 10000))]));
check(ready, "a new phone: the site's worker is installed from the home");
await n.waitForTimeout(500);
DOWN = true;
await n.goto(BASE + '/app/').catch(() => {});
const noApp = await n.evaluate(() => document.documentElement.getAttribute('data-app') === 'none'
  && [...document.querySelectorAll('.no-app')].some((e) => e.offsetParent !== null)).catch(() => false);
check(noApp, 'offline on a new phone: /app/ says "Qalam is not on this phone yet"');
DOWN = false;
await n.screenshot({ path: join(OUT, 'move-3-noapp.png') });
check(!errors.length, `no page error${errors.length ? ': ' + errors[0].slice(0, 200) : ''}`);

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log('\nmove checks pass');
