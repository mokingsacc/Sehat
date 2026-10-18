// Sheet check for C2.1 (P13), in Chromium's print media, as a browser prints "Print or save as PDF":
//   - position: every answer cell sits within 0.5 mm of where the key (/api/sheets/<id>/key) says, measured from the
//     top-left square's centre, the frame the phone's camera finds (WeasyPrint's half is in hub/tests/test_sheets.py);
//   - one page: the sheet is one A4 page in print;
//   - ink: no solid black area wider than 6 mm except the four corner squares, so the camera finds only those
//     (rendered at 8 px per mm and read back through a canvas in the page: no image library).
// It needs a running hub or online server with the starter pack, and Playwright with a Chromium; neither is a
// dependency of the app. Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/sheet_check.mjs --hub http://127.0.0.1:8000 [--out shots/] [--langs prs,ps,en] [--seeds 0,1234,4821]
// Exit code 1 when a check fails.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = (args.hub || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OUT = args.out || null;
const LANGS = (args.langs || 'prs,ps,en').split(',');
const SEEDS = (args.seeds || '0,1234,4821,9999').split(',').map(Number);
const PX_MM = 96 / 25.4;              // CSS pixels per mm
const SCALE = 8 / PX_MM;              // device pixels per CSS pixel, for 8 px per mm
const MAX_SOLID_MM = 6;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const get = async (path) => {
  const r = await fetch(HUB + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

// runs in the page: the cells and the squares in mm from the page's top-left corner
function measure(pxmm) {
  const mm = (r) => ({ x: r.left / pxmm, y: r.top / pxmm, w: r.width / pxmm, h: r.height / pxmm });
  const sheet = document.querySelector('.sheet');
  return {
    sheets: document.querySelectorAll('.sheet').length,
    sheet: mm(sheet.getBoundingClientRect()),
    scrollH: document.documentElement.scrollHeight / pxmm,
    cells: [...document.querySelectorAll('.cell[data-n]')].map((c) => ({ n: +c.dataset.n, ...mm(c.getBoundingClientRect()) })),
    marks: [...document.querySelectorAll('.mk')].map((m) => mm(m.getBoundingClientRect())),
  };
}

// runs in the page: the largest solid black square (dark pixels, side in px) outside the given boxes (px)
async function solid([png, skip]) {
  const img = new Image();
  img.src = png;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const { data, width: W, height: H } = g.getImageData(0, 0, c.width, c.height);
  const dp = new Uint16Array(W * H);
  let best = { side: 0, x: 0, y: 0 };
  const inside = (x, y, s) => skip.some((b) => x - s + 1 >= b.x && y - s + 1 >= b.y && x <= b.x + b.w && y <= b.y + b.h);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dark = data[4 * i] < 110 && data[4 * i + 1] < 110 && data[4 * i + 2] < 110;
      if (!dark) continue;
      dp[i] = (x && y) ? 1 + Math.min(dp[i - 1], dp[i - W], dp[i - W - 1]) : 1;
      if (dp[i] > best.side && !inside(x, y, dp[i])) best = { side: dp[i], x, y };
    }
  }
  return best;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
if (OUT) mkdirSync(OUT, { recursive: true });
const packs = await get('/api/packs');
const lessons = packs.packs.flatMap((p) => p.lessons).filter((l) => l.sheet);
const report = [];
let failed = 0;
for (const l of lessons) {
  for (const lang of LANGS) {
    for (const seed of SEEDS) {
      const problems = [];
      const key = await get(`/api/sheets/${l.id}/key?seed=${seed}&lang=${lang}`);
      const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: SCALE });
      const page = await ctx.newPage();
      await page.emulateMedia({ media: 'print' });
      await page.goto(`${HUB}/api/sheets/${l.id}.html?seed=${seed}&lang=${lang}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const m = await page.evaluate(measure, PX_MM);
      if (m.sheets !== 1) problems.push(`${m.sheets} sheets on the page`);
      if (Math.abs(m.sheet.w - 210) > 0.5 || Math.abs(m.sheet.h - 297) > 0.5) problems.push(`sheet ${m.sheet.w} x ${m.sheet.h} mm`);
      if (m.scrollH > 297.5) problems.push(`the page runs to ${m.scrollH.toFixed(1)} mm`);
      const want = Object.fromEntries(key.items.filter((r) => r.cell).map((r) => [r.n, r.cell]));
      const got = Object.fromEntries(m.cells.map((c) => [c.n, c]));
      if (Object.keys(want).sort().join() !== Object.keys(got).sort().join()) {
        problems.push(`cells ${Object.keys(got).join(',')} on the page, ${Object.keys(want).join(',')} in the key`);
      }
      const [ox, oy] = [16, 16];
      let worst = 0;
      for (const [n, c] of Object.entries(want)) {
        const p = got[n];
        if (!p) continue;
        const d = Math.max(Math.abs(p.x - ox - c.x), Math.abs(p.y - oy - c.y), Math.abs(p.w - c.w), Math.abs(p.h - c.h));
        worst = Math.max(worst, d);
        if (d >= 0.5) problems.push(`cell ${n} is ${d.toFixed(2)} mm off the key`);
      }
      // ink: render the page as printed, then look for solid black outside the squares (1 mm round each)
      const shot = await page.screenshot({ fullPage: false, type: 'png' });
      if (OUT) writeFileSync(join(OUT, `sheet-${l.code}-${lang}-${seed}.png`), shot);
      const pxPerMm = 8;
      const skip = m.marks.map((b) => ({ x: (b.x - 1) * pxPerMm, y: (b.y - 1) * pxPerMm, w: (b.w + 2) * pxPerMm, h: (b.h + 2) * pxPerMm }));
      const blank = await browser.newPage();
      await blank.route('http://sheet.check/**', (r) => (r.request().url().endsWith('.png')
        ? r.fulfill({ body: shot, contentType: 'image/png' }) : r.fulfill({ body: '<!doctype html><title>x</title>', contentType: 'text/html' })));
      await blank.goto('http://sheet.check/');
      const big = await blank.evaluate(solid, ['http://sheet.check/shot.png', skip]);
      await blank.close();
      const bigMm = big.side / pxPerMm;
      if (bigMm > MAX_SOLID_MM) problems.push(`solid black ${bigMm.toFixed(1)} mm wide at ${(big.x / pxPerMm).toFixed(0)}, ${(big.y / pxPerMm).toFixed(0)} mm`);
      await ctx.close();
      if (problems.length) failed++;
      report.push({ lesson: l.id, code: key.code, lang, seed, cells: m.cells.length, worst_mm: +worst.toFixed(3), solid_mm: +bigMm.toFixed(2), problems });
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${key.code} ${lang} seed ${seed}: ${m.cells.length} cells, worst ${worst.toFixed(2)} mm, ` +
        `largest solid black ${bigMm.toFixed(1)} mm` + (problems.length ? '\n  ' + problems.join('\n  ') : ''));
    }
  }
}
await browser.close();
if (OUT) writeFileSync(join(OUT, 'sheet-report.json'), JSON.stringify(report, null, 2));
console.log(`${report.length} sheets, ${failed} with problems`);
process.exit(failed ? 1 : 0);
