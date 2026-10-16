// The module shell. The hub says which modules are on for this phone's cohort (/api/hello, kept on the phone for
// offline use); only those modules' code is loaded, by import() from this app's own folder, and only their offers
// show. The shell, not a module, keeps every screen sparse (design committee C0.1):
// - tabs: at most three, owned here: Lessons, Ask, and Print on the hub or Sheets online (C2, change 6: the third tab
//   belongs to `sheets`, and says Print where the hub's `print` queue is on), each shown only while its module is on;
// - Home: one primary action, one secondary action and one list, picked from the modules' `home.action` offers;
// - the end of a lesson: at most two `lesson.end` actions;
// - `settings.row`: offers kept for the Settings screen (P10).
// An offer is { id, role, priority, when(ctx), render(ctx) }: role is primary, secondary or list on Home; the
// highest priority whose when(ctx) is true wins its place. ctx (context()) is { child, lesson, band, look, tone,
// track }: look is bold or clean, tone child or adult (bands.js).
// A module with app code (any slot in its manifest) lives in app/js/modules/<id>.js and exports register(shell).

import { attrs } from './bands.js';
import * as hub from './hub.js';

export const SLOTS = ['home.action', 'lesson.end', 'settings.row'];
const APP_SLOTS = new Set([...SLOTS, 'teacher.panel', 'admin.panel']);
const ROLES = ['primary', 'secondary', 'list'];
const LESSON_END_MAX = 2;
const ID = /^[a-z][a-z0-9]{1,23}$/;

// what the app always had, for a hub from before modules or a first start away from the hub
export const BUILT_IN = [
  { id: 'ask', slots: [], needs: [] },
  { id: 'check', slots: ['home.action'], needs: [] },
  { id: 'lessons', slots: ['home.action'], needs: [] },
  { id: 'print', slots: [], needs: ['printer'] },
  { id: 'sheets', slots: ['home.action', 'lesson.end'], needs: [] },
  { id: 'teacher', slots: [], needs: ['pin'] },
];

// the tabs, in order, and the module each one belongs to; the third says Print where the hub prints
const TABS = [
  { module: 'lessons', key: 'lessons', icon: 'book', href: '#/home' },
  { module: 'ask', key: 'ask', icon: 'ask', href: '#/ask' },
  { module: 'sheets', key: () => (printer() ? 'print' : 'sheets'), icon: () => (printer() ? 'printer' : 'file'),
    href: '#/print' },
];
// screens that belong to a module (#/name/...); every other screen belongs to the shell
const ROUTES = { ask: 'ask', print: 'sheets', check: 'check', photo: 'photo', teacher: 'teacher', lesson: 'lessons',
  subject: 'lessons' };

let list = BUILT_IN;
const offers = new Map(SLOTS.map((s) => [s, []]));
const loaded = new Map();          // module id -> the import() promise, so each module loads once

// Take the hub's (or the cached) list. Returns true when the set of modules that are on changed.
export function sync(fromHub = hub.moduleList()) {
  const next = Array.isArray(fromHub) ? fromHub.filter((m) => m && typeof m.id === 'string') : BUILT_IN;
  const before = enabledIds().join();
  list = next;
  return enabledIds().join() !== before;
}

function entry(id) { return list.find((m) => m.id === id) || null; }

// a module is on when the hub lists it; one that needs the internet is hidden while the hub is out of reach
export function on(id) {
  const m = entry(id);
  if (!m) return false;
  return !((m.needs || []).includes('internet') && !hub.online());
}

export function enabledIds() { return list.map((m) => m.id).filter(on).sort(); }

// the hub's print queue is on: sheets go to its printer; otherwise the browser prints them (or saves a PDF)
export const printer = () => on('print');

export const tabs = () => TABS.filter((t) => on(t.module)).map((t) => ({ ...t,
  key: typeof t.key === 'function' ? t.key() : t.key, icon: typeof t.icon === 'function' ? t.icon() : t.icon }));

// the hub lists the module for this phone, whether or not it can show now (a module that needs the internet is
// listed while the phone is offline, so a screen can say "Photos need the internet" rather than nothing)
export const listed = (id) => !!entry(id);

export function routeOn(name) { return !ROUTES[name] || on(ROUTES[name]); }

// what a module's register(shell) receives: it can only add offers to the shell's slots
function shellFor(module) {
  return {
    offer(slot, o) {
      if (!offers.has(slot)) throw new Error(`${module}: no slot ${slot}`);
      if (!o || typeof o.id !== 'string' || typeof o.render !== 'function') throw new Error(`${module}: bad offer`);
      if (slot === 'home.action' && !ROLES.includes(o.role)) throw new Error(`${module}: role must be ${ROLES.join(', ')}`);
      const mine = offers.get(slot).filter((x) => !(x.module === module && x.id === o.id));
      offers.set(slot, [...mine, { priority: 0, when: () => true, ...o, module }]);
    },
  };
}

// load the code of every module that is on and has some; a module that fails to load is left out
export async function load(importer = (id) => import(`./modules/${id}.js`)) {
  const todo = list.filter((m) => on(m.id) && ID.test(m.id) && (m.slots || []).some((s) => APP_SLOTS.has(s)));
  await Promise.all(todo.map((m) => {
    if (!loaded.has(m.id)) {
      loaded.set(m.id, Promise.resolve()
        .then(() => importer(m.id))
        .then((code) => code.register(shellFor(m.id)))
        .catch((e) => { loaded.delete(m.id); console.warn(`module ${m.id} not loaded`, e); }));
    }
    return loaded.get(m.id);
  }));
}

// the offers in a slot whose module is on and which want to show now, best first
export function pick(slot, ctx) {
  return (offers.get(slot) || [])
    .filter((o) => on(o.module))
    .filter((o) => { try { return !!o.when(ctx); } catch { return false; } })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function draw(o, ctx) {
  try { return o.render(ctx); } catch (e) { console.warn(`offer ${o.module}/${o.id}`, e); return null; }
}

// what offers decide by: the learner, the lesson in question, and her band's look and tone
export function context(child, lesson) {
  const a = attrs(child);
  return { child, lesson, band: a.band, look: a.look, tone: a.tone, track: child ? child.track : null };
}

// Home: one primary, one secondary and one list, each drawn, or null
export function home(ctx) {
  const all = pick('home.action', ctx);
  const out = {};
  for (const role of ROLES) {
    const o = all.find((x) => x.role === role);
    out[role] = o ? draw(o, ctx) : null;
  }
  return out;
}

// the end of a lesson: at most two actions, drawn
export function lessonEnd(ctx) {
  return pick('lesson.end', ctx).slice(0, LESSON_END_MAX).map((o) => draw(o, ctx)).filter(Boolean);
}

// for tests: forget every offer and loaded module
export function reset() {
  list = BUILT_IN;
  for (const s of SLOTS) offers.set(s, []);
  loaded.clear();
}
