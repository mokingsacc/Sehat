// Where pictures live (docs/STEPS_PLAYER.md "Where the pictures live"): an on-demand picture-step set is not
// precached and not in the APK, downloads when its page is opened online (all files or none, retried after a cut),
// and the page works offline before that with the SVG version. With Playwright's Chromium.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node tools/test_ondemand.mjs
//
// A temporary copy of the app gets a grey-box picture-step version of "handwashing" (the hygiene page; not an
// Emergency or CPR animation, so tools/build.py makes it on-demand) through tools/steps_images.py, is built with
// tools/build.py and packed with android/sync-web.sh. Then, in the browser:
//   1. the first open precaches cpr-baby (Emergency / CPR) and nothing of handwashing;
//   2. offline, before any download: the hygiene page shows the SVG poster, the player plays the SVG version;
//   3. online with one picture failing: the set is not complete, so it never plays (SVG again), no errors;
//   4. online again: the next visit completes the set, the poster cross-fades to the picture-step one in a box of
//      the same size (no blank box, no jump), and the player plays the picture steps;
//   5. offline after that, reloaded: the picture steps play from the phone;
//   6. on mobile data the page alone downloads nothing (Wi-Fi only, like the voice packs); opening it does.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NAME = 'handwashing';
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };

// ---------- the fixture: a copy of the app with a live on-demand set ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ondemand-test-'));
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(REPO, f), path.join(root, f));
for (const d of ['css', 'js', 'fonts', 'img', 'anim', 'tools', 'server']) fs.cpSync(path.join(REPO, d), path.join(root, d), { recursive: true, filter: (s) => !/\/img\/_preview(\/|$)|\/node_modules(\/|$)/.test(s) });
fs.mkdirSync(path.join(root, 'content'));
for (const f of fs.readdirSync(path.join(REPO, 'content'))) if (f !== 'scripts') fs.cpSync(path.join(REPO, 'content', f), path.join(root, 'content', f), { recursive: true });
fs.mkdirSync(path.join(root, 'android')); fs.copyFileSync(path.join(REPO, 'android/sync-web.sh'), path.join(root, 'android/sync-web.sh'));
const png = path.join(os.tmpdir(), 'ondemand-png-' + process.pid); fs.mkdirSync(png, { recursive: true });
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
for fr, sh in (("a", 0), ("b", 60)):
    bg = Image.new("RGB", (1600, 1200), (200, 214, 222)); d = ImageDraw.Draw(bg)
    d.rectangle((0, 900, 1600, 1200), fill=(170, 186, 196)); d.ellipse((500 + sh, 500, 1100 + sh, 900), fill=(120, 150, 170))
    bg.save("${png}/${NAME}-%s-bg.png" % fr)
    hand = Image.new("RGBA", (1600, 1200), (0, 0, 0, 0)); d = ImageDraw.Draw(hand)
    d.rectangle((700, 300, 900, 650 - sh), fill=(90, 90, 90, 255))
    hand.save("${png}/${NAME}-%s-hand.png" % fr)
`]);
execFileSync('python3', [path.join(root, 'tools/steps_images.py'), png, '--out', path.join(root, 'img/steps'), '--json', path.join(root, 'anim/steps'), '--max-kb', '20'], { stdio: 'pipe' });
const jp = path.join(root, `anim/steps/${NAME}.json`);
const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
j.approved = 'test fixture';
j.scenes = [
  { id: `anim.${NAME}.s1`, frame: 'a', motions: [{ id: 'rub', type: 'loop', layer: 'hand', dx: 20, rate: 60, ease: 'rub' }], overlays: [{ type: 'ring', x: 480, y: 360, r: 80, at: 200 }] },
  { id: `anim.${NAME}.s2`, frame: 'b', cam: false, motions: [], overlays: [] },
];
fs.writeFileSync(jp, JSON.stringify(j));
const aj = path.join(root, 'js/anim.js');
fs.writeFileSync(aj, fs.readFileSync(aj, 'utf8').replace(/export const STEPS = \[/, `export const STEPS = ['${NAME}', `));
execFileSync('python3', [path.join(root, 'tools/build.py')], { stdio: 'pipe' });

// ---------- 1a. the build: book.steps, the precache list, the APK ----------
const book = JSON.parse(fs.readFileSync(path.join(root, 'content/book.json'), 'utf8'));
const st = book.steps || {};
ok(st[NAME] && st[NAME].offline === 'on-demand', `book.steps: ${NAME} is on-demand (${st[NAME] && st[NAME].offline})`);
ok(st['cpr-baby'] && st['cpr-baby'].offline === 'precache', 'book.steps: cpr-baby (CPR) is precached');
const odFiles = (st[NAME] && st[NAME].files) || [];
ok(odFiles.length >= 3 && /^anim\/steps\/handwashing\.json\?v=/.test(odFiles[0]), `book.steps lists the set's JSON and ${odFiles.length - 1} pictures`);
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pre = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/s)[1]);
ok(!pre.some((p) => p.indexOf(`steps/${NAME}`) >= 0), 'sw.js precaches nothing of the on-demand set');
ok(pre.indexOf('anim/steps/cpr-baby.json') >= 0 && pre.some((p) => p.indexOf('img/steps/cpr-baby/') === 0), 'sw.js precaches the CPR set');
execFileSync('bash', [path.join(root, 'android/sync-web.sh')], { stdio: 'pipe', env: Object.assign({}, process.env, { WEB_ROOT: root }) });
const www = path.join(root, 'android/app/src/main/assets/www');
ok(!fs.existsSync(path.join(www, 'img/steps', NAME)) && !fs.existsSync(path.join(www, `anim/steps/${NAME}.json`)), 'the APK has nothing of the on-demand set');
ok(fs.existsSync(path.join(www, 'img/steps/cpr-baby')) && fs.existsSync(path.join(www, 'anim/steps/cpr-baby.json')), 'the APK has the CPR set');

// ---------- the browser ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const SRV = { fail: null, hits: [] };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.indexOf('/steps/') >= 0) SRV.hits.push(u);
  if (SRV.fail && u.endsWith(SRV.fail)) { r.socket.destroy(); return; } // a cut-off line
  const f = path.join(root, u.replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch();
const errs = [];
async function phone(mobileData) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_EMPTY_RESPONSE|net::/.test(m.text())) errs.push(m.text()); });
  await p.route(/workers\.dev|\/e$|\/r$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.addInitScript(([CV, cell]) => {
    if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', JSON.stringify('fa')); localStorage.setItem('fhb.voice', JSON.stringify('f')); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); }
    if (cell) Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular', effectiveType: '4g', saveData: false, addEventListener() {} } });
  }, [book.config.consentVersion, !!mobileData]);
  await p.goto(BASE + 'index.html#/home'); await p.waitForSelector('main .hbtn', { timeout: 15000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('main .hbtn', { timeout: 15000 });
  return { ctx, p };
}
const stepsKeys = (p) => p.evaluate(async () => (await (await caches.open('fhb-steps-v1')).keys()).map((r) => r.url));
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(400); };
const posterKind = (p) => p.evaluate((n) => { const el = document.querySelector(`[data-poster="${n}"]`); if (!el) return 'none'; return el.querySelector('.st-poster') ? 'steps' : el.querySelector('.anim-svg') ? 'svg' : 'empty'; }, NAME);
async function playerKind(p) {
  await p.click(`[data-poster="${NAME}"]`);
  await p.waitForSelector('.anim-overlay .anim-stage > *', { timeout: 8000 });
  await p.waitForTimeout(500);
  const k = await p.evaluate(() => {
    const s = document.querySelector('.anim-overlay .anim-stage');
    const imgs = [...s.querySelectorAll('.st img')];
    return { kind: s.querySelector('.st') ? 'steps' : s.querySelector('.anim-svg') ? 'svg' : 'empty', imgs: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length };
  });
  await p.click('.anim-overlay .ax'); await p.waitForTimeout(200);
  return k;
}

try {
  const { ctx, p } = await phone(false);
  // 1b. the first open precached the CPR set and nothing of the on-demand one
  const shell = await p.evaluate(async () => { const k = (await caches.keys()).find((x) => x.indexOf('fhb-shell-') === 0); return (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); });
  ok(shell.some((u) => u.indexOf('/img/steps/cpr-baby/') >= 0), 'the first open precached the CPR pictures');
  ok(!shell.some((u) => u.indexOf(`/steps/${NAME}`) >= 0), 'the first open precached nothing of the on-demand set');
  ok(!SRV.hits.some((u) => u.indexOf(`/steps/${NAME}`) >= 0), 'the first open downloaded nothing of the on-demand set');

  // 2. offline before any download
  await ctx.setOffline(true);
  await go(p, '#/topic/hygiene');
  await p.waitForSelector(`[data-poster="${NAME}"].filled > *`, { timeout: 8000 });
  ok(await posterKind(p) === 'svg', 'offline, not downloaded: the hygiene page shows the SVG poster');
  const k2 = await playerKind(p);
  ok(k2.kind === 'svg', `offline, not downloaded: the player plays the SVG version (${k2.kind})`);
  ok((await stepsKeys(p)).length === 0, 'offline: nothing was stored');
  await ctx.setOffline(false);

  // 3. online, one picture cut off: the set is incomplete and never plays
  SRV.fail = odFiles[2].split('?')[0];
  await go(p, '#/home'); await go(p, '#/topic/hygiene');
  await p.waitForFunction(() => true); await p.waitForTimeout(2500);
  const k3keys = await stepsKeys(p);
  ok(k3keys.length > 0 && k3keys.length < odFiles.length, `a cut-off download keeps ${k3keys.length} of ${odFiles.length} files`);
  ok(await posterKind(p) === 'svg', 'an incomplete set: the poster stays the SVG one');
  const k3 = await playerKind(p);
  ok(k3.kind === 'svg', `an incomplete set never plays: the player plays the SVG version (${k3.kind})`);
  SRV.fail = null;

  // 4. the next visit completes it; the poster changes in place
  await go(p, '#/home'); await go(p, '#/topic/hygiene');
  const h0 = await p.evaluate((n) => document.querySelector(`[data-poster="${n}"]`).getBoundingClientRect().height, NAME);
  const blank = await p.evaluate((n) => new Promise((res) => { // watch the poster box: never empty, same height
    const el = document.querySelector(`[data-poster="${n}"]`), h = el.getBoundingClientRect().height; let bad = '';
    const t0 = Date.now();
    (function look() {
      if (!el.querySelector('.anim-svg, .st-poster')) bad = bad || 'empty at ' + (Date.now() - t0) + ' ms';
      if (Math.abs(el.getBoundingClientRect().height - h) > 1) bad = bad || 'height changed';
      if (el.querySelector('.st-poster') && !el.querySelector('.anim-svg')) return res(bad || 'ok');
      if (Date.now() - t0 > 8000) return res(bad || 'timeout');
      requestAnimationFrame(look);
    })();
  }), NAME);
  ok(blank === 'ok', `the poster cross-fades to the picture-step one with no blank box and no jump (${blank}, ${Math.round(h0)} px)`);
  ok((await stepsKeys(p)).length === odFiles.length, 'the whole set is on the phone');
  const k4 = await playerKind(p);
  ok(k4.kind === 'steps' && k4.imgs > 0 && k4.loaded === k4.imgs, `online: the player plays the picture steps (${k4.kind}, ${k4.loaded}/${k4.imgs} pictures)`);

  // 5. offline after the download: from the phone
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('main', { timeout: 15000 }); await go(p, '#/topic/hygiene');
  await p.waitForSelector(`[data-poster="${NAME}"].filled > *`, { timeout: 8000 });
  ok(await posterKind(p) === 'steps', 'offline after the download: the picture-step poster');
  const k5 = await playerKind(p);
  ok(k5.kind === 'steps' && k5.imgs > 0 && k5.loaded === k5.imgs, `offline after the download: the picture steps play (${k5.loaded}/${k5.imgs} pictures)`);
  await go(p, '#/emergency/baby');
  ok(await p.evaluate(() => !!document.querySelector('main .em-cpr')), 'offline: the Emergency screen opens');
  await ctx.close();

  // 6. mobile data: the page alone does not download; opening the animation does
  const m = await phone(true);
  await go(m.p, '#/topic/hygiene'); await m.p.waitForTimeout(2000);
  ok((await stepsKeys(m.p)).length === 0, 'mobile data: opening the page downloads nothing');
  const k6 = await playerKind(m.p);
  ok(k6.kind === 'svg', 'mobile data: the first play is the SVG version, at once');
  await m.p.waitForTimeout(2500);
  ok((await stepsKeys(m.p)).length === odFiles.length, 'mobile data: opening the animation downloaded the set for next time');
  await m.ctx.close();
} catch (e) { ok(false, 'test crashed: ' + (e && e.stack || e)); }
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); server.close();
fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(png, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
