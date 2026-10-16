// Who is learning: brothers and sisters often share one phone. Each learner keeps her own year (or adult track),
// language and progress, on this phone only. No name: the alias picture (P10) and an optional nickname stand
// for her.

import { fa, s } from '../i18n.js';
import * as state from '../state.js';
import { h, icon, topbar } from '../ui.js';

export const yearLabel = (c) => (c.band === 'ad' ? s(c.track === 'reader' ? 'track_reader' : 'track_literacy')
  : c.year === 0 ? s('beginner') : s('year_n', { n: c.year }));
// the alias picture arrives with sign-up (P10); until then the year, or a book for adults
export const initial = (c) => (c.band === 'ad' ? icon('book', 22, 2.4) : fa(c.year));

export function whoChip(c) {
  return h('a', { class: 'who', href: '#/who', 'aria-label': s('who_title') },
    h('span', { class: 'ini' }, initial(c)),
    h('span', {}, h('b', {}, c.nickname || yearLabel(c)), c.nickname ? h('small', {}, yearLabel(c)) : null));
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
        h('span', { class: 'grow' }, h('b', {}, c.nickname || yearLabel(c)), c.nickname ? h('small', {}, yearLabel(c)) : null),
        c === active ? icon('check', 26, 3) : null)),
      h('a', { class: 'btn outline big', href: '#/welcome' }, icon('plus', 26, 2.6), s('add_child')),
      h('a', { class: 'btn', href: '#/welcome/edit' }, s('change_year'))),
    h('div', { class: 'pad teacher-link' }, h('a', { class: 'link', href: '#/teacher' }, icon('lock', 20), s('teacher'))),
    h('div', { class: 'pad teacher-link' }, h('a', { class: 'link', href: '#/credits' }, icon('file', 20), s('credits'))));
  return { el, tab: null };
}
