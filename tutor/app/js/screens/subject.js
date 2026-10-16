// One subject: this child's lessons first, then every other year's (every lesson is open to everyone).

import { fa, getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, said, speakerBtn, star, subjectBadge, topbar } from '../ui.js';
import { yearLabel } from './who.js';

export function lessonRow(l, n, c) {
  const done = c.done[l.id];
  // the unit is pack text (Dari or Pashto) inside a line in the interface's language: isolated so neither flips the other
  const bits = [l.unit ? h('bdi', {}, plain(l.unit)) : null, l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean);
  return h('a', { class: 'lesson-row', href: '#/lesson/' + encodeURIComponent(l.id) },
    done ? h('span', { class: 'done-mark', 'aria-label': s('status_done') }, icon('check', 18, 3))
      : h('span', { class: `sbadge s-${l.subject}`, style: { width: '30px', height: '30px', fontSize: '15px' } }, fa(n)),
    h('span', { class: 'grow' }, h('b', {}, plain(l.title)),
      h('small', {}, bits.flatMap((b, k) => (k ? [' · ', b] : [b])), l.sheet ? [' · ', icon('printer', 15, 2.2)] : null)),
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
  const el = h('div', { class: 'screen', 'data-speaks': '' });
  const row = (l, i) => said(lessonRow(l, i + 1, c));
  fill(el,
    topbar({ back: '#/home', sub: yearLabel(c), title: s(name), extra: subjectBadge(name, 44) }),
    mine.length ? h('div', { class: 'section-head' }, h('h2', {}, s('this_year'))) : null,
    mine.length ? h('div', { class: 'lessons' }, mine.map(row)) : null,
    !mine.length && !others.length ? h('div', { class: 'empty' }, s('no_lessons')) : null,
    others.length ? h('div', { class: 'section-head' }, h('h2', {}, s('other_years'))) : null,
    years.map((y) => [
      h('div', { class: 'year-head' }, y === 0 ? s('beginner') : s('year_n', { n: y })),
      h('div', { class: 'lessons' }, others.filter((l) => l.year === y).map(row)),
    ]));
  const cards = h('div', { class: 'linkcards' });
  el.append(cards);
  const drawLinks = async () => fill(cards, hub.online() ? linkCards(await hub.links({ subject: name, year: c.year })) : null);
  drawLinks();
  return { el, tab: 'lessons', onHub: drawLinks };
}

// Link cards: our own words about a page elsewhere, the owner, and the address; online only, nothing copied
// (BUILD-PLAN 4.1). Their look is for the design committee (C2): this is the plain, token-styled version.
export function linkCards(cards) {
  if (!cards || !cards.length) return null;
  return [h('div', { class: 'section-head' }, h('h2', {}, s('links_title'))),
    h('div', { class: 'stack pad' }, cards.map((k) => {
      const about = pick(k.about);
      return h('div', { class: 'card lined linkcard' },
        h('div', { class: 'row' },
          h('span', { class: 'grow' }, h('b', { dir: 'auto' }, pick(k.title)), k.owner ? h('small', { class: 'muted', dir: 'auto' }, k.owner) : null),
          speakerBtn(() => speak([pick(k.title), about].join('. '), getLang()), { size: 'sm' })),
        h('p', { class: 'about' }, about),
        h('a', { class: 'btn outline', href: k.url, target: '_blank', rel: 'noopener noreferrer' }, s('open_link')));
    }))];
}
