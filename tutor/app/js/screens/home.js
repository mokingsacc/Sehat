// Home. The shell draws the header and, where drafts are served (staging), the draft band; what follows comes
// from the modules that are on (modules.js): one primary action, one secondary action and one list, never more.
// The band decides the rest (DESIGN.md 5):
// - early years: the 120 px play button with a listen button; no tabs and no list; the grown-up's corner (a lock
//   at the top end) opens Who is learning after a 2-second press, and a short tap says "hold it";
// - years 1 to 6 and adult literacy (bold): the huge play button, "print today's sheet" and the subject tiles;
// - years 7 to 12 and adult readers (clean): the "continue" card, Check my sheet and the subject list.
// Until an adult pack exists, an adult's Home says lessons for adults are coming. A speaker in the header reads
// the whole page; early years, years 1 to 3 and adult literacy hear Home read when it opens.

import { readsOnOpen } from '../bands.js';
import * as day from '../day.js';
import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { hasVoice, sayKey, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, holdable, icon, netChip, pageSpeaker, readPage, said, speakerBtn } from '../ui.js';
import { whoChip } from './who.js';

const HOLD_MS = 2000;
const DAY_EVENT = 'qalam-day';
let readFor = null;          // read Home aloud once per learner and visit, not on every redraw

export default async function home() {
  await library.load();
  const root = h('div', { class: 'screen home', 'data-speaks': '' });
  const draw = () => fill(root, page(root));
  draw();
  window.addEventListener(DAY_EVENT, draw);          // a bell, or her school day changed (the timetable module)
  const c = state.child();
  const key = c && c.id + location.hash;
  if (c && readsOnOpen(c.band, c.track, 'home') && readFor !== key && hasVoice(getLang())) {
    readFor = key;
    setTimeout(() => readPage(root.closest('#app') || root), 400);
  }
  return { el: root, tab: 'lessons', onHub: draw, cleanup: () => { readFor = null; window.removeEventListener(DAY_EVENT, draw); } };
}

// the grown-up's corner: a 2-second press opens Who is learning (and Settings, Print behind it); a tap says "hold it".
// It looks pressed from the first touch, the consent ring fills round the lock, the phone buzzes as Who opens, and
// lifting or leaving early cancels (ruling 6)
function grownUpCorner() {
  const btn = h('button', { type: 'button', class: 'round corner', 'aria-label': s('grown_up') }, icon('lock', 22, 2.4));
  return holdable(btn, { ms: HOLD_MS, buzz: 30, onDone: () => { location.hash = '#/who'; },
    onTap: () => sayKey('hold_it', getLang()) });
}

// the bells' switch (P19, item 4): a 44 px round button, only while her school day is on; one tap switches them
// and says "Bells off" or "Bells on" (or shows it, on a phone without a voice)
function bellToggle(c) {
  const on = day.bellsOn(c);
  return h('button', { type: 'button', class: 'round bell' + (on ? ' on' : ''), 'aria-pressed': String(on),
    'aria-label': s(on ? 'bells_on' : 'bells_off'),
    onClick: () => {
      state.updateChild(c.id, { bells: on ? 'off' : 'on' });
      sayKey(on ? 'bells_off' : 'bells_on', getLang(), null, { shown: true });
      window.dispatchEvent(new Event(DAY_EVENT));
    } }, icon(on ? 'bell' : 'bell-off', 22, 2.2));
}

function header(c, root) {
  if (c.band === 'ey') return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }), grownUpCorner());
  return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }),
    pageSpeaker(root), day.dayOn(c) ? bellToggle(c) : null, netChip());
}

// nothing to show: no lessons for her yet, or (first open, away from the server) nothing on the phone yet
function nothing() {
  if (library.all().length) return h('div', { class: 'empty' }, s('no_lessons'));
  if (hub.home() !== 'online') return h('div', { class: 'empty' }, s('offline'));
  return h('div', { class: 'empty stack' }, h('p', {}, s('connect_once')),
    said(h('button', { type: 'button', class: 'btn', onClick: () => location.reload() }, icon('refresh', 22), s('try_again'))));
}

function adultsComing() {
  return h('section', { class: 'card lined pad-card stack' },
    h('div', { class: 'row' }, h('p', { class: 'grow lead' }, s('adults_coming')),
      speakerBtn(() => sayKey('adults_coming', getLang()), { size: 'md' })),
    said(h('a', { class: 'btn outline', href: '#/welcome/edit' }, s('pick_year'))));
}

// the shell's fixed last row (modules.homeFooter, P22): "+ I want to learn something else", with its speaker
function footer(ctx) {
  const f = modules.homeFooter(ctx);
  if (!f) return null;
  return h('div', { class: 'row learn-else' },
    h('a', { class: 'grow', href: f.href }, icon('plus', 22, 2.6), h('span', {}, s(f.key))),
    speakerBtn(() => sayKey(f.key, getLang()), { size: 'sm' }));
}

function page(root) {
  const c = state.child();
  const ctx = modules.context(c, library.next(c));
  const out = [header(c, root), library.hasDrafts() ? h('div', { class: 'draft', 'data-silent': '' }, s('draft_note')) : null];
  if (c.band === 'ad' && !library.hasAdultLessons(c)) return [...out, adultsComing(), footer(ctx)];
  // no lesson yet: the empty line in the primary's place, and the school day's secondary offer still under it (the
  // Android app's "Is this phone yours?" on a day with no lessons yet, C4 look question 35)
  if (!ctx.lesson) {
    const o = modules.pick('home.action', ctx).find((x) => x.role === 'secondary');
    return [...out, nothing(), o && o.module === 'timetable' ? o.render(ctx) : null];
  }
  const { primary, secondary, list } = modules.home(ctx);
  if (!primary && !secondary && !list) return [...out, nothing()];
  return [...out, primary, secondary, list, footer(ctx)];
}
