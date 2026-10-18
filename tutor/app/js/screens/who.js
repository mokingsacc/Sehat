// Who is learning: brothers and sisters often share one phone. Each learner keeps her own year (or adult track),
// language and progress, on this phone only. No name: her alias picture, the number the server gave it when she
// joined ("Book ۲۷"), and an optional nickname stand for her (DESIGN.md 5). Then "New learner", "Change year or
// language", "Settings" (and Print, for early years, who have no tabs), and the Teacher link while the teacher
// module is on.

import { aliasIcon, aliasName } from '../aliases.js';
import { needsJoin } from '../account.js';
import { fa, getLang, s } from '../i18n.js';
import * as modules from '../modules.js';
import * as state from '../state.js';
import { h, icon, said, topbar } from '../ui.js';

export const yearLabel = (c) => (c.band === 'ad' ? s(c.track === 'reader' ? 'track_reader' : 'track_literacy')
  : c.year === 0 ? s('beginner') : s('year_n', { n: c.year }));

// "Book ۲۷"; before she has joined just "Book", and "Book · waiting to connect" while a join waits to be sent
export function aliasLabel(c, lang = getLang()) {
  const name = aliasName(state.pictureOf(c), lang);         // a stand-in on this phone, when another learner has hers
  if (c.number) return `${name} ${fa(c.number)}`;
  return needsJoin(c) ? `${name} · ${s('waiting_connect')}` : name;
}

// the alias picture on its accent-soft circle (never an initial, a nickname or a photo: ruling 4)
export const aliasPic = (c, size = 22) => h('span', { class: 'ini' }, aliasIcon(state.pictureOf(c), size, 2));

export function whoChip(c) {
  return h('a', { class: 'who', href: '#/who', 'aria-label': s('who_title') },
    aliasPic(c),
    h('span', {}, h('b', {}, c.nickname || aliasLabel(c)), h('small', {}, yearLabel(c))));
}

export default function who() {
  const active = state.child();
  const pickChild = (c) => { state.setActive(c.id); location.hash = '#/home'; };
  const rows = state.children().map((c) => {
    const said1 = [c.nickname, aliasLabel(c), yearLabel(c)].filter(Boolean).join('. ');
    return said(h('button', { type: 'button', class: 'who wide' + (c === active ? ' on' : ''),
      'aria-current': c === active ? 'true' : null, onClick: () => pickChild(c) },
    h('span', { class: 'ini big' }, aliasIcon(state.pictureOf(c), 30, 2)),
    h('span', { class: 'grow' }, h('b', {}, c.nickname || aliasLabel(c)),
      h('small', {}, c.nickname ? `${aliasLabel(c)} · ${yearLabel(c)}` : yearLabel(c))),
    c === active ? icon('check', 26, 3) : null), said1);
  });
  const el = h('div', { class: 'screen' },
    topbar({ back: active ? '#/home' : null, title: s('who_title') }),
    h('div', { class: 'stack pad' },
      rows,
      said(h('a', { class: 'btn outline big', href: '#/welcome' }, icon('plus', 26, 2.6), s('add_child'))),
      active ? said(h('a', { class: 'btn', href: '#/welcome/edit' }, s('change_year'))) : null,
      active ? said(h('a', { class: 'btn', href: '#/settings' }, icon('gear', 22), s('settings'))) : null,
      // early years has no tabs: the grown-up's corner leads here, and Print is reached from here
      active && active.band === 'ey' && modules.on('sheets')
        ? said(h('a', { class: 'btn', href: '#/print' }, icon(modules.printer() ? 'printer' : 'file', 22),
          s(modules.printer() ? 'print' : 'sheets'))) : null),
    modules.on('teacher')
      ? h('div', { class: 'pad teacher-link' }, h('a', { class: 'link', href: '/teacher/' }, icon('lock', 20), s('teacher')))
      : null);
  return { el, tab: null };
}
