// One subject: this child's lessons first, then every other year's (every lesson is open to everyone).

import { fa, s } from '../i18n.js';
import * as library from '../library.js';
import * as state from '../state.js';
import { h, icon, plain, star, subjectBadge, topbar } from '../ui.js';
import { yearLabel } from './who.js';

export function lessonRow(l, n, c) {
  const done = c.done[l.id];
  const bits = [l.unit ? plain(l.unit) : null, l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean);
  return h('a', { class: 'lesson-row', href: '#/lesson/' + encodeURIComponent(l.id) },
    done ? h('span', { class: 'done-mark', 'aria-label': s('status_done') }, icon('check', 18, 3))
      : h('span', { class: `sbadge s-${l.subject}`, style: { width: '30px', height: '30px', fontSize: '15px' } }, fa(n)),
    h('span', { class: 'grow' }, h('b', {}, plain(l.title)),
      h('small', {}, bits.join(' · '), l.sheet ? [' · ', icon('printer', 15, 2.2)] : null)),
    done ? h('span', { class: 'stars-sm' }, [0, 1, 2].map((k) => star(14, k < done.stars))) : null,
    icon('chev', 20));
}

export default async function subject([name]) {
  await library.load();
  const c = state.child();
  const mine = library.mine(c, name);
  const others = library.all().filter((l) => l.subject === name && !mine.includes(l))
    .sort((a, b) => a.year - b.year || a.order - b.order);
  const years = [...new Set(others.map((l) => l.year))];
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/home', sub: yearLabel(c), title: s(name), extra: subjectBadge(name, 44) }),
    mine.length ? h('div', { class: 'section-head' }, h('h2', {}, s('this_year'))) : null,
    mine.length ? h('div', { class: 'lessons' }, mine.map((l, i) => lessonRow(l, i + 1, c))) : null,
    !mine.length && !others.length ? h('div', { class: 'empty' }, s('no_lessons')) : null,
    others.length ? h('div', { class: 'section-head' }, h('h2', {}, s('other_years'))) : null,
    years.map((y) => [
      h('div', { class: 'year-head' }, y === 0 ? s('beginner') : s('year_n', { n: y })),
      h('div', { class: 'lessons' }, others.filter((l) => l.year === y).map((l, i) => lessonRow(l, i + 1, c))),
    ]));
  return { el, tab: 'lessons' };
}
