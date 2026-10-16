// First screen: language and year. Tapping a year starts at once; the year sets the band and the look. No name is
// ever asked (F3). The adult doors, the class code and the rest of sign-up arrive with P10 (DESIGN.md 6).
// Also used as #/welcome/edit to change the year or language of the learner using the phone.

import { dir, fa, getLang, htmlLang, s, setLang } from '../i18n.js';
import * as state from '../state.js';
import { fill, h, topbar } from '../ui.js';

const LANG_NAMES = [['prs', 'دری'], ['ps', 'پښتو'], ['en', 'English']];

export default function welcome([mode]) {
  const editing = mode === 'edit' ? state.child() : null;
  let lang = editing ? editing.lang : getLang();
  const root = h('div', { class: 'screen' });

  function pick(year) {
    if (editing) state.updateChild(editing.id, { year, band: null, lang });
    else state.addChild({ year, lang });
    location.hash = '#/home';
  }

  function draw() {
    setLang(lang);
    document.documentElement.lang = htmlLang(lang);
    document.documentElement.dir = dir(lang);
    const yearBtn = (y) => h('button', { type: 'button', class: 'y' + y,
      'aria-label': s('year_n', { n: y }), onClick: () => pick(y) }, fa(y));
    fill(root,
      topbar({ back: state.children().length ? '#/who' : null, sub: editing ? s('change_year') : s('welcome_kicker'),
        title: s('welcome_title') }),
      h('div', { class: 'langs', role: 'group', 'aria-label': s('language') },
        LANG_NAMES.map(([code, label]) => h('button', { type: 'button', class: code === lang ? 'on' : '', lang: htmlLang(code),
          'aria-pressed': code === lang ? 'true' : 'false', onClick: () => { lang = code; draw(); } }, label))),
      h('section', { class: 'yearbox primary' },
        h('div', { class: 'head' }, h('b', {}, s('primary')), h('span', {}, s('primary_note'))),
        h('div', { class: 'years' }, [1, 2, 3, 4, 5, 6].map(yearBtn)),
        h('button', { type: 'button', class: 'dashed', onClick: () => pick(0) }, s('not_in_school'))),
      h('section', { class: 'yearbox secondary' },
        h('div', { class: 'head' }, h('b', {}, s('secondary')), h('span', {}, s('secondary_note'))),
        h('div', { class: 'years' }, [7, 8, 9, 10, 11, 12].map((y) =>
          h('button', { type: 'button', 'aria-label': s('year_n', { n: y }), onClick: () => pick(y) }, fa(y))))),
      editing ? null : h('a', { class: 'link teacher-link', href: '#/teacher' }, s('teacher')),
    );
  }

  draw();
  return { el: root, tab: null };
}
