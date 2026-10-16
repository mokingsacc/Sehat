// Reading a photo of a Qalam sheet (C2.2), on the phone and in memory only: pure functions on greyscale pixels, so
// they run the same in the camera loop, on a chosen photo and in the tests (app/tests/scan.test.js, no browser).
// - find the four corner squares: an adaptive threshold, dark regions that look square (filled area over hull area
//   above 0.85, hull aspect 0.7 to 1.4, 1.5% to 8% of the frame's width), solid or a ring (one hole of 15% to 40%);
//   the best in each quarter of the frame; the ring is the sheet's top right, which gives the orientation;
// - map the squares' centres to the frame's mm (the key's cells are in mm from the top-left square's centre);
// - cut each value cell, plus 2.5 mm, into a 280 x 200 px tile; check it for blur, glare and darkness;
// - lay the tiles out as the strip the hub reads (hub/tutor_hub/mods/photo.py has the same sizes): two to a row, each
//   under a 24 px black band with its number in white, 600 px wide. Never the name box, the header or the QR code.
// Nothing here keeps a picture: every function returns new arrays and the caller drops them.

export const FRAME = { w: 178, h: 265 };            // mm between the squares' centres (sheets.py FRAME)
export const PAGE = { x: -16, y: -16, w: 210, h: 297 };   // the whole A4 page in the frame's mm
export const CROP = 2.5;
export const STRIP_W = 600; export const TILE_W = 280; export const TILE_H = 200; export const BAND = 24; export const GUTTER = 13;
const CORNERS_MM = { tl: [0, 0], tr: [FRAME.w, 0], br: [FRAME.w, FRAME.h], bl: [0, FRAME.h] };

// RGBA (canvas ImageData) to grey, 0 black to 255 white
export function toGrey(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

// a smaller copy, nw pixels wide (area average)
export function shrink(g, w, h, nw) {
  if (nw >= w) return { g, w, h };
  const k = w / nw;
  const nh = Math.max(1, Math.round(h / k));
  const out = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * k); const y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * k); const x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += g[yy * w + xx];
      out[y * nw + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { g: out, w: nw, h: nh };
}

// 1 where a pixel is darker than its neighbourhood (a window w/4 wide) by more than t, and not lighter than 200
export function threshold(g, w, h, t = 0.2) {
  const r = Math.max(4, Math.round(w / 8));
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(w, x + r + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = sum / ((y1 - y0) * (x1 - x0));
      const v = g[y * w + x];
      m[y * w + x] = v < mean * (1 - t) && v < 200 ? 1 : 0;
    }
  }
  return m;
}

function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; const hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

const area = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

// a dark region's shape: the filled area (with its holes), the holes, the hull, the centre
function shape(m, lab, id, c, w) {
  const bw = c.x1 - c.x0 + 1; const bh = c.y1 - c.y0 + 1;
  // the bounding box's other pixels that can reach its edge are outside; the rest are holes
  const out = new Uint8Array(bw * bh);
  const stack = [];
  const push = (x, y) => { const k = y * bw + x; if (!out[k] && lab[(y + c.y0) * w + x + c.x0] !== id) { out[k] = 1; stack.push(k); } };
  for (let x = 0; x < bw; x++) { push(x, 0); push(x, bh - 1); }
  for (let y = 0; y < bh; y++) { push(0, y); push(bw - 1, y); }
  while (stack.length) {
    const k = stack.pop(); const x = k % bw; const y = (k - x) / bw;
    if (x > 0) push(x - 1, y); if (x < bw - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < bh - 1) push(x, y + 1);
  }
  // holes, each counted on its own
  const holes = [];
  const seen = new Uint8Array(bw * bh);
  let sx = 0; let sy = 0; let filled = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      if (out[k]) continue;
      filled++; sx += x; sy += y;
      if (lab[(y + c.y0) * w + x + c.x0] === id || seen[k]) continue;
      let n = 0; const st = [k]; seen[k] = 1;
      while (st.length) {
        const q = st.pop(); n++;
        const qx = q % bw; const qy = (q - qx) / bw;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx; const ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const nk = ny * bw + nx;
          if (!seen[nk] && !out[nk] && lab[(ny + c.y0) * w + nx + c.x0] !== id) { seen[nk] = 1; st.push(nk); }
        }
      }
      holes.push(n);
    }
  }
  const pts = [];
  for (const [y, [a, b]] of c.rows) pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]);
  const hl = hull(pts);
  return { filled, holes, hullArea: area(hl), cx: c.x0 + sx / filled + 0.5, cy: c.y0 + sy / filled + 0.5, bw, bh };
}

// the dark regions that could be corner squares: [{x, y, side, ring}] in pixels
export function candidates(g, w, h) {
  const m = threshold(g, w, h);
  const lab = new Int32Array(w * h);
  const minSide = 0.015 * w; const maxSide = 0.08 * w;
  const found = [];
  let id = 0;
  const stack = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    id++;
    const c = { area: 0, x0: w, x1: 0, y0: h, y1: 0, rows: new Map() };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const k = stack.pop(); const x = k % w; const y = (k - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const r = c.rows.get(y);
      if (!r) c.rows.set(y, [x, x]); else { if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; }
      if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = id; stack.push(k - 1); }
      if (x < w - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = id; stack.push(k + 1); }
      if (y > 0 && m[k - w] && !lab[k - w]) { lab[k - w] = id; stack.push(k - w); }
      if (y < h - 1 && m[k + w] && !lab[k + w]) { lab[k + w] = id; stack.push(k + w); }
    }
    const bw = c.x1 - c.x0 + 1; const bh = c.y1 - c.y0 + 1;
    if (bw < minSide || bh < minSide || bw > maxSide * 1.5 || bh > maxSide * 1.5) continue;
    if (bw / bh < 0.7 || bw / bh > 1.4) continue;
    if (c.area < 0.4 * minSide * minSide) continue;
    const sh = shape(m, lab, id, c, w);
    const side = Math.sqrt(sh.filled);
    if (side < minSide || side > maxSide) continue;
    if (sh.filled / sh.hullArea < 0.85) continue;
    const big = sh.holes.filter((n) => n > 0.01 * sh.filled);
    const holeArea = big.reduce((a, b) => a + b, 0);
    const solid = big.length === 0 || holeArea < 0.03 * sh.filled;
    const ring = big.length === 1 && holeArea >= 0.15 * sh.filled && holeArea <= 0.4 * sh.filled;
    if (!solid && !ring) continue;
    found.push({ x: sh.cx, y: sh.cy, side, ring: ring && !solid, touches: c.x0 <= 1 || c.y0 <= 1 || c.x1 >= w - 2 || c.y1 >= h - 2 });
  }
  return found;
}

// the four corner squares of a sheet in a frame: { quads: [best in each quarter or null] (top left, top right,
// bottom right, bottom left of the frame), corners: {tl, tr, br, bl} in the sheet's own sense, or null; oriented:
// whether the ring said which corner is the sheet's top right }
export function findMarkers(g, w, h) {
  const all = candidates(g, w, h);
  const quads = [null, null, null, null];
  for (const c of all) {
    const q = c.y < h / 2 ? (c.x < w / 2 ? 0 : 1) : (c.x < w / 2 ? 3 : 2);
    // the biggest wins its quarter, a ring before a square of nearly the same size
    const score = c.side * (c.ring ? 1.1 : 1);
    if (!quads[q] || score > quads[q].score) quads[q] = { ...c, score };
  }
  const n = quads.filter(Boolean).length;
  if (n < 4) return { quads, corners: null, oriented: false, count: n };
  // clockwise around their middle (y runs down), starting from the ring: top right, bottom right, bottom left, top left
  const cx = quads.reduce((s, q) => s + q.x, 0) / 4; const cy = quads.reduce((s, q) => s + q.y, 0) / 4;
  const round = quads.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const rings = round.filter((q) => q.ring);
  let start;
  let oriented = true;
  if (rings.length === 1) start = round.indexOf(rings[0]);
  else { start = round.indexOf(quads[1]); oriented = false; }        // no single ring: take the frame's top right
  const at = (k) => round[(start + k) % 4];
  const corners = { tr: at(0), br: at(1), bl: at(2), tl: at(3) };
  return { quads, corners, oriented, count: 4 };
}

// the homography taking four points src to dst (each [[x, y] x 4]), as 9 numbers
export function homography(src, dst) {
  const A = []; const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]; const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {                // Gaussian elimination with partial pivoting
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

export function project(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

// from the frame's mm to the picture's pixels (the corners found in a picture `scale` times smaller)
export function frameToPicture(corners, scale = 1) {
  const keys = ['tl', 'tr', 'br', 'bl'];
  return homography(keys.map((k) => CORNERS_MM[k]), keys.map((k) => [corners[k].x * scale, corners[k].y * scale]));
}

function sample(g, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const a = g[y0 * w + x0] + (g[y0 * w + x1] - g[y0 * w + x0]) * fx;
  const c = g[y1 * w + x0] + (g[y1 * w + x1] - g[y1 * w + x0]) * fx;
  return a + (c - a) * fy;
}

// a rectangle of the frame (mm) drawn into an ow x oh picture, scaled to fit and centred on white
export function warp(g, w, h, H, rect, ow, oh) {
  const out = new Uint8ClampedArray(ow * oh).fill(250);      // white round it, never counted as glare
  const s = Math.min(ow / rect.w, oh / rect.h);
  const ox = (ow - rect.w * s) / 2; const oy = (oh - rect.h * s) / 2;
  for (let y = Math.floor(oy); y < Math.ceil(oy + rect.h * s); y++) {
    for (let x = Math.floor(ox); x < Math.ceil(ox + rect.w * s); x++) {
      if (x < 0 || y < 0 || x >= ow || y >= oh) continue;
      const [px, py] = project(H, rect.x + (x + 0.5 - ox) / s, rect.y + (y + 0.5 - oy) / s);
      out[y * ow + x] = sample(g, w, h, px - 0.5, py - 0.5);
    }
  }
  return out;
}

// a value cell (from the key: {x, y, w, h} in mm) and 2.5 mm round it, as a 280 x 200 tile
export function tile(g, w, h, H, cell) {
  return warp(g, w, h, H, { x: cell.x - CROP, y: cell.y - CROP, w: cell.w + 2 * CROP, h: cell.h + 2 * CROP }, TILE_W, TILE_H);
}

// the whole page, flattened, `pxmm` pixels to the mm (the "Is this clear?" screen)
export function page(g, w, h, H, pxmm = 2) {
  const ow = Math.round(PAGE.w * pxmm); const oh = Math.round(PAGE.h * pxmm);
  return { g: warp(g, w, h, H, PAGE, ow, oh), w: ow, h: oh };
}

// how clear a tile is: the variance of its Laplacian (blur), the share of burnt-out pixels (glare), its mean (dark)
// sharp: set from the test photos (tools/make_test_photos.mjs): clear tiles score 76 to 126, the same blurred by
// 0.6 mm 26 to 48 and by 1 mm or more 15 to 30
export const LIMITS = { sharp: 30, glare: 0.05, dark: 60 };
export function quality(t, w = TILE_W, h = TILE_H) {
  // the Laplacian of a 3 x 3 average, so the camera's grain does not pass for sharp edges
  const a = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += t[(y + dy) * w + x + dx];
      a[y * w + x] = s / 9;
    }
  }
  let n = 0; let s = 0; let s2 = 0; let burnt = 0; let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = t[y * w + x];
      sum += v;
      if (v >= 255) burnt++;
      if (x > 1 && y > 1 && x < w - 2 && y < h - 2) {
        const l = a[(y - 1) * w + x] + a[(y + 1) * w + x] + a[y * w + x - 1] + a[y * w + x + 1] - 4 * a[y * w + x];
        n++; s += l; s2 += l * l;
      }
    }
  }
  const sharp = s2 / n - (s / n) ** 2;
  const out = { sharp: Math.round(sharp), glare: burnt / (w * h), mean: sum / (w * h) };
  out.problem = out.mean < LIMITS.dark ? 'dark' : out.glare > LIMITS.glare ? 'shiny' : out.sharp < LIMITS.sharp ? 'blurry' : null;
  return out;
}

// digits for the tiles' bands, 5 x 7, so the strip needs no font
const FONT = ['01110100011001110101110011000101110', '00100011000010000100001000010001110', '01110100010000100010001000100011111',
  '11111000100010000010000011000101110', '00010001100101010010111110001000010', '11111100001111000001000011000101110',
  '00110010001000011110100011000101110', '11111000010001000100010000100001000', '01110100011000101110100011000101110',
  '01110100011000101111000010001001100'];

function digits(out, ow, text, x0, y0, k) {
  for (const [i, ch] of [...String(text)].entries()) {
    const bits = FONT[+ch];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (bits[r * 5 + c] !== '1') continue;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) out[(y0 + r * k + dy) * ow + x0 + (i * 6 + c) * k + dx] = 255;
      }
    }
  }
}

export const stripHeight = (n) => GUTTER + Math.ceil(n / 2) * (BAND + TILE_H + GUTTER);

// tiles [{n, g}] in item order -> the strip {g, w, h}, grey, white between the tiles
export function strip(tiles) {
  const w = STRIP_W; const h = stripHeight(tiles.length);
  const out = new Uint8ClampedArray(w * h).fill(255);
  tiles.forEach(({ n, g }, i) => {
    const x = GUTTER + (i % 2) * (TILE_W + GUTTER);
    const y = GUTTER + Math.floor(i / 2) * (BAND + TILE_H + GUTTER);
    for (let yy = 0; yy < BAND; yy++) out.fill(0, (y + yy) * w + x, (y + yy) * w + x + TILE_W);
    const k = 2; const tw = String(n).length * 6 * k - k;
    digits(out, w, n, x + Math.round((TILE_W - tw) / 2), y + Math.round((BAND - 7 * k) / 2), k);
    for (let yy = 0; yy < TILE_H; yy++) out.set(g.subarray(yy * TILE_W, (yy + 1) * TILE_W), (y + BAND + yy) * w + x);
  });
  return { g: out, w, h };
}

// grey to RGBA, for a canvas
export function toRgba(g) {
  const out = new Uint8ClampedArray(g.length * 4);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = g[i]; out[j + 3] = 255; }
  return out;
}

// the camera loop's view of one frame: what to tell her, and whether the squares hold still (moved less than 1.5%
// of the width since each of the last checks)
export function coach(found, w, history) {
  const n = found.count;
  if (n === 4) {
    const pts = ['tl', 'tr', 'br', 'bl'].map((k) => [found.corners[k].x, found.corners[k].y]);
    history.push(pts);
    if (history.length > 3) history.shift();
    const still = history.length === 3 && history.every((p) => p.every(([x, y], i) => Math.hypot(x - pts[i][0], y - pts[i][1]) < 0.015 * w));
    return still ? 'take' : 'hold_still';
  }
  history.length = 0;
  if (n === 0) return 'fit_squares';
  return found.quads.some((q) => q && q.touches) ? 'move_back' : 'show_four';
}

// the whole cut, for the camera's photo or a chosen one: the squares (found on a copy at most 1000 px wide), the
// map from the frame's mm, a tile for each value cell ({n, x, y, w, h} from the key), each tile's quality and the
// strip. Returns { found } alone when four squares are not there.
export function cut(g, w, h, cells) {
  const small = shrink(g, w, h, Math.min(w, 1000));
  const found = findMarkers(small.g, small.w, small.h);
  if (found.count < 4) return { found };
  const H = frameToPicture(found.corners, w / small.w);
  const tiles = cells.map((c) => ({ n: c.n, g: tile(g, w, h, H, c) }));
  return { found, H, tiles, quality: tiles.map((t) => ({ n: t.n, ...quality(t.g) })), strip: strip(tiles) };
}

// the value cells of a key, in item order: [{n, kind, x, y, w, h}]
export const cellsOf = (key) => (key && key.items ? key.items.filter((r) => r.cell).map((r) => ({ n: r.n, ...r.cell })) : []);
