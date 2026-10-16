// The sheets module's offers (C2, change 6): "today's sheet" on the bold Home (the clean Home has the third tab for
// it, F6; early years have only the play and listen buttons), and the worksheet card at the end of a lesson. On the
// hub, where the `print` module's queue is on, they say Print; elsewhere "Get the sheet", which the browser prints
// or saves as a PDF. The screen itself is screens/print.js, for both.

import { s } from '../i18n.js';
import { printer } from '../modules.js';
import { h, icon, said } from '../ui.js';

export function register(shell) {
  shell.offer('home.action', { id: 'sheet-today', role: 'secondary', priority: 10,
    when: (ctx) => ctx.look === 'bold' && ctx.band !== 'ey' && !!(ctx.lesson && ctx.lesson.sheet),
    render: ({ lesson: l }) => h('div', { class: 'pad top-gap' },
      said(h('a', { class: 'btn warm big', href: '#/print/' + encodeURIComponent(l.id) },
        icon(printer() ? 'printer' : 'file', 30, 2.4), s(printer() ? 'print_today' : 'get_today')))) });
  shell.offer('lesson.end', { id: 'worksheet', priority: 10,
    when: (ctx) => !!(ctx.lesson && ctx.lesson.sheet),
    render: ({ lesson: l }) => h('div', { class: 'card lined sheet-card' },
      icon(printer() ? 'printer' : 'file', 34, 2.2),
      h('div', { class: 'grow' }, h('b', {}, s('worksheet')), h('small', {}, s('worksheet_note'))),
      said(h('a', { class: 'btn warm', href: '#/print/' + encodeURIComponent(l.id) }, s(printer() ? 'print_it' : 'get_sheet')))) });
}
