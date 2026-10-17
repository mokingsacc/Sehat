// Contests on the phone (P31, DESIGN-C6-SPECS.md C6.5 and C6.6; app/js/modules/contest.js and screens/contest.js):
// who sees them, what the phone keeps (at most 50, each checked), the window's phases, the one Home shows, her best
// in a subject, the run's time, marking her kept answers against the key as the hub marks, a certificate's path, the
// consent screen's way back, and the run drawing no hint, no why and no "Check my answer".
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

let listed = [];
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push([opts.method || 'GET', String(url)]);
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (String(url).includes('/api/hello')) return reply(200, { hub: 'Qalam', modules: [] });
  if (String(url).includes('/api/m/contest?')) return reply(200, { contests: listed });
  return reply(404, {});
};

const cal = await import('../js/calendar.js');
const hub = await import('../js/hub.js');
const i18n = await import('../js/i18n.js');
const modules = await import('../js/modules.js');
const C = await import('../js/modules/contest.js');
const screen = await import('../js/screens/contest.js');
const signup = await import('../js/screens/signup.js');
const state = await import('../js/state.js');

const MODS = [{ id: 'lessons', slots: ['home.action'], needs: [] },
  { id: 'contest', bands: ['p1', 'p2', 's1', 's2', 'ad'], slots: ['home.action'], needs: [] }];
const HOUR = 3600e3;
const at = (t) => new Date(t).toISOString().slice(0, 16);
const NOW = Date.UTC(2027, 9, 25, 9);
const X = (id, opens, closes, extra = {}) => ({ id, title: { prs: 'مسابقه', ps: 'سیالي', en: 'Maths week 3' }, subject: 'maths',
  opens_at: at(opens), closes_at: at(closes), minutes: 20, n: 5, certificate: true, phase: 'open', mine: null, ...extra });

let c;
beforeEach(() => {
  store.clear();
  calls.length = 0;
  listed = [];
  state.reload();
  modules.reset();
  modules.sync(MODS);
  i18n.setLang('en');
  c = state.addChild({ band: 's1', lang: 'en' });
});
const me = () => state.byId(c.id);

test('contests show where the module is on, for every band but early years', () => {
  assert.ok(C.canContest(me()));
  assert.equal(C.canContest({ ...me(), band: 'ey' }), false);
  modules.sync(MODS.filter((m) => m.id !== 'contest'));
  assert.equal(C.canContest(me()), false);
});

test('the phone keeps at most 50 contests, each checked, and nothing else of them', () => {
  const ok = { id: 'maths-week-3', subject: 'maths', joined: NOW, closes: at(NOW + HOUR), answers: [1, '۱/۲', null, 'x'.repeat(41), 12, true] };
  state.updateChild(c.id, { contests: [ok, { ...ok, id: 'Bad Id' }, { ...ok, id: 'no-joined', joined: 'soon' },
    { ...ok, id: 'maths-week-4', n: 5, right: 4, percent: 80, at: NOW, place: 1, score: 99 },
    { ...ok, id: 'maths-week-5', n: 5, right: 6, percent: 120, at: NOW }] });
  state.reload();
  const kept = me().contests;
  assert.deepEqual(kept.map((x) => x.id), ['maths-week-3', 'maths-week-4', 'maths-week-5']);
  assert.deepEqual(kept[0].answers, [1, '۱/۲', null, null, null, null]);         // a choice 0-9, a short text, or nothing
  assert.deepEqual(Object.keys(kept[1]).sort(), ['answers', 'at', 'closes', 'id', 'joined', 'n', 'percent', 'right', 'subject']);
  assert.ok(!('percent' in kept[2]));                                            // a result that cannot be is dropped
  const many = Array.from({ length: 60 }, (_, i) => ({ ...ok, id: `c-${i}` }));
  state.updateChild(c.id, { contests: many });
  state.reload();
  assert.equal(me().contests.length, 50);
  assert.equal(me().contests[0].id, 'c-10');
});

test('a window is soon a week before, open, late for 10 minutes after the close, then closed', () => {
  const x = X('a', NOW, NOW + 2 * HOUR);
  assert.equal(C.phase(x, NOW - 8 * 24 * HOUR), 'later');
  assert.equal(C.phase(x, NOW - HOUR), 'soon');
  assert.equal(C.phase(x, NOW), 'open');
  assert.equal(C.phase(x, NOW + 2 * HOUR + 5 * 60e3), 'late');
  assert.equal(C.phase(x, NOW + 2 * HOUR + 11 * 60e3), 'closed');
});

test('Home shows one contest: an open one before a soon one, never one she sent', async () => {
  hub.setCohort(null);
  await hub.connect();
  state.updateChild(c.id, { token: 'tok_' + 'a'.repeat(28) });
  const now = Date.now();
  listed = [X('soon-one', now + HOUR, now + 3 * HOUR), X('open-one', now - HOUR, now + HOUR), X('sent-one', now - HOUR, now + HOUR, { mine: { percent: 40 } })];
  await C.refresh(me(), true);
  assert.ok(calls.some(([m, u]) => m === 'GET' && u.includes('/api/m/contest?lang=en')));
  assert.equal(C.next(me()).id, 'open-one');
  C.keep(me(), 'open-one', { subject: 'maths', joined: now, closes: at(now + HOUR), answers: [], n: 5, right: 3, percent: 60, at: now });
  assert.equal(C.next(me()).id, 'soon-one');
  assert.deepEqual(C.known(me(), 'science'), []);
  assert.deepEqual(C.known(me(), 'maths').map((x) => x.id).sort(), ['open-one', 'sent-one', 'soon-one']);
});

test('her best in a subject is her highest percent, as "a of b"', () => {
  state.updateChild(c.id, { contests: [
    { id: 'm1', subject: 'maths', joined: NOW, closes: at(NOW), answers: [], n: 10, right: 7, percent: 70, at: NOW },
    { id: 'm2', subject: 'maths', joined: NOW, closes: at(NOW), answers: [], n: 5, right: 4, percent: 80, at: NOW },
    { id: 's1', subject: 'science', joined: NOW, closes: at(NOW), answers: [] }] });
  assert.deepEqual(C.best(me(), 'maths'), { right: 4, n: 5 });
  assert.equal(C.best(me(), 'science'), null);
  assert.equal(i18n.s('contest_best', { s: i18n.s('maths'), a: 4, b: 5 }), 'Your best in Maths: 4 of 5');
  i18n.setLang('prs');
  assert.equal(i18n.s('contest_result', { a: 7, b: 10 }), '۷ از ۱۰ درست');                  // her digits
});

test('her time is her start plus the minutes, never after the close', () => {
  const x = X('a', NOW, NOW + HOUR);
  assert.equal(screen.deadline({ joined: NOW }, x), NOW + 20 * 60e3);
  assert.equal(screen.deadline({ joined: NOW + 50 * 60e3 }, x), NOW + HOUR);
});

test('her kept answers are marked against the key as the hub marks them', () => {
  const choice = { kind: 'choice', options: ['a', 'b', 'c'] };
  const number = { kind: 'number' };
  assert.ok(screen.rightFor(choice, 1, { answer: 1 }));
  assert.ok(!screen.rightFor(choice, '1', { answer: 1 }));
  assert.ok(screen.rightFor(number, '2/4', { answer: '1/2' }));                 // an unsimplified fraction counts
  assert.ok(screen.rightFor(number, '۱/۲', { answer: '1/2' }));                  // Persian digits
  assert.ok(screen.rightFor(number, '1 1/2', { answer: '3/2' }));
  assert.ok(!screen.rightFor(number, '10+5', { answer: '15' }));
  assert.ok(!screen.rightFor(number, null, { answer: '15' }));
});

test("a contest's certificate path is kept, and consent comes back to the contest or its certificate", () => {
  state.updateChild(c.id, { certs: [{ path: 'contest:maths-week-3', id: 'QC-ABCDE-FGHJK', month: '2027-10' },
    { path: 'contest:Bad', id: 'QC-ABCDE-FGHJK', month: '2027-10' }] });
  state.reload();
  assert.deepEqual(me().certs.map((x) => x.path), ['contest:maths-week-3']);
  assert.equal(signup.thenHash('contest.maths-week-3'), '#/contest/maths-week-3');
  assert.equal(signup.thenHash('cert.contest:maths-week-3'), '#/cert/contest:maths-week-3');
  assert.equal(signup.thenHash('contest.<b>'), '#/home');
});

test('a window shows in her calendar and digits', () => {
  const d = new Date(2027, 9, 25, 8, 0);                     // the phone's own day: 3 Aqrab 1406
  assert.equal(cal.moment(at(d.getTime()), 'en'), '3 Aqrab, 08:00');
  assert.equal(cal.moment(at(d.getTime()), 'prs'), '۳ عقرب، ۰۸:۰۰');
  assert.equal(cal.moment('not a time', 'en'), '');
});

test('the run draws no hint, no why and no "Check my answer", and Send asks with the focus on Cancel', () => {
  const src = readFileSync(new URL('../js/screens/contest.js', import.meta.url), 'utf8');
  const run = src.slice(src.indexOf('function runScreen'), src.indexOf('function answersScreen'));
  assert.ok(run.length > 1000);
  for (const word of ['.why', 'hint', 'check_answer', 'feedback(']) assert.ok(!run.includes(word), word);
  assert.match(run, /confirmSheet\(s\('contest_send_q'\), s\('contest_send'\), s\('cancel'\), \{ safe: true \}\)/);
  assert.match(run, /'data-silent': ''/);                    // the countdown is never read aloud
});

test('a phone that starts with contests kept loads them (the store is read as state.js loads)', async () => {
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'x', learners: [{ id: 'x', band: 's1', year: 7, lang: 'en',
    contests: [{ id: 'maths-week-3', subject: 'maths', joined: NOW, closes: at(NOW), answers: [1] }] }] }));
  const fresh = await import('../js/state.js?fresh=contests');
  assert.equal(fresh.child().id, 'x');
  assert.deepEqual(fresh.child().contests.map((x) => x.id), ['maths-week-3']);
});
