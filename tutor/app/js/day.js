// The virtual school day on the phone (P19; C2.4, C3.1, DESIGN-C2C3-SPECS.md items 4 and 10).
// The cohort's timetable for her band comes from /api/m/timetable without a token and is kept on the phone, so the
// day works offline. From it the phone works out today's blocks (opening, periods, a break, sheet time, close), where
// the day is now, when the next bell is, and which lesson fills each period. Nothing about the day is sent and no
// event is recorded (F5).
// Per learner on the phone (state.js): `day` 'on' or 'off' (unset counts as on: C2.4), `bells` ('off' when she
// switched them off; on by default), `shift` (her start time moved by -120 to +120 minutes, in steps of 30).
// The pure functions take the timetable and a date, so the rules are tested without a screen (app/tests/day.test.js).
//
// Closed-app alarms are the Android app's (P23), and only after she answers "This phone is mine": this page hands
// that app a 7-day plan through a bridge the app adds, `globalThis.QalamAndroid` with `setAlarms(json)` and
// `cancelAlarms()`, whose notifications say only "Qalam". A browser has no bridge, so `syncAlarms` does nothing there
// and no web notification or Web Push is ever used (C3.1).

import { fa, s } from './i18n.js';
import * as modules from './modules.js';
import * as state from './state.js';

export const BANDS = ['p1', 'p2', 's1', 's2'];
export const SHIFT = { min: -120, max: 120, step: 30 };
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];         // Date.getDay() order
const WAKE_BEFORE = 30;                                                     // the APK's wake-up: 30 minutes early

export const toMin = (hhmm) => { const [a, b] = String(hhmm).split(':').map(Number); return a * 60 + b; };
export const minuteOf = (d) => d.getHours() * 60 + d.getMinutes();
const pad2 = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const clampShift = (n) => (Number.isInteger(n) && n % SHIFT.step === 0
  ? Math.max(SHIFT.min, Math.min(SHIFT.max, n)) : 0);

// a timetable as the hub serves it, checked again here: anything odd means no school day rather than a broken one
export function valid(tt) {
  return !!tt && typeof tt === 'object' && Array.isArray(tt.days) && Array.isArray(tt.blocks) && tt.blocks.length > 0
    && /^\d\d:\d\d$/.test(tt.start || '') && tt.blocks.every((b) => b && typeof b.kind === 'string' && Number.isInteger(b.min));
}

// Today's day for a date: {school, why ('weekend', 'holiday' or 'none' when there is no school), blocks}, each block
// {i, kind, subject, start, end, n}: minutes from midnight, n the period's number (0 for other blocks). In Ramadan
// the day starts at the Ramadan time and periods take its shorter length.
export function dayOf(tt, date, shift = 0) {
  if (!valid(tt)) return { school: false, why: 'none', blocks: [] };
  const key = dateKey(date);
  if (!tt.days.includes(WEEK[date.getDay()])) return { school: false, why: 'weekend', blocks: [] };
  if ((tt.holidays || []).includes(key)) return { school: false, why: 'holiday', blocks: [] };
  const r = tt.ramadan && key >= tt.ramadan.from && key <= tt.ramadan.to ? tt.ramadan : null;
  let t = Math.max(0, toMin(r ? r.start : tt.start) + clampShift(shift));
  let n = 0;
  const blocks = tt.blocks.map((b, i) => {
    const len = b.kind === 'period' && r ? r.period_min : b.min;
    const x = { i, kind: b.kind, subject: b.kind === 'period' ? b.subject || 'auto' : null, start: t, end: t + len,
      n: b.kind === 'period' ? ++n : 0 };
    t += len;
    return x;
  });
  return { school: true, why: null, blocks };
}

// where the day is at minute m: before it starts, in a block, or after the close
export function where(day, m) {
  const b = day.blocks;
  if (!day.school || !b.length) return { phase: 'none', block: null, next: null };
  if (m < b[0].start) return { phase: 'before', block: null, next: b[0] };
  const cur = b.find((x) => m >= x.start && m < x.end);
  if (cur) return { phase: 'in', block: cur, next: b[cur.i + 1] || null };
  return { phase: 'after', block: null, next: null };
}

// the minute of the next change after m: a block's start (a bell), or the close's end (Home says the day is done);
// null when nothing is left today
export function nextBoundary(day, m) {
  for (const x of day.blocks) if (x.start > m) return x.start;
  const last = day.blocks[day.blocks.length - 1];
  return last && last.end > m ? last.end : null;
}

// which bell a block starts with
export const bellOf = (kind) => (kind === 'break' ? 'break' : kind === 'close' ? 'end' : 'start');

// Each period gets a lesson. A period with its own subject takes that subject's next lesson. An "auto" period takes
// her plan's next lesson first (P22), else the next lesson not done, the subjects taking turns from one day to the
// next. `queue(subject)` lists a subject's lessons for her, not done first; `plan` lists her plan's lessons not done.
export function fill(day, { plan = [], subjects = [], queue = () => [], dayIndex = 0 } = {}) {
  const used = new Set();
  const take = (list) => { const l = (list || []).find((x) => x && !used.has(x.id)); if (l) used.add(l.id); return l || null; };
  const periods = day.blocks.filter((b) => b.kind === 'period').length || 1;
  const live = subjects.filter((x) => queue(x).length);
  let k = 0;
  const blocks = day.blocks.map((b) => {
    if (b.kind !== 'period') return { ...b, lesson: null };
    if (b.subject && b.subject !== 'auto') return { ...b, lesson: take(queue(b.subject)) };
    let lesson = take(plan);
    if (!lesson) {                                       // a plan's period does not use up a subject's turn
      for (let j = 0; !lesson && j < live.length; j++) lesson = take(queue(live[(k + dayIndex * periods + j) % live.length]));
      k++;
    }
    return { ...b, subject: lesson ? lesson.subject : null, lesson };
  });
  return { ...day, blocks };
}

// 8:05, in her digits; with the words for morning and afternoon only when the day crosses noon (item 10)
export function clock(m, words = false) {
  const hh = Math.floor(m / 60) % 24;
  const t = `${hh % 12 || 12}:${pad2(m % 60)}`;
  return words ? s(hh < 12 ? 'day_am' : 'day_pm', { t }) : fa(t);
}
export const crossesNoon = (day) => day.blocks.length > 0 && day.blocks[0].start < 720 && day.blocks[day.blocks.length - 1].end > 720;

// The Android app's alarms (P23): the next `days` days from `from`, the wake-up 30 minutes before the start and a
// bell at each period's start, as times in ms. Only what the alarms need: no lesson, no subject, no learner.
export function alarmPlan(tt, from, shift = 0, days = 7) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
    const day = dayOf(tt, date, shift);
    if (!day.school) continue;
    const at = (m) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, m).getTime();
    out.push({ at: at(day.blocks[0].start - WAKE_BEFORE), kind: 'wake' });
    for (const b of day.blocks) if (b.kind === 'period') out.push({ at: at(b.start), kind: 'bell' });
  }
  return out.filter((x) => x.at > from.getTime());
}

// --- the learner's day, from what the phone keeps ---

const cacheKey = (c) => `timetable.${(c.cohort && c.cohort.id) || 'own'}.${c.band}`;
export const cached = (c) => { const t = c ? state.cache(cacheKey(c)) : null; return valid(t) ? t : null; };
export const keep = (c, tt) => state.cache(cacheKey(c), valid(tt) ? tt : 0);

// the school day is on for her: her band has one in her cohort's timetable (kept on the phone), the module is on, and
// she has not switched it off; unset counts as on (C2.4)
export function dayOn(c) {
  return !!c && BANDS.includes(c.band) && modules.on('timetable') && modules.allows('timetable', c.band)
    && c.day !== 'off' && !!cached(c);
}
// the one-time Home card has been answered
export const asked = (c) => !!c && (c.day === 'on' || c.day === 'off');
export const bellsOn = (c) => !!c && c.bells !== 'off';

// hand the Android app its alarms, or cancel them; nothing happens in a browser. `mine` and `alarms` are the APK's
// own settings (P23), unset here, so until then every call cancels.
export function syncAlarms(c, now = new Date()) {
  const bridge = globalThis.QalamAndroid;
  if (!bridge || typeof bridge.setAlarms !== 'function') return false;
  if (!dayOn(c) || c.mine !== 'yes' || c.alarms === 'off') {
    if (typeof bridge.cancelAlarms === 'function') bridge.cancelAlarms();
    return true;
  }
  bridge.setAlarms(JSON.stringify({ title: 'Qalam', alarms: alarmPlan(cached(c), now, c.shift || 0) }));
  return true;
}
