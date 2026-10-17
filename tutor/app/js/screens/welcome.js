// Welcome (DESIGN.md 6): one scrolling screen, its title read on open, a speaker on every head and door. Language;
// primary years 1 to 6 and the dashed "Not in school yet" (year 0, early years); secondary years 7 to 12; the two
// adult doors; at the foot "I have a class code" and, while the teacher module is on, "Teacher". No name field: one
// tap on a year or door creates the learner on this phone with an alias picture no other learner here has, and goes
// on through the sign-up steps (signup.js) to Home. With a class code (?join=CODE, or typed) the kicker says "Class
// code found" and the steps are consent, then the lock offer.
// Also #/welcome/edit, to change the year, door or language of the learner using the phone.

import { dir, fa, getLang, htmlLang, s, setLang } from '../i18n.js';
import * as modules from '../modules.js';
import { hasVoice, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn, topbar } from '../ui.js';
import * as signup from './signup.js';

const LANG_NAMES = [['prs', 'دری'], ['ps', 'پښتو'], ['en', 'English']];
let readFor = null;          // the title is read once per visit to Welcome, not on every redraw

export default function welcome([mode]) {
  const editing = mode === 'edit' ? state.child() : null;
  let lang = editing ? editing.lang : getLang();
  const code = editing ? null : signup.pendingCode();
  const root = h('div', { class: 'screen welcome' });

  function pick(learner) {
    if (editing) {
      state.updateChild(editing.id, { year: null, band: null, track: null, ...learner, lang });
      location.hash = '#/home';
      return;
    }
    state.addChild({ ...learner, lang, code });
    signup.pendingCode(null);
    location.hash = signup.next('', 'home');
  }

  const say = (text) => () => speak(text, getLang());
  const head = (title, note) => h('div', { class: 'head' }, h('b', {}, title), h('span', { class: 'grow' }, note),
    speakerBtn(say(`${title}. ${note}`), { size: 'sm' }));

  function draw() {
    setLang(lang);
    document.documentElement.lang = htmlLang(lang);
    document.documentElement.dir = dir(lang);
    const yearBtn = (y, cls = '') => h('button', { type: 'button', class: cls, 'aria-label': s('year_n', { n: y }),
      onClick: () => pick({ year: y }) }, fa(y));
    fill(root,
      topbar({ back: state.children().length ? '#/who' : null,
        sub: editing ? s('change_year') : code ? s('code_found') : s('welcome_kicker'), title: s('welcome_title') }),
      h('div', { class: 'langs', role: 'group', 'aria-label': s('language') },
        LANG_NAMES.map(([c, label]) => h('button', { type: 'button', class: c === lang ? 'on' : '', lang: htmlLang(c),
          'aria-pressed': c === lang ? 'true' : 'false', onClick: () => { lang = c; draw(); } }, label))),
      h('section', { class: 'yearbox primary' },
        head(s('primary'), s('primary_note')),
        h('div', { class: 'years' }, [1, 2, 3, 4, 5, 6].map((y) => yearBtn(y, 'y' + y))),
        said(h('button', { type: 'button', class: 'dashed', onClick: () => pick({ year: 0 }) }, s('not_in_school')))),
      h('section', { class: 'yearbox secondary' },
        head(s('secondary'), s('secondary_note')),
        h('div', { class: 'years' }, [7, 8, 9, 10, 11, 12].map((y) => yearBtn(y)))),
      h('section', { class: 'yearbox secondary adults' },
        head(s('adults'), s('adults_note')),
        h('div', { class: 'stack doors' },
          ['literacy', 'reader'].map((track) => h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn grow', onClick: () => pick({ band: 'ad', track }) },
              s('track_' + track)),
            speakerBtn(say(s('track_' + track)), { size: 'sm' }))))),
      editing ? null : h('div', { class: 'foot' },
        h('div', { class: 'row' }, h('a', { class: 'link grow', href: '#/signup/code' }, icon('card', 20), s('have_code')),
          speakerBtn(say(s('have_code')), { size: 'sm' })),
        modules.on('teacher') ? h('a', { class: 'link teacher-link', href: '/teacher/' }, icon('lock', 20), s('teacher')) : null),
    );
  }

  draw();
  const key = (editing ? 'edit' : 'new') + (code || '');
  if (readFor !== key && hasVoice(lang)) {
    readFor = key;
    setTimeout(() => speak(s('welcome_title'), getLang()), 400);
  }
  return { el: root, tab: null, cleanup: () => { readFor = null; } };
}
