// Browser test of the picture-step player (js/steps.js inside js/anim.js), with Playwright's Chromium.
//
//   NODE_PATH=$(npm root -g) node tools/test_steps_browser.mjs                       # grey-box fixture, made here
//   NODE_PATH=$(npm root -g) node tools/test_steps_browser.mjs --root <folder> --anim cpr-baby --shots <dir>
//
// <folder> holds js/anim.js, js/steps.js, anim/steps/<anim>.json and img/steps/<anim>/ (e.g. the demo folder).
// Without --root a temporary folder is made with the app's js/ and css/ and a grey-box animation drawn by
// tools/steps_images.py (no real pictures). Checks, in fa, ps and en at 320 and 412 px: no console errors, RTL,
// Persian digits, badges on the reading-direction side, pictures never flipped, no sideways scrolling, Previous /
// Again / Next, auto-advance waiting for the counting, reduced motion (key frame with overlays), and the frame rate
// with the CPU slowed down 4 times. --shots writes screenshots (and a strip) of the animation.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // CommonJS lookup, so NODE_PATH works

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
let root = arg('root');
const shots = arg('shots');
let anim = arg('anim', 'test-boxes');
const fpsScene = +arg('fps-scene', anim === 'test-boxes' ? 1 : 1);
const fails = [];
const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } };

if (!root) {
  // fixture: the app's player files + a grey-box animation through the real image pipeline
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-test-'));
  for (const d of ['js', 'css', 'fonts', 'img/icons']) fs.cpSync(path.join(REPO, d), path.join(root, d), { recursive: true });
  const src = path.join(root, '_png'); fs.mkdirSync(src);
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
for fr, sh in (("a", 0), ("b", 40)):
    bg = Image.new("RGB", (1600, 1200), (214, 214, 214)); d = ImageDraw.Draw(bg)
    d.rectangle((0, 900, 1600, 1200), fill=(180, 180, 180)); d.rectangle((300, 700 - sh, 1300, 900), fill=(150, 150, 150))
    bg.save("${src}/test-boxes-%s-bg.png" % fr)
    arm = Image.new("RGBA", (1600, 1200), (0, 0, 0, 0)); d = ImageDraw.Draw(arm)
    d.rectangle((760, 180, 880, 640 - sh), fill=(95, 95, 95, 255)); d.rectangle((700, 600 - sh, 940, 690 - sh), fill=(70, 70, 70, 255))
    d.rectangle((1500, 100, 1530, 130), fill=(95, 95, 95, 255))
    arm.save("${src}/test-boxes-%s-arms.png" % fr)
    if fr == "a":
        dn = Image.new("RGBA", (1600, 1200), (0, 0, 0, 0)); d = ImageDraw.Draw(dn)
        d.rectangle((760, 180, 880, 690), fill=(60, 90, 140, 255)); d.rectangle((700, 650, 940, 740), fill=(40, 70, 120, 255))
        dn.save("${src}/test-boxes-a-arms-down.png")
`]);
  execFileSync('python3', [path.join(REPO, 'tools/steps_images.py'), src, '--out', path.join(root, 'img/steps'), '--json', path.join(root, 'anim/steps'), '--max-kb', '20'], { stdio: 'pipe' });
  const j = JSON.parse(fs.readFileSync(path.join(root, 'anim/steps/test-boxes.json'), 'utf8'));
  j.adult = true;
  j.scenes = [
    { id: 'anim.test-boxes.s1', frame: 'a', cam: { path: [[0, 0, 960], [200, 100, 600]], ms: [2500] },
      motions: [{ id: 'rub', type: 'loop', layer: 'arms', dx: 30, rate: 60, ease: 'rub', at: 300 }],
      overlays: [{ type: 'arrow', from: [150, 150], to: [380, 220], at: 200, mirror: true }, { type: 'tick', x: 760, y: 180, at: 300 },
        { type: 'cross', x: 860, y: 180, at: 300 }, { type: 'guide', from: [180, 520], to: [780, 520], at: 100 }, { type: 'timer', from: 0, to: 3, pos: 'top-start' },
        { type: 'arrow', from: [120, 600], to: [420, 600], bend: 60, at: 200 }, { type: 'dot', x: 600, y: 300, at: 100 },
        { type: 'icon', name: 'hospital', x: 120, y: 120, at: 100 }, { type: 'icon', name: 'car', x: 240, y: 120, crossed: true, at: 100 },
        { type: 'waves', x: 820, y: 420, angle: -30, at: 100, mirror: true },
        { type: 'ring', x: 400, y: 400, r: 40, at: 100, until: 2000, still: false }] },
    { id: 'anim.test-boxes.s2', frame: 'a', cam: false,
      motions: [{ id: 'push', type: 'loop', layer: 'arms', dy: 24, rate: 110, count: 12, slow: { count: 2, rate: 40 }, at: 200 },
        { id: 'breath', type: 'xfade', to: 'b', back: true, count: 2, ms: 400, hold: 400, gap: 300, at: 9500 }],
      overlays: [{ type: 'depth', x: 640, y1: 360, y2: 384, follow: 'push', label: { fa: '5 سانتی‌متر', ps: '5 سانتي متره', en: '5 cm' } },
        { type: 'shade', above: 'bg', x: 490, y: 420, rx: 160, ry: 60, max: 0.35, follow: 'push' },
        { type: 'counter', follow: 'push', of: 12, pos: 'top-end', icon: 'push' }, { type: 'counter', follow: 'breath', pos: 'bottom-start', icon: 'breath' },
        { type: 'ring', x: 490, y: 385, r: 60, at: 300, dim: true }] },
    { id: 'anim.test-boxes.s3', frame: 'a', motions: [{ id: 'sw', type: 'swap', layer: 'arms-down', under: 'arms', rate: 60, count: 3, at: 100 },
      { type: 'fade', layer: 'arms', from: 1, to: 0, at: 3500, ms: 400 },
      { type: 'move', frame: 'b', layer: 'arms', from: { dy: -200 }, to: { dy: 0 }, at: 3600, ms: 500 }, { type: 'xfade', to: 'b', at: 3600, ms: 400 }],
      overlays: [{ type: 'counter', follow: 'sw', pos: 'bottom-end' }] },
  ];
  fs.writeFileSync(path.join(root, 'anim/steps/test-boxes.json'), JSON.stringify(j));
  anim = 'test-boxes';
}

// a harness page next to the player files (standards mode), removed at the end
const H = path.join(root, '_steps_test.html');
fs.writeFileSync(H, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="css/app.css"></head><body><div id="app"><div class="page" id="p"></div></div>
<script type="module">
import { openAnimation, useSteps, loadAnimation } from './js/anim.js';
const q = new URLSearchParams(location.search), a = q.get('a');
useSteps(a);
const d = await loadAnimation(a);
const m0 = d.mount; d.mount = (...x) => (window.__inst = m0(...x));
window.__ended = [];
window.__ctl = await openAnimation(a, { lang: q.get('lang'), still: q.get('still') === '1', adult: true,
  text: (id) => id + ' 12 ' + q.get('lang'),
  play: (ids) => { if (q.get('narr') !== '1') return undefined; return new Promise((r) => setTimeout(() => { window.__ended.push(ids[0]); r('ended'); }, 300)); } });
window.__ready = true;
</script></body></html>`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/_steps_test.html`;
const browser = await chromium.launch();

async function open(page, q) {
  await page.goto(`${base}?a=${anim}&${q}`);
  await page.waitForFunction(() => window.__ready && document.querySelector('.st-view img'));
  await page.waitForTimeout(400);
}
const errs = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') ok(false, `${tag}: console error: ${m.text()}`); });
  page.on('pageerror', (e) => ok(false, `${tag}: page error: ${e.message}`));
};

const result = { fps: {} };
for (const lang of ['fa', 'ps', 'en']) {
  for (const width of [320, 412]) {
    const tag = `${lang} ${width}px`;
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); errs(page, tag);
    await open(page, `lang=${lang}`);
    const rtl = lang !== 'en';
    ok((await page.getAttribute('.anim', 'dir')) === (rtl ? 'rtl' : 'ltr'), `${tag}: dir`);
    ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${tag}: sideways scrolling`);
    // the scene with the counter: freeze at 6 s and read it
    await page.evaluate((i) => window.__ctl.go(i), fpsScene);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__inst.seek(6000));
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const st = document.querySelector('.anim-stage').getBoundingClientRect();
      const b = [...document.querySelectorAll('.st-view:last-child .st-badge')].map((x) => ({ t: x.textContent, l: x.getBoundingClientRect().left, r: x.getBoundingClientRect().right, op: getComputedStyle(x).opacity }));
      const flips = [...document.querySelectorAll('.st-cam, .st-l, .st-l img')].some((x) => { const m = getComputedStyle(x).transform; return m.startsWith('matrix(') && parseFloat(m.slice(7)) < 0; });
      return { st: { l: st.left, r: st.right }, b, flips };
    });
    const c = info.b[0];
    ok(c && /\d|[۰-۹]/.test(c.t), `${tag}: counter shows a number (${c && c.t})`);
    if (c) {
      ok(rtl ? /[۰-۹]/.test(c.t) && !/[0-9]/.test(c.t) : /[0-9]/.test(c.t), `${tag}: digits ${c.t}`);
      const mid = (info.st.l + info.st.r) / 2;
      ok(rtl ? c.r < mid : c.l > mid, `${tag}: counter badge on the ${rtl ? 'left' : 'right'} (top-end)`);
    }
    ok(!info.flips, `${tag}: a picture is flipped`);
    await page.evaluate(() => window.__inst.resume());
    // buttons: Next, Previous, Again, dots
    const idx = () => page.evaluate(() => window.__ctl.index);
    await page.click('.anim-ctl .nx'); await page.waitForTimeout(250);
    const i1 = await idx();
    await page.click('.anim-ctl .pv'); await page.waitForTimeout(250);
    ok((await idx()) === i1 - 1, `${tag}: Previous`);
    await page.click('.anim-ctl .rp'); await page.waitForTimeout(250);
    ok((await idx()) === i1 - 1, `${tag}: Again stays`);
    await page.click('.anim-dots button[data-i="0"]'); await page.waitForTimeout(250);
    ok((await idx()) === 0, `${tag}: dot 0`);
    ok(await page.evaluate(() => document.querySelectorAll('.st-view').length <= 2), `${tag}: old scenes removed`);
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => document.querySelectorAll('.st-view').length === 1), `${tag}: one scene left after the cross-fade`);
    if (shots && width === 412) {
      fs.mkdirSync(shots, { recursive: true });
      for (const sc of (arg('shot-scenes', String(fpsScene))).split(',').map(Number)) {
        await page.evaluate((i) => window.__ctl.go(i), sc); await page.waitForTimeout(1300);
        for (const t of (arg('times', '0,2000,4500,8000,12000')).split(',').map(Number)) {
          await page.evaluate((t) => window.__inst.seek(t), t); await page.waitForTimeout(120);
          await page.locator('.anim').screenshot({ path: path.join(shots, `${anim}-${lang}-${sc === fpsScene ? '' : 's' + sc + '-'}${t}.png`) });
        }
      }
    }
    await ctx.close();
  }
}

// auto-advance: with narration that ends after 0.3 s, a counting scene waits for its count, a short one moves on
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
  const page = await ctx.newPage(); errs(page, 'auto');
  await page.goto(`${base}?a=${anim}&lang=fa&narr=1`);
  await page.waitForFunction(() => window.__ready);
  await page.evaluate((i) => window.__ctl.go(i), fpsScene);
  const left = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__inst.left()), 1500)));
  ok(left > 1000, `auto: the counting scene reports time left (${left} ms)`);
  await page.waitForTimeout(3000);
  ok((await page.evaluate(() => window.__ctl.index)) === fpsScene, 'auto: does not move on before the count is done');
  const n = await page.evaluate(() => window.__ctl.count);
  await page.evaluate((i) => window.__ctl.go(i), n - 1);
  await page.waitForTimeout(500);
  await ctx.close();
}

// reduced motion: the key frame with its overlays, nothing moving
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); errs(page, 'reduced');
  await open(page, 'lang=fa');
  await page.evaluate((i) => window.__ctl.go(i), fpsScene); await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest('.st')).length,
    hidden: [...document.querySelectorAll('.st-view .st-o:not(.st-shade), .st-view .st-badge')].filter((x) => getComputedStyle(x).opacity === '0').length,
    badge: (document.querySelector('.st-badge b') || {}).textContent,
  }));
  ok(r.running === 0, `reduced: ${r.running} animations running`);
  ok(r.hidden === 0, `reduced: ${r.hidden} overlays hidden`);
  ok(!r.badge || /[۰-۹]/.test(r.badge), `reduced: counter key value ${r.badge}`);
  if (shots) await page.locator('.anim').screenshot({ path: path.join(shots, `${anim}-reduced.png`) });
  if (anim === 'test-boxes') {
    // "still": false: an overlay of an earlier frame is left out of the key frame (and only there)
    await page.evaluate(() => window.__ctl.go(0)); await page.waitForTimeout(600);
    const k = await page.evaluate(() => ({ off: document.querySelectorAll('.st-view [data-o="10"]').length, tick: document.querySelectorAll('.st-view [data-o="1"]').length }));
    ok(k.off === 0 && k.tick === 1, `reduced: "still": false overlay left out (${k.off}), the others kept (${k.tick})`);
  }
  await ctx.close();
}

// frame rate with the CPU slowed down 4 times, during the counting scene
for (const width of [320, 412]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); errs(page, 'fps');
  await open(page, 'lang=fa');
  await page.evaluate((i) => window.__ctl.go(i), fpsScene); await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const f = await page.evaluate(() => new Promise((res) => {
    const ts = []; const t0 = performance.now();
    const tick = (t) => { ts.push(t); if (t - t0 < 4000) requestAnimationFrame(tick); else {
      const d = ts.slice(1).map((x, i) => x - ts[i]); d.sort((a, b) => a - b);
      res({ fps: (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000), p95: d[Math.floor(d.length * 0.95)], worst: d[d.length - 1], long: d.filter((x) => x > 50).length });
    } };
    requestAnimationFrame(tick);
  }));
  result.fps[width] = f;
  console.log(`fps at ${width}px, CPU 4x slower: ${f.fps.toFixed(1)} fps, p95 frame ${f.p95.toFixed(1)} ms, worst ${f.worst.toFixed(1)} ms, frames over 50 ms: ${f.long}`);
  ok(f.fps > 45, `fps ${width}px: ${f.fps.toFixed(1)}`);
  await ctx.close();
}

await browser.close(); server.close();
fs.rmSync(H, { force: true });
if (shots) {
  // a strip of the counting scene in Dari
  const files = fs.readdirSync(shots).filter((f) => f.startsWith(anim + '-fa-') && /-fa-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.split('-').pop()) - parseInt(b.split('-').pop()));
  if (files.length) execFileSync('python3', ['-c', `
import sys
from PIL import Image
ims = [Image.open(f) for f in sys.argv[2:]]
w = sum(i.width for i in ims) + 12 * (len(ims) - 1); h = max(i.height for i in ims)
s = Image.new("RGB", (w, h), "white"); x = 0
for i in ims: s.paste(i, (x, 0)); x += i.width + 12
s.save(sys.argv[1])`, path.join(shots, anim + '-strip-fa.png'), ...files.map((f) => path.join(shots, f))]);
}
console.log(fails.length ? `\n${fails.length} problem(s)` : '\nall browser checks passed');
process.exit(fails.length ? 1 : 0);
