// Her own questions (P32, C4.8; module `made`, off everywhere until an admin turns it on): s1, s2 and adult readers.
// Layer 1 is on the phone: a question about a lesson, its answer and an optional why, each at most 300 characters,
// in her language, text only, at most 50 (state `made`). They join her warm-ups, where she marks herself ("I knew it"
// or "Not yet"), since no code knows her answer; nothing is recorded or sent for that. Typing refuses a web address,
// an email, a run of seven digits or "my name is ..." as she types (the identifier filter's rules), so no name or
// number goes in. Layer 2, where `teacher` is on and she has joined: "Ask my teacher to check" sends one item; the
// verdict comes back to #/made. Entry: the lesson's end ("Make a question about this lesson", its second action) and
// the last row of each subject page ("My questions"). Nothing on Home, and none for Quran or seerah lessons.

import { s } from '../i18n.js';
import { allows, on } from '../modules.js';
import * as state from '../state.js';
import { h, icon, said } from '../ui.js';

const DAY = 86400000;
export const today = (now = Date.now()) => Math.floor(now / DAY);
const NONE = ['quran', 'seerah'];

// the module is for her: on, for her band, and an adult on the reader track only (as plans are)
export const canMake = (c) => !!c && on('made') && allows('made', c.band) && (c.band !== 'ad' || c.track === 'reader');
// "Ask my teacher to check": the teacher reads To do there, and the hub knows her
export const canSend = (c) => canMake(c) && on('teacher') && !!c.token;

// what the identifier filter would refuse, as she types: a web address, an email, seven digits, "my name is"
const DIGITS = /(?:\+|00)?[0-9۰-۹٠-٩](?:[\s\-.()]{0,2}[0-9۰-۹٠-٩]){6,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|af|edu|gov|io|me|info)\b)/i;
const NAME = /(\bmy name is|\bmy name's|\bi am called|\bi'm called|اسم من|اسمم|نام من|نامم|زما نوم|نوم مې)\s+\S/i;
export function identifierIn(text) {
  const t = String(text || '');
  return DIGITS.test(t) || EMAIL.test(t) || URL.test(t) || NAME.test(t);
}

const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

// a new question: due tomorrow in her warm-ups
export function add(c, { q, a, why = '', lesson = null }, now = Date.now()) {
  const list = [...(c.made || [])];
  if (list.length >= state.MADE_MAX) return null;
  const item = { id: newId(), q: q.trim(), a: a.trim(), why: why.trim(), lang: c.lang || 'prs', lesson,
    at: today(now), due: today(now) + 1 };
  list.push(item);
  state.updateChild(c.id, { made: list });
  return item;
}

export function remove(c, id) {
  state.updateChild(c.id, { made: (c.made || []).filter((x) => x.id !== id) });
}

export function patch(c, id, p) {
  state.updateChild(c.id, { made: (c.made || []).map((x) => (x.id === id ? { ...x, ...p } : x)) });
}

// up to `room` of her questions due today, oldest due first, none from the lesson she is opening
export function due(c, lessonId, room, now = Date.now()) {
  if (!canMake(c) || room <= 0) return [];
  const d = today(now);
  return (c.made || []).filter((x) => x.due <= d && x.lesson !== lessonId)
    .sort((a, b) => a.due - b.due || a.at - b.at).slice(0, room)
    .map((x) => ({ key: 'made:' + x.id, made: x, step: { kind: 'made', q: x.q, a: x.a, why: x.why } }));
}

// she marked herself: "I knew it" moves it a week on, "Not yet" brings it back tomorrow; nothing is recorded
export function answer(c, id, ok, now = Date.now()) {
  patch(c, id, { due: today(now) + (ok ? 7 : 1) });
}

export function register(shell) {
  shell.offer('lesson.end', { id: 'made-question', priority: 5,
    when: (ctx) => canMake(ctx.child) && !!ctx.lesson && !NONE.includes(ctx.lesson.subject)
      && (ctx.child.made || []).length < state.MADE_MAX,
    render: ({ lesson: l }) => said(h('a', { class: 'btn outline', href: '#/made/new/' + encodeURIComponent(l.id) },
      icon('plus', 22), s('made_make'))) });
}
