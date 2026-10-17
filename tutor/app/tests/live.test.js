// Live classes on the phone (P30a, DESIGN-C6-SPECS.md C6.1 and C6.2): what the phone knows of the open class
// (liveclass.js), the one thing it keeps (`liveSeen`), the school day's live blocks (day.js), and the learner's live
// screen never touching the microphone or a recorder.
// Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in hub)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };

const LIVE = { id: 'abcdefgh23456789', subject: 'maths', since: '2027-01-02T08:00:00Z' };
let hello = {};
globalThis.fetch = async (url) => {
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (String(url).includes('/api/hello')) return reply(200, { hub: 'Qalam', modules: [], ...hello });
  return reply(404, {});
};

const day = await import('../js/day.js');
const hub = await import('../js/hub.js');
const i18n = await import('../js/i18n.js');
const liveclass = await import('../js/liveclass.js');
const modules = await import('../js/modules.js');
const state = await import('../js/state.js');

const LIVE_ON = [{ id: 'live', bands: ['p1', 'p2', 's1', 's2', 'ad'], slots: ['home.action'] },
  { id: 'timetable', bands: ['p1', 'p2', 's1', 's2'], slots: ['home.action'] }];

beforeEach(() => { store.clear(); modules.reset(); liveclass.reset(); i18n.setLang('en'); hello = {}; });

test("the learner's live screen never asks for the microphone and records nothing", () => {
  const src = readFileSync(new URL('../js/modules/live.js', import.meta.url), 'utf8');
  for (const name of ['getUserMedia', 'MediaRecorder', 'mediaDevices']) assert.ok(!src.includes(name), name);
  for (const f of ['../js/liveclass.js', '../js/hub.js']) {
    const other = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/getUserMedia|MediaRecorder/.test(other), f);
  }
});

test("the open class comes from hello, only while the module is on for her band, and never one she saw end", async () => {
  hello = { live: LIVE };
  await hub.connect();
  const c = { id: 'x', band: 's1', token: 't' };
  assert.equal(liveclass.current(c), null);                       // the module is off: nothing
  modules.sync(LIVE_ON);
  assert.deepEqual(liveclass.current(c), LIVE);
  assert.equal(liveclass.current({ ...c, band: 'ey' }), null);     // early years never see it
  assert.equal(liveclass.current({ ...c, liveSeen: LIVE.id }), null);
  hello = { live: { ...LIVE, id: 'not-an-id!' } };
  await hub.refresh();
  assert.equal(liveclass.current(c), null);                       // an odd id is no class
});

test("the live poll's answer wins over hello's while it is fresh: {} means no class", async () => {
  hello = { live: LIVE };
  await hub.connect();
  modules.sync(LIVE_ON);
  const c = { id: 'x', band: 'p2', token: 't' };
  liveclass.heard({});
  assert.equal(liveclass.current(c), null);
  liveclass.heard({ id: 'zzzzzzzzzzzzzzzz', subject: 'class', since: null, here: 3 });
  assert.equal(liveclass.current(c).id, 'zzzzzzzzzzzzzzzz');
  assert.equal(liveclass.titleFor('class'), 'Live class');
  assert.equal(liveclass.titleFor('maths'), 'Live class: Maths');
});

test('the phone keeps only the id of the last class she saw end', () => {
  state.reload();
  const c = state.addChild({ band: 's1', lang: 'en' });
  state.updateChild(c.id, { liveSeen: LIVE.id });
  assert.equal(state.reload() && state.child().liveSeen, LIVE.id);
  state.updateChild(c.id, { liveSeen: 'Not An Id' });             // anything else is dropped
  state.reload();
  assert.ok(!('liveSeen' in state.child()));
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'x', learners: [{ id: 'x', year: 8, lang: 'en', liveSeen: '<b>' }] }));
  state.reload();
  assert.ok(!('liveSeen' in state.child()));
});

// a day with a live block between two periods
const TT = { days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'], start: '08:00',
  blocks: [{ kind: 'opening', min: 5 }, { kind: 'period', subject: 'auto', min: 40 }, { kind: 'live', subject: 'maths', min: 45 },
    { kind: 'live', subject: 'class', min: 30 }, { kind: 'period', subject: 'science', min: 40 }, { kind: 'close', min: 5 }] };
const SAT = new Date(2027, 0, 2);

test('a live block is numbered with the periods and keeps its subject, or "class"', () => {
  const d = day.dayOf(TT, SAT);
  assert.deepEqual(d.blocks.map((b) => [b.kind, b.subject, b.n]), [['opening', null, 0], ['period', 'auto', 1],
    ['live', 'maths', 2], ['live', 'class', 3], ['period', 'science', 4], ['close', null, 0]]);
  assert.deepEqual([d.blocks[2].start, d.blocks[2].end], [8 * 60 + 45, 9 * 60 + 30]);
});

test('with live classes on, a live block has no lesson; off, it is a period of its subject ("class" an auto one)', () => {
  const L = (id, subject) => ({ id, subject });
  const queue = (s) => ({ maths: [L('m1', 'maths'), L('m2', 'maths')], science: [L('s1', 'science')], english: [L('e1', 'english')] }[s] || []);
  const opts = { subjects: ['maths', 'english', 'science'], queue };
  const on = day.fill(day.dayOf(TT, SAT), { ...opts, live: true });
  assert.deepEqual(on.blocks.map((b) => [b.kind, b.lesson && b.lesson.id]), [['opening', null], ['period', 'm1'],
    ['live', null], ['live', null], ['period', 's1'], ['close', null]]);
  const off = day.fill(day.dayOf(TT, SAT), opts);
  assert.deepEqual(off.blocks.map((b) => [b.kind, b.subject, b.lesson && b.lesson.id]), [['opening', null, null],
    ['period', 'maths', 'm1'], ['period', 'maths', 'm2'], ['period', 'english', 'e1'], ['period', 'science', 's1'], ['close', null, null]]);
});

test("a live block's start rings the Android app's bell as a period's does", () => {
  const from = new Date(2027, 0, 1, 22, 0);
  const plan = day.alarmPlan(TT, from, 0, 2).filter((x) => new Date(x.at).getDate() === 2);
  assert.deepEqual(plan.map((x) => [x.kind, new Date(x.at).getHours() * 60 + new Date(x.at).getMinutes()]),
    [['wake', 7 * 60 + 30], ['bell', 8 * 60 + 5], ['bell', 8 * 60 + 45], ['bell', 9 * 60 + 30], ['bell', 10 * 60]]);
});

// --- the floor (P30b, C6.4) ---

test('the floor can be offered only to an adult, outside the APK, in a secure page with a microphone', async () => {
  const floor = await import('../js/floor.js');
  const md = { getUserMedia: async () => ({}) };
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: md }, configurable: true, writable: true });
  globalThis.RTCPeerConnection = class {};
  globalThis.isSecureContext = true;
  const adult = { id: 'x', band: 'ad', token: 't' };
  assert.equal(floor.canSpeak(adult), true);
  assert.equal(floor.canSpeak({ ...adult, band: 's2' }), false);                 // never a child
  globalThis.isSecureContext = false;                                           // the hub's plain http
  assert.equal(floor.canSpeak(adult), false);
  globalThis.isSecureContext = true;
  globalThis.QalamAndroid = { canRecord: () => true };                           // the APK: never
  assert.equal(floor.canSpeak(adult), false);
  delete globalThis.QalamAndroid;
  delete globalThis.RTCPeerConnection;
  assert.equal(floor.canSpeak(adult), false);
  delete globalThis.isSecureContext;
  assert.equal(floor.clock(90e3), '1:30');
  assert.equal(floor.clock(4500), '0:05');
  assert.equal(floor.clock(-1), '0:00');
});

test('floor.js records nothing, stops the track when the floor ends, and only the live screen loads it, for adults', () => {
  const src = readFileSync(new URL('../js/floor.js', import.meta.url), 'utf8');
  assert.ok(!/MediaRecorder|\bvideo\s*:/.test(src));
  assert.match(src, /getUserMedia\(\{ audio: /);
  const stop = src.slice(src.indexOf('function stop()'), src.indexOf('function finish('));
  assert.match(stop, /track\.stop\(\)/);
  assert.match(stop, /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  const live = readFileSync(new URL('../js/modules/live.js', import.meta.url), 'utf8');
  assert.match(live, /c\.band !== 'ad' \|\| globalThis\.QalamAndroid \|\| globalThis\.isSecureContext !== true/);
  assert.match(live, /await import\('\.\.\/floor\.js'\)/);
  assert.ok(!/^import .*floor\.js/m.test(live));                                   // never loaded with the screen
  for (const f of ['../js/main.js', '../js/modules.js', '../js/screens/home.js']) {
    assert.ok(!readFileSync(new URL(f, import.meta.url), 'utf8').includes('floor.js'), f);
  }
});

test('the phone keeps only that she read the explainer', () => {
  const c = state.addChild({ band: 'ad', lang: 'en' });
  state.updateChild(c.id, { floorSeen: true });
  state.reload();
  assert.equal(state.byId(c.id).floorSeen, true);
  state.updateChild(c.id, { floorSeen: 'yes' });
  state.reload();
  assert.ok(!('floorSeen' in state.byId(c.id)));
});
