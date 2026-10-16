// Test photos of printed Qalam sheets (P14), and the strips the phone would send for them.
// For each case below: the sheet as Chromium prints it, with answers "handwritten" into its cells (some right, some
// wrong, one left empty); then a photo of it, turned, tilted in perspective, unevenly lit and noisy, as a phone
// camera would take it; then the phone's own cut (app/js/scan.js) of that photo: the squares, the tiles and the
// strip, encoded as the app encodes it (JPEG 0.7). It writes
//   <out>/<case>-photo.jpg and <out>/<case>.y4m      the photo, and a one-frame video for Chromium's fake camera;
//   <fixtures>/<case>.jpg                             the strip, for hub/tests/test_photo.py;
//   <fixtures>/vision.json                            what the fake provider "reads" in each strip (by its SHA-256),
//                                                     and, per case, the sheet, the answers written and the marks.
// It needs a running hub or online server and Playwright with a Chromium; neither is a dependency of the app.
// Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/make_test_photos.mjs --hub http://127.0.0.1:8000 --out shots/photos [--fixtures hub/tests/fixtures/photos]

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = (args.hub || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OUT = args.out || 'shots/photos';
const FIX = args.fixtures || 'hub/tests/fixtures/photos';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

// what she wrote in each value cell, by item number: the key's answer unless a case says otherwise ('' = empty)
const CASES = [
  { name: 'm7-prs-tilted', lesson: 'maths-7-fractions-add', seed: 4821, lang: 'prs', wrong: { 3: '1/2' }, empty: [5],
    quad: [[150, 130], [960, 90], [1010, 1380], [80, 1330]], turn: 0 },
  { name: 'm7-en-turned', lesson: 'maths-7-fractions-add', seed: 1234, lang: 'en', wrong: { 1: '7/9' }, empty: [],
    quad: [[120, 110], [960, 110], [960, 1330], [120, 1330]], turn: 9 },
  { name: 'm1-prs-upside-down', lesson: 'maths-1-count-5', seed: 0, lang: 'prs', wrong: { 2: '4' }, empty: [],
    quad: [[110, 100], [970, 100], [970, 1340], [110, 1340]], turn: 180 },
];
const W = 1080; const H = 1440;

const get = async (path) => {
  const r = await fetch(HUB + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const turn = (quad, deg) => {
  const a = (deg * Math.PI) / 180; const cx = W / 2; const cy = H / 2;
  return quad.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
};

// runs in the sheet's page: writes each answer into its boxes, in pen-blue, a little crooked
function write([answers, persian]) {
  const fa = (s) => (persian ? s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : s);
  const put = (box, text, k) => {
    if (!text) return;
    const d = document.createElement('div');
    d.textContent = fa(text);
    Object.assign(d.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#1d2a6b', font: `${box.getBoundingClientRect().height > 60 ? 15 : 10}mm/1 sans-serif`,
      transform: `rotate(${(k % 2 ? -1 : 1) * (3 + k)}deg)` });
    box.style.position = box.style.position || 'absolute';
    box.append(d);
  };
  document.querySelectorAll('.cell[data-n]').forEach((cell, k) => {
    const a = answers[cell.dataset.n];
    if (!a) return;
    const boxes = [...cell.querySelectorAll('i:not(.bar)')];
    if (!boxes.length) { put(cell, a, k); return; }
    const m = a.match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
    if (!m) { put(boxes.at(-2), a, k); return; }
    if (boxes.length === 3) put(boxes[0], m[1] || '', k);
    put(boxes.at(-2), m[2], k); put(boxes.at(-1), m[3], k + 1);
  });
}

// runs in a page of the hub's own origin: the photo from the sheet's picture, then the phone's cut of that photo
async function shoot({ sheet, quad, cells, seed }) {
  const scan = await import('/js/scan.js');
  const load = async (bytes, type) => createImageBitmap(new Blob([new Uint8Array(bytes)], { type }));
  const pixels = (bmp) => { const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return x.getImageData(0, 0, bmp.width, bmp.height).data; };
  const jpeg = async (grey, w, h, q) => {
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(new ImageData(scan.toRgba(grey), w, h), 0, 0);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer())];
  };
  const bmp = await load(sheet, 'image/png');
  const pw = bmp.width; const ph = bmp.height;
  const pg = scan.toGrey(pixels(bmp), pw, ph);
  const [W, H] = [1080, 1440];
  const toPage = scan.homography(quad, [[0, 0], [pw, 0], [pw, ph], [0, ph]]);
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const photo = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [px, py] = scan.project(toPage, x + 0.5, y + 0.5);
      let v = 85 + 25 * (y / H);                                     // the table
      if (px >= 0 && py >= 0 && px < pw - 1 && py < ph - 1) {
        const x0 = Math.floor(px); const y0 = Math.floor(py); const fx = px - x0; const fy = py - y0;
        const a = pg[y0 * pw + x0] * (1 - fx) + pg[y0 * pw + x0 + 1] * fx;
        const b = pg[(y0 + 1) * pw + x0] * (1 - fx) + pg[(y0 + 1) * pw + x0 + 1] * fx;
        v = (a * (1 - fy) + b * fy) * 0.86;                          // paper in room light, not pure white
      }
      v *= 1 - 0.22 * Math.hypot(x / W - 0.25, y / H - 0.2);       // light from the top left
      photo[y * W + x] = v + (rand() - 0.5) * 18;
    }
  }
  const photoJpeg = await jpeg(photo, W, H, 0.85);
  // the phone's side: decode the photo as a camera's file would be, then cut it
  const got = pixels(await load(photoJpeg, 'image/jpeg'));
  const g = scan.toGrey(got, W, H);
  const r = scan.cut(g, W, H, cells);
  if (!r.strip) return { photo: photoJpeg, grey: [...photo], found: r.found.count };
  return { photo: photoJpeg, grey: [...photo], found: 4, oriented: r.found.oriented, quality: r.quality,
    strip: await jpeg(r.strip.g, r.strip.w, r.strip.h, 0.7), size: [r.strip.w, r.strip.h] };
}

// a one-frame Y4M video of a grey picture, for --use-file-for-fake-video-capture
function y4m(grey, w, h) {
  const head = Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\nFRAME\n`);
  const chroma = Buffer.alloc((w / 2) * (h / 2) * 2, 128);
  return Buffer.concat([head, Buffer.from(grey), chroma]);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(FIX, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const vision = {};
const cases = {};
for (const c of CASES) {
  const key = await get(`/api/sheets/${c.lesson}/key?seed=${c.seed}&lang=${c.lang}`);
  const values = key.items.filter((r) => r.cell);
  const written = Object.fromEntries(values.map((r) => [r.n, c.empty.includes(r.n) ? '' : (c.wrong[r.n] ?? String(r.a))]));
  // the printed sheet, 6 px to the mm
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 6 / (96 / 25.4) });
  const page = await ctx.newPage();
  await page.emulateMedia({ media: 'print' });
  await page.goto(`${HUB}/api/sheets/${c.lesson}.html?seed=${c.seed}&lang=${c.lang}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(write, [written, c.lang !== 'en']);
  const sheet = await page.screenshot({ type: 'png' });
  await ctx.close();
  // the photo and the cut
  const p = await browser.newPage();
  await p.goto(`${HUB}/api/hello`);
  const r = await p.evaluate(shoot, { sheet: [...sheet], quad: turn(c.quad, c.turn), cells: scan_cells(key), seed: 11 });
  await p.close();
  writeFileSync(join(OUT, `${c.name}-sheet.png`), sheet);
  writeFileSync(join(OUT, `${c.name}-photo.jpg`), Buffer.from(r.photo));
  writeFileSync(join(OUT, `${c.name}.y4m`), y4m(r.grey, W, H));
  if (r.found !== 4) { console.log(`FAIL ${c.name}: ${r.found} squares found`); process.exitCode = 1; continue; }
  const strip = Buffer.from(r.strip);
  writeFileSync(join(FIX, `${c.name}.jpg`), strip);
  const read = values.map((r2) => ({ n: r2.n, read: written[r2.n] }));
  vision[sha(strip)] = read;
  cases[c.name] = { lesson: c.lesson, code: key.code, seed: c.seed, lang: c.lang, written: read,
    right: values.map((r2) => written[r2.n] === String(r2.a)), strip: r.size, bytes: strip.length };
  const bad = r.quality.filter((q) => q.problem);
  console.log(`${bad.length ? 'WARN' : 'ok  '} ${c.name}: ${key.code}, squares ${r.oriented ? 'oriented' : 'NOT oriented'}, ` +
    `strip ${r.size.join(' x ')} px, ${strip.length} bytes, sharpness ${r.quality.map((q) => q.sharp).join(' ')}` +
    (bad.length ? `; ${bad.map((q) => `${q.n} ${q.problem}`).join(', ')}` : ''));
}
await browser.close();
writeFileSync(join(FIX, 'vision.json'), JSON.stringify({ vision, cases }, null, 1) + '\n');

function scan_cells(key) { return key.items.filter((r) => r.cell).map((r) => ({ n: r.n, ...r.cell })); }
