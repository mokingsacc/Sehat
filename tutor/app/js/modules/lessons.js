// The lessons module on Home: the big button for the next lesson (primary) and the subjects (list).
// Early years: one 120 px play button with the next activity's picture above it and a 72 px listen button; no list.
// Bold look (years 1 to 6, adult literacy): one huge play button with a listen button, and subject tiles (stars
// for children).
// Clean look (years 7 to 12, adult readers): a calm "continue" card with progress, and a subject list.

import { getLang, s } from '../i18n.js';
import * as library from '../library.js';
import { speak } from '../speech.js';
import { h, icon, perButton, playIcon, plain, said, speakerBtn, subjectBadge, star } from '../ui.js';

const hasLesson = (ctx) => !!ctx.lesson;

function subjectLine(l) {
  return [s(l.subject), l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean).join(' · ');
}

function nextBold({ child: c, lesson: l }) {
  const started = c.step[l.id] !== undefined;
  return h('section', { class: 'card next-card' },
    h('span', { class: 'tag' }, started ? s('continue') : s('next_lesson')),
    l.glyph ? h('div', { class: 'glyph', 'aria-hidden': 'true' }, l.glyph) : subjectBadge(l.subject, 72),
    h('div', { class: 'title' }, plain(l.title)),
    h('div', { class: 'muted' }, subjectLine(l)),
    h('div', { class: 'row big-row' },
      speakerBtn(() => speak(plain(l.title), getLang()), { size: 'md', label: s('listen') }),
      h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id), 'aria-label': s('start_lesson') }, playIcon(52)),
      h('span', { class: 'spacer' })));
}

function nextEarly({ lesson: l }) {
  return h('section', { class: 'early' },
    l.glyph ? h('div', { class: 'glyph', 'aria-hidden': 'true' }, l.glyph) : subjectBadge(l.subject, 96),
    h('a', { class: 'play huge', href: '#/lesson/' + encodeURIComponent(l.id), 'aria-label': s('start_lesson') }, playIcon(64)),
    speakerBtn(() => speak(plain(l.title), getLang()), { size: 'xl', label: s('listen') }));
}

function nextClean({ child: c, lesson: l }) {
  const at = c.step[l.id];
  const pct = at !== undefined && l.steps ? Math.round((100 * at) / l.steps) : 0;
  return h('section', { class: 'card soft continue' },
    h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id), 'aria-label': s('start_lesson') }, playIcon(44)),
    h('div', { class: 'grow' },
      h('div', { class: 'kicker' }, at !== undefined ? s('continue') : s('next_lesson')),
      h('div', { class: 'title' }, plain(l.title)),
      h('div', { class: 'muted small' }, [subjectLine(l), l.unit ? plain(l.unit) : null].filter(Boolean).join(' · ')),
      at !== undefined ? h('div', { class: 'bar' }, h('span', { style: { width: pct + '%' } })) : null));
}

// subject tiles; in the bands with a speaker per button they go one per row, each with its speaker at the end
function tiles({ child: c, tone }) {
  const one = perButton();
  return [h('div', { class: 'section-head' }, h('h2', {}, s('subjects'))),
    h('div', { class: 'tiles' + (one ? ' one' : '') }, library.subjectOrder(c.lang).map((sub) => {
      const p = library.progress(c, sub);
      return said(h('a', { class: 'tile', href: '#/subject/' + sub },
        subjectBadge(sub, 46),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          p.total ? h('small', {}, tone === 'child' ? star(14, p.done > 0) : null, s('of', { a: p.done, b: p.total })) : null)));
    }))];
}

function subjectList({ child: c }) {
  return [h('div', { class: 'section-head' }, h('h2', {}, s('subjects')), h('span', {}, s('every_lesson_open'))),
    h('nav', { class: 'subjects', 'aria-label': s('subjects') }, library.subjectOrder(c.lang).map((sub) => {
      const p = library.progress(c, sub);
      return h('a', { href: '#/subject/' + sub },
        subjectBadge(sub, 42),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          p.total ? h('small', { class: 'muted' }, s('of', { a: p.done, b: p.total })) : null,
          p.total ? h('div', { class: 'bar' }, h('span', { style: { width: Math.round((100 * p.done) / p.total) + '%' } })) : null),
        icon('chev', 22));
    }))];
}

export function register(shell) {
  shell.offer('home.action', { id: 'next', role: 'primary', priority: 10, when: hasLesson,
    render: (ctx) => (ctx.band === 'ey' ? nextEarly(ctx) : ctx.look === 'bold' ? nextBold(ctx) : nextClean(ctx)) });
  shell.offer('home.action', { id: 'subjects', role: 'list', priority: 10, when: (ctx) => hasLesson(ctx) && ctx.band !== 'ey',
    render: (ctx) => (ctx.look === 'bold' ? tiles(ctx) : subjectList(ctx)) });
}

