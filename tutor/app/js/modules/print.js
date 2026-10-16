// The print module's offers: "print today's sheet" on the bold Home (the clean Home has the Print tab for it, F6;
// early years have only the play and listen buttons), and the worksheet card at the end of a lesson. The Print screen itself is screens/print.js.

import { s } from '../i18n.js';
import { h, icon } from '../ui.js';

export function register(shell) {
  shell.offer('home.action', { id: 'print-today', role: 'secondary', priority: 10,
    when: (ctx) => ctx.look === 'bold' && ctx.band !== 'ey' && !!(ctx.lesson && ctx.lesson.sheet),
    render: ({ lesson: l }) => h('div', { class: 'pad top-gap' },
      h('a', { class: 'btn warm big', href: '#/print/' + encodeURIComponent(l.id) }, icon('printer', 30, 2.4), s('print_today'))) });
  shell.offer('lesson.end', { id: 'worksheet', priority: 10,
    when: (ctx) => !!(ctx.lesson && ctx.lesson.sheet),
    render: ({ lesson: l }) => h('div', { class: 'card lined sheet-card' },
      icon('printer', 34, 2.2),
      h('div', { class: 'grow' }, h('b', {}, s('worksheet')), h('small', {}, s('worksheet_note'))),
      h('a', { class: 'btn warm', href: '#/print/' + encodeURIComponent(l.id) }, s('print_it'))) });
}
