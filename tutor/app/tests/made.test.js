// Her own questions on the phone (P32, C4.8; app/js/modules/made.js): who may make them, what typing refuses (a web
// address, an email, seven digits, "my name is"), what the phone keeps (at most 50, each part at most 300 characters,
// no other field), how they join her warm-ups when she marks herself, and the lesson-end offer.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const i18n = await import('../js/i18n.js');
const modules = await import('../js/modules.js');
const made = await import('../js/modules/made.js');
const state = await import('../js/state.js');

const MODS = [{ id: 'lessons', slots: ['home.action'], needs: [] }, { id: 'teacher', slots: [], needs: [] },
  { id: 'made', bands: ['s1', 's2', 'ad'], slots: ['lesson.end'], needs: [] }];
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 17, 9);

let c;
beforeEach(() => {
  store.clear();
  state.reload();
  modules.reset();
  modules.sync(MODS);
  i18n.setLang('en');
  c = state.addChild({ band: 's1', lang: 'prs' });
});
const me = () => state.byId(c.id);

test('s1, s2 and adult readers where the module is on; sending needs the teacher and her token', () => {
  assert.ok(made.canMake(me()));
  assert.equal(made.canMake({ ...me(), band: 'p2' }), false);
  assert.equal(made.canMake({ ...me(), band: 'ad', track: 'literacy' }), false);
  assert.ok(made.canMake({ ...me(), band: 'ad', track: 'reader' }));
  assert.equal(made.canSend(me()), false);                          // not joined: no token
  assert.ok(made.canSend({ ...me(), token: 'abc' }));
  modules.sync(MODS.filter((m) => m.id !== 'teacher'));
  assert.equal(made.canSend({ ...me(), token: 'abc' }), false);
  modules.sync(MODS.filter((m) => m.id !== 'made'));
  assert.equal(made.canMake(me()), false);
});

test('typing a web address, an email, seven digits or "my name is" stops Save', () => {
  for (const t of ['see www.example.com', 'https://x.org', 'khanacademy.org', 'a@b.co', 'call 0791234567',
    '۰۷۹۱ ۲۳۴ ۵۶۷', 'My name is Laila', 'نام من لیلا است', 'زما نوم ګلالۍ دی']) assert.ok(made.identifierIn(t), t);
  for (const t of ['What is 3/4 of 12?', '12 ÷ 4 = 3', 'The year 1402', 'name the three parts', 'کتاب را بخوان'])
    assert.equal(made.identifierIn(t), false, t);
});

test('the phone keeps at most 50, each part at most 300 characters, and nothing else', () => {
  const x = made.add(me(), { q: '  What is 1/2 of 10? ', a: '5', why: '', lesson: 'm7-fractions' }, NOW);
  assert.match(x.id, /^[a-z0-9]{8}$/);
  assert.deepEqual(me().made[0], { id: x.id, q: 'What is 1/2 of 10?', a: '5', why: '', lang: 'prs', lesson: 'm7-fractions',
    at: Math.floor(NOW / DAY), due: Math.floor(NOW / DAY) + 1 });
  state.updateChild(c.id, { made: [...me().made, { id: 'zzzzzz1', q: 'q'.repeat(400), a: 'a', name: 'Laila', sent: 7,
    status: 'change', chips: ['spelling', 'rude'], reply: 'Look again' }, { id: 'BAD', q: 'q', a: 'a' },
  { id: 'nooanswer', q: 'q', a: ' ' }] });
  state.reload();
  const [, y, ...rest] = me().made;
  assert.equal(rest.length, 0);
  assert.equal(y.q.length, 300);
  assert.equal(y.name, undefined);
  assert.deepEqual([y.sent, y.status, y.chips, y.reply], [7, 'change', ['spelling'], 'Look again']);
  state.updateChild(c.id, { made: Array.from({ length: 60 }, (_, i) => ({ id: 'item' + String(i).padStart(4, '0'), q: 'q', a: 'a' })) });
  state.reload();
  assert.equal(me().made.length, state.MADE_MAX);
  assert.equal(made.add(me(), { q: 'one more', a: 'no' }, NOW), null);
  made.remove(me(), 'item0059');
  assert.equal(me().made.length, 49);
});

test('they join her warm-ups when due, never from the lesson she opens, and she marks herself', () => {
  const a = made.add(me(), { q: 'A?', a: 'a', lesson: 'l1' }, NOW);
  const b = made.add(me(), { q: 'B?', a: 'b', lesson: 'l2' }, NOW);
  assert.deepEqual(made.due(me(), 'l9', 3, NOW), []);                       // due tomorrow
  const tomorrow = NOW + DAY;
  assert.deepEqual(made.due(me(), 'l9', 3, tomorrow).map((x) => x.made.id), [a.id, b.id]);
  assert.deepEqual(made.due(me(), 'l1', 3, tomorrow).map((x) => x.made.id), [b.id]);
  assert.deepEqual(made.due(me(), 'l9', 1, tomorrow).map((x) => x.key), ['made:' + a.id]);
  assert.deepEqual(made.due(me(), 'l9', 0, tomorrow), []);
  assert.deepEqual(made.due(me(), 'l9', 3, tomorrow)[0].step, { kind: 'made', q: 'A?', a: 'a', why: '' });
  made.answer(me(), a.id, true, tomorrow);                                  // "I knew it": a week on
  made.answer(me(), b.id, false, tomorrow);                                 // "Not yet": tomorrow again
  assert.deepEqual(made.due(me(), 'l9', 3, tomorrow + DAY).map((x) => x.made.id), [b.id]);
  assert.deepEqual(made.due(me(), 'l9', 3, tomorrow + 7 * DAY).map((x) => x.made.id), [b.id, a.id]);
  modules.sync(MODS.filter((m) => m.id !== 'made'));
  assert.deepEqual(made.due(me(), 'l9', 3, tomorrow + 7 * DAY), []);       // the module off: nothing
});

test('the lesson end offers "Make a question about this lesson", never for Quran or seerah', async () => {
  await modules.load(async (id) => (id === 'made' ? made : { register() {} }));
  const ctx = (subject) => modules.context(me(), { id: 'l-' + subject, subject });
  assert.deepEqual(modules.pick('lesson.end', ctx('maths')).map((o) => o.id), ['made-question']);
  assert.deepEqual(modules.pick('lesson.end', ctx('quran')), []);
  assert.deepEqual(modules.pick('lesson.end', ctx('seerah')), []);
  assert.equal(i18n.s('made_make'), 'Make a question about this lesson');
});

test('a phone with her questions on it opens with them (the state is cleaned as the module loads)', async () => {
  store.clear();
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'l9', learners: [{ id: 'l9', band: 's1', lang: 'prs',
    made: [{ id: 'made0001', q: 'Q?', a: '9', why: '', lang: 'prs', lesson: null, at: 1, due: 2 }] }] }));
  const fresh = await import('../js/state.js?boot');                       // a new instance, as a page start is
  assert.equal(fresh.child().id, 'l9');
  assert.equal(fresh.child().made[0].q, 'Q?');
});
