// The lessons module on Home: the big button for the next lesson (primary) and the subjects (list).
// Early years: one 120 px play button with the next activity's picture above it and a 72 px listen button; no list.
// Bold look (years 1 to 6, adult literacy): one huge play button with a listen button, and subject tiles (stars
// for children).
// Clean look (years 7 to 12, adult readers): a calm "continue" card with progress, and a subject list.
// Adults (P26, C4.3): the list is "What to learn", the track rows in this order: reading and writing in her
// language, everyday maths, English, Chinese, University; a row shows when she has lessons in it (University: when
// its module is on). Adult literacy: one per row with "3 of 30" and a speaker at the end; adult readers: a bar and
// "12/30". After the literacy pathway's last lesson, the secondary asks once "You can read now. Use the reader look?".
// The Quran reader (P29, the `quran` module: s1, s2 and adult readers) is the last row of the clean list and of the
// reader track's rows, while its module is on; university preparation (P28, the `university` module: s2 and adult
// readers) just before it.

import { fa, getLang, s } from '../i18n.js';
import * as graph from '../graph.js';
import * as library from '../library.js';
import { allows, on } from '../modules.js';
import * as state from '../state.js';
import { speak } from '../speech.js';
import { h, icon, perButton, plain, playIcon, said, speakerBtn, star, subjectBadge, titleText } from '../ui.js';

const hasLesson = (ctx) => !!ctx.lesson;
// the big button starts the lesson with its warm-up of due review items (P25a; none in early years: recall.js)
const WARM = '?warm=1';

function subjectLine(l) {
  return [s(l.subject), l.minutes ? s('minutes', { n: l.minutes }) : null].filter(Boolean).join(' · ');
}

function nextBold({ child: c, lesson: l }) {
  const started = c.step[l.id] !== undefined;
  return h('section', { class: 'card next-card' },
    h('span', { class: 'tag' }, started ? s('continue') : s('next_lesson')),
    l.glyph ? h('div', { class: 'glyph', 'aria-hidden': 'true' }, l.glyph) : subjectBadge(l.subject, 72),
    h('div', { class: 'title' }, titleText(l.title)),
    h('div', { class: 'muted' }, subjectLine(l)),
    h('div', { class: 'row big-row' },
      speakerBtn(() => speak(plain(l.title), getLang()), { size: 'md', label: s('listen') }),
      h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id) + WARM, 'aria-label': s('start_lesson') }, playIcon(52)),
      h('span', { class: 'spacer' })));
}

function nextEarly({ lesson: l }) {
  return h('section', { class: 'early' },
    l.glyph ? h('div', { class: 'glyph', 'aria-hidden': 'true' }, l.glyph) : subjectBadge(l.subject, 96),
    h('a', { class: 'play huge', href: '#/lesson/' + encodeURIComponent(l.id) + WARM, 'aria-label': s('start_lesson') }, playIcon(64)),
    speakerBtn(() => speak(plain(l.title), getLang()), { size: 'xl', label: s('listen') }));
}

function nextClean({ child: c, lesson: l }) {
  const at = c.step[l.id];
  const pct = at !== undefined && l.steps ? Math.round((100 * at) / l.steps) : 0;
  return h('section', { class: 'card soft continue' },
    h('a', { class: 'play', href: '#/lesson/' + encodeURIComponent(l.id) + WARM, 'aria-label': s('start_lesson') }, playIcon(44)),
    h('div', { class: 'grow' },
      h('div', { class: 'kicker' }, at !== undefined ? s('continue') : s('next_lesson')),
      h('div', { class: 'title' }, titleText(l.title)),
      h('div', { class: 'muted small' }, [subjectLine(l), l.unit ? plain(l.unit) : null].filter(Boolean).join(' · ')),
      at !== undefined ? h('div', { class: 'bar' }, h('span', { style: { width: pct + '%' } })) : null));
}

// subject tiles; in the bands with a speaker per button they go one per row, each with its speaker at the end
// `head: false` where the screen's own title already says it (Subjects: one head, C5.3)
export function tiles({ child: c, tone, head = true }) {
  const one = perButton();
  return [head ? h('div', { class: 'section-head' }, h('h2', {}, s('subjects'))) : null,
    h('div', { class: 'tiles' + (one ? ' one' : '') }, library.subjectsFor(c).map((sub) => {
      const p = library.progress(c, sub);
      return said(h('a', { class: 'tile', href: '#/subject/' + sub },
        subjectBadge(sub, 46),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          p.total ? h('small', {}, tone === 'child' ? star(14, p.done > 0) : null, s('of', { a: p.done, b: p.total }))
            : h('small', { class: 'muted' }, s('no_lessons_year')))));
    }))];
}

// the reader's row (P29): only where the module is on, which the hub decides by her band
const readerRow = () => h('a', { href: '#/quran' }, subjectBadge('quran', 42),
  h('span', { class: 'grow' }, h('b', {}, s('quran_reader'))), icon('chev', 22));
const uniRow = () => h('a', { href: '#/university' }, subjectBadge('university', 42),
  h('span', { class: 'grow' }, h('b', {}, s('university'))), icon('chev', 22));

// one row shape (C5 part C, item 6): the name, then "0 of 1" and the bar under it, the chevron at the end; a subject
// with nothing for her year says so, muted, at the same height
export function subjectList({ child: c, band, head = true }) {
  return [head ? h('div', { class: 'section-head' }, h('h2', {}, s('subjects')), h('span', {}, s('every_lesson_open'))) : null,
    h('nav', { class: 'subjects', 'aria-label': s('subjects') }, library.subjectsFor(c).map((sub) => {
      const p = library.progress(c, sub);
      return h('a', { href: '#/subject/' + sub },
        subjectBadge(sub, 42),
        h('span', { class: 'grow' }, h('b', {}, s(sub)),
          h('small', { class: 'muted' }, p.total ? s('of', { a: p.done, b: p.total }) : s('no_lessons_year')),
          h('div', { class: 'bar' + (p.total ? '' : ' nothing') }, h('span', { style: { width: (p.total ? Math.round((100 * p.done) / p.total) : 0) + '%' } }))),
        icon('chev', 22));
    }), on('university') && allows('university', band) ? uniRow() : null,
    on('quran') && allows('quran', band) ? readerRow() : null)];
}

// the adult track rows: [subject, label key] in order, reading first in her language
const TRACKS = (lang) => [[lang === 'ps' ? 'pashto' : 'dari', 'track_read'], ['maths', 'track_maths'], ['english', 'english'],
  ['chinese', 'chinese'], ['university', 'university'], ['quran', 'quran_reader']];

// the rows she has: { sub, key, href, p: {done, total} or null }
export const trackList = (c) => TRACKS(c.lang).map(([sub, key]) => {
  if (sub === 'university') return on('university') && c.track === 'reader' ? { sub, key, href: '#/university', p: null } : null;
  if (sub === 'quran') return on('quran') && c.track === 'reader' ? { sub, key, href: '#/quran', p: null } : null;
  const p = library.progress(c, sub);
  return p.total ? { sub, key, href: '#/subject/' + sub, p } : null;
}).filter(Boolean);

export function trackRows({ child: c, look }) {
  const rows = trackList(c);
  if (!rows.length) return null;
  const bold = look === 'bold';
  return [h('div', { class: 'section-head row' }, h('h2', { class: 'grow' }, s('what_to_learn')),
    speakerBtn(() => speak(s('what_to_learn'), getLang()), { size: 'sm' })),
  h('nav', { class: 'tracks', 'aria-label': s('what_to_learn') }, rows.map((r) => {
    const name = s(r.key);
    const row = h('a', { class: 'track-row', href: r.href }, subjectBadge(r.sub, 42),
      h('span', { class: 'grow' }, h('b', {}, name),
        r.p && bold ? h('small', { class: 'muted' }, s('of', { a: r.p.done, b: r.p.total })) : null,
        r.p && !bold ? h('div', { class: 'bar' }, h('span', { style: { width: Math.round((100 * r.p.done) / r.p.total) + '%' } })) : null),
      r.p && !bold ? h('small', { class: 'muted' }, fa(`${r.p.done}/${r.p.total}`)) : null,
      bold ? null : icon('chev', 22));
    return bold ? said(row, [name, r.p ? s('of', { a: r.p.done, b: r.p.total }) : ''].join('. ')) : row;
  }))];
}

// the literacy track's last lesson is done: a pathway for adults in her reading subject whose `final` she finished
function readyToRead(c) {
  if (!c || c.band !== 'ad' || c.track === 'reader' || c.readerAsked) return false;
  const sub = c.lang === 'ps' ? 'pashto' : 'dari';
  return graph.pathways(c, library.all().filter((l) => l.audience === 'adult'), sub)
    .some(({ p }) => p.final && c.done && c.done[p.final]);
}

function switchCard({ child: c }) {
  const answer = (yes) => {
    state.updateChild(c.id, { readerAsked: true, ...(yes ? { track: 'reader' } : {}) });
    window.dispatchEvent(new HashChangeEvent('hashchange'));   // Home again, in the look her track now has
  };
  return h('section', { class: 'card lined pad-card stack' },
    h('div', { class: 'row' }, h('p', { class: 'grow lead' }, s('switch_q')), speakerBtn(() => speak(s('switch_q'), getLang()), { size: 'md' })),
    said(h('button', { type: 'button', class: 'btn primary', onClick: () => answer(true) }, s('switch_yes'))),
    said(h('button', { type: 'button', class: 'btn outline', onClick: () => answer(false) }, s('switch_no'))));
}

export function register(shell) {
  shell.offer('home.action', { id: 'reader-switch', role: 'secondary', priority: 90, when: (ctx) => readyToRead(ctx.child),
    render: switchCard });
  shell.offer('home.action', { id: 'next', role: 'primary', priority: 10, when: hasLesson,
    render: (ctx) => (ctx.band === 'ey' ? nextEarly(ctx) : ctx.look === 'bold' ? nextBold(ctx) : nextClean(ctx)) });
  shell.offer('home.action', { id: 'subjects', role: 'list', priority: 10, when: (ctx) => hasLesson(ctx) && ctx.band !== 'ey',
    render: (ctx) => (ctx.band === 'ad' ? trackRows(ctx) : ctx.look === 'bold' ? tiles(ctx) : subjectList(ctx)) });
}

