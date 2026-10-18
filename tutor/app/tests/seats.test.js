// Seats and clocks (W4, WEBSITE.md 3.3 to 3.5 and 3.11): one seat per server, each token sent only to the server
// whose id issued it; a learner from before W4 placed at the address she last used; events with `to`, sent to each
// of her class's servers; the clock's skew from hello.now, so events from a phone whose clock fell back to 2010 land
// inside the server's window; a 401 that drops one seat only; two tokens for one server merged.
// Run with: node --test app/tests/*.test.js   (no browser; fetch is two stand-in servers)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };

const realNow = Date.now;
const DAY = 24 * 3600e3;

// two stand-in servers: the village hub and the online home, each with its own id, text, learners and time
function server(name, id, consent, origins) {
  return { name, id, consent, origins, up: false, known: new Map(), seen: [], events: [], merges: [], now: () => realNow(),
    classes: { K7QM4PRT: { id: 'class-7b', label: 'Class 7B' } }, n: 10 };
}
const HUB = server('hub', 'a1a1a1a1a1a1a1a1a1a1', 'hub-2026-10b', ['http://10.42.0.1', '']);
const ONLINE = server('online', 'b2b2b2b2b2b2b2b2b2b2', 'online-2026-10b', ['https://qalam.example.org']);
const SERVERS = [HUB, ONLINE];
const which = (url) => {
  const base = url.startsWith('/') ? '' : url.replace(/\/(api)\/.*$/, '');
  return SERVERS.find((s) => s.origins.includes(base));
};

globalThis.fetch = async (url, opts = {}) => {
  const s = which(url);
  if (!s || !s.up) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  const body = opts.body ? JSON.parse(opts.body) : null;
  const token = (opts.headers || {})['X-Learner-Token'] || null;
  if (token) s.seen.push(token);
  if (body && body.other) s.seen.push(body.other);
  if (path === '/api/hello') return reply(200, { hub: 'Qalam', id: s.id, now: s.now(), consent: s.consent, home: s.name, modules: [] });
  const me = token && s.known.get(token);
  if (path === '/api/join') {
    if (body.consent && body.consent.version !== s.consent) return reply(422, { detail: 'not this text' });
    const cohort = body.cohort_code ? s.classes[body.cohort_code] : { id: s.name, label: s.name };
    if (!cohort) return reply(404, { detail: 'no class has this code' });
    const t = `tok_${s.name}_${String(++s.n).padStart(20, 'x')}`;
    s.known.set(t, { number: s.n, cohort, consent: body.consent || null });
    return reply(200, { token: t, number: s.n, picture: body.picture, cohort });
  }
  if (path === '/api/me') {
    if (!me) return reply(401, { detail: 'join again' });
    if (opts.method === 'DELETE') { s.known.delete(token); return reply(200, { deleted: true }); }
    if (body && body.consent) me.consent = body.consent;
    return reply(200, { number: me.number, cohort: me.cohort, consent: me.consent });
  }
  if (path === '/api/me/merge') {
    if (!me) return reply(401, { detail: 'join again' });
    s.merges.push([token, body.other]);
    const other = s.known.get(body.other);
    if (other && other.cohort.id !== me.cohort.id) return reply(409, { detail: 'different classes' });
    if (other) s.known.delete(token);                        // the other is the older here: it stays
    return reply(200, { kept: other ? 'other' : 'this', number: (other || me).number, cohort: (other || me).cohort });
  }
  if (path === '/api/events') {
    if (!me) return reply(401, { detail: 'join again' });
    if (!me.consent) return reply(403, { detail: 'no consent' });
    for (const e of body.events) s.events.push({ ...e, token });
    return reply(200, { saved: body.events.length });
  }
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');
const account = await import('../js/account.js');
account.start();

async function reach(...up) {
  for (const s of SERVERS) s.up = up.includes(s);
  await hub.connect();
  await account.sync();
  await events.flush();
}
const agreed = (s) => ({ kind: 'guardian-on-phone', version: s.consent, at: '2026-10-16T09:41' });

beforeEach(async () => {
  Date.now = realNow;
  delete globalThis.QalamAndroid;
  globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };
  await reach();
  store.clear();
  for (const s of SERVERS) {
    Object.assign(s, { known: new Map(), seen: [], events: [], merges: [], now: () => realNow() });
  }
  state.reload();
  account.reset();
  events.reset();
});

// what each server ever received as a token, against what it issued
function onlyItsOwn() {
  for (const s of SERVERS) {
    for (const t of s.seen) assert.ok(t.startsWith(`tok_${s.name}_`) || t.startsWith('tok_old'), `${s.name} got ${t}`);
  }
}

test('the Android app goes hub, online, hub and keeps one token per server, sending neither to the other', async () => {
  globalThis.location = { protocol: 'https:', origin: 'https://appassets.androidplatform.net' };
  globalThis.QalamAndroid = { setAlarms() {}, cancelAlarms() {}, online: () => 'https://qalam.example.org', version: () => '0.4.0' };
  // at the hub: she came with her class card, and her grown-up agreed to the hub's text
  await reach(HUB);
  const c = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(c.id, HUB.consent);
  await account.sync();
  const hubToken = state.byId(c.id).token;
  assert.ok(hubToken.startsWith('tok_hub_'));
  state.setStep('maths-7-fractions-add', 0);
  await events.flush();
  assert.equal(HUB.events.length, 1);
  // online: nothing of hers goes there until her grown-up agrees to the online text; her lessons wait for the hub
  await reach(ONLINE);
  assert.equal(state.byId(c.id).token, null);
  state.markDone('maths-7-fractions-add', 3);
  await events.flush();
  assert.equal(ONLINE.events.length, 0);
  account.agree(c.id, ONLINE.consent);
  await account.sync();
  const onlineToken = state.byId(c.id).token;
  assert.ok(onlineToken.startsWith('tok_online_'));
  state.setStep('dari-1-sheen', 0);
  await events.flush();
  assert.equal(ONLINE.events.length, 0);                                 // her class's server is the hub
  // the hub again: the same seat, the same token, and everything she did meanwhile
  await reach(HUB);
  assert.equal(state.byId(c.id).token, hubToken);
  assert.deepEqual(HUB.events.map((e) => [e.verb, e.object, e.token]), [
    ['lesson.start', 'maths-7-fractions-add', hubToken], ['lesson.done', 'maths-7-fractions-add', hubToken],
    ['lesson.start', 'dari-1-sheen', hubToken]]);
  assert.deepEqual(Object.keys(state.seats(state.byId(c.id))).sort(), [HUB.id, ONLINE.id]);
  assert.equal(events.queued().length, 0);
  onlyItsOwn();
});

test('a learner from before W4 keeps her token after the move, so her events stay hers and a certificate completes', async () => {
  HUB.known.set('tok_oldxxxxxxxxxxxxxxxxxxxxxxxx', { number: 27, cohort: { id: 'class-7b', label: 'Class 7B' },
    consent: agreed(HUB) });
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'm', forget: [], learners: [{ id: 'm', band: 's1', year: 8, lang: 'prs',
    picture: 'cup', token: 'tok_oldxxxxxxxxxxxxxxxxxxxxxxxx', number: 27, cohort: { id: 'class-7b', label: 'Class 7B' },
    code: 'K7QM4PRT', asked: true, consent: { ...agreed(HUB), sent: true }, sentBand: 's1', done: {}, step: {} }] }));
  store.set('qalam.events.v1', JSON.stringify([{ n: '1.1', l: 'm', at: new Date(realNow()).toISOString().slice(0, 16),
    verb: 'lesson.done', object: 'maths-7-fractions-add', value: 3 }]));     // queued before the update
  state.reload();
  assert.equal(state.byId('m').number, 27);                              // shown as before, while away
  await reach(HUB);
  const l = state.byId('m');
  assert.deepEqual(Object.keys(state.seats(l)), [HUB.id]);
  assert.equal(l.token, 'tok_oldxxxxxxxxxxxxxxxxxxxxxxxx');
  state.markDone('dari-1-sheen', 2);
  await events.flush();
  // every finished lesson under the one token she always had: what a certificate is earned from
  assert.deepEqual([...new Set(HUB.events.map((e) => e.token))], ['tok_oldxxxxxxxxxxxxxxxxxxxxxxxx']);
  assert.deepEqual(HUB.events.map((e) => e.object), ['maths-7-fractions-add', 'dari-1-sheen']);
});

test('a token from before W4 is tried only where it was last used; one that server forgot means she joins again', async () => {
  globalThis.location = { protocol: 'https:', origin: 'https://appassets.androidplatform.net' };
  globalThis.QalamAndroid = { setAlarms() {}, cancelAlarms() {}, online: () => 'https://qalam.example.org', version: () => '0.4.0' };
  store.set('qalam.cache.hub', JSON.stringify('http://10.42.0.1'));
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'm', forget: [], learners: [{ id: 'm', band: 's1', year: 8, lang: 'prs',
    picture: 'cup', token: 'tok_oldyyyyyyyyyyyyyyyyyyyyyyyy', number: 4, cohort: { id: 'hub', label: 'hub' },
    asked: true, consent: { ...agreed(HUB), sent: true }, sentBand: 's1', done: {}, step: {} }] }));
  state.reload();
  await reach(ONLINE);                                                   // not where she used it: never sent
  assert.deepEqual(ONLINE.seen, []);
  assert.equal(state.byId('m').token, null);
  await reach(HUB);                                                      // the hub forgot her (a year away)
  const l = state.byId('m');
  assert.deepEqual(HUB.seen[0], 'tok_oldyyyyyyyyyyyyyyyyyyyyyyyy');
  assert.ok(l.token.startsWith('tok_hub_') && l.consent.sent);           // joined again with her grown-up's yes
  assert.deepEqual(Object.keys(state.seats(l)), [HUB.id]);
  onlyItsOwn();
});

test('a 401 drops only that server\'s seat; "Stop sharing" tells each server, with its own token, when it is in reach', async () => {
  await reach(HUB);
  const c = state.addChild({ year: 8, lang: 'prs' });
  account.agree(c.id, HUB.consent);
  await account.sync();
  const h = state.byId(c.id).token;
  globalThis.location = { protocol: 'http:', origin: 'http://elsewhere' };
  ONLINE.origins.push('');
  HUB.origins = ['http://10.42.0.1'];
  try {
    await reach(ONLINE);
    account.agree(c.id, ONLINE.consent);
    await account.sync();
    const o = state.byId(c.id).token;
    ONLINE.known.delete(o);                                              // online forgot her
    state.updateChild(c.id, { year: 10 });                                // her new year goes to the server: a 401
    await account.sync();
    assert.notEqual(state.byId(c.id).token, o);                          // joined online again
    assert.equal(state.seatOf(state.byId(c.id), HUB.id).token, h);       // the hub's seat untouched
    account.stopSharing(c.id);
    await account.sync();
    assert.equal(ONLINE.known.size, 0);                                  // deleted online now
    assert.ok(HUB.known.has(h));                                         // the hub's waits for the hub
    assert.deepEqual(state.toForget(), [h]);
    onlyItsOwn();
  } finally {
    ONLINE.origins = ['https://qalam.example.org'];
    HUB.origins = ['http://10.42.0.1', ''];
  }
  globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };
  await reach(HUB);
  assert.equal(HUB.known.has(h), false);
  assert.deepEqual(state.toForget(), []);
});

test('the phone refuses to send a token to a server that did not issue it', async () => {
  await reach(HUB);
  const c = state.addChild({ year: 8, lang: 'prs' });
  account.agree(c.id, HUB.consent);
  await account.sync();
  const h = state.byId(c.id).token;
  assert.equal(hub.mayCarry(h), true);
  assert.equal(hub.mayCarry('tok_madeupxxxxxxxxxxxxxxxxxxxxx'), false);   // not hers on this phone at all
  ONLINE.origins.push('');
  HUB.origins = ['http://10.42.0.1'];
  try {
    await reach(ONLINE);
    assert.equal(hub.mayCarry(h), false);
    await assert.rejects(hub.me(h), (e) => e.other === true);
    assert.deepEqual(ONLINE.seen, []);
  } finally {
    ONLINE.origins = ['https://qalam.example.org'];
    HUB.origins = ['http://10.42.0.1', ''];
  }
});

test('events from a phone whose clock fell back to 2010 land inside the window', async () => {
  await reach(HUB);
  const c = state.addChild({ year: 8, lang: 'prs' });
  account.agree(c.id, HUB.consent);
  await account.sync();
  await reach();
  // the battery died: the clock says 2010, and she keeps learning for two days
  const fell = Date.UTC(2010, 0, 1);
  let wall = fell;
  Date.now = () => wall;
  state.setStep('maths-7-fractions-add', 0);
  wall += 2 * DAY;
  state.markDone('maths-7-fractions-add', 3);
  // the hub again, the phone's clock still wrong
  await reach(HUB);
  const real = realNow();
  assert.equal(HUB.events.length, 2);
  for (const e of HUB.events) {
    const t = Date.parse(e.at + ':00Z');
    assert.ok(t > real - 3 * DAY && t <= real + 60e3, e.at);
  }
  // and on another visit the phone's clock was put right before the hub answered: still inside
  HUB.events.length = 0;
  await reach();
  state.setStep('dari-1-sheen', 0);
  Date.now = realNow;
  await reach(HUB);
  const t = Date.parse(HUB.events[0].at + ':00Z');
  assert.ok(t > realNow() - 3 * DAY && t <= realNow() + 60e3, HUB.events[0].at);
});

test('a phone that never met a server, with its clock in 2010, sends its events at the right time', async () => {
  let wall = Date.UTC(2010, 5, 1);
  Date.now = () => wall;
  const c = state.addChild({ year: 3, lang: 'prs' });
  state.updateChild(c.id, { consent: { ...agreed(HUB), sent: false } });  // agreed before any server was in reach
  state.setStep('dari-1-alif', 0);
  wall += 3600e3;
  await reach(HUB);
  assert.equal(HUB.events.length, 1);
  const t = Date.parse(HUB.events[0].at + ':00Z');
  assert.ok(Math.abs(t - realNow()) < 2 * 3600e3, HUB.events[0].at);
  assert.deepEqual(Object.keys(state.seats(state.byId(c.id))), [HUB.id]);   // her unplaced seat found its server
  assert.ok(Math.abs(state.clock().skew - (realNow() - wall)) < 60e3);
});

test('an event waiting for her class\'s server stays 60 days; one with no class, 14', async () => {
  await reach(HUB);
  const a = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(a.id, HUB.consent);
  const b = state.addChild({ year: 3, lang: 'prs' });
  account.agree(b.id, HUB.consent);
  await account.sync();
  await reach();
  state.setActive(a.id);
  state.setStep('maths-7-fractions-add', 0);
  state.setActive(b.id);
  state.setStep('dari-1-alif', 0);
  let wall = realNow() + 20 * DAY;
  Date.now = () => wall;
  assert.deepEqual(events.pending().map((e) => e.object), ['maths-7-fractions-add']);
  wall = realNow() + 61 * DAY;
  assert.deepEqual(events.pending(), []);
});

test('two tokens of hers for one server are folded into one learner, and the server says which stays', async () => {
  await reach(HUB);
  const c = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(c.id, HUB.consent);
  await account.sync();
  const mine = state.byId(c.id).token;
  // another device of hers joined the hub apart (W7's bag brings its token here)
  HUB.known.set('tok_hub_otherxxxxxxxxxxxxxxxxxx', { number: 3, cohort: { id: 'class-7b', label: 'Class 7B' }, consent: agreed(HUB) });
  state.setSeat(c.id, HUB.id, { also: ['tok_hub_otherxxxxxxxxxxxxxxxxxx'] });
  await account.sync();
  assert.deepEqual(HUB.merges, [[mine, 'tok_hub_otherxxxxxxxxxxxxxxxxxx']]);
  const l = state.byId(c.id);
  assert.equal(l.token, 'tok_hub_otherxxxxxxxxxxxxxxxxxx');
  assert.equal(l.number, 3);
  assert.equal(state.seatOf(l, HUB.id).also, undefined);
  // in another class: not merged, hers stays
  HUB.known.set('tok_hub_elsewhere_xxxxxxxxxxxxx', { number: 9, cohort: { id: 'class-9a', label: '9A' }, consent: agreed(HUB) });
  state.setSeat(c.id, HUB.id, { also: ['tok_hub_elsewhere_xxxxxxxxxxxxx'] });
  await account.sync();
  assert.equal(state.byId(c.id).token, 'tok_hub_otherxxxxxxxxxxxxxxxxxx');
  assert.equal(state.seatOf(state.byId(c.id), HUB.id).also, undefined);
  onlyItsOwn();
});
