// The phone's events queue (app/js/events.js): lessons done offline are kept and sent when the hub is back, as
// verbs and lesson ids only. Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in hub)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };

// a stand-in hub: answers /api/hello, takes or refuses /api/events, or is out of reach
const posted = [];
let hubUp = false;
let refuse = 0;          // the status the next events call gets (0: taken)
globalThis.fetch = async (url, opts = {}) => {
  if (!hubUp) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url.endsWith('/api/hello')) return reply(200, { hub: 'Qalam', modules: [] });
  if (url.endsWith('/api/events')) {
    if (refuse) { const st = refuse; refuse = 0; return reply(st, { error: 'no' }); }
    const body = JSON.parse(opts.body);
    posted.push(body.events);
    return reply(200, { saved: body.events.length, expired: 0 });
  }
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');

async function goOffline() { hubUp = false; await hub.connect(); }
async function goOnline() { hubUp = true; await hub.connect(); await events.flush(); }

beforeEach(async () => {
  await goOffline();
  store.clear();
  events.reset();
  posted.length = 0;
  refuse = 0;
});

test('a lesson done offline is two events once the hub is back, with no name in them', async () => {
  state.addChild({ name: 'Maryam', year: 1, lang: 'prs' });
  state.setStep('maths-1-count-5', 0);
  state.setStep('maths-1-count-5', 1);          // the next step is not a new start
  state.markDone('maths-1-count-5', 3);
  assert.deepEqual(events.pending().map((e) => [e.verb, e.object, e.value]),
    [['lesson.start', 'maths-1-count-5', undefined], ['lesson.done', 'maths-1-count-5', 3]]);
  assert.equal(posted.length, 0);
  await goOnline();
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].map((e) => e.verb), ['lesson.start', 'lesson.done']);
  for (const e of posted[0]) {
    assert.deepEqual(Object.keys(e).sort(), e.value === undefined ? ['at', 'object', 'verb'] : ['at', 'object', 'value', 'verb']);
    assert.match(e.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  }
  assert.ok(!JSON.stringify(posted).includes('Maryam'));
  assert.deepEqual(events.pending(), []);
});

test('a lesson opened again after it was done starts again', async () => {
  state.addChild({ name: '', year: 7, lang: 'prs' });
  state.setStep('dari-1-sheen', 0);
  state.markDone('dari-1-sheen', 2);
  state.setStep('dari-1-sheen', 0);
  assert.deepEqual(events.pending().map((e) => e.verb), ['lesson.start', 'lesson.done', 'lesson.start']);
});

test('only known verbs and plain lesson ids are queued', () => {
  assert.equal(events.record('lesson.start', 'Maryam from the third house'), false);
  assert.equal(events.record('lesson.start', 'call-0799123456'), false);
  assert.equal(events.record('print.queued', 'dari-1-sheen', 1), false);     // the hub writes that one itself
  assert.equal(events.record('lesson.done', 'dari-1-sheen'), false);         // needs its stars
  assert.equal(events.record('lesson.start', 'dari-1-sheen', 4), false);
  assert.equal(events.record('lesson.start', 'dari-1-sheen'), true);
  assert.equal(events.pending().length, 1);
});

test('a batch that did not arrive stays; one the hub refuses is dropped', async () => {
  events.record('lesson.start', 'dari-1-sheen');
  hubUp = true;
  await hub.connect();
  refuse = 503;
  await events.flush();
  assert.equal(events.pending().length, 1);
  refuse = 422;
  await events.flush();
  assert.deepEqual(events.pending(), []);
  assert.equal(posted.length, 0);
});

test('more than a hundred go in batches of a hundred', async () => {
  for (let i = 0; i < 230; i++) events.record('lesson.start', 'dari-1-sheen');
  await goOnline();
  assert.deepEqual(posted.map((b) => b.length), [100, 100, 30]);
});
