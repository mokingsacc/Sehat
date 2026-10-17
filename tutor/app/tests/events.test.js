// The phone's events queue (app/js/events.js): lessons done offline are kept and sent when the hub is back, as
// verbs and lesson ids only, each learner's with her own token, and only with consent (P10).
// Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in hub)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };

// a stand-in hub: answers /api/hello (as the server HUB), takes or refuses /api/events, or is out of reach
const HUB = 'a1a1a1a1a1a1a1a1a1a1';
const posted = [];
const tokens = [];         // the learner token each events call carried
const keys = [];           // the sheet-key addresses the phone asked for
let hubUp = false;
let refuse = 0;          // the status every events call gets until it changes (0: taken)
globalThis.fetch = async (url, opts = {}) => {
  if (!hubUp) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url.includes('/api/hello')) return reply(200, { hub: 'Qalam', id: HUB, now: Date.now(), modules: [] });
  if (url.includes('/key?')) { keys.push(url); return reply(200, { items: [] }); }
  if (url.includes('/api/events')) {
    if (refuse) return reply(refuse, { error: 'no' });
    const body = JSON.parse(opts.body);
    if (!opts.headers['X-Learner-Token']) return reply(401, { error: 'join again' });
    tokens.push(opts.headers['X-Learner-Token']);
    posted.push(body.events);
    return reply(200, { saved: body.events.length, expired: 0 });
  }
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');
const account = await import('../js/account.js');
account.start();

const AGREED = { kind: 'guardian-on-phone', version: 'hub-2026-10', at: '2026-10-16T09:41', sent: true };
const TOKEN = 'tok_aaaaaaaaaaaaaaaaaaaaaaaa';
// a learner who joined the hub and whose grown-up agreed: her seat there (W4)
function joined(year = 1, token = TOKEN) {
  const c = state.addChild({ year, lang: 'prs' });
  state.setSeat(c.id, HUB, { consent: AGREED, token, number: 27, cohort: { id: 'c1', label: 'Class' }, sentBand: c.band });
  return state.byId(c.id);
}
// an event queued for the hub
const toHub = { to: [HUB] };

async function goOffline() { hubUp = false; await hub.connect(); }
async function goOnline() { hubUp = true; await hub.connect(); await events.flush(); }

beforeEach(async () => {
  await goOffline();
  store.clear();
  events.reset();
  posted.length = 0;
  tokens.length = 0;
  refuse = 0;
  state.reload();
  events.record('lesson.start', 'dari-1-sheen', null, 'nobody');     // drops nothing: the queue was cleared
  events.reset();
});

test('a lesson done offline is two events once the hub is back, with no name in them', async () => {
  const c = state.addChild({ name: 'Maryam', year: 1, lang: 'prs' });
  state.setSeat(c.id, HUB, { consent: AGREED, token: TOKEN, sentBand: 'p1' });
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
  assert.deepEqual(tokens, [TOKEN]);
  assert.deepEqual(events.pending(), []);
});

test('a lesson opened again after it was done starts again', async () => {
  joined(7);
  state.setStep('dari-1-sheen', 0);
  state.markDone('dari-1-sheen', 2);
  state.setStep('dari-1-sheen', 0);
  assert.deepEqual(events.pending().map((e) => e.verb), ['lesson.start', 'lesson.done', 'lesson.start']);
});

test('only known verbs and plain lesson ids are queued, each for a learner on this phone', () => {
  const l = joined().id;
  assert.equal(events.record('lesson.start', 'Maryam from the third house', null, l, toHub), false);
  assert.equal(events.record('lesson.start', 'call-0799123456', null, l, toHub), false);
  assert.equal(events.record('print.queued', 'dari-1-sheen', 1, l, toHub), false);     // the hub writes that one itself
  assert.equal(events.record('lesson.done', 'dari-1-sheen', null, l, toHub), false);   // needs its stars
  assert.equal(events.record('lesson.start', 'dari-1-sheen', 4, l, toHub), false);
  assert.equal(events.record('lesson.start', 'dari-1-sheen'), false);            // whose?
  assert.equal(events.record('lesson.start', 'dari-1-sheen', null, l, toHub), true);
  assert.equal(events.pending().length, 1);
  assert.deepEqual(Object.keys(events.pending()[0]).sort(), ['at', 'object', 'verb']);   // the learner id stays here
});

test('the hint events name an item (lesson:n) and its rung or result, never a name', () => {
  const l = joined().id;
  assert.equal(events.record('check.item', 'maths-7-fractions-add:3', 2, l, toHub), true);
  assert.equal(events.record('check.item', 'maths-7-fractions-add:3', 3, l, toHub), false);       // 0, 1 or 2
  assert.equal(events.record('check.item', 'maths-7-fractions-add', 1, l, toHub), false);         // which item?
  assert.equal(events.record('hint.rung', 'maths-7-fractions-add:3', 1, l, toHub), true);
  assert.equal(events.record('hint.rung', 'maths-7-fractions-add:3', 4, l, toHub), false);
  assert.equal(events.record('check.dispute', 'maths-7-fractions-add:3', null, l, toHub), true);
  assert.equal(events.record('check.dispute', 'Maryam:3', null, l, toHub), false);
  assert.equal(events.pending().length, 3);
});

test('without consent nothing is queued; with consent but no token yet, events wait for her join', async () => {
  const c = state.addChild({ year: 3, lang: 'prs' });
  state.setStep('dari-1-sheen', 0);
  state.markDone('dari-1-sheen', 3);
  assert.deepEqual(events.pending(), []);
  state.setSeat(c.id, HUB, { consent: AGREED });
  state.setStep('dari-1-alif', 0);
  await goOnline();
  assert.equal(posted.length, 0);
  assert.equal(events.pending().length, 1);
  state.setSeat(c.id, HUB, { token: TOKEN });
  await events.flush();
  assert.deepEqual(posted.flat().map((e) => e.object), ['dari-1-alif']);
});

test('two learners on one phone send their own events with their own tokens', async () => {
  const a = joined(2, 'tok_aaaaaaaaaaaaaaaaaaaaaaaa');
  state.setStep('dari-1-sheen', 0);
  joined(8, 'tok_bbbbbbbbbbbbbbbbbbbbbbbb');
  state.setStep('maths-7-fractions-add', 0);
  state.setActive(a.id);
  state.markDone('dari-1-sheen', 2);
  await goOnline();
  assert.deepEqual(tokens, ['tok_aaaaaaaaaaaaaaaaaaaaaaaa', 'tok_bbbbbbbbbbbbbbbbbbbbbbbb']);
  assert.deepEqual(posted.map((b) => b.map((e) => e.object)), [['dari-1-sheen', 'dari-1-sheen'], ['maths-7-fractions-add']]);
});

test('a token the server does not know keeps her events and clears the token for a new join', async () => {
  const c = joined();
  state.setStep('dari-1-sheen', 0);
  refuse = 401;
  hubUp = true;
  await hub.connect();
  await events.flush();
  assert.equal(events.pending().length, 1);
  assert.equal(state.byId(c.id).token, null);
  assert.equal(state.byId(c.id).number, null);
});

test('removing a learner drops her queued events and queues her server record for deletion', () => {
  const a = joined(2, 'tok_aaaaaaaaaaaaaaaaaaaaaaaa');
  state.setStep('dari-1-sheen', 0);
  joined(8, 'tok_bbbbbbbbbbbbbbbbbbbbbbbb');
  state.setStep('maths-7-fractions-add', 0);
  state.removeLearner(a.id);
  assert.deepEqual(events.pending().map((e) => e.object), ['maths-7-fractions-add']);
  assert.deepEqual(state.toForget(), ['tok_aaaaaaaaaaaaaaaaaaaaaaaa']);
});

test('a batch that did not arrive stays; one the hub refuses is dropped', async () => {
  events.record('lesson.start', 'dari-1-sheen', null, joined().id, toHub);
  refuse = 503;
  hubUp = true;
  await hub.connect();
  await events.flush();
  assert.equal(events.pending().length, 1);
  refuse = 422;
  await events.flush();
  assert.deepEqual(events.pending(), []);
  assert.equal(posted.length, 0);
});

test('more than a hundred go in batches of a hundred', async () => {
  const l = joined().id;
  for (let i = 0; i < 230; i++) events.record('lesson.start', 'dari-1-sheen', null, l, toHub);
  await goOnline();
  assert.deepEqual(posted.map((b) => b.length), [100, 100, 30]);
});

test('a marked sheet is a check.done with a percent; a key fetch is never an event', async () => {
  const l = joined(7).id;
  assert.equal(events.record('check.done', 'maths-7-fractions-add', null, l, toHub), false);     // needs its percent
  assert.equal(events.record('check.key', 'maths-7-fractions-add', null, l, toHub), false);      // gone
  assert.equal(events.record('check.done', 'maths-7-fractions-add', 75, l, toHub), true);
  await goOnline();
  keys.length = 0;
  await hub.sheetKey('maths-7-fractions-add', 4821, 'prs');
  assert.equal(keys.length, 1);
  assert.ok(!keys[0].includes('for='));
  assert.deepEqual(posted.flat().map((e) => [e.verb, e.object, e.value]), [['check.done', 'maths-7-fractions-add', 75]]);
});
