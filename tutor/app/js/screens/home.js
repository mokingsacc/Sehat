// Home. The shell draws the header and the draft note; what follows comes from the modules that are on
// (modules.js): one primary action, one secondary action and one list, never more.
// Years 0 to 6 (look C): the huge play button, "print today's sheet" and the subject tiles.
// Years 7 to 12 (look B): the "continue" card, Check my sheet and the subject list (Print is a tab, F6).
// Every lesson stays open from the subject pages; the big button only saves choosing.

import { s } from '../i18n.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import * as state from '../state.js';
import { fill, h, hubChip } from '../ui.js';
import { whoChip } from './who.js';

export default async function home() {
  await library.load();
  const root = h('div', { class: 'screen' });
  const draw = () => fill(root, page());
  draw();
  return { el: root, tab: 'lessons', onHub: draw };
}

function header(c) {
  return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }), hubChip());
}

function nothing() {
  return h('div', { class: 'empty' }, library.all().length ? s('no_lessons') : s('offline'));
}

function page() {
  const c = state.child();
  const ctx = { child: c, lesson: library.next(c), look: state.mode(c) };
  const out = [header(c), h('div', { class: 'draft' }, s('draft_note'))];
  if (!ctx.lesson) return [...out, nothing()];
  const { primary, secondary, list } = modules.home(ctx);
  if (!primary && !secondary && !list) return [...out, nothing()];
  return [...out, primary, secondary, list];
}
