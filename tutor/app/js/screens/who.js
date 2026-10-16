// Who is learning: brothers and sisters often share one phone. Each child keeps their own year, language
// and progress, on this phone only.

import { fa, s } from '../i18n.js';
import * as state from '../state.js';
import { h, icon, topbar } from '../ui.js';

export const yearLabel = (c) => (c.year === 0 ? s('beginner') : s('year_n', { n: c.year }));
export const initial = (c) => (c.name ? c.name.trim()[0] : fa(c.year));

export function whoChip(c) {
  return h('a', { class: 'who', href: '#/who', 'aria-label': s('who_title') },
    h('span', { class: 'ini' }, initial(c)),
    h('span', {}, h('b', {}, c.name || yearLabel(c)), c.name ? h('small', {}, yearLabel(c)) : null));
}

export default function who() {
  const active = state.child();
  const pickChild = (c) => { state.setActive(c.id); location.hash = '#/home'; };
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/home', title: s('who_title') }),
    h('div', { class: 'stack pad' },
      state.children().map((c) => h('button', { type: 'button', class: 'who wide' + (c === active ? ' on' : ''),
        onClick: () => pickChild(c) },
        h('span', { class: 'ini' }, initial(c)),
        h('span', { class: 'grow' }, h('b', {}, c.name || yearLabel(c)), c.name ? h('small', {}, yearLabel(c)) : null),
        c === active ? icon('check', 26, 3) : null)),
      h('a', { class: 'btn outline big', href: '#/welcome' }, icon('plus', 26, 2.6), s('add_child')),
      h('a', { class: 'btn', href: '#/welcome/edit' }, s('change_year'))),
    h('div', { class: 'pad teacher-link' }, h('a', { class: 'link', href: '#/teacher' }, icon('lock', 20), s('teacher'))),
    h('div', { class: 'pad teacher-link' }, h('a', { class: 'link', href: '#/credits' }, icon('file', 20), s('credits'))));
  return { el, tab: null };
}
