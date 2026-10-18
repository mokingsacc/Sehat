// "I want to learn this" (P22; C3.5, DESIGN-C2C3-SPECS.md item 14, BUILD-PLAN 5.1 v1). Her plan lives on the phone:
// { label, lessons: [lesson ids in pack order], again: { id: when it was added again } }. One plan at a time.
// - Home: while a plan has a lesson left, it is Home's continue card ("Your plan · lesson 2 of 4", primary); the
//   school day's `auto` periods take it first (timetable.js). The row that opens #/plan is the shell's
//   (modules.homeFooter), not an offer.
// - A lesson counts as done for the plan once she finished it, or, for a lesson a marked sheet added again (item 3,
//   wrong items), once she finished it after that.
// - Bands s1, s2 and adults; adult literacy since 7c (C4.11) as a screen of goal chips read aloud (pathways), with
//   "Someone can type it for you" opening the box.
// - Offline, and for the chips, the phone matches her words against the lessons it knows (titles and units).
// Nothing about the plan is sent; a typed goal goes to the server without her token (screens/plan.js).
// Since P25a (C4.1): a plan is built over the skills graph (graph.js): what the goal needs that she has not mastered
// comes first, tagged "Learn first". A pathway runs as a plan ({..., path: id}); pathways are tapped, so they are for
// every band the plan module allows, adult literacy too (canFollow), while typing a goal stays for readers (canPlan).
// One plan at a time: starting another while one has a lesson left asks once, "Stop 'Fractions' and start 'Money'?"
// (begin). A finished plan: Home's card says once "Done: Fractions", then the plan clears.

import { getLang, pick, s } from '../i18n.js';
import * as library from '../library.js';
import { allows, on } from '../modules.js';
import * as state from '../state.js';
import * as graph from '../graph.js';
import { confirmSheet, h, icon, plain, playIcon, said, speakerBtn, titleText } from '../ui.js';
import * as certs from './cert.js';
import { speak } from '../speech.js';

export const BANDS = ['s1', 's2', 'ad'];
export const MAX = 12;
export const CHIPS = 8;
export const CHIPS_BOLD = 6;
export const CLOSEST = 3;

// she can make a plan: the module on for her band; an adult on the literacy track gets the goal chips, not the box
// (7c, C4.11: goals she hears and taps)
export const canPlan = (c) => !!c && BANDS.includes(c.band) && on('plan') && allows('plan', c.band);
export const chipsOnly = (c) => !!c && c.band === 'ad' && c.track !== 'reader';

// she can follow a plan or a pathway: the module on for her band (an adult on either track)
export const canFollow = (c) => !!c && BANDS.includes(c.band) && on('plan') && allows('plan', c.band);

// the lessons the phone knows for her band, in pack order (adults: adult packs; children: their band's years)
export function bandLessons(c) {
  return library.all().filter((l) => library.serves(c, l));           // a pack with bands too (P27a)
}

export function doneFor(c, id) {
  const d = c.done && c.done[id];
  const again = c.plan && c.plan.again && c.plan.again[id];
  return !!d && (!again || (d.at || 0) > again);
}

// where her plan is: { label, lessons, done, total, next, n } (n: the next lesson's place, from 1), or null
export function where(c) {
  const p = c && c.plan;
  if (!p || !Array.isArray(p.lessons)) return null;
  const lessons = p.lessons.map((id) => library.get(id)).filter(Boolean);
  if (!lessons.length) return null;
  const i = lessons.findIndex((l) => !doneFor(c, l.id));
  return { label: p.label || '', lessons, total: lessons.length, done: lessons.filter((l) => doneFor(c, l.id)).length,
    next: i < 0 ? null : lessons[i], n: i < 0 ? lessons.length : i + 1 };
}

// the plan's lessons not done yet, for the school day's periods (timetable.js)
export const left = (c) => { const w = where(c); return w ? w.lessons.filter((l) => !doneFor(c, l.id)) : []; };

export function start(c, label, ids, path = null) {
  const lessons = [...new Set(ids)].filter((id) => library.get(id)).slice(0, MAX);
  state.updateChild(c.id, { plan: lessons.length
    ? { label: String(label || '').slice(0, 60), lessons, again: {}, ...(path ? { path } : {}) } : null });
  return lessons.length > 0;
}

// start a plan, asking first when another one still has a lesson left (one dialog, the confirming button first)
export async function begin(c, label, ids, path = null, ask = confirmSheet) {
  const w = where(c);
  const same = w && (path ? c.plan.path === path : w.label === String(label || '').slice(0, 60));
  if (w && w.next && !same && !(await ask(s('plan_switch', { a: w.label, b: label }), s('plan_switch_yes')))) {
    return false;
  }
  return start(state.child(), label, ids, path);
}

export function stop(c) { state.updateChild(c.id, { plan: null }); }

// a marked sheet with wrong items adds its lesson to her plan, once (C2.3 item 3): a new plan named after the lesson
// when none runs. Returns true when the lesson is in her plan, waiting to be done again.
export function addAgain(c, lessonId, now = Date.now()) {
  const l = library.get(lessonId);
  if (!l || !canPlan(c)) return false;
  const p = c.plan && Array.isArray(c.plan.lessons) ? c.plan : null;
  if (p && p.lessons.includes(lessonId) && !doneFor(c, lessonId)) return true;      // already waiting
  const lessons = p ? (p.lessons.includes(lessonId) ? p.lessons : [...p.lessons, lessonId].slice(-MAX)) : [lessonId];
  const again = { ...((p && p.again) || {}), [lessonId]: now };
  state.updateChild(c.id, { plan: { label: p ? p.label : plain(l.unit || l.title), lessons, again } });
  return true;
}

// "Or pick one": the unit names of her band's lessons, up to eight (six in the bold sizes), in pack order
export function units(c, max = CHIPS) {
  const seen = new Map();
  for (const l of bandLessons(c)) {
    const name = plain(l.unit || '');
    if (name && !seen.has(name)) seen.set(name, l);
  }
  return [...seen.keys()].slice(0, max);
}

export function unitPlan(c, name) {
  const lessons = bandLessons(c).filter((l) => plain(l.unit || '') === name);
  return { kind: lessons.length ? 'plan' : 'miss', label: name, lessons: lessons.map((l) => l.id) };
}

// words for matching on the phone, spelt as Ask spells them (ی and ي, ک and ك: the same letter)
export const words = (t) => String(t || '').toLowerCase()
  .replace(/[ً-ٰٟ]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإآ]/g, 'ا').replace(/‌/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

const same = (a, b) => {
  if (a === b) return true;
  const [x, y] = a.length <= b.length ? [a, b] : [b, a];
  return x.length >= 3 && y.startsWith(x) && y.length - x.length <= 3;
};

// her goal against the titles and units the phone knows: a plan (half her words or more in a lesson's title or
// unit), the closest lessons (three at most), or a miss; as the server does, without the lessons' text
export function localSearch(c, text, lang = getLang()) {
  const want = [...new Set(words(text))];
  if (!want.length) return { kind: 'miss' };
  const ls = bandLessons(c);
  const scored = ls.map((l, i) => {
    const have = words(['prs', 'ps', 'en'].map((x) => pick(l.title, x) + ' ' + pick(l.unit || '', x)).join(' ')
      + ' ' + s(l.subject));
    const hit = want.filter((w) => have.some((x) => same(w, x))).length;
    return { l, i, share: hit / want.length };
  }).filter((x) => x.share > 0).sort((a, b) => b.share - a.share || a.i - b.i);
  const node = !scored.length || scored[0].share < 0.5 ? graph.matchNode(text, ls, words, same) : null;
  if (node) return { kind: 'plan', label: plain(node.n.title, lang), lessons: node.lessons };
  if (!scored.length) return { kind: 'miss' };
  const best = scored[0];
  if (best.share >= 0.5) {
    const unit = plain(best.l.unit || '', lang);
    const ids = new Set(scored.filter((x) => x.share >= 0.5).map((x) => x.l.id));
    if (unit) ls.filter((l) => l.subject === best.l.subject && plain(l.unit || '', lang) === unit).forEach((l) => ids.add(l.id));
    return { kind: 'plan', label: unit || plain(best.l.title, lang), lessons: ls.filter((l) => ids.has(l.id)).map((l) => l.id).slice(0, MAX) };
  }
  return { kind: 'closest', lessons: scored.slice(0, CLOSEST).map((x) => x.l.id) };
}

// a plan she finished: Home says so once ("Done: Fractions"), then the plan clears. Kept in memory until she leaves
// Home, so a redraw of Home still shows it.
const finished = new Map();
function finishedNow(c) {
  if (!c) return null;
  const w = where(c);
  if (w && !w.next) {
    finished.set(c.id, { label: w.label, path: c.plan.path || null });
    state.updateChild(c.id, { plan: null });
  }
  return finished.get(c.id) || null;
}
export const lastFinished = (c) => (c ? finished.get(c.id) || null : null);

// a finished pathway with a certificate adds "Get my certificate" (P25b), or "My certificate" once she has it
function doneCard({ child: c }) {
  const f = finished.get(c.id);
  const line = s('plan_done', { label: f.label });
  const x = f.path ? graph.findPathway(f.path) : null;
  const cert = x && certs.ready(c, x) ? said(h('a', { class: 'btn outline', href: '#/cert/' + encodeURIComponent(x.p.id) },
    icon('printer', 22), s(certs.certOf(c, x.p.id) ? 'cert_mine' : 'cert_get'))) : null;
  return h('section', { class: 'card soft continue plan-card done' + (cert ? ' with-cert' : '') },
    h('span', { class: 'done-mark', 'aria-hidden': 'true' }, icon('check', 26, 3)),
    h('div', { class: 'grow stack-sm' }, h('div', { class: 'title' }, line), cert),
    speakerBtn(() => speak(line, getLang()), { size: 'sm' }));
}

// Home's continue card while a plan has a lesson left: "Your plan · lesson 2 of 4"; it starts the lesson with its
// warm-up (spaced review, P25a)
function planCard(ctx) {
  const c = ctx.child;
  if (!where(c) && finished.has(c.id)) return doneCard(ctx);
  const w = where(c);
  const l = w.next;
  return h('section', { class: 'card soft continue plan-card' },
    h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id) + '?warm=1', 'aria-label': s('start_lesson') }, playIcon(44)),
    h('div', { class: 'grow' },
      h('div', { class: 'kicker' }, s('plan_kicker', { n: w.n, b: w.total })),
      h('div', { class: 'title' }, titleText(l.title)),
      h('div', { class: 'muted small' }, [w.label, s(l.subject)].filter(Boolean).join(' · ')),
      h('div', { class: 'bar' }, h('span', { style: { width: Math.round((100 * w.done) / w.total) + '%' } }))));
}

export function register(shell) {
  shell.offer('home.action', { id: 'plan-next', role: 'primary', priority: 30,
    when: (ctx) => canFollow(ctx.child) && (!!(where(ctx.child) || {}).next || !!finishedNow(ctx.child)), render: planCard });
  // "Done" is said once: leaving Home forgets it
  globalThis.addEventListener?.('hashchange', () => {
    if (!/^#\/?(home)?$/.test(globalThis.location.hash)) finished.clear();
  });
}
