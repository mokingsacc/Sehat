// Joining and the server's record of each learner (app/js/account.js): a class code joins at once, consent or not;
// without one she joins when her grown-up agrees; a consent given later, a new year, "Stop sharing" and removing a
// learner reach the server when it is in reach. Nothing sent is a name.
// Run with: node --test app/tests/*.test.js   (no browser; fetch is a stand-in server)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1' };

// a stand-in server: one class with code K7QM4PRT for years 7 to 12, and its own cohort for everyone else
const calls = [];
const known = new Map();         // token -> record
let up = false;
let n = 26;
globalThis.fetch = async (url, opts = {}) => {
  if (!up) throw new TypeError('network down');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const path = url.replace(/\?.*$/, '');
  const body = opts.body ? JSON.parse(opts.body) : null;
  const token = (opts.headers || {})['X-Learner-Token'];
  if (path.endsWith('/api/hello')) return reply(200, { hub: 'Qalam', consent: 'hub-2026-10', modules: [] });
  calls.push([opts.method || 'GET', path, body, token || null]);
  if (path.endsWith('/api/join')) {
    if (body.cohort_code && body.cohort_code !== 'K7QM4PRT') return reply(404, { detail: 'no class has this code' });
    if (body.cohort_code && !['s1', 's2'].includes(body.band)) return reply(422, { detail: 'not for this year' });
    const t = `tok_${String(++n).padStart(24, 'x')}`;
    const cohort = body.cohort_code ? { id: 'class-7b', label: 'Class 7B' } : { id: 'hub', label: 'Hub' };
    known.set(t, { ...body, cohort });
    return reply(200, { token: t, number: n, picture: body.picture, cohort });
  }
  if (path.endsWith('/api/me')) {
    if (!known.has(token)) return reply(401, { detail: 'join again' });
    if (opts.method === 'DELETE') { known.delete(token); return reply(200, { deleted: true }); }
    Object.assign(known.get(token), body);
    return reply(200, {});
  }
  if (path.endsWith('/api/events')) return reply(known.has(token) ? 200 : 401, {});
  return reply(404, {});
};

const hub = await import('../js/hub.js');
const state = await import('../js/state.js');
const account = await import('../js/account.js');
account.start();

const said = [];
account.onNote((k) => said.push(k));

// a learner who came with the class card and answered the consent screen ("Not now" here)
function carded(year, code = 'K7QM4PRT') {
  const c = state.addChild({ year, lang: 'prs', code });
  return state.updateChild(c.id, { asked: true });
}

async function online() { up = true; await hub.connect(); await account.sync(); }
async function offline() { up = false; await hub.connect(); }

beforeEach(async () => {
  await offline();
  store.clear();
  state.reload();
  account.reset();
  calls.length = 0;
  said.length = 0;
  known.clear();
});

test('a class code is checked for its shape the way the server makes it', () => {
  assert.equal(account.normalCode('k7qm 4prt'), 'K7QM4PRT');
  assert.equal(account.normalCode('K7QM-4PRT'), 'K7QM4PRT');
  assert.equal(account.normalCode('K7QM-4PR0'), null);          // no 0, O, 1, I or L on a card
  assert.equal(account.normalCode('short'), null);
  assert.equal(account.showCode('K7QM4PRT'), 'K7QM-4PRT');
});

test('with a class code she joins when the server is in reach, consent or not; the number comes back', async () => {
  const c = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT' });
  assert.equal(account.needsJoin(state.byId(c.id)), false);    // the consent screen comes first
  state.updateChild(c.id, { asked: true });
  assert.equal(account.needsJoin(state.byId(c.id)), true);           // "waiting to connect"
  await online();
  const [[method, path, body]] = calls;
  assert.deepEqual([method, path], ['POST', '/api/join']);
  assert.deepEqual(Object.keys(body).sort(), ['band', 'cohort_code', 'lang', 'picture']);
  const l = state.byId(c.id);
  assert.deepEqual([l.number, l.cohort.id, l.consent, account.needsJoin(l)], [27, 'class-7b', null, false]);
});

test('without a code nothing is sent until the grown-up agrees; then she joins with the consent record', async () => {
  const c = state.addChild({ year: 2, lang: 'prs' });
  await online();
  assert.deepEqual(calls, []);
  account.agree(c.id, hub.consentVersion());
  await account.sync();
  const [, , body] = calls.find(([, p]) => p === '/api/join');
  assert.equal(body.consent.kind, 'guardian-on-phone');
  assert.equal(body.consent.version, 'hub-2026-10');
  assert.match(body.consent.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.deepEqual(Object.keys(body.consent).sort(), ['at', 'kind', 'version']);
  assert.equal(state.byId(c.id).consent.sent, true);
});

test('an adult agrees for herself', async () => {
  const c = state.addChild({ band: 'ad', track: 'reader', lang: 'en' });
  account.agree(c.id, 'hub-2026-10');
  assert.equal(state.byId(c.id).consent.kind, 'self');
});

test('a code the server does not know is dropped with a word to her, and she learns on', async () => {
  const c = carded(8, 'ABCD2345');
  await online();
  assert.deepEqual(said, ['code_not_found']);
  assert.equal(state.byId(c.id).code, null);
  assert.equal(state.byId(c.id).token, null);
  const d = carded(2);                                         // a class for years 7 to 12
  await account.sync();
  assert.deepEqual(said, ['code_not_found', 'code_wrong_class']);
  assert.equal(state.byId(d.id).code, null);
});

test('consent given after joining, and a new year, go to /api/me', async () => {
  const c = carded(8);
  await online();
  const token = state.byId(c.id).token;
  account.agree(c.id, 'hub-2026-10');
  await account.sync();
  state.updateChild(c.id, { year: 11, band: null });
  await account.sync();
  const mine = calls.filter(([, p]) => p === '/api/me').map(([m, , b, t]) => [m, Object.keys(b)[0], t]);
  assert.deepEqual(mine, [['POST', 'consent', token], ['POST', 'band', token]]);
  assert.equal(known.get(token).band, 's2');
});

test('"Stop sharing" deletes her server record, now or once the server is back, and she stays on the phone', async () => {
  const c = carded(8);
  await online();
  const token = state.byId(c.id).token;
  await offline();
  account.stopSharing(c.id);
  const l = state.byId(c.id);
  assert.deepEqual([l.consent, l.token, l.number, l.code], [null, null, null, null]);
  assert.deepEqual(state.toForget(), [token]);
  await online();
  assert.ok(calls.some(([m, p, , t]) => m === 'DELETE' && p === '/api/me' && t === token));
  assert.equal(known.has(token), false);
  assert.deepEqual(state.toForget(), []);
  assert.ok(state.byId(c.id));
});

test('a token the server forgot is replaced by joining again', async () => {
  const c = carded(8);
  await online();
  const first = state.byId(c.id).token;
  known.clear();                                                  // a year away: the server deleted her
  state.updateChild(c.id, { year: 10, band: null });             // a new band to send finds out
  await account.sync();
  const l = state.byId(c.id);
  assert.ok(l.token && l.token !== first);
  assert.equal(l.cohort.id, 'class-7b');
});

test('nothing a learner sends is a name', async () => {
  const c = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT', name: 'Maryam' });
  state.updateChild(c.id, { nickname: 'Mari', name: 'Maryam' });
  account.agree(c.id, 'hub-2026-10');
  await online();
  const sent = JSON.stringify(calls);
  assert.ok(!sent.includes('Maryam') && !sent.includes('Mari'));
});

test('the sign-up order: a class code goes to consent, then the lock offer; never a lock for early years', async () => {
  const signup = await import('../js/screens/signup.js');
  state.addChild({ year: 3, lang: 'prs' });
  assert.equal(signup.next(), '#/home');                              // no card: she learns at once
  const c = state.addChild({ year: 8, lang: 'prs', code: 'K7QM4PRT' });
  assert.equal(signup.next(), '#/consent/home');
  signup.markNotNow(c.id);
  assert.equal(signup.next(), '#/lock/offer/home');                   // "Not now" still offers the lock
  assert.equal(signup.next('consent', 'ask'), '#/lock/offer/ask');
  state.updateChild(c.id, { lockOffered: true });
  assert.equal(signup.next('consent'), '#/home');
  const ey = state.addChild({ year: 0, lang: 'prs', code: 'K7QM4PRT' });
  account.agree(ey.id, 'hub-2026-10');
  assert.equal(signup.next('consent'), '#/home');
});

test("the website's doors (WEBSITE.md 2.2): ?year=, ?track= and ?lang= are read, anything else is no door", async () => {
  const { door } = await import('../js/screens/signup.js');
  assert.deepEqual(door('?year=3&lang=ps'), { lang: 'ps', learner: { year: 3 } });
  assert.deepEqual(door('?year=0'), { lang: null, learner: { year: 0 } });
  assert.deepEqual(door('?track=reader&lang=en'), { lang: 'en', learner: { band: 'ad', track: 'reader' } });
  assert.deepEqual(door('?lang=en'), { lang: 'en', learner: null });
  for (const bad of ['', '?site', '?year=13', '?year=-1', '?year=3.5', '?year=03x', '?track=teacher', '?lang=fr', '?join=K7QM4PRT'])
    assert.equal(door(bad), null, bad);
});
