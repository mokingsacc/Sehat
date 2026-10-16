// The Check my sheet module's offer: the secondary action on the clean Home (years 7 to 12). The screen itself is
// screens/check.js; the bold Home reaches it from Print and the end of a lesson.

import { s } from '../i18n.js';
import { h, icon } from '../ui.js';

export function register(shell) {
  shell.offer('home.action', { id: 'check-sheet', role: 'secondary', priority: 10,
    when: (ctx) => ctx.look === 'big',
    render: () => h('div', { class: 'row pad top-gap' },
      h('a', { class: 'btn grow', href: '#/check' }, icon('check'), s('check_sheet'))) });
}
