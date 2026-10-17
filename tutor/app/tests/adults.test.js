// Adult tracks on the phone (P26, C4.3; 7c, C4.11): which adult packs each track sees, Home's track rows, the switch
// card after the literacy pathway, and the goal chips' door.
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
const lessons = await import('../js/modules/lessons.js');
const plan = await import('../js/modules/plan.js');
const state = await import('../js/state.js');

const L = (id, subject, order = 1) => ({ id, year: 0, subject, order, title: { prs: id, en: id }, unit: null, steps: 4, sheet: true });
const PACKS = [
  { id: 'starter', lessons: [L('maths-7-fractions-add', 'maths')].map((l) => ({ ...l, year: 7 })) },
  { id: 'adult-literacy-1', audience: 'adult', tracks: ['literacy', 'reader'], lessons: [L('ad-dari-1', 'dari', 1), L('ad-dari-2', 'dari', 2)] },
  { id: 'adult-maths-1', audience: 'adult', tracks: ['literacy', 'reader'], lessons: [L('ad-money', 'maths')] },
  { id: 'english-adult-1', audience: 'adult', lessons: [L('ad-hello', 'english')] },            // reader track only
];
const GRAPHS = [{ subject: 'dari', version: '1', nodes: [{ id: 'w', needs: [], lessons: ['ad-dari-1', 'ad-dari-2'], title: { en: 'Words' } }],
  pathways: [{ id: 'ad-read-dari', goal: ['w'], bands: ['ad'], final: 'ad-dari-2', certificate: true, title: { en: 'Read and write' } }] }];
const MODS = [{ id: 'lessons', slots: ['home.action'], needs: [] }, { id: 'plan', bands: ['s1', 's2', 'ad'], slots: ['home.action'], needs: [] }];

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
  c = state.addChild({ band: 'ad', track: 'literacy', lang: 'prs' });
});
const me = () => state.byId(c.id);

test('the literacy track sees reading and everyday maths; the reader track every adult pack; children none', () => {
  assert.deepEqual(['dari', 'maths', 'english'].map((s) => library.mine(me(), s).length), [2, 1, 0]);
  const reader = { ...me(), track: 'reader' };
  assert.deepEqual(['dari', 'maths', 'english'].map((s) => library.mine(reader, s).length), [2, 1, 1]);
  assert.deepEqual(plan.bandLessons(me()).map((l) => l.id), ['ad-dari-1', 'ad-dari-2', 'ad-money']);
  assert.ok(library.hasAdultLessons(me()));
  assert.equal(library.mine({ ...me(), band: 's1', year: 7, track: null }, 'dari').length, 0);
});

test("Home's list for adults is the track rows, reading in her language first", () => {
  const rows = (child) => lessons.trackList(child).map((r) => [r.key, r.href, r.p && r.p.total]);
  assert.deepEqual(rows(me()), [['track_read', '#/subject/dari', 2], ['track_maths', '#/subject/maths', 1]]);
  assert.deepEqual(rows({ ...me(), track: 'reader' }).map((r) => r[0]), ['track_read', 'track_maths', 'english']);
  assert.equal(rows({ ...me(), lang: 'ps' }).length, 1);                 // Pashto reading: no Pashto lessons here
});

test('after the literacy pathway, the switch card asks once', () => {
  const reg = { offers: [], offer(slot, o) { this.offers.push(o); } };
  lessons.register(reg);
  const card = reg.offers.find((o) => o.id === 'reader-switch');
  assert.equal(card.when(modules.context(me(), null)), false);
  state.markDone('ad-dari-2', 3);
  assert.equal(card.when(modules.context(me(), null)), true);
  state.updateChild(c.id, { readerAsked: true });
  assert.equal(card.when(modules.context(me(), null)), false);         // answered: never again
  assert.equal(card.when(modules.context({ ...me(), readerAsked: false, track: 'reader' }, null)), false);
});
