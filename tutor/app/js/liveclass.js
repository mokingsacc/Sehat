// What the phone knows of its class's live class (P30a, DESIGN-C6-SPECS.md C6.1 and C6.2), and its title: the class open now, from
// /api/hello's `live` (read again every minute while connected) or, inside a timetable's live block, from the live
// poll every 20 seconds (modules/live.js). The timetable's Now card and the live module's Home offer both ask here,
// so neither imports the other. Nothing is kept on the phone but `liveSeen` (state.js): the id of the last class she
// saw end, so a stale hello does not offer it again.

import * as hub from './hub.js';
import { s } from './i18n.js';
import * as modules from './modules.js';

const FRESH_MS = 60e3;
let polled = null;              // {at, live}: the live poll's answer, newer than hello's while fresh

export const ID = /^[a-z0-9]{16}$/;

// "Live class: Maths", or "Live class" for a class with no one subject
export const subjectName = (subject) => (subject && subject !== 'class' ? s(subject) : null);
export const titleFor = (subject) => (subjectName(subject) ? s('live_of', { s: subjectName(subject) }) : s('live_title'));

// the live module can show for her: on for her class and her band (never early years), and the phone online
export const can = (c) => !!c && modules.on('live') && modules.allows('live', c.band) && c.band !== 'ey';

function clean(x) {
  return x && typeof x === 'object' && typeof x.id === 'string' && ID.test(x.id)
    ? { id: x.id, subject: typeof x.subject === 'string' ? x.subject : 'class', since: x.since || null } : null;
}

// the class's open live class, or null: not one she saw end, and only while the module can show for her
export function current(c) {
  if (!can(c)) return null;
  const fromPoll = polled && Date.now() - polled.at < FRESH_MS;
  const info = hub.info();
  const live = clean(fromPoll ? polled.live : info && info.live);
  return live && c.liveSeen !== live.id ? live : null;
}

// the live poll's answer: {id, subject, since, here} or {} (no class open)
export function heard(answer) {
  polled = { at: Date.now(), live: clean(answer) };
}

// for tests
export function reset() { polled = null; }
