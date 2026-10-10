// Where pictures live (docs/STEPS_PLAYER.md "Where the pictures live"): an on-demand picture-step set is not
// precached and not in the APK, downloads when its page is opened online (all files or none, checked against their
// hashes, carried on after a cut), and the page works offline before that with the SVG version. Playwright's Chromium.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node tools/test_ondemand.mjs
//
// A temporary copy of the app gets a grey-box picture-step version of "handwashing" (the hygiene page; not an
// Emergency or CPR animation, so tools/build.py makes it on-demand) through tools/steps_images.py, and a picture
// folder that is not live; it is built with tools/build.py and packed with android/sync-web.sh. In the browser
// (Wi-Fi unless said otherwise):
//   1. the first open precaches cpr-baby (Emergency / CPR) and nothing of handwashing;
//   2. offline, before any download: the SVG poster and the SVG version;
//   3. one picture cut off: the set is incomplete and never plays; the next visit fetches only the missing files;
//   4. complete: the poster cross-fades in a box of the same size (no blank, no jump); the picture steps play,
//      offline too, and the Emergency screen opens;
//   5. an update (new ?v= for a picture): the old set keeps playing until the new one is complete, then the old files go;
//   6. a website JSON that is not the version the book names (version skew): nothing is kept, the SVG plays;
//   7. a stalled file is given up after the inactivity time (also with no AbortController) and the next visit
//      completes; a slow but steady file (longer than that time in total) finishes;
//   8. mobile data, no navigator.connection, and data saver: the page alone downloads nothing; opening it does.
//   9. a set with no SVG version waits off its page until it is downloaded;
//  10. a picture shared from another set's folder is listed by its own path, downloaded and kept by the sweep.
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NAME = 'handwashing';
const IDLE = 1500; // the inactivity time the test sets (the app's default is 30 s)
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const sha8 = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 8);

// ---------- the fixture: a copy of the app with a live on-demand set ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ondemand-test-'));
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(REPO, f), path.join(root, f));
for (const d of ['css', 'js', 'fonts', 'img', 'anim', 'tools', 'server']) fs.cpSync(path.join(REPO, d), path.join(root, d), { recursive: true, filter: (s) => !/\/img\/_preview(\/|$)|\/node_modules(\/|$)/.test(s) });
fs.mkdirSync(path.join(root, 'content'));
for (const f of fs.readdirSync(path.join(REPO, 'content'))) if (f !== 'scripts') fs.cpSync(path.join(REPO, 'content', f), path.join(root, 'content', f), { recursive: true });
fs.mkdirSync(path.join(root, 'android')); fs.copyFileSync(path.join(REPO, 'android/sync-web.sh'), path.join(root, 'android/sync-web.sh'));
const png = fs.mkdtempSync(path.join(os.tmpdir(), 'ondemand-png-'));
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
// a picture folder and JSON of a set that is not live (not in STEPS): never in the APK
fs.cpSync(path.join(root, 'img/steps', NAME), path.join(root, 'img/steps/not-live-yet'), { recursive: true });
fs.copyFileSync(jp, path.join(root, 'anim/steps/not-live-yet.json'));
const build = () => { execFileSync('python3', [path.join(root, 'tools/build.py')], { stdio: 'pipe' }); return JSON.parse(fs.readFileSync(path.join(root, 'content/book.json'), 'utf8')); };
const book = build();

// ---------- the build: book.steps, the precache list, the APK ----------
const st = book.steps || {};
ok(st[NAME] && st[NAME].offline === 'on-demand', `book.steps: ${NAME} is on-demand (${st[NAME] && st[NAME].offline})`);
ok(st['cpr-baby'] && st['cpr-baby'].offline === 'precache', 'book.steps: cpr-baby (CPR) is precached');
ok(!st['not-live-yet'], 'book.steps: a set that is not live is not listed');
const odFiles = (st[NAME] && st[NAME].files) || [];
ok(odFiles.length >= 3 && /^anim\/steps\/handwashing\.json\?v=/.test(odFiles[0]), `book.steps lists the set's JSON and ${odFiles.length - 1} pictures`);
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pre = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/s)[1]);
ok(!pre.some((p) => p.indexOf(`steps/${NAME}`) >= 0 || p.indexOf('not-live-yet') >= 0), 'sw.js precaches nothing of the on-demand or not-live set');
ok(pre.indexOf('anim/steps/cpr-baby.json') >= 0 && pre.some((p) => p.indexOf('img/steps/cpr-baby/') === 0), 'sw.js precaches the CPR set');
execFileSync('bash', [path.join(root, 'android/sync-web.sh')], { stdio: 'pipe', env: Object.assign({}, process.env, { WEB_ROOT: root }) });
const www = path.join(root, 'android/app/src/main/assets/www');
ok(!fs.existsSync(path.join(www, 'img/steps', NAME)) && !fs.existsSync(path.join(www, `anim/steps/${NAME}.json`)), 'the APK has nothing of the on-demand set');
ok(!fs.existsSync(path.join(www, 'img/steps/not-live-yet')) && !fs.existsSync(path.join(www, 'anim/steps/not-live-yet.json')), 'the APK has nothing of the not-live folder');
ok(fs.existsSync(path.join(www, 'img/steps/cpr-baby')) && fs.existsSync(path.join(www, 'anim/steps/cpr-baby.json')), 'the APK has the CPR set');
fs.rmSync(path.join(root, 'android/app'), { recursive: true, force: true });

// ---------- the website ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
// SRV.fail: cut off this file; SRV.stall: send half of it and hang; SRV.drip: send it in pieces, one every ms;
// SRV.json: serve this text as the set's JSON (version skew)
const SRV = { fail: null, stall: null, drip: null, json: null, hits: {} };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.indexOf('/steps/' + NAME) >= 0) SRV.hits[u] = (SRV.hits[u] || 0) + 1;
  if (SRV.fail && u.endsWith(SRV.fail)) { r.socket.destroy(); return; }
  const f = path.join(root, u.replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  let body = fs.readFileSync(f);
  if (SRV.json && u.endsWith(`anim/steps/${NAME}.json`)) body = Buffer.from(SRV.json);
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  if (SRV.stall && u.endsWith(SRV.stall)) { r.write(body.slice(0, body.length >> 1)); return; } // never ends
  if (SRV.drip && u.endsWith(SRV.drip.file)) {
    const n = SRV.drip.pieces, size = Math.ceil(body.length / n); let k = 0;
    const t = setInterval(() => { r.write(body.slice(k * size, (k + 1) * size)); if (++k >= n) { clearInterval(t); r.end(); } }, SRV.drip.ms);
    return;
  }
  r.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch();
const errs = [];
const NETS = {
  wifi: { type: 'wifi', effectiveType: '4g', saveData: false },
  cellular: { type: 'cellular', effectiveType: '4g', saveData: false },
  saveData: { type: 'wifi', effectiveType: '4g', saveData: true },
  none: null, // no navigator.connection at all (iPhone, many computers)
};
async function phone(net, noAbort) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push(m.text()); });
  await p.route(/workers\.dev|\/e$|\/r$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.addInitScript(([CV, c, noAb]) => {
    if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', JSON.stringify('fa')); localStorage.setItem('fhb.voice', JSON.stringify('f')); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); }
    Object.defineProperty(navigator, 'connection', { configurable: true, value: c ? Object.assign({ addEventListener() {} }, c) : undefined });
    if (noAb) window.AbortController = undefined;
  }, [book.config.consentVersion, NETS[net], !!noAbort]);
  await p.goto(BASE + 'index.html#/home'); await p.waitForSelector('main .hbtn', { timeout: 15000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('main .hbtn', { timeout: 15000 });
  return { ctx, p };
}
// the app's own module (the same instance the page uses): a short inactivity time, or a newer book.steps
const setup = (p, steps) => p.evaluate(([s, idle]) => import('./js/anim.js').then((m) => { m.stepsSetup(s, '', { idleMs: idle }); }), [steps, IDLE]);
const stepsKeys = (p) => p.evaluate(async () => (await (await caches.open('fhb-steps-v1')).keys()).map((r) => r.url.replace(location.origin + '/', '')));
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(400); };
const revisit = async (p, wait) => { await go(p, '#/home'); await go(p, '#/topic/hygiene'); await p.waitForTimeout(wait || 1500); };
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
  const { ctx, p } = await phone('wifi');
  await setup(p, book.steps);
  // 1. the first open precached the CPR set and nothing of the on-demand one
  const shell = await p.evaluate(async () => { const k = (await caches.keys()).find((x) => x.indexOf('fhb-shell-') === 0); return (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); });
  ok(shell.some((u) => u.indexOf('/img/steps/cpr-baby/') >= 0), 'the first open precached the CPR pictures');
  ok(!shell.some((u) => u.indexOf(`/steps/${NAME}`) >= 0), 'the first open precached nothing of the on-demand set');
  ok(!Object.keys(SRV.hits).length, 'the first open downloaded nothing of the on-demand set');

  // 2. offline before any download
  await ctx.setOffline(true);
  await go(p, '#/topic/hygiene');
  await p.waitForSelector(`[data-poster="${NAME}"].filled > *`, { timeout: 8000 });
  ok(await posterKind(p) === 'svg', 'offline, not downloaded: the hygiene page shows the SVG poster');
  ok((await playerKind(p)).kind === 'svg', 'offline, not downloaded: the player plays the SVG version');
  ok((await stepsKeys(p)).length === 0, 'offline: nothing was stored');
  await ctx.setOffline(false);

  // 3. one picture cut off: incomplete, never plays; the next visit fetches only what is missing
  SRV.fail = odFiles[2].split('?')[0];
  await revisit(p, 2500);
  const kept = await stepsKeys(p);
  ok(kept.length === 2, `a cut-off download keeps the ${kept.length} files that arrived before the cut (of ${odFiles.length})`);
  ok(await posterKind(p) === 'svg', 'an incomplete set: the poster stays the SVG one');
  ok((await playerKind(p)).kind === 'svg', 'an incomplete set never plays: the player plays the SVG version');
  SRV.fail = null;
  const hitsBefore = Object.assign({}, SRV.hits);

  // 4. the next visit completes it; the poster changes in place
  await go(p, '#/home'); await go(p, '#/topic/hygiene');
  const blank = await p.evaluate((n) => new Promise((res) => { // watch the poster box: never empty, same height
    const el = document.querySelector(`[data-poster="${n}"]`), h = el.getBoundingClientRect().height; let bad = '';
    const t0 = Date.now();
    (function look() {
      if (!el.querySelector('.anim-svg, .st-poster')) bad = bad || 'empty at ' + (Date.now() - t0) + ' ms';
      if (Math.abs(el.getBoundingClientRect().height - h) > 1) bad = bad || 'height changed';
      if (el.querySelector('.st-poster') && !el.querySelector('.anim-svg')) return res(bad || 'ok ' + Math.round(h) + ' px');
      if (Date.now() - t0 > 8000) return res(bad || 'timeout');
      requestAnimationFrame(look);
    })();
  }), NAME);
  ok(/^ok/.test(blank), `the poster cross-fades to the picture-step one with no blank box and no jump (${blank})`);
  ok((await stepsKeys(p)).length === odFiles.length, 'the whole set is on the phone');
  const refetched = kept.filter((u) => (SRV.hits['/' + u.split('?')[0]] || 0) !== (hitsBefore['/' + u.split('?')[0]] || 0));
  ok(refetched.length === 0, 'files kept from the cut-off try were not downloaded again' + (refetched.length ? ': ' + refetched.join(' ') : ''));
  const box = await p.evaluate((n) => { const el = document.querySelector(`[data-poster="${n}"]`), r = el.getBoundingClientRect(), c = el.querySelector('.st-poster').getBoundingClientRect(); return [r.width, r.height, c.width, c.height]; }, NAME);
  ok(Math.abs(box[1] - box[0] * 2 / 3) < 2 && Math.abs(box[3] - box[1]) < 2 && Math.abs(box[2] - box[0]) < 2, `the picture-step poster fills its 3:2 box (${box.map(Math.round).join(' x ')})`);
  const k4 = await playerKind(p);
  ok(k4.kind === 'steps' && k4.imgs > 0 && k4.loaded === k4.imgs, `online: the player plays the picture steps (${k4.loaded}/${k4.imgs} pictures)`);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('main', { timeout: 15000 }); await setup(p, book.steps); await go(p, '#/topic/hygiene');
  await p.waitForSelector(`[data-poster="${NAME}"].filled > *`, { timeout: 8000 });
  ok(await posterKind(p) === 'steps', 'offline after the download: the picture-step poster');
  const k5 = await playerKind(p);
  ok(k5.kind === 'steps' && k5.loaded === k5.imgs && k5.imgs > 0, `offline after the download: the picture steps play (${k5.loaded}/${k5.imgs})`);
  await go(p, '#/emergency/baby');
  ok(await p.evaluate(() => !!document.querySelector('main .em-cpr')), 'offline: the Emergency screen opens');
  await ctx.setOffline(false);

  // 5. an update: a new version of one picture (new ?v=); the old set plays until the new one is complete
  const pic = j.frames.a.layers[0].src, picPath = path.join(root, 'img/steps', NAME, pic);
  execFileSync('python3', ['-c', `from PIL import Image; im = Image.open("${picPath}").convert("RGB"); im.putpixel((5, 5), (255, 0, 0)); im.save("${picPath}", "WEBP", quality=60)`]);
  const nv = sha8(fs.readFileSync(picPath));
  const j2 = JSON.parse(fs.readFileSync(jp, 'utf8'));
  for (const f of Object.values(j2.frames)) for (const L of f.layers) if (L.src === pic) L.v = nv;
  fs.writeFileSync(jp, JSON.stringify(j2));
  const book2 = build(), files2 = book2.steps[NAME].files;
  ok(files2[0] !== odFiles[0] && files2.some((f) => f.indexOf('v=' + nv) > 0), 'an update gives the set a new JSON ?v= and the changed picture its new ?v=');
  await setup(p, book2.steps);
  SRV.fail = 'img/steps/' + NAME + '/' + pic; // the new picture cannot come yet
  await revisit(p, 2000);
  const k6 = await playerKind(p);
  ok(k6.kind === 'steps' && k6.loaded === k6.imgs && k6.imgs > 0, 'while the new version is incomplete, the old set keeps playing');
  ok((await stepsKeys(p)).indexOf(odFiles[0]) >= 0, 'the old version stays on the phone meanwhile');
  SRV.fail = null;
  await revisit(p, 2500);
  const keys6 = await stepsKeys(p);
  ok(files2.every((f) => keys6.indexOf(f) >= 0) && keys6.length === files2.length, `the new version is complete and the old files are gone (${keys6.length} files)`);
  const k6b = await playerKind(p);
  ok(k6b.kind === 'steps' && k6b.loaded === k6b.imgs, 'the new version plays');

  // 6. version skew: the website's JSON is not the one the book names: nothing is kept, the SVG plays
  await p.evaluate(() => caches.delete('fhb-steps-v1'));
  await setup(p, book2.steps);
  SRV.json = JSON.stringify(Object.assign({}, j2, { _note: 'a newer website' }));
  await revisit(p, 2000);
  ok((await stepsKeys(p)).length === 0, 'a website JSON that is not the version the book names is not kept');
  ok((await playerKind(p)).kind === 'svg', 'version skew: the SVG version plays');
  SRV.json = null;

  // 7. a stalled file is given up after the inactivity time; the next visit completes
  await setup(p, book2.steps);
  SRV.stall = files2[1].split('?')[0];
  await revisit(p, IDLE + 1500);
  ok((await stepsKeys(p)).length === 1, 'a stalled picture is given up (the JSON before it is kept)');
  SRV.stall = null;
  await revisit(p, 2500);
  ok((await stepsKeys(p)).length === files2.length, 'the next visit completes the set');
  // a slow but steady file takes longer than the inactivity time in total and still finishes
  await p.evaluate(() => caches.delete('fhb-steps-v1'));
  await setup(p, book2.steps);
  SRV.drip = { file: files2[1].split('?')[0], pieces: 5, ms: Math.round(IDLE * 0.6) };
  await revisit(p, IDLE * 0.6 * 5 + 2500);
  ok((await stepsKeys(p)).length === files2.length, `a slow but steady picture (${(IDLE * 0.6 * 5 / 1000).toFixed(1)} s in total, ${IDLE / 1000} s inactivity time) finishes`);
  SRV.drip = null;
  await ctx.close();

  // 7b. no AbortController (old phones): a stall still frees the set for the next try
  const na = await phone('wifi', true);
  await setup(na.p, book2.steps);
  SRV.stall = files2[1].split('?')[0];
  await revisit(na.p, IDLE + 1500);
  SRV.stall = null;
  await revisit(na.p, 2500);
  ok((await stepsKeys(na.p)).length === files2.length, 'with no AbortController, a stalled try does not block the next one');
  await na.ctx.close();

  // 8. not on Wi-Fi: the page alone downloads nothing; opening the animation does (that first play is the SVG)
  for (const net of ['cellular', 'none', 'saveData']) {
    const m = await phone(net);
    await setup(m.p, book2.steps);
    await revisit(m.p, 1500);
    ok((await stepsKeys(m.p)).length === 0, `${net}: opening the page downloads nothing`);
    const k8 = await playerKind(m.p);
    ok(k8.kind === 'svg', `${net}: the first play is the SVG version, at once`);
    await m.p.waitForTimeout(2500);
    ok((await stepsKeys(m.p)).length === files2.length, `${net}: opening the animation downloaded the set for next time`);
    await m.ctx.close();
  }

  // 9. a set with no SVG version: its block is left off the page until the pictures are on the phone, then appears
  fs.rmSync(path.join(root, `anim/${NAME}.js`));
  const book3 = build();
  ok(book3.steps[NAME].fallback === false, 'book.steps: no SVG version (fallback false)');
  const nf = await phone('wifi');
  SRV.drip = { file: book3.steps[NAME].files[1].split('?')[0], pieces: 4, ms: 500 }; // slow enough to look before it arrives
  await go(nf.p, '#/topic/hygiene');
  const first = await nf.p.evaluate((n) => ({ block: !!document.querySelector(`[data-poster="${n}"]`), wait: !!document.querySelector(`[data-steps-wait="${n}"]`) }), NAME);
  ok(!first.block && first.wait, 'no SVG version, not downloaded: the block waits off the page');
  await nf.p.waitForSelector(`[data-poster="${NAME}"] .st-poster`, { timeout: 10000 }).catch(() => {});
  ok(await posterKind(nf.p) === 'steps' && !(await nf.p.$(`[data-steps-wait="${NAME}"]`)), 'once downloaded, the block appears with its picture-step poster');
  SRV.drip = null;
  await nf.ctx.close();

  // 10. a picture the set shares with another set's folder ("../shared-pics/b-bg.webp", as newborn-warm reads
  // cpr-newborn's skin-to-skin picture): listed by its own path, downloaded with the set, and kept after the start-up sweep
  const j4 = JSON.parse(fs.readFileSync(jp, 'utf8'));
  const sharedL = j4.frames.b.layers[0];
  fs.mkdirSync(path.join(root, 'img/steps/shared-pics'), { recursive: true });
  fs.copyFileSync(path.join(root, 'img/steps', NAME, sharedL.src), path.join(root, 'img/steps/shared-pics', sharedL.src));
  sharedL.src = '../shared-pics/' + sharedL.src;
  fs.writeFileSync(jp, JSON.stringify(j4));
  const book4 = build(), files4 = book4.steps[NAME].files;
  const sharedFile = files4.find((f) => f.indexOf('img/steps/shared-pics/') === 0);
  ok(!!sharedFile && !files4.some((f) => f.indexOf('..') >= 0), `book.steps lists the shared picture by its own path (${sharedFile})`);
  const sh = await phone('wifi');
  await setup(sh.p, book4.steps);
  await revisit(sh.p, 2500);
  await sh.p.waitForTimeout(8000); // the start-up sweep (8 s after the start) must keep the shared picture
  const keys10 = await stepsKeys(sh.p);
  ok(keys10.indexOf(sharedFile) >= 0 && keys10.length === files4.length, `the shared picture is downloaded with the set and survives the sweep (${keys10.length}/${files4.length} files)`);
  await go(sh.p, '#/home'); await go(sh.p, '#/topic/hygiene');
  await sh.p.waitForSelector(`[data-poster="${NAME}"] .st-poster`, { timeout: 10000 }).catch(() => {});
  const k10 = await playerKind(sh.p);
  ok(k10.kind === 'steps' && k10.imgs > 0 && k10.loaded === k10.imgs, `a set with a shared picture plays (${k10.loaded}/${k10.imgs} pictures)`);
  await sh.ctx.close();
} catch (e) { ok(false, 'test crashed: ' + (e && e.stack || e)); }
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); server.close();
fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(png, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
