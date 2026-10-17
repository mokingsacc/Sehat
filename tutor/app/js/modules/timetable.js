// The virtual school day (P19; C2.4 and C3.1, DESIGN-C2C3-SPECS.md items 4 and 10). Home's offers while her day
// is on (day.js says when): the Now card (primary), "Your school day" once (secondary, top priority, until she
// answers it) and the Today list (the list); Settings → School day (settings.row); and the bells.
// - The day comes from her cohort's timetable for her band, fetched without a token and kept on the phone, so it
//   works offline. No timetable kept: no card and no school day.
// - Bells ring only while Qalam is on screen (document.visibilityState), on by default, off in one tap (Home's bell
//   button or Settings). A timer runs to the next block's start; coming back to the page works the day out again,
//   with no catch-up bells. The first tap anywhere unlocks sound (C3.1), so the first bell is not blocked.
// - At each bell: the sound, a toast ("Period 2: Maths") and Home's Now card moves on; in a lesson nothing else
//   changes. The opening, sheet time and the close also say their line.
// - The kill switch (the cohort's timetable module off) takes it all away at the next read of /api/hello, silently.
// - No web notification and no Web Push, ever; closed-app alarms are the Android app's (day.syncAlarms, P23).
// Nothing about her day is sent and no event is recorded (F5).

import * as day from '../day.js';
import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import { allows, on } from '../modules.js';
import { chime, hasVoice, sayKey, speak, unlockOnFirstTap } from '../speech.js';
import { readsOnOpen } from '../bands.js';
import * as state from '../state.js';
import { fill, h, icon, playIcon, plain, said, speakerBtn, subjectBadge, toast } from '../ui.js';
import { aiFor } from './homework.js';

const BELLS = { start: 'audio/bells/start.opus', break: 'audio/bells/break.opus', end: 'audio/bells/end.opus' };
const REFRESH_MS = 30 * 60e3;          // the timetable is read again at most every half hour while online
const BLOCK_ICON = { opening: 'bell', break: 'cup', sheet: 'file', close: 'bell' };
const EVENT = 'qalam-day';             // the day moved on, or her day settings changed: Home redraws

const fetched = new Map();             // cache key -> when it was last asked for
let timer = null;
let cardRead = null;

// --- the day, worked out for her ---

const dayIndex = (d) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);

function queue(c) {
  return (subject) => {
    const ls = library.mine(c, subject);
    return [...ls.filter((l) => !c.done[l.id]), ...ls.filter((l) => c.done[l.id])];
  };
}

// her plan's lessons not done yet (P22 keeps the plan on the phone)
function planLessons(c) {
  const ids = (c.plan && Array.isArray(c.plan.lessons) && c.plan.lessons) || [];
  return ids.map((id) => library.get(id)).filter((l) => l && !c.done[l.id]);
}

export function today(c, now = new Date()) {
  const d = day.dayOf(day.cached(c), now, c.shift || 0);
  return day.fill(d, { plan: planLessons(c), subjects: library.subjectOrder(c.lang), queue: queue(c), dayIndex: dayIndex(now) });
}

const changed = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window in tests */ } };

// the timetable for her band, from the hub; kept on the phone. A 404 means no school day there: the copy goes.
async function refresh(c, force = false) {
  if (!c || !day.BANDS.includes(c.band) || !hub.online() || !on('timetable')) return;
  const key = `${(c.cohort && c.cohort.id) || 'own'}.${c.band}`;
  if (!force && Date.now() - (fetched.get(key) || 0) < REFRESH_MS) return;
  fetched.set(key, Date.now());
  const before = JSON.stringify(day.cached(c));
  try {
    day.keep(c, (await hub.timetable(c.band)).timetable);
  } catch (e) {
    if (e.status === 404) day.keep(c, null); else return;
  }
  if (JSON.stringify(day.cached(c)) !== before) { changed(); arm(); }
}

// --- the bells ---

function announce(c, b, d) {
  const lang = getLang();
  if (b.kind === 'period') {
    toast(s('bell_period', { n: b.n, subject: b.subject ? s(b.subject) : s('block_period') }));
  } else if (b.kind === 'opening') {
    const subjects = [...new Set(d.blocks.filter((x) => x.subject).map((x) => s(x.subject)))];
    const list = subjects.join(lang === 'en' ? ', ' : '، ');
    setTimeout(() => sayKey('day_greeting', lang, { list }, { shown: true }), 1600);
  } else if (b.kind === 'break') {
    toast(s('day_break', { t: day.clock(b.end) }));
  } else if (b.kind === 'sheet') {
    setTimeout(() => sayKey('day_sheet', lang, null, { shown: true }), 1600);
  } else if (b.kind === 'close') {
    setTimeout(() => sayKey('day_over', lang, null, { shown: true }), 1600);
  }
}

function fire() {
  timer = null;
  const c = state.child();
  if (document.visibilityState === 'visible' && day.dayOn(c)) {
    const now = new Date();
    const d = today(c, now);
    const b = d.blocks.find((x) => x.start === day.minuteOf(now));
    if (b) {
      if (day.bellsOn(c)) chime(BELLS[day.bellOf(b.kind)]);
      announce(c, b, d);
    }
    changed();
  }
  arm();
}

// a timer to the next block's start (or the close's end), only while the page is on screen; after the day, the next
// look is just after midnight
export function arm() {
  clearTimeout(timer);
  timer = null;
  const c = state.child();
  day.syncAlarms(c);
  if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !day.dayOn(c)) return;
  const now = new Date();
  const next = day.nextBoundary(day.dayOf(day.cached(c), now, c.shift || 0), day.minuteOf(now));
  const at = next === null ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, next, 0, 200);
  timer = setTimeout(next === null ? arm : fire, Math.max(250, at - now));
}

function watch() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { changed(); arm(); } else { clearTimeout(timer); timer = null; }
  });
  window.addEventListener('hashchange', () => { arm(); refresh(state.child()); });
  window.addEventListener(EVENT, () => { if (!timer) arm(); });
}

// --- Home ---

const daySet = (patch) => { const c = state.child(); state.updateChild(c.id, patch); changed(); arm(); };

// Homework help can take her (C2.4): the module is on for her band, the phone is online and the AI speaks her language
const homeworkReady = (ctx) => on('homework') && allows('homework', ctx.band) && hub.online() && aiFor();

// "Your school day", until she answers it; there is no "Not now": ignoring it leaves the day on (C2.4)
function dayCard(ctx) {
  const hw = homeworkReady(ctx);
  const lines = [s('day_title'), s('day_card')].join('. ');
  const c = ctx.child;
  if (ctx.look === 'bold' && !readsOnOpen(c.band, c.track, 'home') && cardRead !== c.id && hasVoice(getLang())) {
    cardRead = c.id;                       // p2: the card's lines are read on open (bold bands)
    setTimeout(() => speak(lines, getLang()), 500);
  }
  return h('section', { class: 'card lined pad-card stack daycard' },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, s('day_title')),
      speakerBtn(() => speak(lines, getLang()), { size: 'sm' })),
    h('p', { class: 'lead' }, s('day_card')),
    said(h('button', { type: 'button', class: 'btn primary big', onClick: () => daySet({ day: 'on' }) },
      icon('bell', 26, 2.2), s('day_yes'))),
    said(h('button', { type: 'button', class: 'btn outline big', onClick: () => daySet({ day: 'off' }) },
      icon('bag', 26, 2.2), s(hw ? 'day_no_hw' : 'day_no'))));
}

const lessonHref = (l) => '#/lesson/' + encodeURIComponent(l.id);
const titleOf = (b) => (b.kind === 'period'
  ? [b.subject ? s(b.subject) : s('block_period'), b.lesson ? plain(b.lesson.title) : null].filter(Boolean).join(' · ')
  : s('block_' + b.kind));

function kicker(d, w, words) {
  const t = (m) => day.clock(m, words);
  if (!d.school) return s('day_none');
  if (w.phase === 'before') return s('day_starts', { t: t(d.blocks[0].start) });
  if (w.phase === 'after') return s('day_done');
  const b = w.block;
  if (b.kind === 'period') return s('day_period', { n: b.n, a: t(b.start), b: t(b.end) });
  if (b.kind === 'opening') return s('day_opening', { a: t(b.start), b: t(b.end) });
  if (b.kind === 'break') return s('day_break', { t: t(b.end) });
  if (b.kind === 'sheet') return s('day_sheet_title');
  return s('day_done');
}

// The Now card: the period on now with its lesson and play button; before school, the time it starts above the
// first lesson; in the break, a cup and no play button; in sheet time, today's sheet; after the close, on a day
// with no school, the next lesson as the continue card would show it. In bold bands the 100 px play button sits
// under the kicker.
function nowCard(ctx) {
  const c = ctx.child;
  const now = new Date();
  const d = today(c, now);
  const w = day.where(d, day.minuteOf(now));
  const words = day.crossesNoon(d);
  const b = w.block;
  const top = kicker(d, w, words);
  const firstPeriod = d.blocks.find((x) => x.kind === 'period' && x.lesson);
  const lesson = b && b.kind === 'period' ? b.lesson
    : w.phase === 'before' || (b && b.kind === 'opening') ? (firstPeriod && firstPeriod.lesson) || ctx.lesson
      : b && (b.kind === 'break') ? null : ctx.lesson;
  const sheet = b && b.kind === 'sheet' ? library.sheetLesson(c) : null;
  const done = w.phase === 'in' ? b.i : w.phase === 'after' ? d.blocks.length : 0;
  const progress = d.school && w.phase === 'in'
    ? [h('div', { class: 'bar' }, h('span', { style: { width: Math.round((100 * done) / d.blocks.length) + '%' } })),
      h('small', { class: 'muted' }, s('day_progress', { a: done, b: d.blocks.length }))] : null;
  const note = b && b.kind === 'period' ? h('small', { class: 'muted' }, s('day_paper')) : null;
  const what = lesson ? (b && b.kind === 'period' ? titleOf(b) : [s(lesson.subject), plain(lesson.title)].join(' · ')) : null;
  const play = (size) => (lesson ? h('a', { class: 'play', href: lessonHref(lesson), 'aria-label': s('start_lesson') }, playIcon(size)) : null);
  const cup = b && b.kind === 'break' ? h('span', { class: 'nowpic', 'aria-hidden': 'true' }, icon('cup', 56, 2)) : null;
  const sheetBtn = sheet ? said(h('a', { class: 'btn warm', href: '#/print/' + encodeURIComponent(sheet.id) }, icon('file', 22),
    s('day_sheet'))) : null;
  if (ctx.look === 'bold') {
    return h('section', { class: 'card next-card now' },
      h('span', { class: 'tag' }, top), cup, play(52),
      what ? h('div', { class: 'title' }, what) : null, note, progress, sheetBtn);
  }
  return h('section', { class: 'card soft continue now' }, cup || play(44),
    h('div', { class: 'grow stack-sm' }, h('div', { class: 'kicker' }, top),
      what ? h('div', { class: 'title' }, what) : null, note, progress, sheetBtn));
}

// The Today list: one row per block, the time at the row's start, a subject badge or the block's icon, the title, ✓
// when it is over or its lesson is done, and "now". Then "All subjects", which opens #/subjects. In bold bands the
// same list as tiles, with the time on each (one per row where every button has its speaker).
function todayList(ctx) {
  const c = ctx.child;
  const now = new Date();
  const d = today(c, now);
  if (!d.school) return null;
  const m = day.minuteOf(now);
  const words = day.crossesNoon(d);
  const bold = ctx.look === 'bold';
  const rows = d.blocks.map((b) => {
    const isNow = m >= b.start && m < b.end;
    const over = b.end <= m || (b.lesson && c.done[b.lesson.id]);
    const href = b.kind === 'period' && b.lesson ? lessonHref(b.lesson)
      : b.kind === 'sheet' && library.sheetLesson(c) ? '#/print/' + encodeURIComponent(library.sheetLesson(c).id) : null;
    const badge = b.kind === 'period' && b.subject ? subjectBadge(b.subject, bold ? 46 : 36)
      : h('span', { class: 'bicon' }, icon(BLOCK_ICON[b.kind] || 'clock', bold ? 28 : 22, 2.2));
    const kids = [h('span', { class: 'time' }, day.clock(b.start, words)), badge,
      h('span', { class: 'grow' }, h('b', {}, titleOf(b))),
      isNow ? h('span', { class: 'tag' }, s('now_tag')) : over ? icon('check', 22, 2.6) : null];
    const cls = (bold ? 'tile trow' : 'trow') + (isNow ? ' now' : '');
    return said(href ? h('a', { class: cls, href }, kids) : h('div', { class: cls }, kids));
  });
  const all = said(h('a', { class: bold ? 'tile trow all' : 'trow all', href: '#/subjects' },
    h('span', { class: 'grow' }, h('b', {}, s('all_subjects'))), icon('chev', 22)));
  return [h('div', { class: 'section-head' }, h('h2', {}, s('today'))),
    bold ? h('div', { class: 'tiles one' }, rows, all)
      : h('nav', { class: 'subjects today', 'aria-label': s('today') }, rows, all)];
}

// --- Settings → School day ---

function settingsRow(ctx) {
  const box = h('section', { class: 'card lined set-row' });
  const sw = (label, onNow, toggle) => h('div', { class: 'row' }, h('b', { class: 'grow' }, label),
    h('button', { type: 'button', class: 'switch' + (onNow ? ' on' : ''), role: 'switch', 'aria-checked': String(onNow),
      'aria-label': label, onClick: toggle }, h('span', { class: 'knob' })));
  const draw = () => {
    const c = state.child();
    const dayIsOn = c.day !== 'off';
    const shift = day.clampShift(c.shift || 0);
    const start = day.toMin(day.cached(c).start) + shift;
    const set = (patch) => { daySet(patch); draw(); };
    fill(box,
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', {}, s('school_day')), h('small', {}, s('school_day_note'))),
        speakerBtn(() => speak([s('school_day'), s('school_day_note')].join('. '), getLang()), { size: 'sm' })),
      sw(s('school_day'), dayIsOn, () => set({ day: dayIsOn ? 'off' : 'on' })),
      dayIsOn ? sw(s('bells'), day.bellsOn(c), () => set({ bells: day.bellsOn(c) ? 'off' : 'on' })) : null,
      dayIsOn ? h('div', { class: 'row' }, h('b', { class: 'grow' }, s('start_time')),
        h('button', { type: 'button', class: 'round', 'aria-label': s('start_earlier'), disabled: shift <= day.SHIFT.min || null,
          onClick: () => set({ shift: shift - day.SHIFT.step }) }, icon('minus', 22)),
        h('span', { class: 'stepper-v', 'aria-live': 'polite' }, day.clock(start)),
        h('button', { type: 'button', class: 'round', 'aria-label': s('start_later'), disabled: shift >= day.SHIFT.max || null,
          onClick: () => set({ shift: shift + day.SHIFT.step }) }, icon('plus', 22))) : null);
  };
  draw();
  return box;
}

// the school day can be hers: her band has one in the timetable kept on the phone
const hasDay = (ctx) => !!ctx.child && day.BANDS.includes(ctx.band) && allows('timetable', ctx.band) && !!day.cached(ctx.child);

export function register(shell) {
  shell.offer('home.action', { id: 'day-card', role: 'secondary', priority: 100,
    when: (ctx) => day.dayOn(ctx.child) && !day.asked(ctx.child), render: dayCard });
  shell.offer('home.action', { id: 'now', role: 'primary', priority: 50, when: (ctx) => day.dayOn(ctx.child), render: nowCard });
  shell.offer('home.action', { id: 'today', role: 'list', priority: 50,
    when: (ctx) => day.dayOn(ctx.child) && today(ctx.child).school, render: todayList });
  shell.offer('settings.row', { id: 'school-day', priority: 10, when: hasDay, render: settingsRow });
  unlockOnFirstTap(Object.values(BELLS));
  watch();
  refresh(state.child(), true);
  arm();
}
