// The list of lessons from the hub's packs (kept on the phone for when the hub is out of reach), and which
// lesson comes next for a child. Every lesson stays open; this only decides what the big button starts.

import * as hub from './hub.js';

// the child's own language is learnt first, then the other subjects
const ORDER = {
  prs: ['dari', 'maths', 'science', 'english', 'pashto'],
  ps: ['pashto', 'maths', 'science', 'english', 'dari'],
};

let list = [];
let loading = null;

export function load(refresh = false) {
  if (!loading || refresh) {
    loading = hub.packs().then((packs) => {
      list = packs.flatMap((p) => p.lessons.map((l) => ({ ...l, pack: p.id, audience: p.audience || 'child',
        ...(p.audience === 'adult' ? { tracks: Array.isArray(p.tracks) && p.tracks.length ? p.tracks : ['reader'] } : {}) })));
      return list;
    });
  }
  return loading;
}

export const all = () => list;
// drafts are served only where reviewers look (staging, a hub not in release mode): then the draft band shows
export const isDraft = (l) => (l.draft ?? l.review !== 'checked');
export const hasDrafts = () => list.some(isDraft);
export const get = (id) => list.find((l) => l.id === id) || null;
export const byCode = (code) => list.find((l) => l.code && l.code.toUpperCase() === String(code).toUpperCase()) || null;
export const subjectOrder = (lang) => ORDER[lang] || ORDER.prs;

const byOrder = (a, b) => a.year - b.year || a.order - b.order || a.id.localeCompare(b.id);

// Adults learn from adult packs only (adult objects, no childish pictures); children from the others. Since P26 an
// adult pack says which tracks see it (`tracks`, the reader track by default): the literacy track sees reading and
// everyday maths, the reader track every adult pack (C4.3).
const forAdults = (c) => c && c.band === 'ad';
export const trackFits = (c, l) => !forAdults(c) || (l.tracks || ['reader']).includes(c.track === 'reader' ? 'reader' : 'literacy');
const fits = (c, l) => (l.audience === 'adult') === forAdults(c) && trackFits(c, l);
export const hasAdultLessons = (c = null) => list.some((l) => l.audience === 'adult' && (!c || trackFits(c, l)));

// A subject's lessons for this learner's year (an adult: every adult lesson in it). Children not in school yet
// (year 0) get year 0 and 1 lessons.
export function mine(c, subject) {
  if (forAdults(c)) return list.filter((l) => l.subject === subject && fits(c, l)).sort(byOrder);
  const years = c.year === 0 ? [0, 1] : [c.year];
  return list.filter((l) => l.subject === subject && years.includes(l.year) && fits(c, l)).sort(byOrder);
}

export function progress(c, subject) {
  const ls = mine(c, subject);
  return { done: ls.filter((l) => c.done[l.id]).length, total: ls.length };
}

// what the big button starts: the lesson they left half way, else the first not done (one subject after
// another, so a child is not stuck on one subject), else the first of their lessons
export function next(c) {
  if (!c) return null;
  if (c.last && c.step[c.last] !== undefined && get(c.last)) return get(c.last);
  const order = subjectOrder(c.lang);
  const own = order.flatMap((s) => mine(c, s))
    .sort((a, b) => a.order - b.order || order.indexOf(a.subject) - order.indexOf(b.subject));
  if (own.length) return own.find((l) => !c.done[l.id]) || own[0];
  if (forAdults(c)) return null;           // no adult pack yet: Home says lessons for adults are coming
  // no lessons for this year yet: the nearest year that has some (the lower one when two are as near)
  const near = list.filter((l) => fits(c, l)).sort((a, b) => Math.abs(a.year - c.year) - Math.abs(b.year - c.year) || a.year - b.year
    || a.order - b.order || order.indexOf(a.subject) - order.indexOf(b.subject));
  return near.find((l) => !c.done[l.id]) || near[0] || null;
}

// the lesson after this one in the same subject and year, for "next lesson" at the end
export function after(c, lesson) {
  const ls = list.filter((l) => l.subject === lesson.subject && l.year === lesson.year).sort(byOrder);
  const i = ls.findIndex((l) => l.id === lesson.id);
  return ls.slice(i + 1).find((l) => !c.done[l.id]) || next(c);
}

// "today's sheet": the next lesson's sheet, else the sheet of the lesson done most recently
export function sheetLesson(c) {
  const n = next(c);
  if (n && n.sheet) return n;
  const done = Object.entries(c.done).sort((a, b) => b[1].at - a[1].at).map(([id]) => get(id));
  return done.find((l) => l && l.sheet) || list.find((l) => l.sheet) || null;
}
