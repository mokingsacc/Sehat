// One subject: this child's lessons first, then every other year's (every lesson is open to everyone).
// Since P25a (C4.1) the subject's pathways for her band come first, as cards: the title, "8 lessons, 3 done, a
// certificate", a bar, and Start (before the first lesson) or Continue. Start runs the pathway as her plan (asking
// first when another plan has a lesson left) and opens its first lesson with the warm-up.

import { fa, getLang, pick, s } from '../i18n.js';
import * as graph from '../graph.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as certs from '../modules/cert.js';
import * as made from '../modules/made.js';
import * as plans from '../modules/plan.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, said, speakerBtn, star, subjectBadge, titleText, topbar } from '../ui.js';
import { yearLabel } from './who.js';

export function lessonRow(l, n, c) {
  const done = c.done[l.id];
  // the unit is pack text (Dari or Pashto) inside a line in the interface's language: isolated so neither flips the other
  const bits = [l.unit ? h('bdi', {}, plain(l.unit)) : null, l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean);
  return h('a', { class: 'lesson-row', href: '#/lesson/' + encodeURIComponent(l.id) },
    done ? h('span', { class: 'done-mark', 'aria-label': s('status_done') }, icon('check', 18, 3))
      : h('span', { class: `sbadge s-${l.subject}`, style: { width: '30px', height: '30px', fontSize: '15px' } }, fa(n)),
    h('span', { class: 'grow' }, h('b', {}, titleText(l.title)),
      h('small', {}, bits.flatMap((b, k) => (k ? [' · ', b] : [b])), l.sheet ? [' · ', icon('printer', 15, 2.2)] : null)),
    done ? h('span', { class: 'stars-sm' }, [0, 1, 2].map((k) => star(14, k < done.stars))) : null,
    icon('chev', 20));
}

// one pathway's card: what it holds for her now (its running plan, or what starting it would give her)
function pathCard(c, x) {
  const mine = plans.bandLessons(c);
  const running = c.plan && c.plan.path === x.p.id ? plans.where(c) : null;
  const p = graph.pathwayPlan(c, x, mine);
  const ids = running ? running.lessons.map((l) => l.id) : p.lessons;
  const done = ids.filter((id) => (running ? plans.doneFor(c, id) : c.done && c.done[id])).length;
  const title = plain(x.p.title);
  const line = [s('path_line', { n: ids.length, k: done }), x.p.certificate ? s('path_cert') : null].filter(Boolean)
    .join(getLang() === 'en' ? ', ' : '، ');
  const left = ids.find((id) => !(running ? plans.doneFor(c, id) : c.done && c.done[id]));
  const go = async () => {
    if (!running && !(await plans.begin(c, title, p.lessons, x.p.id))) return;
    const next = running ? running.next : library.get(left) || library.get(p.lessons[0]);
    if (next) location.hash = '#/lesson/' + encodeURIComponent(next.id) + '?warm=1';
  };
  return h('section', { class: 'card lined pad-card stack path-card' },
    h('div', { class: 'row' }, h('h2', { class: 'grow', dir: 'auto' }, title),
      speakerBtn(() => speak([title, line].join('. '), getLang()), { size: 'sm' })),
    h('p', { class: 'muted small' }, line),
    h('div', { class: 'bar' }, h('span', { style: { width: (ids.length ? Math.round((100 * done) / ids.length) : 0) + '%' } })),
    left ? said(h('button', { type: 'button', class: 'btn primary', onClick: go },
      running ? s('continue') : s('path_start'), icon('next', 22))) : h('p', { class: 'muted small' }, s('path_done')),
    // a finished pathway's certificate (P25b): "Get my certificate", then "My certificate" to print it again
    !left && certs.ready(c, x) ? said(h('a', { class: 'btn outline', href: '#/cert/' + encodeURIComponent(x.p.id) },
      icon('printer', 22), s(certs.certOf(c, x.p.id) ? 'cert_mine' : 'cert_get'))) : null);
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
  const paths = plans.canFollow(c) ? graph.pathways(c, plans.bandLessons(c), name) : [];
  fill(el,
    topbar({ back: '#/home', sub: yearLabel(c), title: s(name), extra: subjectBadge(name, 44), child: true }),
    paths.length ? h('div', { class: 'path-cards' }, paths.map((x) => pathCard(c, x))) : null,
    mine.length ? h('div', { class: 'section-head' }, h('h2', {}, s('this_year'))) : null,
    mine.length ? h('div', { class: 'lessons' }, mine.map(row)) : null,
    !mine.length && !others.length ? h('div', { class: 'empty' }, s('no_lessons')) : null,
    others.length ? h('div', { class: 'section-head' }, h('h2', {}, s('other_years'))) : null,
    years.map((y) => [
      h('div', { class: 'year-head' }, y === 0 ? s('beginner') : s('year_n', { n: y })),
      h('div', { class: 'lessons' }, others.filter((l) => l.year === y).map(row)),
    ]),
    // P32 (C4.8): the last row, her own questions, where the module is hers
    made.canMake(c) && !['quran', 'seerah'].includes(name) ? h('nav', { class: 'subjects made-row' },
      h('a', { href: '#/made' }, h('span', { class: 'sbadge s-made', style: { width: '42px', height: '42px' } }, icon('pencil', 24)),
        h('span', { class: 'grow' }, h('b', {}, s('made_title')),
          h('small', { class: 'muted' }, s('made_count', { n: fa((c.made || []).length) }))), icon('chev', 22))) : null);
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
