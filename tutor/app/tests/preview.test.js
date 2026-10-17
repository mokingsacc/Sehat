// A reviewer's preview (P17): /review/ frames the learner app at ?preview=<band>&lang=<lang>; that page keeps one
// learner in memory only and writes nothing to the browser's storage. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { test } from 'node:test';

const store = new Map();
const writes = [];
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { writes.push(k); store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
};
store.set('qalam.v2', JSON.stringify({ v: 2, active: 'x', learners: [{ id: 'x', band: 'p1', year: 2, lang: 'ps' }] }));
globalThis.location = { search: '?preview=s1&lang=en', hash: '', protocol: 'https:', origin: 'https://example.test' };

const state = await import('../js/state.js');

test('the preview is one learner in the band asked for, kept in memory only', () => {
  assert.deepEqual(state.preview, { band: 's1', lang: 'en' });
  const c = state.child();
  assert.equal(c.band, 's1');
  assert.equal(c.lang, 'en');
  assert.equal(c.consent, null);                     // no consent: no event is ever kept
  assert.equal(state.learners().length, 1);          // the phone's own learners are not read
  state.markDone('maths-7-fractions-add', 3);
  state.cache('lesson.x', { id: 'x' });
  assert.deepEqual(state.cache('lesson.x'), { id: 'x' });
  assert.equal(state.record('lesson.start', 'maths-7-fractions-add'), false);
  assert.deepEqual(writes, []);
});
