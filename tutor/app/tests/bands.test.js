// Age bands, looks and tones (app/js/bands.js, DESIGN.md's C1 spec), the colour tokens' contrast in all four
// palettes (app/css/app.css), and the interface strings in Dari, Pashto and English (app/js/i18n.js).
// Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const bands = await import('../js/bands.js');
const i18n = await import('../js/i18n.js');

test('the year sets the band, the band the look and the tone', () => {
  const by = (y) => bands.bandOfYear(y);
  assert.deepEqual([0, 1, 3, 4, 6, 7, 9, 10, 12].map(by), ['ey', 'p1', 'p1', 'p2', 'p2', 's1', 's1', 's2', 's2']);
  assert.equal(by(13), null);
  const rows = [
    [{ year: 0 }, 'ey', 'bold', 'child'], [{ year: 2 }, 'p1', 'bold', 'child'], [{ year: 5 }, 'p2', 'bold', 'child'],
    [{ year: 8 }, 's1', 'clean', 'adult'], [{ year: 11 }, 's2', 'clean', 'adult'],
    [{ band: 'ad', track: 'literacy' }, 'ad', 'bold', 'adult'], [{ band: 'ad', track: 'reader' }, 'ad', 'clean', 'adult'],
  ];
  for (const [l, band, look, tone] of rows) {
    const a = bands.attrs(l);
    assert.deepEqual([a.band, a.look, a.tone], [band, look, tone], JSON.stringify(l));
  }
});

test('read on open, tabs and praise follow the band', () => {
  const r = (b, t, w) => bands.readsOnOpen(b, t, w);
  assert.ok(r('ey', null, 'home') && r('ey', null, 'step'));
  assert.ok(r('p1', null, 'home') && r('p1', null, 'step'));
  assert.ok(!r('p2', null, 'home') && r('p2', null, 'step'));
  assert.ok(!r('s1', null, 'step') && !r('s2', null, 'home'));
  assert.ok(r('ad', 'literacy', 'home') && r('ad', 'literacy', 'step') && !r('ad', 'reader', 'step'));
  assert.equal(bands.hasTabs('ey'), false);
  assert.equal(bands.hasTabs('p1'), true);
  assert.equal(bands.praise('p2'), 'stars');
  assert.equal(bands.praise('ad'), 'check');
  assert.equal(bands.praise('s1'), 'check');
});

test('Bigger text and the theme are per learner; no learner means the clean adult look', () => {
  assert.deepEqual(bands.attrs({ year: 3, text: 'large', theme: 'dark' }),
    { band: 'p1', look: 'bold', tone: 'child', text: 'large', theme: 'dark' });
  assert.deepEqual(bands.attrs({ year: 3, theme: 'phone' }).theme, null);
  assert.deepEqual(bands.attrs(null), { band: null, look: 'clean', tone: 'adult', text: null, theme: null });
});

// the CSS token blocks, read from app.css
const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
function block(selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, selector);
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const lightAdult = block(':root');
const lightChild = { ...lightAdult, ...block(':root[data-tone="child"]') };
const darkAdult = block(':root[data-theme="dark"]');
const darkChild = { ...darkAdult, ...block(':root[data-theme="dark"][data-tone="child"]') };
const PALETTES = { 'light adult': { ...lightAdult }, 'light child': lightChild,
  'dark adult': { ...lightAdult, ...darkAdult }, 'dark child': { ...lightAdult, ...darkChild } };

// every text pair the screens use, on the backgrounds it sits on
const PAIRS = [
  ['ink', 'bg'], ['ink', 'card'], ['ink', 'soft'], ['muted', 'bg'], ['muted', 'card'], ['muted', 'soft'],
  ['on-accent', 'accent'], ['on-warm', 'warm'], ['accent-ink', 'bg'], ['accent-ink', 'card'], ['accent-ink', 'accent-soft'],
  ['warm-ink', 'warm-soft'], ['good-ink', 'good-soft'], ['bad', 'bad-soft'], ['bad', 'card'], ['ai-ink', 'draft-bg'],
  ['ai-ink', 'card'],
];

test('every text pair is 4.5:1 or better in all four palettes', () => {
  for (const [name, p] of Object.entries(PALETTES)) {
    for (const [fg, bg] of PAIRS) {
      const c = bands.contrast(p[fg], p[bg]);
      assert.ok(c >= 4.5, `${name}: ${fg} on ${bg} is ${c.toFixed(2)}:1`);
    }
    assert.ok(bands.contrast(p['line-strong'], p.card) >= 3, `${name}: input outlines`);
  }
});

test('the committee\'s colour fixes hold: warm #c2540a, no white on --good, the accent-ink token', () => {
  assert.equal(lightAdult.warm, '#c2540a');
  assert.ok(bands.contrast('#ffffff', lightAdult.warm) >= 4.5);
  assert.ok(bands.contrast('#ffffff', lightAdult.good) < 4.5);            // so nothing puts white text on it
  assert.doesNotMatch(css, /background: var\(--good\);[^}]*color: (#fff|var\(--on-accent\))/);
  assert.doesNotMatch(css, /color: var\(--accent-shadow\)/);
  for (const sub of ['maths', 'science', 'english', 'dari', 'pashto']) {
    assert.ok(bands.contrast('#ffffff', lightAdult['s-' + sub]) >= 4.5, sub);
  }
});

test('no colour or size is written into a rule outside the token blocks', () => {
  const rules = css.slice(css.indexOf('* { box-sizing'));
  const colours = [...rules.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0]);
  assert.deepEqual([...new Set(colours)], ['#fff']);                   // the sheet preview only: paper is white
  const sizes = [...rules.matchAll(/font-size: (\d+)px/g)].map((m) => +m[1]);
  assert.deepEqual(sizes.sort((a, b) => a - b), [50, 84, 84, 150]);    // the fixed lesson glyphs
  assert.match(css, /:root\[data-text="large"\] \{ --scale: 1\.25; --tap-add: 8px; \}/);
});

test('every interface string exists in Dari, Pashto and English, with no name field left', () => {
  const prs = i18n.keys('prs');
  assert.deepEqual(i18n.keys('ps').sort(), [...prs].sort());
  assert.deepEqual(i18n.keys('en').sort(), [...prs].sort());
  for (const gone of ['name', 'name_hint', 'name_on_sheet', 'well_done']) assert.ok(!prs.includes(gone), gone);
});

test('the tone picks the wording; English keeps Latin digits', () => {
  i18n.setLang('en');
  i18n.setTone('child');
  assert.equal(i18n.s('right'), 'Right! Well done');
  i18n.setTone('adult');
  assert.equal(i18n.s('right'), 'Correct');
  assert.equal(i18n.s('correct_of', { a: 8, b: 10 }), 'Correct, 8 of 10');
  assert.equal(i18n.dir(), 'ltr');
  i18n.setLang('prs');
  assert.equal(i18n.s('of', { a: 8, b: 10 }), '۸ از ۱۰');
  assert.equal(i18n.dir(), 'rtl');
  i18n.setTone('child');
});
