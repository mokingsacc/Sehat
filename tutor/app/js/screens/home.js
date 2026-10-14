// Home. Years 0 to 6 (look C): one huge play button for the next lesson, a listen button, a big print button
// and five subject tiles. Years 7 to 12 (look B): a calm "continue" card, print and check, and a subject list.
// Every lesson stays open from the subject pages; the big button only saves choosing.

import { getLang, s } from '../i18n.js';
import * as library from '../library.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, hubChip, icon, playIcon, plain, speakerBtn, subjectBadge, star } from '../ui.js';
import { whoChip } from './who.js';

export default async function home() {
  await library.load();
  const root = h('div', { class: 'screen' });
  const draw = () => fill(root, state.mode() === 'small' ? small() : big());
  draw();
  return { el: root, tab: 'lessons', onHub: draw };
}

function header(c) {
  return h('header', { class: 'top' }, whoChip(c), h('div', { class: 'grow' }), hubChip());
}

function nothing() {
  return h('div', { class: 'empty' }, library.all().length ? s('no_lessons') : s('offline'));
}

function subjectLine(l) {
  return [s(l.subject), l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean).join(' · ');
}

function small() {
  const c = state.child();
  const l = library.next(c);
  const out = [header(c), h('div', { class: 'draft' }, s('draft_note'))];
  if (!l) return [...out, nothing()];
  const started = c.step[l.id] !== undefined;
  out.push(
    h('section', { class: 'card next-card' },
      h('span', { class: 'tag' }, started ? s('continue') : s('next_lesson')),
      l.glyph ? h('div', { class: 'glyph', 'aria-hidden': 'true' }, l.glyph) : subjectBadge(l.subject, 72),
      h('div', { class: 'title' }, plain(l.title)),
      h('div', { class: 'muted' }, subjectLine(l)),
      h('div', { class: 'row big-row' },
        speakerBtn(() => speak(plain(l.title), getLang()), { size: 'md', label: s('listen') }),
        h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id), 'aria-label': s('start_lesson') }, playIcon(52)),
        h('span', { class: 'spacer' }))),
  );
  if (l.sheet) {
    out.push(h('div', { class: 'pad top-gap' },
      h('a', { class: 'btn warm big', href: '#/print/' + encodeURIComponent(l.id) }, icon('printer', 30, 2.4), s('print_today'))));
  }
  out.push(h('div', { class: 'section-head' }, h('h2', {}, s('subjects'))),
    h('div', { class: 'tiles' }, library.subjectOrder(c.lang).map((sub) => {
      const p = library.progress(c, sub);
      return h('a', { class: 'tile', href: '#/subject/' + sub },
        subjectBadge(sub, 46),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          p.total ? h('small', {}, star(14, p.done > 0), s('of', { a: p.done, b: p.total })) : null));
    })));
  return out;
}

function big() {
  const c = state.child();
  const l = library.next(c);
  const out = [header(c), h('div', { class: 'draft' }, s('draft_note'))];
  if (!l) return [...out, nothing()];
  const at = c.step[l.id];
  const pct = at !== undefined && l.steps ? Math.round((100 * at) / l.steps) : 0;
  out.push(
    h('section', { class: 'card soft continue' },
      h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id), 'aria-label': s('start_lesson') }, playIcon(44)),
      h('div', { class: 'grow' },
        h('div', { class: 'kicker' }, at !== undefined ? s('continue') : s('next_lesson')),
        h('div', { class: 'title' }, plain(l.title)),
        h('div', { class: 'muted small' }, [subjectLine(l), l.unit ? plain(l.unit) : null].filter(Boolean).join(' · ')),
        at !== undefined ? h('div', { class: 'bar' }, h('span', { style: { width: pct + '%' } })) : null)),
    h('div', { class: 'row pad top-gap' },
      l.sheet ? h('a', { class: 'btn outline grow', href: '#/print/' + encodeURIComponent(l.id) }, icon('printer'), s('print_it')) : null,
      h('a', { class: 'btn grow', href: '#/check' }, icon('check'), s('check_sheet'))),
    h('div', { class: 'section-head' }, h('h2', {}, s('subjects')), h('span', {}, s('every_lesson_open'))),
    h('nav', { class: 'subjects', 'aria-label': s('subjects') }, library.subjectOrder(c.lang).map((sub) => {
      const p = library.progress(c, sub);
      return h('a', { href: '#/subject/' + sub },
        subjectBadge(sub, 42),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          p.total ? h('small', { class: 'muted' }, s('of', { a: p.done, b: p.total })) : null,
          p.total ? h('div', { class: 'bar' }, h('span', { style: { width: Math.round((100 * p.done) / p.total) + '%' } })) : null),
        icon('chev', 22));
    })),
  );
  return out;
}
