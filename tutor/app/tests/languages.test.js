// English and Chinese (P27a, C4.4): a pack with `bands` shows to those bands whatever their year (the Chinese starter
// for s2 and adult readers), a chosen subject joins her list only where she has lessons and the big button never starts
// it on its own, and "say it" records only where the phone can: never in the APK, never on a plain-http page.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const library = await import('../js/library.js');
const plan = await import('../js/modules/plan.js');
const speech = await import('../js/speech.js');

const L = (id, subject, year = 0, order = 1) => ({ id, year, subject, order, title: { prs: id }, unit: null, steps: 4, sheet: true });
const PACKS = [
  { id: 'starter', lessons: [L('maths-10-a', 'maths', 10), L('maths-7-a', 'maths', 7)] },
  { id: 'chinese-1', bands: ['s2', 'ad'], tracks: ['reader'], share_alike: true, lessons: [L('zh-1', 'chinese', 0, 1)] },
];
const s2 = { id: 'a', band: 's2', year: 10, lang: 'prs', done: {}, step: {} };
const s1 = { id: 'b', band: 's1', year: 7, lang: 'prs', done: {}, step: {} };
const reader = { id: 'c', band: 'ad', track: 'reader', lang: 'prs', done: {}, step: {} };
const literacy = { id: 'd', band: 'ad', track: 'literacy', lang: 'prs', done: {}, step: {} };

beforeEach(async () => {
  store.clear();
  store.set('qalam.cache.packs', JSON.stringify(PACKS));
  await library.load(true);
});

test('the Chinese starter is for s2 and adult readers only, whatever the year', () => {
  assert.deepEqual(library.mine(s2, 'chinese').map((l) => l.id), ['zh-1']);
  assert.deepEqual(library.mine(reader, 'chinese').map((l) => l.id), ['zh-1']);
  assert.deepEqual(library.mine(s1, 'chinese'), []);
  assert.deepEqual(library.mine(literacy, 'chinese'), []);
  assert.ok(plan.bandLessons(s2).some((l) => l.id === 'zh-1') && !plan.bandLessons(s1).some((l) => l.id === 'zh-1'));
  assert.ok(library.hasAdultLessons(reader));
});

test('a chosen subject is listed where she has lessons, and the big button never starts it on its own', () => {
  assert.deepEqual(library.subjectsFor(s2).slice(-1), ['chinese']);
  assert.ok(!library.subjectsFor(s1).includes('chinese'));
  assert.equal(library.next(s2).id, 'maths-10-a');
  assert.equal(library.next({ ...s2, done: { 'maths-10-a': { at: 1 } } }).id, 'maths-10-a');   // her own year's again
});

test('say it records in a secure browser only: the APK and a plain-http hub draw no mic', () => {
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia() {} } }, configurable: true });
  globalThis.MediaRecorder = function MediaRecorder() {};
  globalThis.isSecureContext = true;
  assert.equal(speech.canRecord(), true);
  globalThis.isSecureContext = false;                                 // the hub's plain http
  assert.equal(speech.canRecord(), false);
  globalThis.isSecureContext = true;
  globalThis.QalamAndroid = { setAlarms() {}, canRecord: () => false };   // the APK says so (C3.6)
  assert.equal(speech.canRecord(), false);
  globalThis.QalamAndroid = { setAlarms() {} };                       // an older APK without the answer: no mic either
  assert.equal(speech.canRecord(), false);
  delete globalThis.QalamAndroid; delete globalThis.MediaRecorder; delete globalThis.isSecureContext;
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
});
