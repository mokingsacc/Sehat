// The teacher's return code on the phone (W9, app/js/screens/returncode.js): the server's answer becomes her learner
// on this phone (the same picture, number, class and consent, a seat with the new token), and her finished lessons
// and marks come back from GET /api/me/progress without being sent again as events.
// Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in server)

import assert from 'node:assert/strict';
import { test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };
const SID = '5e458b863963caa06450';
globalThis.fetch = async (url) => {
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url.replace(/\?.*$/, '').endsWith('/api/hello')) return reply(200, { hub: 'Qalam', id: SID, consent: 'hub-2026-10c', modules: [] });
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');
const { comeBack, rebuilt } = await import('../js/screens/returncode.js');
const signup = await import('../js/screens/signup.js');
await hub.connect();

const TOKEN = 'tok_' + 'r'.repeat(24);
const answer = (more = {}) => ({ token: TOKEN, cohort: { id: 'class-7b', label: 'Class 7B' }, band: 's1', picture: 'cup',
  number: 27, consent: { kind: 'guardian-on-phone', version: 'hub-2026-10c', at: '2026-10-01T09:30' }, ...more });

test('her lessons and marks come back: the most stars, the later time, and her own marks here stay', () => {
  const l = { done: { a: { stars: 1, at: 5 } }, marks: { a: 90 } };
  const p = { done: { a: { stars: 3, at: '2026-10-01T09:30' }, b: { stars: 2, at: '2026-10-02T10:00' }, 'Bad id': { stars: 3 },
    c: { stars: 7, at: '2026-10-02T10:00' } }, marks: { a: 40, b: 85, c: 'x' } };
  const out = rebuilt(l, p);
  assert.deepEqual(Object.keys(out.done).sort(), ['a', 'b']);
  assert.deepEqual(out.done.a, { stars: 3, at: Date.parse('2026-10-01T09:30:00Z') });
  assert.equal(out.done.b.stars, 2);
  assert.deepEqual(out.marks, { a: 90, b: 85 });
  assert.deepEqual(rebuilt({ done: {} }, null), { done: {}, marks: {} });
});

test("the server's answer is her learner here, with a seat that holds the new token and her consent", () => {
  const id = comeBack(answer());
  const l = state.byId(id);
  assert.equal(state.child().id, id);
  assert.equal(l.picture, 'cup');
  assert.equal(l.band, 's1');
  assert.equal(l.year, 7);                    // the band's first year: she changes it in Settings
  const seat = state.seatOf(l, SID);
  assert.equal(seat.token, TOKEN);
  assert.equal(seat.number, 27);
  assert.deepEqual(seat.cohort, { id: 'class-7b', label: 'Class 7B' });
  assert.equal(seat.consent.sent, true);
  assert.equal(seat.sentBand, 's1');
  state.updateChild(id, rebuilt(l, { done: { 'maths-7-fractions-add': { stars: 3, at: '2026-10-01T09:30' } }, marks: {} }));
  assert.equal(state.byId(id).done['maths-7-fractions-add'].stars, 3);
  assert.equal(events.queued().length, 0);                         // nothing to send again
  assert.equal(signup.next('', 'home'), '#/lock/offer/home');      // the lock is offered, as after a class join
});

test('a learner already here with that seat takes the new token; no second learner', () => {
  const before = state.learners().length;
  const TOKEN2 = 'tok_' + 's'.repeat(24);
  const id = comeBack(answer({ token: TOKEN2 }));
  assert.equal(state.learners().length, before);
  assert.equal(state.seatOf(state.byId(id), SID).token, TOKEN2);
});

test("an adult comes back on the literacy track, with a picture no other learner here shows", () => {
  const id = comeBack(answer({ token: 'tok_' + 't'.repeat(24), band: 'ad', number: 28, consent: null }));
  const l = state.byId(id);
  assert.equal(l.band, 'ad');
  assert.equal(l.track, 'literacy');
  assert.notEqual(state.pictureOf(l), 'cup');                // a stand-in: the learner above shows hers
  assert.equal(state.seatOf(l, SID).consent, null);
});
