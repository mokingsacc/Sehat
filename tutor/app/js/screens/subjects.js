// #/subjects: every subject, as Home shows them on a day without school (P19, DESIGN-C2C3-SPECS.md item 4). While
// her school day is on, Home's list is Today's timetable, and its last row, "All subjects", opens this screen.

import * as library from '../library.js';
import * as modules from '../modules.js';
import * as state from '../state.js';
import { s } from '../i18n.js';
import { h, topbar } from '../ui.js';
import { subjectList, tiles } from '../modules/lessons.js';

export default async function subjects() {
  await library.load();
  const ctx = modules.context(state.child(), null);
  const bold = ctx.look === 'bold';
  return { el: h('div', { class: 'screen' }, topbar({ back: '#/home', title: s('all_subjects'), lead: bold ? null : s('every_lesson_open'), child: true }),
    bold ? tiles({ ...ctx, head: false }) : subjectList({ ...ctx, head: false })), tab: 'lessons' };
}
