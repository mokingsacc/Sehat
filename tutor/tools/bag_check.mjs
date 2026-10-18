// The school bag end to end (WEBSITE.md 3.6 to 3.13, phase W7), in Chromium through Playwright, over the four
// origins one learner meets, with her phone's network throttled to poor 2G (900 ms, 35 kbit/s, as site_check) for
// everything the bag sends:
//   1. The Android app (https://appassets.androidplatform.net, its bridge stood in), online only: she starts as an
//      open learner, agrees in Settings (the c text names the bag), gets her bag and its card, sets her PIN; a lesson (1 star) and
//      a plan; a question asked while the online Ask fails waits in her outbox, and the bag carries it.
//   2. The phone's Chrome (https://online.qalam.test): the app's "Use Qalam in this browser too" opens /m#<code>; the
//      digits are found at the online relay; "Is this you?" → her PIN → Home. The question queued on the app shows as
//      waiting on that phone and is not sent from here; a new question is. 3 stars on the first lesson, a second
//      lesson, a newer plan; Sync now.
//   3. The app at the village hub (http://qalam.lan): she agrees there too, her question waiting in the app goes to
//      the hub, and her bag reaches the hub's relay.
//   4. Chrome at the hub (an insecure page: the vendored PBKDF2): "I already use Qalam", the code typed, her PIN; a
//      lower score on the first lesson, a third lesson, the newest plan; Sync now. The app, at the hub then online,
//      carries it to the online relay.
//   5. A new phone online: the code typed, her PIN once; nothing is lost: each lesson at its highest stars, the
//      newest plan, both questions once each and never sent again, her seat's token and no new join. Her fifth
//      lesson offers the card once more. Then "Make a new code" there, and the app finds its old code stopped.
//   6. W8: a borrowed phone with its owner's learner: "Just for today": her PIN, the bar with Done on every screen, a
//      lesson and a question (the online Ask failing); nothing reaches its storage (localStorage, sessionStorage,
//      IndexedDB) and it is not asked to persist; Done pushes her bag and opens the app again with the owner's
//      learner only; her own phone gets the lesson and sends the question once.
//   7. W9: a learner of the hub's own class (her lessons' events go there), her phone lost and no card: her teacher
//      at the hub makes a return code; a new phone at the hub types it (no class code: the hub's own class) and is
//      her learner again: the same picture and number, a new token (the old one is refused), the lock offered, her
//      lessons back from the hub's events and none sent again, and the teacher's class list as long as before.
// Each question reaches a server exactly once (the stand-in front logs every POST /api/ask), and neither the code
// nor the keys ever leave a phone.
// One front server stands in for the three hosts (a self-signed certificate; Chromium maps the names to it):
// appassets.androidplatform.net serves tutor/app as the APK does, online.qalam.test goes to an online-mode hub
// (TUTOR_HOME=online, TUTOR_ORIGINS=https://appassets.androidplatform.net), qalam.lan to a village hub. The app's
// other hub addresses (10.42.0.1, 192.168.4.1) are refused at once. Run from tutor/:
//   PLAYWRIGHT=… CHROMIUM=… node tools/bag_check.mjs --hub http://127.0.0.1:8013 --hub-data <its TUTOR_DATA> \
//     --online http://127.0.0.1:8014 [--out shots]
// Exit code 1 when a check fails.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer as https } from 'node:https';
import { createServer as http, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = new URL(args.hub || 'http://127.0.0.1:8013');
const ONLINE = new URL(args.online || 'http://127.0.0.1:8014');
const OUT = args.out || 'shots';
const TEACHER_PIN = readFileSync(join(args['hub-data'] || '', 'teacher-pin.txt'), 'utf8').trim();   // the village hub's
const APP = new URL('../app/', import.meta.url).pathname;
const APK = 'https://appassets.androidplatform.net';
const WEB = 'https://online.qalam.test';
const LAN = 'http://qalam.lan';
const PIN = '1357';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
mkdirSync(OUT, { recursive: true });

// the front: what reaches each host, and every API call with its body
const reach = { hub: false, online: true, askDown: false };
const log = [];
const seen = [];                                          // every address and body a server got
let phase = '1 app';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
function proxy(to, server, req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const path = new URL(req.url, 'http://x').pathname;
    seen.push(`${req.url} ${body}`);
    const up = httpRequest({ host: to.hostname, port: to.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      if (path.startsWith('/api/')) log.push({ phase, server, method: req.method, path, status: r.statusCode, body: body.toString() });
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502); res.end(); });
    up.end(body);
  });
}
function front(req, res) {
  const host = String(req.headers.host || '').split(':')[0];
  const url = new URL(req.url, 'http://x');
  if (host === 'qalam.lan') { if (!reach.hub) { req.socket.destroy(); return; } proxy(HUB, 'hub', req, res); return; }
  if (host === 'online.qalam.test') {
    if (!reach.online) { req.socket.destroy(); return; }
    if (reach.askDown && url.pathname === '/api/ask' && req.method === 'POST') {       // the online Ask failing
      log.push({ phase, server: 'online', method: 'POST', path: '/api/ask', status: 503, body: '' });
      res.writeHead(503, { 'access-control-allow-origin': req.headers.origin || '*', 'content-type': 'application/json' });
      res.end('{"error":"down"}');
      return;
    }
    proxy(ONLINE, 'online', req, res);
    return;
  }
  if (host === 'appassets.androidplatform.net') {                   // the APK's own files (AppPathHandler)
    const p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(APP, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f) || /\/(tests|audio)\//.test(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(f));
    return;
  }
  res.writeHead(404); res.end();
}
const certs = mkdtempSync(join(tmpdir(), 'bag-check-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certs, 'k.pem'), '-out',
  join(certs, 'c.pem'), '-days', '2', '-subj', '/CN=qalam.test'], { stdio: 'ignore' });
const secure = https({ key: readFileSync(join(certs, 'k.pem')), cert: readFileSync(join(certs, 'c.pem')) }, front);
const plain = http(front);
await new Promise((ok) => secure.listen(0, '127.0.0.1', ok));
await new Promise((ok) => plain.listen(0, '127.0.0.1', ok));
const S = secure.address().port;
const P = plain.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: [
  `--host-resolver-rules=MAP appassets.androidplatform.net:443 127.0.0.1:${S}, MAP online.qalam.test:443 127.0.0.1:${S}, MAP qalam.lan:80 127.0.0.1:${P}`,
  '--ignore-certificate-errors',              // the stand-in certificate (a service worker needs it browser-wide)
  '--allow-running-insecure-content',         // the APK's WebView allows the hub's http (MIXED_CONTENT_ALWAYS_ALLOW)
  '--no-proxy-server'] });

// a stand-in voice (nothing is played), and the APK's bridge on its own origin only
function fakes() {
  window.__said = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [{ lang: 'fa-IR', name: 'stand-in' }], speak: (u) => window.__said.push(u.text), cancel() {}, onvoiceschanged: null } });
  navigator.vibrate = () => true;
  window.__persist = 0;                       // how often the app asked to keep its storage (W8)
  try {
    const st = navigator.storage;
    const keep = st.persist.bind(st);
    st.persist = () => { window.__persist += 1; return keep(); };
  } catch { /* no StorageManager */ }
  if (location.host === 'appassets.androidplatform.net') {
    window.QalamAndroid = { setAlarms() {}, canRecord: () => false, online: () => 'https://online.qalam.test', version: () => '',
      notifyState: () => 'off', exactAlarms: () => true, takeBag: () => '', shareFile: () => false };
  }
}
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(fakes);
  await ctx.route(/^http:\/\/(10\.42\.0\.1|192\.168\.4\.1)[:/]/, (r) => r.abort('connectionrefused'));
  return { ctx, name, errors: [] };
}
async function open(ph, url) {
  const page = await ph.ctx.newPage();
  page.on('pageerror', (e) => ph.errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#app .screen'), null, { timeout: 30000 });
  // the bag's code and the card's QR, as an installed app has them; then every request is on poor 2G
  await page.evaluate(async () => {
    await import(new URL('js/bag.js', document.baseURI).href);
    await import(new URL('js/qr.js', document.baseURI).href);
  });
  const cdp = await ph.ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 900, downloadThroughput: 35000 / 8,
    uploadThroughput: 35000 / 8 });
  return page;
}
// the route, and its screen drawn (a screen waits for what it reads from the server, so over 2G the last one stays a while)
const SCREENS = [['#/bag/ready/', '.bag-card'], ['#/bag/again', '.bag-card'], ['#/bag/code-new', '.bag-card'], ['#/bag/newcode', '.btn.danger'],
  ['#/bag', '.screen.bag'], ['#/home', '.screen.home'], ['#/settings', '.screen.settings:not(.bag)'], ['#/lock', '.screen.lock'],
  ['#/welcome', '.screen.welcome:not(.move)'], ['#/move', '.screen.move'], ['#/consent/', '.screen.consent'], ['#/ask', '.thread'], ['#/return', '.screen.return']];
const slow = [];
async function at(page, want, ms = 90000) {
  const t = Date.now();
  const sel = (SCREENS.find(([h]) => want.startsWith(h)) || [null, '#app .screen'])[1];
  await page.waitForFunction(([w, sel]) => location.hash.startsWith(w) && document.querySelector('#app ' + sel), [want, sel], { timeout: ms });
  if (Date.now() - t > 10000) slow.push(`${want} in ${phase}: ${((Date.now() - t) / 1000).toFixed(0)} s`);
  await page.waitForTimeout(500);
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('qalam.v2')));
const learner = async (page) => (await stored(page)).learners[0];
const shot = (page, name) => page.screenshot({ path: join(OUT, `bag-${name}-360.png`) });
const latin = (t) => String(t || '').replace(/[۰-۹]/g, (x) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/\D/g, '');

// the app's own state.js and outbox.js, as a finished lesson, a plan and Ask call them
const work = (page, what, a = null) => page.evaluate(async ([what, a]) => {
  const state = await import(new URL('js/state.js', document.baseURI).href);
  const outbox = await import(new URL('js/outbox.js', document.baseURI).href);
  if (what === 'done') state.markDone(a[0], a[1]);
  if (what === 'plan') state.updateChild(state.child().id, { plan: { label: a[0], lessons: a[1], again: {} } });
  if (what === 'ask') outbox.queue({ id: null, q: a, at: Date.now(), lang: 'prs', lesson: null });
}, [what, a]);

async function hold(page) {
  const b = await page.$('.consent .hold');
  await b.scrollIntoViewIfNeeded();
  const box = await b.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
}
async function pin(page) { await at(page, '#/lock'); await page.keyboard.type(PIN); }
async function syncNow(page, what) {
  await page.evaluate(() => { location.hash = '#/bag'; });
  await at(page, '#/bag');
  await page.click('.bag .btn.primary');
  await page.waitForFunction(() => { const b = document.querySelector('.bag .btn.primary'); return b && !b.disabled; }, null, { timeout: 90000 });
  const st = await page.evaluate(async () => {
    const hub = await import(new URL('js/hub.js', document.baseURI).href);
    const state = await import(new URL('js/state.js', document.baseURI).href);
    const m = state.cache('bag.' + state.child().id);
    return m && m.at[hub.id()] ? m.at[hub.id()].st : null;
  });
  check(st === 'saved', `${what}: Sync now saved her bag at the relay in reach` + (st === 'saved' ? '' : ` (${st})`));
}
// "I already use Qalam": the digits typed (or handed over), "Is this you?", her PIN once
async function moveIn(page, code, what) {
  if (code !== null) {
    await page.click('a[href="#/move"]');
    await at(page, '#/move');
    await page.fill('.bag-in', code.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]));
    await page.click('.move form button[type=submit]');
  }
  await page.waitForSelector('.move .found', { timeout: 90000 });
  check(!!(await page.$('.move .found .btn.primary')), `${what}: "Found: … Is this you?"`);
  await shot(page, `found-${what.replace(/\W+/g, '-')}`);
  await page.click('.move .found .btn.primary');
  await pin(page);
  await at(page, '#/home');
  check(true, `${what}: her PIN once, then Home`);
}
const asks = (q) => log.filter((e) => e.method === 'POST' && e.path === '/api/ask' && e.status < 300 && e.body.includes(q));

try {
  // 1. the Android app, online only
  const A = await phone('A');
  let app = await open(A, `${APK}/`);
  await at(app, '#/welcome');
  await app.click('.yearbox.secondary:not(.adults) .years button >> nth=1');      // year 8, no class card: Home
  await at(app, '#/home');
  await app.evaluate(() => { location.hash = '#/settings'; });                    // an open learner agrees in Settings
  await at(app, '#/settings');
  await app.click('a[href="#/consent/settings"]');
  await at(app, '#/consent/');
  await app.waitForSelector('.consent .hold', { timeout: 60000 });          // its text comes over 2G
  check((await app.$$('.consent-row')).length === 5, 'the app online: the consent names the school bag');
  await hold(app);
  await at(app, '#/bag/ready/', 90000);
  const code = latin(await app.getAttribute('.bag-card .bag-code', 'aria-label'));
  check(/^\d{16}$/.test(code) && !!(await app.$('.bag-card svg.qr')), 'the app: the bag is ready, 16 digits and the QR');
  await shot(app, 'ready');
  await app.click('.bag .btn.outline');
  await at(app, '#/lock/offer/');
  await app.keyboard.type(PIN);
  await app.waitForTimeout(400);
  await app.keyboard.type(PIN);
  await at(app, '#/settings');
  await work(app, 'done', ['dari-1-sheen', 1]);
  await work(app, 'plan', ['plan one', ['dari-1-sheen']]);
  reach.askDown = true;
  await work(app, 'ask', 'bag check: the first question');
  await app.waitForTimeout(8000);
  const a1 = await learner(app);
  check(a1.asks.length === 1 && a1.asks[0].queued, 'the app: the question waits (the online Ask fails)');
  const webSid = Object.keys(a1.seats).find((s) => /^[0-9a-f]{20}$/.test(s));
  const token = webSid && a1.seats[webSid].token;
  check(!!token, 'the app joined online: her seat there');
  await syncNow(app, 'the app online');
  reach.askDown = false;

  // 2. Chrome on the same phone: "Use Qalam in this browser too"
  phase = '2 chrome';
  const warm = await A.ctx.newPage();                 // the site was opened once before, so its app is cached
  await warm.goto(`${WEB}/app/`);
  await warm.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  await warm.close();
  await app.evaluate(() => { location.hash = '#/bag'; });
  await at(app, '#/bag');
  check(!!(await app.$('.bag .handoff')), 'the app: "Use Qalam in this browser too"');
  await app.click('.bag .handoff');
  await at(app, '#/move', 60000);
  check(!(await app.evaluate(() => location.href)).match(/\d{16}/), 'the handed-over digits stay in no address');
  const chrome = app;
  await moveIn(chrome, null, 'Chrome (handed over)');
  const c1 = await learner(chrome);
  check(c1.seats[webSid] && c1.seats[webSid].token === token, 'Chrome: her online seat came with the bag, the same token');
  check(c1.asks.length === 1 && c1.asks[0].queued, 'Chrome: the question queued on the app came in the bag');
  await chrome.evaluate(() => { location.hash = '#/ask'; });
  await at(chrome, '#/ask');
  check(!!(await chrome.$('.note.row .badge.wait')), 'Chrome: the question shows as waiting on her other phone, with "Send from here"');
  await shot(chrome, 'waiting-other-phone');
  await work(chrome, 'done', ['dari-1-sheen', 3]);
  await work(chrome, 'done', ['bagcheck-two', 2]);
  await work(chrome, 'plan', ['plan two', ['bagcheck-two']]);
  await work(chrome, 'ask', 'bag check: the second question');
  await chrome.waitForTimeout(6000);
  await syncNow(chrome, 'Chrome');
  check(asks('the first question').length === 0, 'Chrome never sent the question waiting on the app');
  check(asks('the second question').length === 1, 'Chrome sent its own question once');

  // 3. the app at the village hub (it looks for the hub before the online home)
  phase = '3 app at the hub';
  reach.hub = true;
  app = await open(A, `${APK}/`);
  await pin(app);
  await at(app, '#/home');
  await app.evaluate(() => { location.hash = '#/settings'; });
  await at(app, '#/settings');
  await app.click('a[href="#/consent/settings"]');
  await at(app, '#/consent/');
  await app.waitForSelector('.consent .hold', { timeout: 60000 });
  await hold(app);
  await at(app, '#/settings');
  await app.waitForTimeout(8000);
  await syncNow(app, 'the app at the hub');
  check(asks('the first question').length === 1 && asks('the first question')[0].server === 'hub',
    'the app sent its waiting question once, at the hub');

  // 4. Chrome at the hub: an insecure page, so the vendored PBKDF2 derives her keys
  phase = '4 chrome at the hub';
  const lan = await open(A, `${LAN}/app/`);
  check(!(await lan.evaluate(() => isSecureContext)), 'the hub\'s page is not a secure context (no crypto.subtle)');
  await at(lan, '#/welcome');
  await moveIn(lan, code, 'Chrome at the hub');
  await work(lan, 'done', ['dari-1-sheen', 2]);
  await work(lan, 'done', ['bagcheck-three', 1]);
  await work(lan, 'plan', ['plan three', ['bagcheck-three']]);
  await syncNow(lan, 'Chrome at the hub');
  await lan.close();
  app.close();
  app = await open(A, `${APK}/`);                       // the app at the hub: it pulls what Chrome left there
  await pin(app);
  await syncNow(app, 'the app at the hub again');
  phase = '4 app online';
  reach.hub = false;                                    // she walks home: online only
  await app.evaluate(async () => { const hub = await import(new URL('js/hub.js', document.baseURI).href); await hub.connect(); });
  await syncNow(app, 'the app online again');

  // 5. a new phone, online
  phase = '5 new phone';
  const D = await phone('D');
  const warmD = await D.ctx.newPage();
  await warmD.goto(`${WEB}/app/`);
  await warmD.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  await warmD.close();
  const d = await open(D, `${WEB}/app/`);
  await at(d, '#/welcome');
  await moveIn(d, code, 'the new phone');
  await d.waitForTimeout(8000);
  const dl = await learner(d);
  check((dl.done['dari-1-sheen'] || {}).stars === 3, 'nothing lost: the first lesson keeps its highest stars (3)');
  check((dl.done['bagcheck-two'] || {}).stars === 2 && (dl.done['bagcheck-three'] || {}).stars === 1,
    'nothing lost: the lessons from Chrome and from the hub are there');
  check(dl.plan && dl.plan.label === 'plan three', 'the newest plan stays (made at the hub)');
  const qs = dl.asks.map((x) => x.q).sort();
  check(qs.length === 2 && qs[0].includes('first') && qs[1].includes('second') && dl.asks.every((x) => !x.queued),
    'both questions, once each, neither waiting');
  check(dl.seats[webSid] && dl.seats[webSid].token === token, 'the new phone: her online seat, the same token');
  check(!!dl.lock, 'the new phone: her lock came with her');
  check((await d.evaluate(() => window.__persist)) >= 1, 'the new phone asked to keep its storage (she came with her lessons)');
  check(!log.some((e) => e.phase === '5 new phone' && e.path === '/api/join'), 'the new phone joined nowhere again');
  check(asks('the first question').length === 1 && asks('the second question').length === 1,
    'each question reached a server exactly once');
  await shot(d, 'new-phone-home');

  // her fifth finished lesson: the card is offered once more (it was never printed on this phone), then never again
  await work(d, 'done', ['bagcheck-four', 1]);
  await work(d, 'done', ['bagcheck-five', 1]);
  await d.evaluate(() => { location.hash = '#/settings'; });
  await at(d, '#/settings');
  await d.evaluate(() => { location.hash = '#/home'; });
  await at(d, '#/bag/again');
  check(latin(await d.getAttribute('.bag-card .bag-code', 'aria-label')) === code, 'after the fifth lesson: the card offered again');
  await shot(d, 'card-again');
  await d.click('.bag .btn.outline');
  await at(d, '#/home');
  await d.evaluate(() => { location.hash = '#/settings'; });
  await at(d, '#/settings');
  await d.evaluate(() => { location.hash = '#/home'; });
  await at(d, '#/home');
  check((await d.evaluate(() => location.hash)) === '#/home', 'the card is offered twice at most');

  // "Make a new code" on the new phone: the app's old code stops
  await d.evaluate(() => { location.hash = '#/lock/check/bag-newcode'; });
  await pin(d);                                         // her PIN again before a new code
  await at(d, '#/bag/newcode');
  await d.click('.btn.danger');
  await at(d, '#/bag/code-new', 60000);
  const code2 = latin(await d.getAttribute('.bag-card .bag-code', 'aria-label'));
  check(/^\d{16}$/.test(code2) && code2 !== code, 'the new phone: a new code');
  await syncNow(d, 'the new code');
  await app.evaluate(async () => { const b = await import(new URL('js/bagsync.js', document.baseURI).href); await b.syncAll({ quiet: false }); });
  await app.evaluate(() => { location.hash = '#/home'; });
  await at(app, '#/home');
  await app.evaluate(() => { location.hash = '#/bag'; });
  await at(app, '#/bag');
  check(!!(await app.$('a[href="#/bag/retype"]')), 'the app: the old code was stopped, "Type the new code"');
  await shot(app, 'stopped');

  // 6. a borrowed phone that has its owner's learner: "Just for today"
  phase = '6 borrowed phone';
  const E = await phone('E');
  const warmE = await E.ctx.newPage();
  await warmE.goto(`${WEB}/app/`);
  await warmE.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  await warmE.close();
  const e = await open(E, `${WEB}/app/`);
  await at(e, '#/welcome');
  await e.click('.yearbox.secondary:not(.adults) .years button >> nth=0');        // the owner: year 7
  await at(e, '#/home');
  const owner = (await learner(e)).id;
  const snap = () => e.evaluate(async () => JSON.stringify({ l: Object.entries(localStorage).sort(), s: Object.entries(sessionStorage).sort(),
    i: (await indexedDB.databases()).map((x) => x.name).sort() }));
  await e.evaluate(() => { location.hash = '#/move'; });
  await at(e, '#/move');
  await e.fill('.bag-in', code2);
  await e.click('.move form button[type=submit]');
  await e.waitForSelector('.move .found .today-choice', { timeout: 90000 });
  const before = await snap();
  await e.click('.move .found .today-choice');
  await pin(e);
  await at(e, '#/home');
  check(!!(await e.$('.today-bar a[href="#/today"]')), 'Just for today: the bar with Done on every screen');
  await shot(e, 'just-for-today');
  check((await e.evaluate(async () => (await import(new URL('js/state.js', document.baseURI).href)).learners().length)) === 1,
    'Just for today: only her, and the owner\'s learner unseen');
  await work(e, 'done', ['bagcheck-today', 2]);
  reach.askDown = true;
  await work(e, 'ask', 'bag check: the borrowed phone question');
  await e.waitForTimeout(6000);
  check((await snap()) === before, 'Just for today: nothing of hers reached the phone\'s storage');
  check((await e.evaluate(() => window.__persist)) === 0, 'Just for today: the phone was not asked to keep anything');
  await e.click('.today-bar a[href="#/today"]');
  await e.waitForFunction(() => !document.querySelector('.today-bar') && document.querySelector('#app .screen.home'), null, { timeout: 90000 });
  reach.askDown = false;
  const after = await stored(e);
  check(after.learners.length === 1 && after.learners[0].id === owner, 'Done: the phone opened again, with its owner\'s learner only');
  await syncNow(d, 'her phone after the borrowed one');
  await d.evaluate(async () => { const o = await import(new URL('js/outbox.js', document.baseURI).href); await o.flush(); });
  await d.waitForTimeout(3000);
  const dl2 = await learner(d);
  check((dl2.done['bagcheck-today'] || {}).stars === 2, 'Done pushed her bag: today\'s lesson is on her phone');
  check(asks('the borrowed phone question').length === 1 && asks('the borrowed phone question')[0].phase === '6 borrowed phone',
    'the question left waiting on the borrowed phone was sent once, by her own phone');

  // 7. W9: a learner of the hub's own class; her phone lost, no card: the teacher's return code at the village hub
  phase = '7 return code';
  reach.hub = true;
  reach.online = false;                                 // at school: the hub is her class's server
  const G = await phone('G');
  const g = await open(G, `${LAN}/app/`);
  await at(g, '#/welcome');
  await g.click('.yearbox.secondary:not(.adults) .years button >> nth=2');        // year 9
  await at(g, '#/home');
  await g.evaluate(() => { location.hash = '#/settings'; });
  await at(g, '#/settings');
  await g.click('a[href="#/consent/settings"]');
  await at(g, '#/consent/');
  await g.waitForSelector('.consent .hold', { timeout: 60000 });
  await hold(g);
  await at(g, '#/bag/ready/', 90000);
  await g.click('.bag .btn.outline');                  // the card is not printed, and later the phone is lost
  await at(g, '#/lock/offer/');
  await g.keyboard.type(PIN);
  await g.waitForTimeout(400);
  await g.keyboard.type(PIN);
  await at(g, '#/settings');
  await work(g, 'done', ['bagcheck-seven', 3]);
  await work(g, 'done', ['bagcheck-eight', 1]);
  await g.evaluate(async () => { const a = await import(new URL('js/account.js', document.baseURI).href); await a.sync(); });
  await g.waitForTimeout(3000);
  check(log.filter((e) => e.phase === '7 return code' && e.server === 'hub' && e.path === '/api/events' && e.body.includes('lesson.done')).length >= 1,
    'a learner of the hub\'s class: her lessons\' events reached the hub');
  const api = (path, { token, pin, method = 'GET' } = {}) => fetch(new URL(path, HUB), { method, headers: { 'content-type': 'application/json',
    'x-qalam': '1', ...(token ? { 'x-learner-token': token } : {}), ...(pin ? { 'x-teacher-pin': pin } : {}) } })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  const hubSid = (await api('/api/hello')).data.id;
  const lost = await learner(g);
  const was = lost.seats[hubSid];
  check(!!(was && was.token && was.number), 'her phone has her seat at the hub (the phone she will lose)');
  const classBefore = (await api('/api/m/teacher/class', { pin: TEACHER_PIN })).data.learners;
  const made = await api(`/api/m/teacher/class/${lost.picture}-${was.number}/return-code`, { pin: TEACHER_PIN, method: 'POST' });
  check(made.status === 200 && /^\d{6}$/.test(made.data.code) && made.data.minutes === 15, 'the teacher made a return code: six digits, 15 minutes');
  await G.ctx.close();                                  // the phone is lost
  phase = '7 new phone';
  const F = await phone('F');
  const f = await open(F, `${LAN}/app/`);
  await at(f, '#/welcome');
  await f.click('a[href="#/move"]');
  await at(f, '#/move');
  await f.click('.move .return-link');
  await at(f, '#/return');
  await shot(f, 'return-code');
  await f.fill('.return-digits', made.data.code.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]));
  await f.click('.return form button[type=submit]');
  await f.waitForSelector('.return .found', { timeout: 90000 });
  await shot(f, 'return-welcome');
  const fl = await learner(f);
  const seat = fl.seats[hubSid] || {};
  check(fl.picture === lost.picture && seat.number === was.number && seat.token && seat.token !== was.token,
    'the new phone: her picture and number, with a new token');
  check((await api('/api/me', { token: was.token })).status === 401, 'the lost phone\'s token is refused at the hub');
  const prog = (await api('/api/me/progress', { token: seat.token })).data;
  check((prog.done['bagcheck-seven'] || {}).stars === 3 && (fl.done['bagcheck-seven'] || {}).stars === 3
    && (fl.done['bagcheck-eight'] || {}).stars === 1 && Object.keys(prog.done).every((k) => fl.done[k] && fl.done[k].stars >= prog.done[k].stars),
    'her lessons came back from the hub\'s events' + ` (${Object.keys(fl.done).length} lessons)`);
  await f.click('.return .return-on');
  await at(f, '#/lock/offer/');
  await f.keyboard.type(PIN);
  await f.waitForTimeout(400);
  await f.keyboard.type(PIN);
  await at(f, '#/home');
  check(true, 'the new phone: the lock offered, then Home');
  await f.waitForTimeout(5000);
  check(!log.some((e) => e.phase === '7 new phone' && (e.path === '/api/join' || (e.path === '/api/events' && e.body.includes('lesson.done')))),
    'the new phone joined nowhere again and sent none of her lessons again');
  check((await api('/api/m/teacher/class', { pin: TEACHER_PIN })).data.learners === classBefore, 'the teacher sees one learner, as before');
  check((await f.evaluate(async (c) => { try { await (await import(new URL('js/hub.js', document.baseURI).href)).returnCode({ code: c }); return 0; }
      catch (e) { return e.status; } }, made.data.code)) === 410, 'a used return code is refused (410)');

  const all = seen.join('\n');
  const keys = [dl.bag.k, dl.bag.f, dl.bag.w, dl2.bag.k, dl2.bag.f, dl2.bag.w];
  check(![code, code2, ...keys].some((x) => x && all.includes(x)), 'neither code nor its keys ever left a phone');
  check(A.errors.length + D.errors.length + E.errors.length + F.errors.length + G.errors.length === 0, 'no page errors' + [...A.errors, ...D.errors, ...E.errors, ...F.errors, ...G.errors].map((e) => ': ' + e).join(''));
} catch (e) {
  const where = (String(e.stack).match(/bag_check\.mjs:(\d+)/) || [])[1];
  check(false, `the walk stopped (line ${where}, in ${phase}): ${e.message.split('\n')[0]}`);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) {
    console.log('  page', pg.url(), (await pg.textContent('#app').catch(() => '')).slice(0, 200).replace(/\s+/g, ' '));
  }
} finally {
  await browser.close();
  secure.close();
  plain.close();
  rmSync(certs, { recursive: true, force: true });
}
for (const x of slow) console.log(`note: a screen took over 10 s on 2G: ${x}`);
console.log(problems.length ? `${problems.length} problem(s)` : 'bag checks pass');
process.exit(problems.length ? 1 : 0);
