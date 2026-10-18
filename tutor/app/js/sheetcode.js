// The code printed at a sheet's foot (C2.1): the lesson's code, the 4-digit seed and a Damm check digit,
// `M7-03-48217`. A mistyped digit, or two swapped, fails the check digit and is refused rather than marked against
// another sheet. Sheets without a seed keep the bare lesson code. Typing takes Persian or Latin digits and any
// separators. The hub makes the same code (hub/tutor_hub/sheets.py); app/tests/sheetcode.test.js checks they agree.

import { latin } from './numbers.js';

const DAMM = ['0317598642', '7092154863', '4206871359', '1750983426', '6123045978',
  '3674209581', '5869720134', '8945362017', '9438617205', '2581436790'];

export function damm(digits) {
  let i = 0;
  for (const d of String(digits)) i = +DAMM[i][+d];
  return i;
}

// the code for a lesson's sheet code and seed (0: a sheet without generated sums)
export function make(lessonCode, seed) {
  if (!seed) return lessonCode;
  const s = String(seed).padStart(4, '0');
  return `${lessonCode}-${s}${damm(s)}`;
}

export function tidy(text) {
  return latin(text).toUpperCase().trim().replace(/[\s·._–—]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// { code: the lesson's code, seed } from what she typed, or null when it is not a code or its check digit is wrong
export function parse(text) {
  const t = tidy(text);
  const m = t.match(/^(.+?)-(\d{5})$/);
  if (m) return damm(m[2]) === 0 ? { code: m[1], seed: +m[2].slice(0, 4) } : null;
  return /^[A-Z0-9-]{2,12}$/.test(t) ? { code: t, seed: 0 } : null;
}

// what a sheet's QR code holds: `Q1 <code> <LANG>`, text and never a URL
export function fromQr(text) {
  const m = String(text || '').trim().match(/^Q1 ([A-Z0-9-]+) (PRS|PS|EN)$/);
  if (!m) return null;
  const p = parse(m[1]);
  return p ? { ...p, lang: m[2].toLowerCase() } : null;
}
