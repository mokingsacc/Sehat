// Reading a photo of a sheet (app/js/scan.js): synthetic photos of a sheet, drawn here pixel by pixel (the corner
// squares, the top right ring, answer cells with writing in them, small print and a QR-like pattern), turned,
// tilted in perspective, lit unevenly and made noisy. The squares must be found in the right order, the cells cut
// out where the key says, and the strip laid out as the hub expects. No browser, no image files.
// Run with: node --test app/tests/scan.test.js

import assert from 'node:assert/strict';
import { test } from 'node:test';

const scan = await import('../js/scan.js');

const PX = 5;                                    // the drawn page: 5 px to the mm
const PW = 210 * PX; const PH = 297 * PX;
// cells in the frame's mm, as the key gives them (sheets.answer_key)
const CELLS = [
  { n: 1, kind: 'int', x: 120, y: 40, w: 30, h: 22 },
  { n: 2, kind: 'frac', x: 30, y: 40, w: 24, h: 30 },
  { n: 3, kind: 'mixed', x: 110, y: 120, w: 41, h: 30 },
  { n: 4, kind: 'int', x: 20, y: 200, w: 30, h: 22 },
];

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

function drawPage() {
  const g = new Uint8ClampedArray(PW * PH).fill(235);
  const box = (x, y, w, h, v = 0) => {
    for (let yy = Math.round(y * PX); yy < Math.round((y + h) * PX); yy++) {
      for (let xx = Math.round(x * PX); xx < Math.round((x + w) * PX); xx++) if (xx >= 0 && yy >= 0 && xx < PW && yy < PH) g[yy * PW + xx] = v;
    }
  };
  const outline = (x, y, w, h, t = 0.5) => { box(x, y, w, t); box(x, y + h - t, w, t); box(x, y, t, h); box(x + w - t, y, t, h); };
  for (const [cx, cy] of [[16, 16], [194, 16], [16, 281], [194, 281]]) box(cx - 6, cy - 6, 12, 12);
  box(194 - 3, 16 - 3, 6, 6, 235);                                     // the ring's hole
  // small print: words of letters 1.5 to 3 mm tall over the body, and the name box
  for (let k = 0; k < 260; k++) {
    const x = 20 + rand() * 170; const y = 40 + rand() * 215;
    if (CELLS.some((c) => x > c.x + 16 - 6 && x < c.x + 16 + c.w + 4 && y > c.y + 16 - 6 && y < c.y + 16 + c.h + 4)) continue;
    box(x, y, 0.6 + rand() * 2, 1.5 + rand() * 1.5, 30);
  }
  outline(124, 10.5, 60, 9, 0.4);                                     // the name box, 4 mm from the ring
  // a QR-like pattern at the foot: 0.62 mm modules
  for (let i = 0; i < 29; i++) for (let j = 0; j < 29; j++) if (rand() < 0.5) box(96 + i * 0.62, 269 + j * 0.62, 0.62, 0.62);
  for (const c of CELLS) {
    const x = c.x + 16; const y = c.y + 16;
    if (c.kind === 'int') outline(x, y, c.w, c.h);
    else {
      const fx = x + c.w - 24;
      outline(fx, y, 24, 13); outline(fx, y + 17, 24, 13); box(fx + 1, y + 14.8, 22, 0.4);
      if (c.kind === 'mixed') outline(x, y + 8.5, 14, 13);
    }
    // her writing: a thick stroke across the cell's middle
    const mx = x + c.w / 2; const my = y + c.h / 2;
    for (let t = -0.35; t <= 0.35; t += 0.01) box(mx + t * c.w * 0.8, my + t * 8, 1.2, 1.2, 20);
  }
  return g;
}

const PAGE = drawPage();

// a photo of the page: the page's corners land on `quad` (frame pixels, page order tl, tr, br, bl)
function photo(quad, { W = 900, H = 1200, noise = 14, light = 0.25 } = {}) {
  const Hm = scan.homography(quad, [[0, 0], [PW, 0], [PW, PH], [0, PH]]);   // frame px -> page px
  const g = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [px, py] = scan.project(Hm, x + 0.5, y + 0.5);
      let v = px >= 0 && py >= 0 && px < PW && py < PH ? PAGE[Math.floor(py) * PW + Math.floor(px)] : 70;
      v = v * (1 - light * (x / W)) + (rand() - 0.5) * 2 * noise;          // uneven light and noise
      g[y * W + x] = v;
    }
  }
  return { g, w: W, h: H, toFrame: scan.homography([[0, 0], [PW, 0], [PW, PH], [0, PH]], quad) };   // page px -> frame px
}

const at = (ph, mmx, mmy) => scan.project(ph.toFrame, (mmx + 16) * PX, (mmy + 16) * PX);   // frame mm -> photo px

function rotate(cx, cy, deg, pts) {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
}

const SHOTS = {
  straight: [[90, 80], [810, 80], [810, 1100], [90, 1100]],
  turned: rotate(450, 600, 11, [[110, 110], [790, 110], [790, 1070], [110, 1070]]),
  perspective: [[160, 120], [760, 90], [840, 1120], [70, 1080]],
  'upside down': rotate(450, 600, 180, [[100, 90], [800, 90], [800, 1100], [100, 1100]]),
  'sideways and tilted': rotate(450, 600, -84, [[160, 260], [740, 230], [770, 1000], [140, 960]]),
};

for (const [name, quad] of Object.entries(SHOTS)) {
  test(`the four squares are found in a photo: ${name}`, () => {
    const ph = photo(quad);
    const small = scan.shrink(ph.g, ph.w, ph.h, 480);
    const k = ph.w / small.w;
    const f = scan.findMarkers(small.g, small.w, small.h);
    assert.equal(f.count, 4);
    assert.ok(f.oriented, 'the ring says which corner is the top right');
    for (const [key, [mx, my]] of Object.entries({ tl: [0, 0], tr: [178, 0], br: [178, 265], bl: [0, 265] })) {
      const [ex, ey] = at(ph, mx, my);
      const c = f.corners[key];
      assert.ok(Math.hypot(c.x * k - ex, c.y * k - ey) < 0.01 * ph.w, `${key}: ${c.x * k},${c.y * k} not ${ex},${ey}`);
    }
  });
}

test('each cell is cut out where the key says, writing in the middle and white round it', () => {
  for (const quad of [SHOTS.turned, SHOTS.perspective, SHOTS['upside down']]) {
    const ph = photo(quad);
    const f = scan.findMarkers(ph.g, ph.w, ph.h);
    const Hm = scan.frameToPicture(f.corners);
    for (const c of CELLS) {
      // the cell's corners land within 0.5 mm of the truth
      for (const [mx, my] of [[c.x, c.y], [c.x + c.w, c.y + c.h]]) {
        const [x, y] = scan.project(Hm, mx, my);
        const [ex, ey] = at(ph, mx, my);
        const mmPerPx = 210 / Math.hypot(...(([a, b]) => [b[0] - a[0], b[1] - a[1]])([at(ph, -16, -16), at(ph, 194, -16)]));
        assert.ok(Math.hypot(x - ex, y - ey) * mmPerPx < 0.5, `cell ${c.n}`);
      }
      const t = scan.tile(ph.g, ph.w, ph.h, Hm, c);
      assert.equal(t.length, scan.TILE_W * scan.TILE_H);
      const s = Math.min(scan.TILE_W / (c.w + 5), scan.TILE_H / (c.h + 5));
      const mid = t[Math.round(scan.TILE_H / 2) * scan.TILE_W + Math.round(scan.TILE_W / 2)];
      const dark = (x0, y0, x1, y1) => { let n = 0; let d = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (t[y * scan.TILE_W + x] < 110) d++; } return d / n; };
      const cx = scan.TILE_W / 2; const cy = scan.TILE_H / 2;
      assert.ok(dark(cx - 10, cy - 10, cx + 10, cy + 10) > 0.2, `cell ${c.n}: her writing is in the middle (${mid})`);
      // the 2.5 mm round the cell: white but for noise (the outer 1.5 mm of it)
      const ox = (scan.TILE_W - (c.w + 5) * s) / 2; const oy = (scan.TILE_H - (c.h + 5) * s) / 2;
      assert.ok(dark(Math.ceil(ox), Math.ceil(oy), Math.floor(ox + 1.5 * s), Math.floor(scan.TILE_H - oy)) < 0.05, `cell ${c.n}: margin`);
    }
  }
});

test('the strip is the hub\'s shape: two tiles a row under numbered black bands, 600 px wide', () => {
  const tiles = [1, 2, 3, 12, 7].map((n) => ({ n, g: new Uint8ClampedArray(scan.TILE_W * scan.TILE_H).fill(200) }));
  const s = scan.strip(tiles);
  assert.equal(s.w, 600);
  assert.equal(s.h, 13 + 3 * 237);
  assert.equal(s.h, scan.stripHeight(5));
  const px = (x, y) => s.g[y * s.w + x];
  assert.equal(px(5, 5), 255);                                   // gutter
  assert.equal(px(13 + 2, 13 + 2), 0);                           // band of tile 1
  assert.equal(px(13 + 140, 13 + 24 + 100), 200);                // tile 1
  assert.equal(px(13 + 280 + 13 + 2, 13 + 2), 0);                // band of tile 2, beside it
  assert.equal(px(13 + 2, 13 + 237 + 2), 0);                     // band of tile 3, below
  let white = 0;
  for (let y = 13; y < 13 + 24; y++) for (let x = 13; x < 13 + 280; x++) if (px(x, y) === 255) white++;
  assert.ok(white > 30 && white < 300, `the number is drawn in white (${white} px)`);
  assert.equal(px(13 + 280 + 13 + 140, 13 + 2 * 237 + 24 + 100), 255);   // no sixth tile
});

test('a blurred, a dark and a burnt-out tile are each named; a clear one passes', () => {
  const ph = photo(SHOTS.straight);
  const f = scan.findMarkers(ph.g, ph.w, ph.h);
  const Hm = scan.frameToPicture(f.corners);
  const clear = scan.tile(ph.g, ph.w, ph.h, Hm, CELLS[0]);
  assert.equal(scan.quality(clear).problem, null, JSON.stringify(scan.quality(clear)));
  const blur = new Uint8ClampedArray(clear.length);
  const W = scan.TILE_W; const R = 6;
  for (let y = 0; y < scan.TILE_H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0; let n = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && xx >= 0 && yy < scan.TILE_H && xx < W) { s += clear[yy * W + xx]; n++; } }
      blur[y * W + x] = s / n;
    }
  }
  assert.equal(scan.quality(blur).problem, 'blurry');
  assert.equal(scan.quality(clear.map((v) => v * 0.2)).problem, 'dark');
  assert.equal(scan.quality(clear.map((v, i) => (i % 7 < 2 ? 255 : v))).problem, 'shiny');
});

test('coaching: fit the squares, show all four, move back, hold still, then take it', () => {
  const hist = [];
  const four = (dx) => ({ count: 4, quads: [], corners: { tl: { x: 10 + dx, y: 10 }, tr: { x: 400, y: 10 }, br: { x: 400, y: 600 }, bl: { x: 10, y: 600 } } });
  assert.equal(scan.coach({ count: 0, quads: [null, null, null, null] }, 480, hist), 'fit_squares');
  assert.equal(scan.coach({ count: 2, quads: [{ touches: false }, null, { touches: false }, null] }, 480, hist), 'show_four');
  assert.equal(scan.coach({ count: 3, quads: [{ touches: true }, null, {}, {}] }, 480, hist), 'move_back');
  assert.equal(scan.coach(four(0), 480, hist), 'hold_still');
  assert.equal(scan.coach(four(30), 480, hist), 'hold_still');       // moved 30 px: more than 1.5% of 480
  assert.equal(scan.coach(four(31), 480, hist), 'hold_still');
  assert.equal(scan.coach(four(32), 480, hist), 'take');             // three checks, each within 7 px
});

test('nothing on a blank or busy picture is taken for four squares', () => {
  const blank = new Uint8ClampedArray(480 * 640).fill(240);
  assert.equal(scan.findMarkers(blank, 480, 640).count, 0);
  const busy = new Uint8ClampedArray(480 * 640).map(() => (rand() < 0.5 ? 20 : 235));
  assert.ok(scan.findMarkers(busy, 480, 640).count < 4);
});

test('the whole cut: squares, tiles, quality and strip from one photo; nothing without four squares', () => {
  const key = { items: [...CELLS.map((c) => ({ n: c.n, check: 'value', cell: { kind: c.kind, x: c.x, y: c.y, w: c.w, h: c.h } })),
    { n: 5, check: 'self' }] };
  const cells = scan.cellsOf(key);
  assert.deepEqual(cells.map((c) => c.n), [1, 2, 3, 4]);
  const scaled = SHOTS.perspective.map(([x, y]) => [x * 1500 / 900, y * 2000 / 1200]);
  const big = photo(scaled, { W: 1500, H: 2000 });
  const r = scan.cut(big.g, big.w, big.h, cells);
  assert.equal(r.found.count, 4);
  assert.equal(r.tiles.length, 4);
  assert.deepEqual([r.strip.w, r.strip.h], [600, scan.stripHeight(4)]);
  assert.ok(r.quality.every((q) => q.problem === null), JSON.stringify(r.quality));
  const none = scan.cut(new Uint8ClampedArray(600 * 800).fill(230), 600, 800, cells);
  assert.equal(none.found.count, 0);
  assert.equal(none.strip, undefined);
});
