// The code at a sheet's foot (app/js/sheetcode.js) must be the hub's code (hub/tutor_hub/sheets.py), digit for digit:
// the values below are the hub's own. A wrong digit, or two swapped, is refused rather than marked against another sheet.
// Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { test } from 'node:test';

const sc = await import('../js/sheetcode.js');

// sheets.sheet_code({"sheet": {"code": "M7-03", ...}}, seed) on the hub
const HUB = [[4821, 'M7-03-48217'], [1, 'M7-03-00013'], [9999, 'M7-03-99992'], [1000, 'M7-03-10008'],
  [7, 'M7-03-00076'], [305, 'M7-03-03051']];

test('the app makes the hub\'s codes', () => {
  for (const [seed, code] of HUB) assert.equal(sc.make('M7-03', seed), code);
  assert.equal(sc.make('D1-01', 0), 'D1-01');           // no generated sums: the bare lesson code
});

test('typed any way, a right code gives the lesson code and the seed', () => {
  for (const t of ['M7-03-48217', 'm7 03 48217', 'M7-03-۴۸۲۱۷', ' m7.03.48217 ', 'M7—03—48217']) {
    assert.deepEqual(sc.parse(t), { code: 'M7-03', seed: 4821 }, t);
  }
  assert.deepEqual(sc.parse('d1-01'), { code: 'D1-01', seed: 0 });
});

test('one wrong digit, or two neighbours swapped, is refused', () => {
  const good = '48217';
  for (let i = 0; i < 5; i++) {
    for (let d = 0; d < 10; d++) {
      if (String(d) === good[i]) continue;
      assert.equal(sc.parse(`M7-03-${good.slice(0, i)}${d}${good.slice(i + 1)}`), null);
    }
    if (i < 4 && good[i] !== good[i + 1]) {
      assert.equal(sc.parse(`M7-03-${good.slice(0, i)}${good[i + 1]}${good[i]}${good.slice(i + 2)}`), null);
    }
  }
  assert.equal(sc.parse(''), null);
  assert.equal(sc.parse('what is this sheet?'), null);  // a bare code that names no lesson is refused by the library
});

test('the QR holds text: format, code and language, never a URL', () => {
  assert.deepEqual(sc.fromQr('Q1 M7-03-48217 PRS'), { code: 'M7-03', seed: 4821, lang: 'prs' });
  assert.deepEqual(sc.fromQr('Q1 D1-01 PS'), { code: 'D1-01', seed: 0, lang: 'ps' });
  assert.equal(sc.fromQr('Q1 M7-03-48271 PRS'), null);
  assert.equal(sc.fromQr('https://example.org/M7-03-48217'), null);
});
