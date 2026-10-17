// What she sent that waits (app/js/outbox.js, P11): a question asked offline waits on the phone, is counted and
// shown, and goes when the server is back, after her join; after 7 days it is "Not sent"; a refusal is "Couldn't
// send". Events are never counted, and the events queue keeps 14 days at most.
// Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in online home)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'https:', origin: 'https://qalam.example' };

const asked = [];
const planned = [];
let up = false;
let refuseAsk = 0;
let n = 40;
globalThis.fetch = async (url, opts = {}) => {
  if (!up) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const path = url.replace(/\?.*$/, '');
  const token = (opts.headers || {})['X-Learner-Token'];
  if (path.endsWith('/api/hello')) return reply(200, { hub: 'Qalam', home: 'online', consent: 'online-2026-10', modules: [] });
  if (path.endsWith('/api/join')) return reply(200, { token: `tok_${String(++n).padStart(24, 'q')}`, number: n, picture: 'key', cohort: { id: 'open', label: 'Open' } });
  if (path.endsWith('/api/ask')) {
    if (!token) return reply(401, {});
    if (refuseAsk) return reply(refuseAsk, {});
    asked.push([JSON.parse(opts.body).text, token]);
    return reply(200, { id: 'q' + asked.length, text: 'an answer', source: 'bank', waiting: false });
  }
  if (path.endsWith('/api/events')) return reply(200, {});
  if (path.endsWith('/api/m/plan')) { planned.push([JSON.parse(opts.body).goal, token]); return reply(200, { kind: 'wish', saved: true }); }
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');
const account = await import('../js/account.js');
const outbox = await import('../js/outbox.js');
account.start();
const toasts = [];
outbox.onSent((m) => toasts.push(m));

const AGREED = { kind: 'guardian-on-phone', version: 'online-2026-10', at: '2026-10-16T09:41', sent: false };

beforeEach(async () => {
  up = false;
  await hub.connect();
  store.clear();
  state.reload();
  events.reset();
  account.reset();
  outbox.reset();
  asked.length = 0;
  planned.length = 0;
  toasts.length = 0;
  refuseAsk = 0;
});

async function back() { up = true; await hub.connect(); await outbox.flush(); }

test('an https page with no server yet is the online home', () => {
  assert.equal(hub.home(), 'online');
});

test('a question asked offline waits, is counted with her join, and goes after it when she is back online', async () => {
  const c = state.addChild({ year: 7, lang: 'prs' });
  state.updateChild(c.id, { consent: AGREED });
  outbox.queue({ id: null, q: 'Why is the sky blue?', at: Date.now(), lang: 'en' });
  state.record('lesson.start', 'dari-1-sheen');
  assert.deepEqual(outbox.waiting(), ['wait_join', 'wait_question']);         // events are never counted
  await back();
  const l = state.byId(c.id);
  assert.deepEqual(asked, [['Why is the sky blue?', l.token]]);
  assert.deepEqual([l.asks[0].queued, l.asks[0].a, l.asks[0].id], [false, 'an answer', 'q1']);
  assert.deepEqual(outbox.waiting(), []);
  assert.equal(toasts.length, 1);
  assert.deepEqual(events.pending(), []);                                       // and her events went too
});

test('a waiting wish goes with her token, so her own class gets it, never one a link names (C5 H1)', async () => {
  const c = state.addChild({ year: 8, lang: 'prs', band: 's1' });
  state.updateChild(c.id, { consent: AGREED });
  outbox.queueWish(c.id, 'astronomy', 'en');
  await back();
  const l = state.byId(c.id);
  assert.deepEqual(planned, [['astronomy', l.token]]);
});

test('a question waiting more than 7 days is "Not sent", and "Send again" sends it', async () => {
  const c = state.addChild({ year: 7, lang: 'prs' });
  state.updateChild(c.id, { consent: AGREED });
  const e = outbox.queue({ id: null, q: 'An old question', at: Date.now() - 8 * 864e5, lang: 'en' });
  await back();
  assert.equal(asked.length, 0);
  assert.equal(state.byId(c.id).asks[0].notSent, true);
  await outbox.again(c.id, e.k);
  assert.deepEqual(asked.map(([q]) => q), ['An old question']);
});

test('a question the server refuses shows "Couldn\'t send"; one that met a busy server keeps waiting', async () => {
  const c = state.addChild({ year: 7, lang: 'prs' });
  state.updateChild(c.id, { consent: AGREED });
  outbox.queue({ id: null, q: 'one', at: Date.now(), lang: 'en' });
  refuseAsk = 503;
  await back();
  assert.equal(state.byId(c.id).asks[0].queued, true);
  refuseAsk = 422;
  await outbox.flush();
  assert.deepEqual([state.byId(c.id).asks[0].queued, state.byId(c.id).asks[0].failed], [false, true]);
});

test('the events queue keeps 14 days at most, without a word', () => {
  const c = state.addChild({ year: 7, lang: 'prs' });
  state.updateChild(c.id, { consent: AGREED });
  const old = new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 16);
  store.set('qalam.events.v1', JSON.stringify([{ n: '1.1', l: c.id, at: old, verb: 'lesson.start', object: 'dari-1-sheen' }]));
  state.record('lesson.start', 'dari-1-alif');
  assert.deepEqual(events.pending().map((e) => e.object), ['dari-1-alif']);
});

test('when the phone loses the network the app knows at once, and finds the server again', async () => {
  up = true;
  assert.equal(await hub.connect(), true);
  const heard = [];
  hub.onChange((ok) => heard.push(ok));
  up = false;
  hub.lost();
  assert.equal(hub.online(), false);
  assert.deepEqual(heard, [false]);
  hub.lost();                                                                   // said once
  assert.deepEqual(heard, [false]);
  up = true;
  assert.equal(await hub.connect(), true);
  assert.equal(hub.online(), true);
});
