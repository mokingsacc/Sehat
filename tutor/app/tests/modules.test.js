// The module shell (app/js/modules.js): which modules are on, the tabs, the slot registry and the Home picker.
// Run with: node --test app/tests/*.test.js   (no browser; offers draw plain strings here)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// a phone's storage, before the app's modules read it
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const hub = await import('../js/hub.js');
const modules = await import('../js/modules.js');

const HUB_LIST = [
  { id: 'ask', slots: [], needs: [] }, { id: 'check', slots: ['home.action'], needs: [] },
  { id: 'lessons', slots: ['home.action'], needs: [] },
  { id: 'print', slots: ['home.action', 'lesson.end'], needs: ['printer'] }, { id: 'teacher', slots: [], needs: ['pin'] },
];
const without = (id) => HUB_LIST.filter((m) => m.id !== id);

// stand-ins for app/js/modules/*.js, offering what the real ones offer
const CODE = {
  lessons: { register(shell) {
    shell.offer('home.action', { id: 'next', role: 'primary', priority: 10, when: (c) => !!c.lesson, render: () => 'play' });
    shell.offer('home.action', { id: 'subjects', role: 'list', priority: 10, when: (c) => !!c.lesson, render: () => 'subjects' });
  } },
  print: { register(shell) {
    shell.offer('home.action', { id: 'print-today', role: 'secondary', priority: 10,
      when: (c) => c.look === 'bold' && c.band !== 'ey' && !!c.lesson.sheet, render: () => 'print today' });
    shell.offer('lesson.end', { id: 'worksheet', priority: 10, when: (c) => !!c.lesson.sheet, render: () => 'worksheet' });
  } },
  check: { register(shell) {
    shell.offer('home.action', { id: 'check-sheet', role: 'secondary', priority: 10, when: (c) => c.look === 'clean',
      render: () => 'check my sheet' });
  } },
};
const imported = [];
const importer = async (id) => { imported.push(id); if (!CODE[id]) throw new Error('no file'); return CODE[id]; };

const small = { lesson: { id: 'maths-1-count-5', sheet: true }, look: 'bold', band: 'p1' };
const big = { lesson: { id: 'maths-7-fractions-add', sheet: true }, look: 'clean', band: 's1' };
const keys = (t) => t.map((x) => x.key);

beforeEach(() => { modules.reset(); imported.length = 0; store.clear(); });

test('without word from a hub the app has the built-in five, as it always had', () => {
  modules.sync(null);
  assert.deepEqual(modules.enabledIds(), ['ask', 'check', 'lessons', 'print', 'teacher']);
  assert.deepEqual(keys(modules.tabs()), ['lessons', 'ask', 'print']);
});

test('the list kept on the phone is used while the hub is out of reach', () => {
  assert.equal(hub.online(), false);
  assert.equal(hub.moduleList(), null);
  localStorage.setItem('qalam.cache.modules', JSON.stringify(without('print')));
  modules.sync();
  assert.deepEqual(modules.enabledIds(), ['ask', 'check', 'lessons', 'teacher']);
});

test('a module switched off loses its tab and its screens; sync says when the list changed', () => {
  assert.equal(modules.sync(HUB_LIST), false);              // the same five as the built-in list
  assert.equal(modules.sync(without('print')), true);
  assert.equal(modules.sync(without('print')), false);
  assert.deepEqual(keys(modules.tabs()), ['lessons', 'ask']);
  assert.equal(modules.routeOn('print'), false);
  assert.equal(modules.routeOn('check'), true);
  assert.equal(modules.routeOn(''), true);                  // Home and Who is learning belong to the shell
  assert.equal(modules.routeOn('who'), true);
  modules.sync(without('lessons'));
  assert.equal(modules.routeOn('lesson'), false);
});

test('only modules that are on and have app code are imported, once each', async () => {
  modules.sync(without('check'));
  await modules.load(importer);
  await modules.load(importer);
  assert.deepEqual(imported.sort(), ['lessons', 'print']);  // not ask or teacher (no slots), not check (off)
});

test('a module whose code fails to load is left out; the others still show', async () => {
  modules.sync([...HUB_LIST, { id: 'broken', slots: ['home.action'], needs: [] }]);
  const warn = console.warn;
  console.warn = () => {};
  try { await modules.load(importer); } finally { console.warn = warn; }
  assert.ok(imported.includes('broken'));
  assert.equal(modules.home(small).primary, 'play');
});

test('Home shows one primary, one secondary and one list, by look', async () => {
  modules.sync(HUB_LIST);
  await modules.load(importer);
  assert.deepEqual(modules.home(small), { primary: 'play', secondary: 'print today', list: 'subjects' });
  assert.deepEqual(modules.home(big), { primary: 'play', secondary: 'check my sheet', list: 'subjects' });
});

test('with print off, "print today\'s sheet" goes and nothing else changes', async () => {
  modules.sync(HUB_LIST);
  await modules.load(importer);
  const before = modules.home(small);
  modules.sync(without('print'));
  assert.deepEqual(modules.home(small), { ...before, secondary: null });
  assert.deepEqual(modules.home(big), { primary: 'play', secondary: 'check my sheet', list: 'subjects' });
  assert.deepEqual(modules.lessonEnd(small), []);
});

test('the best offer wins its place; a broken when() is skipped', () => {
  modules.sync([{ id: 'aaa', slots: ['home.action'] }, { id: 'bbb', slots: ['home.action'] }]);
  return modules.load(async (id) => ({ register(shell) {
    shell.offer('home.action', { id: `${id}-1`, role: 'secondary', priority: id === 'aaa' ? 1 : 5, render: () => id });
    shell.offer('home.action', { id: `${id}-2`, role: 'list', when: () => { throw new Error('x'); }, render: () => 'never' });
  } })).then(() => {
    assert.deepEqual(modules.home(small), { primary: null, secondary: 'bbb', list: null });
  });
});

test('the end of a lesson takes two actions at most', async () => {
  modules.sync([{ id: 'many', slots: ['lesson.end'] }]);
  await modules.load(async () => ({ register(shell) {
    for (const k of [1, 2, 3]) shell.offer('lesson.end', { id: `a${k}`, priority: k, render: () => `a${k}` });
  } }));
  assert.deepEqual(modules.lessonEnd(small), ['a3', 'a2']);
});

test('modules can only use the shell\'s slots and roles', async () => {
  let shell;
  modules.sync([{ id: 'pushy', slots: ['home.action'] }]);
  await modules.load(async () => ({ register(sh) { shell = sh; } }));
  assert.throws(() => shell.offer('home.tile', { id: 'x', render: () => 'x' }), /no slot home\.tile/);
  assert.throws(() => shell.offer('home.action', { id: 'x', role: 'banner', render: () => 'x' }), /role must be/);
  assert.throws(() => shell.offer('home.action', { id: 'x', role: 'primary' }), /bad offer/);
});

test('a module that needs the internet is hidden while the hub is out of reach', () => {
  modules.sync([...HUB_LIST, { id: 'photo', slots: [], needs: ['internet'] }]);
  assert.equal(hub.online(), false);
  assert.equal(modules.on('photo'), false);
  assert.equal(modules.on('lessons'), true);
});
