// The homework module's offer (C2 item 3, P15): "Homework help" as Home's secondary action for years 4 to 12 (p2,
// s1, s2) while her school day is not on (C2.4: she said "I go to school", or her cohort has no school day for her
// band; day.js). It opens Ask in homework
// mode (#/ask?hw=1): the hint ladder for exercises and "Check my answer". It shows only while the hub is in reach and
// the AI is on for her language; otherwise the band's usual secondary (today's sheet, Check my sheet) keeps its place.

import { dayOn } from '../day.js';
import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { allows, on } from '../modules.js';
import { h, icon, said } from '../ui.js';

export function aiFor(lang = getLang()) {
  const ai = (hub.info() && hub.info().ai) || {};
  return !!ai.on && (ai.langs || []).includes(lang);
}

export function register(shell) {
  shell.offer('home.action', { id: 'homework-help', role: 'secondary', priority: 20,
    when: (ctx) => on('homework') && allows('homework', ctx.band) && !dayOn(ctx.child) && hub.online() && aiFor(),
    render: ({ look }) => h('div', { class: 'pad top-gap' + (look === 'clean' ? ' row' : '') },
      said(h('a', { class: 'btn ' + (look === 'bold' ? 'warm big' : 'grow'), href: '#/ask?hw=1' },
        icon('bulb', look === 'bold' ? 30 : 22, 2.2), s('hw_title')))) });
}
