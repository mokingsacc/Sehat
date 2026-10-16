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
import { getLang, s } from '../i18n.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { hasVoice, sayKey, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, hubChip, icon, speakerBtn } from '../ui.js';
import { whoChip } from './who.js';

const HOLD_MS = 2000;
let readFor = null;          // read Home aloud once per learner and visit, not on every redraw

export default async function home() {
  await library.load();
  const root = h('div', { class: 'screen home', 'data-speaks': '' });
  const draw = () => fill(root, page(root));
  draw();
  const c = state.child();
  const key = c && c.id + location.hash;
  if (c && readsOnOpen(c.band, c.track, 'home') && readFor !== key && hasVoice(getLang())) {
    readFor = key;
    setTimeout(() => readPage(root), 400);
  }
  return { el: root, tab: 'lessons', onHub: draw, cleanup: () => { readFor = null; } };
}

// everything the page says, in reading order (the page speaker)
function readPage(root) {
  const text = (root.closest('#app') || root).innerText.replace(/\s+/g, ' ').trim();
  speak(text, getLang());
}

// the grown-up's corner: a long press opens Who is learning (and Settings, Print behind it); a tap says "hold it"
function grownUpCorner() {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; location.hash = '#/who'; }, HOLD_MS);
  };
  const end = () => {
    if (timer) { clearTimeout(timer); timer = null; sayKey('hold_it', getLang()); }
  };
  return h('button', { type: 'button', class: 'round corner', 'aria-label': s('grown_up'),
    onPointerdown: start, onPointerup: end, onPointerleave: () => { clearTimeout(timer); timer = null; },
    onContextmenu: (e) => e.preventDefault() }, icon('lock', 22, 2.4));
}

function header(c, root) {
  if (c.band === 'ey') return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }), grownUpCorner());
  return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }),
    speakerBtn(() => readPage(root), { size: 'sm', label: s('hear_page'), page: true }), hubChip());
}

function nothing() {
  return h('div', { class: 'empty' }, library.all().length ? s('no_lessons') : s('offline'));
}

function adultsComing() {
  return h('section', { class: 'card lined pad-card stack' },
    h('div', { class: 'row' }, h('p', { class: 'grow lead' }, s('adults_coming')),
      speakerBtn(() => sayKey('adults_coming', getLang()), { size: 'md' })),
    h('a', { class: 'btn outline', href: '#/welcome/edit' }, s('pick_year')));
}

function page(root) {
  const c = state.child();
  const ctx = modules.context(c, library.next(c));
  const out = [header(c, root), library.hasDrafts() ? h('div', { class: 'draft' }, s('draft_note')) : null];
  if (c.band === 'ad' && !library.hasAdultLessons()) return [...out, adultsComing()];
  if (!ctx.lesson) return [...out, nothing()];
  const { primary, secondary, list } = modules.home(ctx);
  if (!primary && !secondary && !list) return [...out, nothing()];
  return [...out, primary, secondary, list];
}
