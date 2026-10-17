// "I want to learn this" on the phone (app/js/modules/plan.js, P22): who sees Home's row, the chips, the phone's own
// search, her plan and what counts as done, the lesson a marked sheet adds again, and what the phone keeps.
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
const library = await import('../js/library.js');
const modules = await import('../js/modules.js');
const plan = await import('../js/modules/plan.js');
const state = await import('../js/state.js');

const L = (id, year, subject, title, unit, order = 1) => ({ id, year, subject, order, title: { prs: title, en: title },
  unit: unit ? { prs: unit, en: unit } : null, steps: 4 });
const PACKS = [
  { id: 'starter', lessons: [
    L('maths-7-what-fractions', 7, 'maths', 'کسر چیست', 'کسرها', 1),
    L('maths-7-fractions-add', 7, 'maths', 'جمع کسرها', 'کسرها', 2),
    L('maths-7-whole', 7, 'maths', 'عددهای تام', 'عددها', 3),
    L('science-7-states-of-matter', 7, 'science', 'سه حالت ماده', 'ماده', 4),
    L('maths-1-count-5', 1, 'maths', 'شمردن تا ۵', 'عددها', 1),
    L('maths-10-algebra', 10, 'maths', 'الجبر', 'الجبر', 1)] },
  { id: 'adults', audience: 'adult', lessons: [L('ad-money', 0, 'maths', 'پول در بازار', 'پول', 1)] },
];
const PLAN = { id: 'plan', bands: ['s1', 's2', 'ad'], slots: ['home.action'], needs: [] };
const LESSONS = { id: 'lessons', slots: ['home.action'], needs: [] };

let c;
beforeEach(async () => {
  store.clear();
  store.set('qalam.cache.packs', JSON.stringify(PACKS));
  state.reload();
  await library.load(true);
  modules.reset();
  modules.sync([LESSONS, PLAN]);
  i18n.setLang('prs');
  c = state.addChild({ year: 7, lang: 'prs' });
});

const me = () => state.byId(c.id);

test('Home shows the row in s1, s2 and to adults, while the module is on, and nothing else uses it', () => {
  const foot = (child) => modules.homeFooter(modules.context(child, null));
  assert.deepEqual(foot(me()), { href: '#/plan', key: 'plan_row' });
  assert.ok(plan.canPlan(me()) && !plan.chipsOnly(me()));
  for (const [band, track, year] of [['p2', null, 5], ['ey', null, 0]]) {
    const x = { ...me(), band, track, year };
    assert.equal(foot(x), null, band + track);
    assert.equal(plan.canPlan(x), false);
  }
  assert.ok(foot({ ...me(), band: 'ad', track: 'reader', year: null }));
  // adult literacy since 7c (C4.11): the row opens the goal chips, not the box
  const lit = { ...me(), band: 'ad', track: 'literacy', year: null };
  assert.ok(foot(lit) && plan.canPlan(lit) && plan.chipsOnly(lit));
  modules.sync([LESSONS]);                                        // the module off (or the kill switch)
  assert.equal(foot(me()), null);
  assert.equal(modules.routeOn('plan'), false);
  assert.ok(!modules.SLOTS.includes('home.footer'));             // not a slot
});

test('the chips are the unit names of her band, and a chip gives that unit as a plan', () => {
  assert.deepEqual(plan.units(me()), ['کسرها', 'عددها', 'ماده']);
  assert.deepEqual(plan.unitPlan(me(), 'کسرها'),
    { kind: 'plan', label: 'کسرها', lessons: ['maths-7-what-fractions', 'maths-7-fractions-add'] });
  assert.deepEqual(plan.units({ ...me(), band: 'ad', track: 'reader', year: null }), ['پول']);
  assert.deepEqual(plan.units({ ...me(), band: 's2', year: 10 }), ['الجبر']);
});

test('offline, her words find a plan, the closest lessons or nothing, spelt any way', () => {
  const r = plan.localSearch(me(), 'جمع كسر');                    // Arabic kaf, as some keyboards type it
  assert.equal(r.kind, 'plan');
  assert.deepEqual(r.lessons, ['maths-7-what-fractions', 'maths-7-fractions-add']);
  assert.equal(r.label, 'کسرها');
  assert.deepEqual(plan.localSearch(me(), 'حالت آب یخ بخار'), { kind: 'closest', lessons: ['science-7-states-of-matter'] });
  assert.deepEqual(plan.localSearch(me(), 'ستاره‌ها'), { kind: 'miss' });
  assert.deepEqual(plan.localSearch(me(), 'شمردن'), { kind: 'miss' });   // a year 1 lesson is not in her band
  assert.deepEqual(plan.localSearch(me(), ''), { kind: 'miss' });
});

test('her plan: where she is, the next lesson, what the school day takes, and stopping it', () => {
  assert.equal(plan.where(me()), null);
  assert.ok(plan.start(me(), 'کسرها', ['maths-7-what-fractions', 'maths-7-fractions-add', 'no-such-lesson']));
  let w = plan.where(me());
  assert.deepEqual([w.label, w.total, w.done, w.n, w.next.id], ['کسرها', 2, 0, 1, 'maths-7-what-fractions']);
  state.setActive(c.id);
  state.markDone('maths-7-what-fractions', 3);
  w = plan.where(me());
  assert.deepEqual([w.done, w.n, w.next.id], [1, 2, 'maths-7-fractions-add']);
  assert.deepEqual(plan.left(me()).map((l) => l.id), ['maths-7-fractions-add']);
  state.markDone('maths-7-fractions-add', 2);
  assert.equal(plan.where(me()).next, null);
  plan.stop(me());
  assert.equal(me().plan, undefined);
  assert.equal(plan.start(me(), 'x', ['no-such-lesson']), false);
});

test('a marked sheet with wrong items puts its lesson in her plan until she does it again', () => {
  state.setActive(c.id);
  state.markDone('maths-7-fractions-add', 1);
  const t = Date.now();
  assert.ok(plan.addAgain(me(), 'maths-7-fractions-add', t));
  let w = plan.where(me());
  assert.deepEqual([w.label, w.next.id], ['کسرها', 'maths-7-fractions-add']);      // done before, so again
  const again = me().plan.again['maths-7-fractions-add'];
  assert.ok(plan.addAgain(me(), 'maths-7-fractions-add', t + 5));                   // once, not twice
  assert.equal(me().plan.again['maths-7-fractions-add'], again);
  state.updateChild(c.id, { done: { 'maths-7-fractions-add': { stars: 3, at: t + 10 } } });
  assert.equal(plan.where(me()).next, null);                                       // done again after it was added
  plan.start(me(), 'ماده', ['science-7-states-of-matter']);
  assert.ok(plan.addAgain(me(), 'maths-7-fractions-add', t + 20));                 // joins the running plan
  assert.deepEqual(me().plan.lessons, ['science-7-states-of-matter', 'maths-7-fractions-add']);
  assert.equal(plan.addAgain({ ...me(), band: 'p2', year: 5 }, 'maths-7-fractions-add'), false);   // not her band's
});

test('the phone keeps only a label, lesson ids and when, and at most five goals waiting to send', () => {
  state.updateChild(c.id, { plan: { label: 'x'.repeat(80), lessons: ['ok-1', 'Bad Id', 'ok-1', 5], again: { 'ok-1': 3, z: 4 },
    goal: 'my words' } });
  assert.deepEqual(me().plan, { label: 'x'.repeat(60), lessons: ['ok-1'], again: { 'ok-1': 3 } });
  state.updateChild(c.id, { wishes: Array.from({ length: 7 }, (_, i) => ({ q: 'stars ' + i, lang: 'en', at: i, token: 'no' })) });
  assert.equal(me().wishes.length, 5);
  assert.deepEqual(Object.keys(me().wishes[0]).sort(), ['at', 'lang', 'q']);
  state.updateChild(c.id, { wishes: [], plan: null });
  assert.equal(me().wishes, undefined);
  assert.equal(me().plan, undefined);
});
