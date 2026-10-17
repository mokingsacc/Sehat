// The school bag on the move (W7, WEBSITE.md 3.6 to 3.13; app/js/bagsync.js with account.js and state.js), with two
// stand-in relays (the village hub and the online home, each with its own id, consent texts, learners and bags, as
// hub/tutor_hub/server.py answers) and several phones, each its own storage. A bag made at the hub reaches a new
// phone; both phones learn apart and meet again through either relay, and nothing is lost (stars take the higher
// value, the newest plan stays, each question is sent once, from the phone that queued it); two pushes at once end in
// one bag; "Stop sharing" and "Make a new code" stop the bag on the other phone, which does not join again on its
// own; removing her from one phone sends nothing; "This is also me"; a relay never sees her code or her keys, and a
// token never goes to a server that did not issue it. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, test } from 'node:test';

// each phone's own storage
const phones = {};
let store = null;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// the phones run the Android app, which reaches the hub's address and then the online home it was built for
globalThis.location = { protocol: 'https:', origin: 'https://appassets.androidplatform.net' };
globalThis.QalamAndroid = { setAlarms() {}, cancelAlarms() {}, online: () => 'https://qalam.example.org', version: () => '0.5.0' };

const realNow = Date.now;
let now = realNow();
Date.now = () => now;

// the stand-in relays: learners by token, bags by id; a consent version ending in "c" names the bag (the c texts)
function server(name, id, origins) {
  return { name, id, origins, up: false, known: new Map(), bags: new Map(), seen: [], bodies: [], events: [], n: 10, e: 0,
    consent: `${name}-2026-10c`, classes: { K7QM4PRT: { id: 'class-7b', label: 'Class 7B' } } };
}
const HUB = server('hub', 'a1a1a1a1a1a1a1a1a1a1', ['http://10.42.0.1']);
const ONLINE = server('online', 'b2b2b2b2b2b2b2b2b2b2', ['https://qalam.example.org']);
const SERVERS = [HUB, ONLINE];
const which = (url) => SERVERS.find((s) => s.origins.includes(url.startsWith('/') ? '' : url.replace(/\/api\/.*$/, '')));
const sha = (h) => createHash('sha256').update(Buffer.from(h, 'hex')).digest('hex');
const pepper = (s, f) => createHash('sha256').update(s.id + f).digest('hex');   // stands in for HMAC(pepper, F_r)
const BLOB = /^[A-Za-z0-9+/]+={0,2}$/;

globalThis.fetch = async (url, opts = {}) => {
  const s = which(url);
  if (!s || !s.up) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (body === undefined ? Promise.reject(new Error('no body')) : body) });
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (opts.body) s.bodies.push(opts.body);
  const token = (opts.headers || {})['X-Learner-Token'] || null;
  if (token) s.seen.push(token);
  if (body && body.other) s.seen.push(body.other);
  if (path === '/api/hello') return reply(200, { hub: 'Qalam', id: s.id, now: now, consent: s.consent, home: s.name, modules: [], bag: { max: 65536 } });
  const me = token && s.known.get(token);
  if (path === '/api/join') {
    const cohort = body.cohort_code ? s.classes[body.cohort_code] : { id: s.name, label: s.name };
    if (!cohort) return reply(404, { detail: 'no class' });
    const t = `tok_${s.name}_${String(++s.n).padStart(20, 'x')}`;
    s.known.set(t, { number: s.n, cohort, consent: body.consent || null });
    return reply(200, { token: t, number: s.n, picture: body.picture, cohort });
  }
  if (path === '/api/me') {
    if (!me) return reply(401, { detail: 'join again' });
    if (opts.method === 'DELETE') {
      s.known.delete(token);
      for (const b of s.bags.values()) if (b.token === token && !b.gone) Object.assign(b, { gone: 'today', blob: null, token: null });
      return reply(200, { deleted: true });
    }
    if (body && body.consent) me.consent = body.consent;
    return reply(200, { number: me.number, cohort: me.cohort, consent: me.consent });
  }
  if (path === '/api/me/token') {
    if (!me) return reply(401, { detail: 'join again' });
    const t = `tok_${s.name}_${String(++s.n).padStart(20, 'y')}`;
    s.known.delete(token);
    s.known.set(t, me);
    for (const b of s.bags.values()) if (b.token === token) b.token = t;
    return reply(200, { token: t });
  }
  if (path === '/api/me/merge') {
    if (!me) return reply(401, { detail: 'join again' });
    const other = s.known.get(body.other);
    if (other) s.known.delete(body.other);
    return reply(200, { kept: 'this', number: me.number, cohort: me.cohort });
  }
  if (path === '/api/events') {
    if (!me) return reply(401, { detail: 'join again' });
    for (const e of body.events) s.events.push({ ...e, token });
    return reply(200, { saved: body.events.length });
  }
  if (path === '/api/ask') {
    s.asks = (s.asks || 0) + 1;
    return reply(200, { id: s.asks, text: 'an answer', source: 'rules' });
  }
  if (path === '/api/bag/get') {
    const b = s.bags.get(pepper(s, body.f));
    if (!b) return reply(404, { detail: 'none' });
    if (b.gone) return reply(410, { gone: b.gone });
    if (body.etag === b.etag) return reply(304);
    return reply(200, { etag: b.etag, blob: b.blob });
  }
  if (path === '/api/bag/put') {
    if (!me) return reply(401, { detail: 'join again' });
    if (!(me.consent && /c$/.test(me.consent.version))) return reply(403, { detail: 'consent' });
    assert.match(body.blob, BLOB);
    const id = pepper(s, body.f);
    const b = s.bags.get(id);
    if (b && b.gone) return reply(410, { gone: b.gone });
    if (b && b.w !== sha(body.w)) return reply(403, { detail: 'wrong w' });
    if (body.if === 'new' ? !!b : b && b.etag !== body.if) return reply(412, { etag: b.etag });
    const etag = String(++s.e).padStart(16, '0');
    s.bags.set(id, { w: sha(body.w), etag, blob: body.blob, token, gone: null });
    for (const [k, o] of s.bags) if (k !== id && o.token === token && !o.gone) Object.assign(o, { gone: 'today', blob: null, token: null });
    s.puts = (s.puts || 0) + 1;
    return reply(200, { etag });
  }
  if (path === '/api/bag/delete') {
    if (!me) return reply(401, { detail: 'join again' });
    const b = s.bags.get(pepper(s, body.f));
    if (b && b.w !== sha(body.w)) return reply(403, { detail: 'wrong w' });
    if (b) Object.assign(b, { gone: 'today', blob: null, token: null });
    return reply(204, {});
  }
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const events = await import('../js/events.js');
const account = await import('../js/account.js');
const outbox = await import('../js/outbox.js');
const bagsync = await import('../js/bagsync.js');
const B = await import('../js/bag.js');
account.start();

// a phone: its own storage, and the app started again on it
async function phone(name) {
  await reach();
  phones[name] ||= new Map();
  store = phones[name];
  state.reload();
  account.reset();
  events.reset();
  outbox.reset();
  bagsync.reset();
  state.lockAll();
}
async function reach(...up) {
  for (const s of SERVERS) s.up = up.includes(s);
  await hub.connect();
  if (up.length) { await account.sync(); await bagsync.syncAll({ force: true }); await events.flush(); }
}
const agreed = (s) => ({ kind: 'guardian-on-phone', version: s.consent, at: '2026-10-17T09:41', sent: false });

beforeEach(async () => {
  now = realNow();
  for (const k of Object.keys(phones)) delete phones[k];
  for (const s of SERVERS) Object.assign(s, { known: new Map(), bags: new Map(), seen: [], bodies: [], events: [], puts: 0, asks: 0 });
  await phone('a');
});

// a learner at the hub with her class code and her grown-up's yes to the c text, and her bag
async function madeAtHub() {
  await reach(HUB);
  const c = state.addChild({ year: 3, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(c.id, HUB.consent);
  const code = await bagsync.make(c.id);
  await reach(HUB);
  return { id: c.id, code };
}

function nothingSecretSent(code, k) {
  for (const s of SERVERS) {
    for (const b of s.bodies) {
      for (const secret of [code, k.k, k.f, k.w]) assert.ok(!b.includes(secret), `${s.name} was sent a secret`);
    }
    for (const t of s.seen) assert.ok(t.startsWith(`tok_${s.name}_`), `${s.name} got ${t}`);
  }
}

test('a bag made at the hub reaches a new phone: found, "Is this you?", and she arrives locked, with her seat', async () => {
  const { id, code } = await madeAtHub();
  state.setActive(id);
  state.markDone('maths-3-add', 2);
  state.updateChild(id, { lock: { salt: 's', hash: 'h' } });
  state.addAsk({ q: 'why?', at: now, lang: 'prs', queued: true });
  now += 31e3;
  await reach(HUB);
  assert.equal(HUB.bags.size, 1);
  const a = state.byId(id);
  // a new phone, at the hub: the 16 digits typed
  await phone('b');
  await reach(HUB);
  const found = await bagsync.lookUp(code);
  assert.ok(found.bag, found.why);
  const sum = bagsync.summary(found.bag);
  assert.deepEqual([sum.picture, sum.year, sum.lessons, sum.number, sum.lock], [a.picture, 3, 1, a.number, true]);
  const l = await bagsync.restore(found, code);
  assert.equal(l.token, a.token);                                   // the same seat: her events stay hers
  assert.deepEqual(l.done['maths-3-add'].stars, 2);
  assert.ok(l.lock && !state.isUnlocked(l.id));                     // arrives locked: her PIN once
  assert.deepEqual(l.bag, a.bag);
  assert.equal(l.asks.length, 1);
  assert.equal(state.mine(l.asks[0]), false);                       // queued on the other phone: it sends it
  assert.deepEqual(outbox.waiting(l).filter((w) => w === 'wait_question'), []);
  nothingSecretSent(code, a.bag);
});

test('Just for today on a borrowed phone: nothing of hers reaches its storage, Done pushes her bag, and the owner is back', async () => {
  const { id, code } = await madeAtHub();
  state.setActive(id);
  state.markDone('maths-3-add', 2);
  now += 31e3;
  await reach(HUB);
  // the borrowed phone has its owner's learner
  await phone('c');
  await reach(HUB);
  const owner = state.addChild({ year: 5, lang: 'ps' });
  const found = await bagsync.lookUp(code);
  const before = JSON.stringify([...store].sort());
  state.startToday();
  const l = await bagsync.restore(found, code);
  assert.deepEqual(state.learners().map((x) => x.id), [l.id]);        // only her, and only in memory
  assert.ok(state.justToday() && l.lock === null && l.done['maths-3-add'].stars === 2);
  state.markDone('maths-3-sub', 3);
  state.addAsk({ q: 'today?', at: now, lang: 'prs', queued: true });
  await reach(HUB);
  now += 31e3;
  assert.equal(await bagsync.syncLearner(l.id, { force: true }), 'saved');   // Done
  assert.equal(JSON.stringify([...store].sort()), before);           // nothing reached this phone's storage
  assert.ok(HUB.events.some((e) => e.verb === 'lesson.done'));        // her events went with her token
  state.reload();                                                     // the app opened again
  assert.ok(!state.justToday());
  assert.deepEqual(state.learners().map((x) => x.id), [owner.id]);
  // her own phone: today's lesson and question came home
  await phone('a');
  await reach(HUB);
  assert.equal(state.byId(id).done['maths-3-sub'].stars, 3);
  assert.ok(state.byId(id).asks.some((a) => a.q === 'today?'));
});

test('two phones learn apart and meet through the hub and online: nothing lost, higher stars, newest plan, each question sent once', async () => {
  const { id, code } = await madeAtHub();
  state.setActive(id);
  const a0 = state.byId(id);
  await phone('b');
  await reach(HUB);
  const l = await bagsync.restore(await bagsync.lookUp(code), code);
  // apart: phone b offline, then phone a online
  await reach();
  state.setActive(l.id);
  state.markDone('maths-3-add', 3);
  state.updateChild(l.id, { plan: { label: 'b plan', lessons: ['dari-1-sheen'] } });
  outbox.queue({ id: null, q: 'from b', at: now, lang: 'prs' });
  now += 60e3;
  await phone('a');
  state.setActive(id);
  state.markDone('maths-3-add', 1);
  state.markDone('science-3-plants', 2);
  now += 60e3;
  state.updateChild(id, { plan: { label: 'a plan, newer', lessons: ['science-3-plants'] } });
  await reach(ONLINE);
  account.agree(id, ONLINE.consent);
  await reach(ONLINE);
  assert.ok(state.byId(id).seats[ONLINE.id].token.startsWith('tok_online_'));
  assert.equal(ONLINE.bags.size, 1);
  await reach(HUB);                                                  // a carries online's seat and work to the hub
  // b meets the hub: everything merges
  await phone('b');
  await reach(HUB);
  await outbox.flush();
  let b = state.byId(l.id);
  assert.deepEqual(Object.keys(b.done).sort(), ['maths-3-add', 'science-3-plants']);
  assert.equal(b.done['maths-3-add'].stars, 3);                     // the higher
  assert.equal(b.plan.label, 'a plan, newer');                      // the newest stamp
  assert.ok(b.seats[ONLINE.id] && b.seats[ONLINE.id].token.startsWith('tok_online_'));   // online's seat came with it
  await reach(HUB);
  // a again: b's question came, and is b's to send; a sends none of it
  await phone('a');
  await reach(HUB);
  const asks = state.byId(id).asks;
  assert.deepEqual(asks.map((x) => x.q), ['from b']);
  const sentBefore = HUB.asks;
  await outbox.flush();
  assert.equal(HUB.asks, sentBefore);
  assert.equal(HUB.asks, 1);                                        // sent once, by b
  // both phones end with the same record
  const ra = B.pack(state.byId(id));
  await phone('b');
  await reach(HUB);
  b = state.byId(l.id);
  const rb = B.pack(b);
  for (const part of ['done', 'plan', 'asks']) assert.deepEqual(ra[part] ?? ra.s[part], rb[part] ?? rb.s[part], part);
  nothingSecretSent(code, a0.bag);
});

test('two phones push at once: the second gets 412, pulls, merges and pushes, and the bag holds both', async () => {
  const { id, code } = await madeAtHub();
  await phone('b');
  await reach(HUB);
  const l = await bagsync.restore(await bagsync.lookUp(code), code);
  state.setActive(l.id);
  state.markDone('dari-1-sheen', 3);
  await phone('a');
  state.setActive(id);
  state.markDone('maths-3-add', 2);
  await reach(HUB);                               // a writes first
  await phone('b');
  await reach(HUB);                               // b's etag is stale: 412, pull, merge, push
  const k = state.byId(l.id).bag;
  const got = await bagsync.lookUp(code);
  assert.deepEqual(Object.keys(got.bag.done).sort(), ['dari-1-sheen', 'maths-3-add']);
  assert.ok(HUB.puts >= 3);
  nothingSecretSent(code, k);
});

test('"Stop sharing" on one phone stops the bag; the other phone keeps what it has, says so, and does not join again', async () => {
  const { id, code } = await madeAtHub();
  await phone('b');
  await reach(HUB);
  const l = await bagsync.restore(await bagsync.lookUp(code), code);
  state.markDone('maths-3-add', 2);
  await phone('a');
  await reach(HUB);
  account.stopSharing(id);
  await reach(HUB);
  assert.equal(state.byId(id).bag, undefined);                      // this phone forgets the old code
  assert.ok([...HUB.bags.values()].every((b) => b.gone));
  await phone('b');
  const joinsBefore = HUB.n;
  await reach(HUB);
  await outbox.flush();
  assert.ok(bagsync.stopped(l.id));
  assert.equal(bagsync.status(l.id).gone !== null, true);
  assert.equal(HUB.n, joinsBefore);                                 // no new learner made on the hub
  assert.equal(state.byId(l.id).done['maths-3-add'].stars, 2);      // she keeps what she has
});

test('"Make a new code": the old bag stops everywhere it meets, every seat gets a new token, and the new code brings the other phone back', async () => {
  const { id, code } = await madeAtHub();
  await phone('b');
  await reach(HUB);
  const l = await bagsync.restore(await bagsync.lookUp(code), code);
  const oldToken = l.token;
  await phone('a');
  await reach(HUB);
  const fresh = await bagsync.newCode(id);
  assert.notEqual(fresh, code);
  await reach(HUB);
  const a = state.byId(id);
  assert.notEqual(a.token, oldToken);                               // a new token; the old one died on the server
  assert.ok(!HUB.known.has(oldToken) && HUB.known.has(a.token));
  assert.ok((a.dead || []).includes(oldToken));
  assert.equal((await bagsync.lookUp(code)).why, 'gone');            // the old code: stopped
  assert.ok((await bagsync.lookUp(fresh)).bag);
  // the other phone: stopped, and it does not join again on its own
  await phone('b');
  const n = HUB.n;
  await reach(HUB);
  await outbox.flush();
  assert.ok(bagsync.stopped(l.id));
  assert.equal(HUB.n, n);
  // its new code typed: her record and her new token come back
  const found = await bagsync.lookUp(fresh);
  await bagsync.mergeInto(l.id, found, fresh);
  await reach(HUB);
  assert.equal(bagsync.stopped(l.id), false);
  assert.equal(state.byId(l.id).token, a.token);
  assert.deepEqual(state.byId(l.id).bag, a.bag);
});

test('removing her: "From this phone only" sends nothing; "Everywhere" deletes her records and her bag', async () => {
  const { id, code } = await madeAtHub();
  const bodies = HUB.bodies.length;
  account.remove(id, { here: true });
  await reach(HUB);
  assert.equal(state.byId(id), null);
  assert.ok(!HUB.bodies.slice(bodies).some((b) => b.includes('tok_')) && HUB.known.size === 1);
  assert.ok((await bagsync.lookUp(code)).bag);                       // her bag and seat live on
  // on another phone, everywhere
  await phone('b');
  await reach(HUB);
  const l = await bagsync.restore(await bagsync.lookUp(code), code);
  account.remove(l.id);
  await reach(HUB);
  assert.equal(HUB.known.size, 0);
  assert.equal((await bagsync.lookUp(code)).why, 'gone');
});

test('"This is also me": two learners on one phone become one, her tokens fold on the server, and a stand-in picture is local', async () => {
  const { id, code } = await madeAtHub();
  // a second phone where she started fresh before she found her card
  await phone('b');
  await reach(HUB);
  const fresh = state.addChild({ year: 3, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(fresh.id, HUB.consent);
  await reach(HUB);
  state.setActive(fresh.id);
  state.markDone('dari-1-sheen', 1);
  const found = await bagsync.lookUp(code);
  state.updateChild(fresh.id, { picture: bagsync.summary(found.bag).picture });     // the same picture as hers
  const restored = await bagsync.restore(found, code);
  assert.equal(restored.picture, state.byId(fresh.id).picture);
  assert.ok(restored.stand && restored.stand !== restored.picture);                  // a stand-in, on this phone only
  assert.equal(state.pictureOf(restored), restored.stand);
  await bagsync.fold(fresh.id, restored.id);
  const one = state.byId(fresh.id);
  assert.equal(state.learners().length, 1);
  assert.deepEqual(one.bag.code, code);
  assert.ok(one.seats[HUB.id].also && one.seats[HUB.id].also.length === 1);
  await reach(HUB);
  assert.equal(state.byId(fresh.id).seats[HUB.id].also, undefined);   // folded: one learner on the server
  assert.equal(HUB.known.size, 1);
  // the stand-in never travels
  const l = state.byId(fresh.id);
  assert.ok(!('stand' in B.pack(l).s));
});

test('online on mobile data a push waits 30 minutes after the last; the hub has no limit; a bag of a newer app is never written', async () => {
  const { id, code } = await madeAtHub();
  await reach(ONLINE);
  account.agree(id, ONLINE.consent);
  await reach(ONLINE);
  const puts = ONLINE.puts;
  state.setActive(id);
  state.markDone('maths-3-add', 1);
  await bagsync.syncAll();                        // a change, moments after the last push: it waits
  assert.equal(ONLINE.puts, puts);
  assert.equal(bagsync.status(id).online, 'waiting');
  assert.equal(bagsync.status(id).hub, 'saved');
  now += 31 * 60e3;
  await bagsync.syncAll();
  assert.equal(ONLINE.puts, puts + 1);
  // a newer app's bag (v 2): read and kept, never written over
  const k = state.byId(id).bag;
  const newer = { ...B.pack(state.byId(id)), v: 2, more: { x: 1 } };
  const rk = B.forRelay(k, ONLINE.id);
  const row = ONLINE.bags.get(pepper(ONLINE, rk.f));
  row.blob = bagsync.b64(await B.seal(newer, k));
  row.etag = 'ffffffffffffffff';
  now += 31 * 60e3;
  state.markDone('science-3-plants', 1);
  const before = ONLINE.puts;
  await bagsync.syncAll({ force: true });
  assert.equal(ONLINE.puts, before);
  assert.ok(bagsync.status(id).newer);
  assert.deepEqual(state.byId(id).bagx.more, { x: 1 });
  nothingSecretSent(code, k);
});
