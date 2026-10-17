// University preparation on the phone (P28, C4.6): a card past its review_by date is not drawn, by the phone's own
// date; the checked month in her language; what a card costs, in words; and the checklist's ticks kept on the phone
// only, as step numbers.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const U = await import('../js/screens/university.js');
const i18n = await import('../js/i18n.js');
const state = await import('../js/state.js');

test('a card past its review_by date is not drawn, offline too', () => {
  const cards = [{ id: 'a', review_by: '2027-04-17' }, { id: 'b', review_by: '2026-10-16' }, { id: 'c' }];
  assert.deepEqual(U.current(cards, '2026-10-17').map((c) => c.id), ['a', 'c']);
  assert.deepEqual(U.current(cards, '2027-04-17').map((c) => c.id), ['a', 'c']);     // the last day still shows
  assert.deepEqual(U.current(cards, '2027-04-18').map((c) => c.id), ['c']);
  assert.equal(U.today(new Date(2027, 0, 5)), '2027-01-05');
});

test('the checked month is written in her language', () => {
  i18n.setLang('en');
  assert.equal(U.monthOf('2026-10-17', 'en'), 'October 2026');
  i18n.setLang('prs');
  assert.equal(U.monthOf('2027-03-01', 'prs'), 'مارچ ۲۰۲۷');
  assert.equal(U.monthOf('nonsense', 'prs'), '');
});

test("what a card costs: a scholarship's free is free to apply", () => {
  assert.equal(U.costKey({ cost: 'free', kind: 'course' }), 'uni_cost_free');
  assert.equal(U.costKey({ cost: 'free', kind: 'scholarship' }), 'uni_cost_free_apply');
  assert.equal(U.costKey({ cost: 'audit', kind: 'course' }), 'uni_cost_audit');
  assert.equal(U.costKey({ cost: 'fees', kind: 'course' }), 'uni_cost_fees');
  assert.equal(U.costKey({ kind: 'guide' }), null);
});

test('her ticks stay on the phone as step numbers 1 to 12, each once', () => {
  const c = state.addChild({ band: 's2', year: 11, lang: 'prs' });
  assert.deepEqual(state.updateChild(c.id, { uni: [3, 1, 3, 8] }).uni, [1, 3, 8]);
  assert.deepEqual(state.updateChild(c.id, { uni: [0, 13, 2.5, 'x', 12] }).uni, [12]);
  assert.equal(state.updateChild(c.id, { uni: [] }).uni, undefined);
});
