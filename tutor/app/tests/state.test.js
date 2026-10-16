// The phone's record (app/js/state.js): qalam.v1 migrates to qalam.v2 once, every name dropped, and v2 keeps only
// its own fields. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const state = await import('../js/state.js');

const V1 = {
  v: 1, active: 'b',
  children: [
    { id: 'a', name: 'Maryam', year: 2, lang: 'prs', done: { 'dari-1-sheen': { stars: 3, at: 1 } }, step: {}, prints: {}, asks: [] },
    { id: 'b', name: 'Ahmad Shah', year: 8, lang: 'ps', done: {}, step: { 'maths-7-fractions-add': 2 },
      prints: { 'maths-7-fractions-add': 4821 }, asks: [{ id: 'q1', q: 'why?' }], last: 'maths-7-fractions-add', phone: '0700' },
  ],
};

beforeEach(() => store.clear());

test('v1 migrates to v2 with every name dropped, and the v1 record leaves the phone', () => {
  store.set('qalam.v1', JSON.stringify(V1));
  state.reload();
  assert.equal(store.has('qalam.v1'), false);
  const raw = store.get('qalam.v2');
  assert.ok(raw && !raw.includes('Maryam') && !raw.includes('Ahmad') && !raw.includes('0700'));
  const v2 = JSON.parse(raw);
  assert.equal(v2.v, 2);
  assert.equal(v2.active, 'b');
  const [a, b] = v2.learners;
  assert.deepEqual([a.band, a.year, a.lang, b.band, b.year, b.lang], ['p1', 2, 'prs', 's1', 8, 'ps']);
  assert.ok(!('name' in a) && !('name' in b) && !('phone' in b));
  assert.deepEqual(a.done, V1.children[0].done);                      // progress stays
  assert.equal(b.step['maths-7-fractions-add'], 2);
  assert.equal(b.prints['maths-7-fractions-add'], 4821);
  assert.equal(b.last, 'maths-7-fractions-add');
  for (const l of [a, b]) {
    assert.deepEqual([l.picture, l.nickname, l.lock, l.consent, l.text, l.theme], [null, '', null, null, 'normal', 'phone']);
  }
  assert.equal(state.child().id, 'b');
});

test('a new learner has no name; a name passed in is never kept', () => {
  state.reload();
  const c = state.addChild({ year: 0, lang: 'prs', name: 'Zahra' });
  assert.equal(c.band, 'ey');
  assert.ok(!store.get('qalam.v2').includes('Zahra'));
  state.updateChild(c.id, { name: 'Zahra', text: 'large', theme: 'dark' });
  const saved = JSON.parse(store.get('qalam.v2')).learners[0];
  assert.ok(!('name' in saved));
  assert.deepEqual([saved.text, saved.theme], ['large', 'dark']);
});

test('adults take a door, not a year', () => {
  state.reload();
  const c = state.addChild({ band: 'ad', track: 'reader', lang: 'en' });
  assert.deepEqual([c.band, c.year, c.track, c.lang], ['ad', null, 'reader', 'en']);
  const lit = state.addChild({ band: 'ad', lang: 'prs' });
  assert.equal(lit.track, 'literacy');
  const changed = state.updateChild(c.id, { year: 9, band: null });
  assert.deepEqual([changed.band, changed.year, changed.track], ['s1', 9, null]);
});

test('a v2 record is read back cleaned, and storage that fails leaves an empty phone', () => {
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'x', learners: [{ id: 'x', year: 5, name: 'stray', lang: 'ps' }] }));
  state.reload();
  assert.equal(state.child().band, 'p2');
  assert.ok(!('name' in state.child()));
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  try {
    assert.deepEqual(state.reload().learners, []);
  } finally { globalThis.localStorage = real; }
});
