// The skills graph and spaced review on the phone (app/js/graph.js, app/js/modules/recall.js, P25a, C4.1): mastery,
// plans over the graph with "Learn first", pathways, one plan at a time, the finished plan, the warm-up's items and
// boxes, and what the phone keeps.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
// a learner with a plan, stored before the app starts: state.js must read her back (P22's plan was lost on reload)
store.set('qalam.v2', JSON.stringify({ v: 2, active: 'a', forget: [], learners: [{ id: 'a', band: 's1', year: 7,
  picture: 'key', plan: { label: 'x', lessons: ['maths-7-fractions-add'], path: 's1-fractions' }, marks: { 'maths-7-fractions-add': 90 },
  recall: { 'maths-7-fractions-add:5': [2, 100] } }] }));

const state = await import('../js/state.js');
const first = state.learner();
const i18n = await import('../js/i18n.js');
const library = await import('../js/library.js');
const modules = await import('../js/modules.js');
const graph = await import('../js/graph.js');
const plan = await import('../js/modules/plan.js');
const recall = await import('../js/modules/recall.js');
const events = await import('../js/events.js');

const L = (id, year, subject, title, sheet = true, order = 1) => ({ id, year, subject, order, title: { prs: title, en: title },
  unit: null, steps: 4, sheet });
const PACKS = [{ id: 'starter', lessons: [
  L('maths-7-what-fractions', 7, 'maths', 'What fractions are', true, 1),
  L('maths-7-fractions-add', 7, 'maths', 'Adding fractions', true, 2),
  L('maths-7-halves', 7, 'maths', 'Halves', false, 3),
  L('maths-1-count-5', 1, 'maths', 'Count to 5', true, 1),
  L('quran-7-fatiha', 7, 'quran', 'Al-Fatiha', false, 1)] }];
const node = (id, needs, lessons, en) => ({ id, needs, lessons, title: { prs: en, en } });
const GRAPHS = [{ subject: 'maths', version: '1', draft: true,
  nodes: [node('count-5', [], ['maths-1-count-5'], 'Count to 5'), node('halves', [], ['maths-7-halves'], 'Halves'),
    node('frac-what', ['halves'], ['maths-7-what-fractions'], 'What a fraction is'),
    node('frac-add', ['frac-what'], ['maths-7-fractions-add'], 'Add fractions together')],
  pathways: [{ id: 's1-fractions', goal: ['frac-add'], bands: ['s1'], title: { prs: 'Fractions', en: 'Fractions' },
    final: 'maths-7-fractions-add', certificate: true }] }];
const MODS = [{ id: 'lessons', slots: ['home.action'], needs: [] }, { id: 'plan', bands: ['s1', 's2', 'ad'], slots: ['home.action'], needs: [] },
  { id: 'recall', bands: ['p1', 'p2', 's1', 's2', 'ad'], slots: [], needs: [] }];
const step = (kind, extra = {}) => ({ kind, prompt: 'q', ...(kind === 'choice' ? { options: ['a', 'b'], answer: 0 } : { answer: '3' }), ...extra });

let c;
beforeEach(async () => {
  store.clear();
  store.set('qalam.cache.packs', JSON.stringify(PACKS));
  store.set('qalam.cache.graphs', JSON.stringify(GRAPHS));
  state.reload();
  await library.load(true);
  modules.reset();
  modules.sync(MODS);
  i18n.setLang('en');
  c = state.addChild({ year: 7, lang: 'en' });
});
const me = () => state.byId(c.id);
const mine = () => plan.bandLessons(me());

test('a learner stored with a plan, marks and review items is read back at start', () => {
  assert.equal(first && first.id, 'a');
  assert.deepEqual(first.plan, { label: 'x', lessons: ['maths-7-fractions-add'], again: {}, path: 's1-fractions' });
  assert.deepEqual(first.marks, { 'maths-7-fractions-add': 90 });
  assert.deepEqual(first.recall, { 'maths-7-fractions-add:5': [2, 100] });
});

test('mastered: the latest sheet at 80% or more; a lesson without a sheet, finished', () => {
  const add = library.get('maths-7-fractions-add');
  assert.equal(graph.mastered(me(), add), false);
  state.setMark('maths-7-fractions-add', 80);
  assert.equal(graph.mastered(me(), add), true);
  state.setMark('maths-7-fractions-add', 60);                         // her latest counts, not her best
  assert.equal(graph.mastered(me(), add), false);
  state.markDone('maths-7-fractions-add', 3);
  assert.equal(graph.mastered(me(), add), false);                     // finishing is not enough where there is a sheet
  state.markDone('maths-7-halves', 3);
  assert.equal(graph.mastered(me(), library.get('maths-7-halves')), true);
});

test('a plan over the graph puts what she has not mastered first, prerequisites first, and tags it', () => {
  let x = graph.expand(me(), ['maths-7-fractions-add'], mine());
  assert.deepEqual(x.lessons, ['maths-7-halves', 'maths-7-what-fractions', 'maths-7-fractions-add']);
  assert.deepEqual([...x.first], ['maths-7-halves', 'maths-7-what-fractions']);
  state.setMark('maths-7-what-fractions', 100);
  x = graph.expand(me(), ['maths-7-fractions-add'], mine());
  assert.deepEqual(x.lessons, ['maths-7-halves', 'maths-7-fractions-add']);
  // a lesson in no node plans as before, and another band's lesson never joins
  assert.deepEqual(graph.expand(me(), ['quran-7-fatiha'], mine()).lessons, ['quran-7-fatiha']);
  assert.ok(!graph.expand(me(), ['maths-7-fractions-add'], mine()).lessons.includes('maths-1-count-5'));
});

test('the phone finds a node by its title, and pathways run as plans with their id', () => {
  assert.deepEqual(plan.localSearch(me(), 'together', 'en'),
    { kind: 'plan', label: 'Add fractions together', lessons: ['maths-7-fractions-add'] });
  const [p] = graph.pathways(me(), mine(), 'maths');
  assert.equal(p.p.id, 's1-fractions');
  assert.deepEqual(graph.pathways({ ...me(), band: 'p1' }, mine()), []);
  const pp = graph.pathwayPlan(me(), p, mine());
  assert.equal(pp.path, 's1-fractions');
  assert.deepEqual(pp.lessons, ['maths-7-halves', 'maths-7-what-fractions', 'maths-7-fractions-add']);
  plan.start(me(), pp.label, pp.lessons, pp.path);
  assert.equal(me().plan.path, 's1-fractions');
});

test('one plan at a time: another plan with a lesson left asks first, and Cancel keeps the old one', async () => {
  plan.start(me(), 'Fractions', ['maths-7-fractions-add']);
  const asked = [];
  const no = async (text) => { asked.push(text); return false; };
  assert.equal(await plan.begin(me(), 'Halves', ['maths-7-halves'], null, no), false);
  assert.deepEqual(asked, ['Stop “Fractions” and start “Halves”?']);
  assert.equal(me().plan.label, 'Fractions');
  assert.equal(await plan.begin(me(), 'Halves', ['maths-7-halves'], null, async () => true), true);
  assert.equal(me().plan.label, 'Halves');
  plan.start(me(), 'Fractions', ['maths-7-fractions-add']);
  assert.equal(await plan.begin(me(), 'Fractions', ['maths-7-fractions-add'], null, no), true);   // the same: no question
  state.markDone('maths-7-fractions-add', 3);
  assert.equal(await plan.begin(me(), 'Halves', ['maths-7-halves'], null, no), true);            // nothing left: none
  assert.equal(asked.length, 1);
  assert.equal(me().plan.label, 'Halves');
});

test('a finished plan says Done once on Home, then clears', () => {
  plan.start(me(), 'Halves', ['maths-7-halves']);
  const reg = { offer: (slot, o) => (reg.o = o) };
  plan.register(reg);
  assert.equal(reg.o.when(modules.context(me(), null)), true);
  state.markDone('maths-7-halves', 3);
  assert.equal(reg.o.when(modules.context(me(), null)), true);         // done: the card says so
  assert.equal(me().plan, undefined);                                   // and the plan has cleared
  assert.deepEqual(plan.lastFinished(me()), { label: 'Halves', path: null });
});

test('a finished lesson adds its marked steps, else its last two questions; none from Quran, none in ey', () => {
  const L1 = { id: 'maths-7-fractions-add', subject: 'maths', steps: [step('read'), step('choice'), step('number'), step('choice')] };
  assert.deepEqual(recall.itemsOf(L1), [3, 4]);
  L1.steps[1].recall = true;
  assert.deepEqual(recall.itemsOf(L1), [2]);
  assert.deepEqual(recall.itemsOf({ id: 'quran-7-fatiha', subject: 'quran', steps: [step('choice')] }), []);
  const now = Date.UTC(2027, 2, 1, 10);
  assert.equal(recall.add(me(), L1, now), 1);
  assert.deepEqual(me().recall, { 'maths-7-fractions-add:2': [1, recall.today(now) + 1] });
  assert.equal(recall.add({ ...me(), band: 'ey' }, L1, now), 0);
  modules.sync(MODS.filter((m) => m.id !== 'recall'));
  assert.equal(recall.canRecall(me()), false);                          // the module off
});

test('due items play lowest box first, then oldest, three at most, only with their lesson on the phone', () => {
  const now = Date.UTC(2027, 2, 10, 10);
  const d = recall.today(now);
  store.set('qalam.cache.lesson.maths-7-what-fractions', JSON.stringify({ id: 'maths-7-what-fractions', steps: [step('choice'), step('number')] }));
  state.updateChild(c.id, { recall: { 'maths-7-what-fractions:1': [3, d - 5], 'maths-7-what-fractions:2': [1, d],
    'maths-7-halves:1': [1, d - 9], 'maths-7-fractions-add:4': [1, d - 9], 'maths-7-what-fractions:9': [0, d - 99] } });
  const due = recall.due(me(), 'maths-7-fractions-add', now);
  assert.deepEqual(due.map((x) => x.key), ['maths-7-what-fractions:2', 'maths-7-what-fractions:1']);   // halves: not cached
  assert.equal(due[0].step.kind, 'number');
  assert.deepEqual(recall.due(me(), 'x', now - 86400000).map((x) => x.key), ['maths-7-what-fractions:1']);
});

test('right moves an item up a box, wrong back to box 1, right in box 5 retires it; the event needs consent', () => {
  const now = Date.UTC(2027, 2, 10, 10);
  const d = recall.today(now);
  state.updateChild(c.id, { recall: { 'maths-7-halves:1': [1, d] } });
  assert.deepEqual(recall.answer(me(), 'maths-7-halves:1', true, now), [2, d + 3]);
  assert.deepEqual(recall.answer(me(), 'maths-7-halves:1', true, now), [3, d + 7]);
  assert.deepEqual(recall.answer(me(), 'maths-7-halves:1', false, now), [1, d + 1]);
  state.updateChild(c.id, { recall: { 'maths-7-halves:1': [5, d] } });
  assert.deepEqual(recall.answer(me(), 'maths-7-halves:1', true, now), [0, d]);
  assert.equal(recall.add(me(), { id: 'maths-7-halves', subject: 'maths', steps: [step('choice')] }, now), 0);   // retired stays
  assert.equal(events.pending(c.id).length, 0);                         // no consent: no event queued
  state.updateChild(c.id, { consent: { kind: 'self', version: 'v1' } });
  recall.answer(me(), 'maths-7-halves:1', false, now);
  assert.deepEqual(events.pending(c.id).map((e) => [e.verb, e.object, e.value]), [['recall.item', 'maths-7-halves:1', 0]]);
});

test('the phone keeps at most 300 review items, retired ones dropped first, and nothing malformed', () => {
  const r = { 'bad key': [1, 1], 'maths-7-halves:1': [9, 1], 'maths-7-halves:2': ['1', 1] };
  for (let k = 0; k < 290; k += 1) r[`maths-7-a${k}:1`] = [2, 1000 + k];
  for (let k = 0; k < 20; k += 1) r[`maths-7-r${k}:1`] = [0, 10];
  state.updateChild(c.id, { recall: r });
  const kept = Object.keys(me().recall);
  assert.equal(kept.length, state.RECALL_MAX);
  assert.equal(kept.filter((k) => k.includes('-r')).length, 10);
  assert.ok(!kept.includes('bad key') && !kept.includes('maths-7-halves:1') && !kept.includes('maths-7-halves:2'));
});
