// A small QR code maker (byte mode, error correction level M, versions 1 to 10: up to 213 bytes), for the
// "Share Sehat" screen. Works offline. Follows ISO/IEC 18004; the structure follows Project Nayuki's
// QR Code generator (MIT licence). tools/test_growth.mjs checks its structure; versions 1 to 10 were also read back
// with the jsQR decoder when it was written.
// qrSvg(text) -> an <svg> string (dark squares on white with the 4-module quiet zone), or '' if the text is too long.

const ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // level M: error correction codewords per block, versions 1-10
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // level M: number of blocks

function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC[v - 1] * BLOCKS[v - 1];

// Reed-Solomon over GF(256), polynomial 0x11D
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(v) * 8) v++;
  if (v > 10) return null;
  // data bits: mode 0100 (bytes), length, the bytes, terminator, padding
  const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(v) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // split into blocks, add error correction, interleave
  const nb = BLOCKS[v - 1], ecl = ECC[v - 1], raw = Math.floor(rawModules(v) / 8), nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecl), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length;
    const ec = rsRemainder(dat, div); if (i < nShort) dat.push(-1); // placeholder keeps the columns aligned
    blocks.push(dat.concat(ec));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) cw.push(b[i]); });

  const size = v * 4 + 17, M = [], F = [];
  for (let y = 0; y < size; y++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  // timing lines, finders, alignment patterns
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (v > 1) {
    const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const format = (mask) => {
    const d = mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); // level M = 00
    const b = ((d << 10) | r) ^ 0x5412, g = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i));
    set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
    set(8, size - 8, true);
  };
  format(0); // reserve the format areas before placing data
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // data in the zigzag order
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  // try the 8 masks, keep the one with the lowest penalty
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); format(m); const p = penalty(M, size); if (p < bestP) { bestP = p; best = m; } apply(m); }
  apply(best); format(best);
  return M;
}

function penalty(M, n) {
  let p = 0, dark = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      // finder-like: dark-light-dark-dark-dark-light-dark with 4 light on one side
      for (let b = 0; b + 10 < n; b++) {
        const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => get(a, b + k));
        const f1 = s[0] && !s[1] && s[2] && s[3] && s[4] && !s[5] && s[6] && !s[7] && !s[8] && !s[9] && !s[10];
        const f2 = !s[0] && !s[1] && !s[2] && !s[3] && s[4] && !s[5] && s[6] && s[7] && s[8] && !s[9] && s[10];
        if (f1 || f2) p += 40;
      }
    }
  };
  line((a, b) => M[a][b]); line((a, b) => M[b][a]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (M[y][x]) dark++;
    if (x < n - 1 && y < n - 1) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
  }
  return p + (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
}

export function qrSvg(text, cls = 'qr') {
  const M = qrMatrix(text); if (!M) return '';
  const n = M.length, q = 4; let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" role="img"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#22201D"/></svg>`;
}
