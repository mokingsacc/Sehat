// A small QR code maker for the school bag's card (WEBSITE.md 3.6, W7): the text `Q1 BAG <16 digits>`, alphanumeric
// mode, error correction level M, versions 1 to 3. A line-for-line port of the hub's maker (hub/tutor_hub/qr.py,
// which the sheets use and which is checked against segno), so the card looks the same from every home; the hub's
// tests check this one against it, mask by mask (test_bag_card.py). It runs on the phone, so the code never leaves
// it. Text only, never an address (3.14 item 5). Loaded only with the card (sw.js LAZY).

export const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const CAPACITY = { 1: 16, 2: 28, 3: 44 };          // data codewords at level M, one block each
const EC = { 1: 10, 2: 16, 3: 26 };                // error correction codewords
const ALIGN = { 1: null, 2: 18, 3: 22 };
const FORMAT_M = 0b00;

const EXP = new Array(512).fill(0);
const LOG = new Array(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function ecWords(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const nxt = new Array(gen.length + 1).fill(0);
    gen.forEach((g, j) => { nxt[j] ^= g; nxt[j + 1] ^= mul(g, EXP[i]); });
    gen = nxt;
  }
  const rem = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = rem[i];
    if (c) for (let j = 1; j < gen.length; j++) rem[i + j] ^= mul(gen[j], c);
  }
  return rem.slice(data.length);
}

export const fits = (text) => [...String(text)].every((c) => ALNUM.includes(c)) && String(text).length <= 61;

function versionFor(text) {
  const need = 4 + 9 + 11 * Math.floor(text.length / 2) + 6 * (text.length % 2);
  for (const v of [1, 2, 3]) if (need <= CAPACITY[v] * 8) return v;
  throw new Error('too long for a QR code here');
}

function codewords(text, version) {
  const out = [];
  const put = (v, n) => { for (let i = 0; i < n; i++) out.push((v >> (n - 1 - i)) & 1); };
  put(0b0010, 4);
  put(text.length, 9);
  for (let i = 0; i < text.length - 1; i += 2) put(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
  if (text.length % 2) put(ALNUM.indexOf(text[text.length - 1]), 6);
  const cap = CAPACITY[version] * 8;
  put(0, Math.min(4, cap - out.length));
  while (out.length % 8) out.push(0);
  for (let i = 0; out.length < cap; i++) put(i % 2 ? 0x11 : 0xec, 8);
  const data = [];
  for (let i = 0; i < out.length; i += 8) data.push(parseInt(out.slice(i, i + 8).join(''), 2));
  return [...data, ...ecWords(data, EC[version])];
}

function base(version) {
  const size = 17 + 4 * version;
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  const r = Array.from({ length: size }, () => new Array(size).fill(false));
  const setf = (y, x, v) => { m[y][x] = v; r[y][x] = true; };
  for (const [cy, cx] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dy = -1; dy < 8; dy++) {
      for (let dx = -1; dx < 8; dx++) {
        const y = cy + dy, x = cx + dx;
        if (y >= 0 && y < size && x >= 0 && x < size) {
          const ring = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
          setf(y, x, [0, 1, 3].includes(ring) ? 1 : 0);
        }
      }
    }
  }
  for (let i = 8; i < size - 8; i++) { setf(6, i, i % 2 === 0 ? 1 : 0); setf(i, 6, i % 2 === 0 ? 1 : 0); }
  const a = ALIGN[version];
  if (a) {
    for (let dy = -2; dy < 3; dy++) for (let dx = -2; dx < 3; dx++) setf(a + dy, a + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1 ? 1 : 0);
  }
  setf(4 * version + 9, 8, 1);                       // the dark module
  for (let i = 0; i < 9; i++) for (const [y, x] of [[8, i], [i, 8]]) if (!r[y][x]) setf(y, x, 0);
  for (let i = 0; i < 8; i++) for (const [y, x] of [[8, size - 1 - i], [size - 1 - i, 8]]) if (!r[y][x]) setf(y, x, 0);
  return { m, r };
}

function place(m, r, words) {
  const size = m.length;
  const bits = [];
  for (const w of words) for (let i = 0; i < 8; i++) bits.push((w >> (7 - i)) & 1);
  let k = 0;
  let up = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x -= 1;
    for (let j = 0; j < size; j++) {
      const y = up ? size - 1 - j : j;
      for (const xx of [x, x - 1]) {
        if (!r[y][xx]) { m[y][xx] = k < bits.length ? bits[k] : 0; k += 1; }
      }
    }
    up = !up;
  }
}

const MASKS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

function formatBits(mask) {
  const data = (FORMAT_M << 3) | mask;
  let v = data << 10;
  for (let i = 14; i > 9; i--) if (v & (1 << i)) v ^= 0b10100110111 << (i - 10);
  return ((data << 10) | v) ^ 0b101010000010010;
}

function putFormat(m, mask) {
  const size = m.length;
  const f = formatBits(mask);
  const bit = Array.from({ length: 15 }, (_, i) => (f >> i) & 1);
  for (let i = 0; i < 6; i++) m[i][8] = bit[i];
  m[7][8] = bit[6]; m[8][8] = bit[7]; m[8][7] = bit[8];
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit[i];
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit[i];
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit[i];
}

function finderLike(row) {
  const n = row.length;
  const pat = [1, 0, 1, 1, 1, 0, 1];
  let p = 0;
  let i = 0;
  while (i <= n - 7) {
    if (pat.every((v, j) => row[i + j] === v)) {
      const after = i + 7;
      const before = row.slice(Math.max(i - 4, 0), i);
      const next = row.slice(after, after + 4);
      if (i === 0 || i === n - 7 || !before.some(Boolean) || !next.some(Boolean)) { p += 40; i = after; } else i += 4;
      continue;
    }
    i += 1;
  }
  return p;
}

function penalty(m) {
  const size = m.length;
  let p = 0;
  const cols = m[0].map((_, x) => m.map((row) => row[x]));
  for (const lines of [m, cols]) {
    for (const row of lines) {
      let run = 0;
      let prev = null;
      for (const v of row) {
        if (v === prev) run += 1;
        else { if (run >= 5) p += run - 2; run = 1; prev = v; }
      }
      if (run >= 5) p += run - 2;
      p += finderLike(row);
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) p += 3;
    }
  }
  const dark = m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
  p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
  return p;
}

// the QR code for `text` as rows of 0 (light) and 1 (dark), without the quiet zone; `mask` to force one (tests)
export function matrix(text, mask = null) {
  text = String(text);
  if (!fits(text)) throw new Error("a bag card's QR code holds capitals, digits and a few signs only");
  const version = versionFor(text);
  const { m: b, r } = base(version);
  place(b, r, codewords(text, version));
  let best = null;
  for (const k of mask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask]) {
    const m = b.map((row) => row.slice());
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (!r[y][x] && MASKS[k](y, x)) m[y][x] ^= 1;
    const dark = 4 * version + 9;
    m[dark][8] = 0;                     // judged before the format bits and the dark module (ISO/IEC 18004:2015, 7.8)
    const score = penalty(m);
    m[dark][8] = 1;
    putFormat(m, k);
    if (!best || score < best[0]) best = [score, m];
  }
  return best[1];
}

// the code as an SVG element's markup: black on white, a quiet zone of 4 modules, `size` CSS units wide
export function svg(text, size = '32mm') {
  const m = matrix(text);
  const n = m.length + 8;
  let path = '';
  m.forEach((row, y) => row.forEach((v, x) => { if (v) path += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" `
    + `role="img" aria-hidden="true"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
