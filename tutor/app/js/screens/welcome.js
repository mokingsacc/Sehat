// First screen: language, name (optional) and year. Tapping a year starts at once; the year sets the look.
// Also used as #/welcome/edit to change the year or language of the child using the phone.

import { fa, getLang, s, setLang } from '../i18n.js';
import * as state from '../state.js';
import { fill, h, topbar } from '../ui.js';

const COLOURS = ['#0b6e4f', '#d9600b', '#1f4fa3', '#b23a48', '#7a4a9e', '#0d7c7e'];
const LANG_NAMES = [['prs', 'دری'], ['ps', 'پښتو']];

export default function welcome([mode]) {
  const editing = mode === 'edit' ? state.child() : null;
  let lang = editing ? editing.lang : getLang();
  let name = editing ? editing.name : '';
  const root = h('div', { class: 'screen' });

  function pick(year) {
    if (editing) state.updateChild(editing.id, { year, lang, name: name.trim().slice(0, 30) });
    else state.addChild({ name, year, lang });
    location.hash = '#/home';
  }

  function draw() {
    setLang(lang);
    document.documentElement.lang = lang === 'ps' ? 'ps-AF' : 'fa-AF';
    const input = h('input', { value: name, placeholder: s('name_hint'), 'aria-label': s('name'), maxlength: 30,
      autocomplete: 'off', onInput: (e) => { name = e.target.value; } });
    const yearBtn = (y) => h('button', { type: 'button', style: { background: COLOURS[(y - 1) % 6] },
      'aria-label': s('year_n', { n: y }), onClick: () => pick(y) }, fa(y));
    fill(root,
      topbar({ back: state.children().length ? '#/who' : null, sub: editing ? s('change_year') : s('welcome_kicker'),
        title: s('welcome_title') }),
      h('div', { class: 'langs', role: 'group', 'aria-label': s('language') },
        LANG_NAMES.map(([code, label]) => h('button', { type: 'button', class: code === lang ? 'on' : '',
          'aria-pressed': code === lang ? 'true' : 'false', onClick: () => { lang = code; draw(); } }, label))),
      h('label', { class: 'field' }, h('span', {}, s('name')), input),
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
