// The list of lessons from the hub's packs (kept on the phone for when the hub is out of reach), and which
// lesson comes next for a child. Every lesson stays open; this only decides what the big button starts.

import { bandOfYear } from './bands.js';
import * as hub from './hub.js';
import { addVoices } from './speech.js';

// the child's own language is learnt first, then the other subjects
const ORDER = {
  prs: ['dari', 'maths', 'science', 'english', 'pashto'],
  ps: ['pashto', 'maths', 'science', 'english', 'dari'],
};
// subjects she chooses (P27a: Chinese for s2 and adult readers; P29: Quran and seerah): listed after the school
// subjects only where she has lessons in them, and never started by the big button on its own
export const CHOSEN = ['chinese', 'quran', 'seerah'];

let list = [];
let loading = null;

export function load(refresh = false) {
  if (!loading || refresh) {
    loading = hub.packs().then((packs) => {
      for (const p of packs) addVoices(p.voices, hub.url);        // the titles' clips, in the one voice (C5.6)
      list = packs.flatMap((p) => p.lessons.map((l) => ({ ...l, pack: p.id, audience: p.audience || 'child',
        ...(p.audience === 'adult' || (p.bands || []).includes('ad')
          ? { tracks: Array.isArray(p.tracks) && p.tracks.length ? p.tracks : ['reader'] } : {}),
        ...(Array.isArray(p.bands) && p.bands.length ? { bands: p.bands } : {}) })));
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
// everyday maths, the reader track every adult pack (C4.3). Since P27a a pack may name its `bands` instead (the
// Chinese starter: s2 and adult readers): it shows to those bands only, whatever their year, adults by its tracks.
const forAdults = (c) => c && c.band === 'ad';
export const trackFits = (c, l) => !forAdults(c) || (l.tracks || ['reader']).includes(c.track === 'reader' ? 'reader' : 'literacy');
const fits = (c, l) => (l.bands ? !!c && l.bands.includes(c.band) : (l.audience === 'adult') === forAdults(c)) && trackFits(c, l);
export const hasAdultLessons = (c = null) => list.some((l) => (l.audience === 'adult' || (l.bands || []).includes('ad'))
  && (!c || trackFits(c, l)));

// A subject's lessons for this learner's year (an adult: every adult lesson in it; a pack with bands: all of it).
// Children not in school yet (year 0) get year 0 and 1 lessons.
export function mine(c, subject) {
  if (forAdults(c)) return list.filter((l) => l.subject === subject && fits(c, l)).sort(byOrder);
  const years = c.year === 0 ? [0, 1] : [c.year];
  return list.filter((l) => l.subject === subject && (l.bands || years.includes(l.year)) && fits(c, l)).sort(byOrder);
}

// is this lesson one for her band (her plans, pathways and certificates draw on these)
export function serves(c, l) {
  if (!c) return false;
  if (l.bands) return fits(c, l);
  return forAdults(c) ? l.audience === 'adult' && trackFits(c, l) : l.audience !== 'adult' && bandOfYear(l.year) === c.band;
}

// the subjects on her list: the school subjects, then the chosen ones where she has lessons
export const subjectsFor = (c) => [...subjectOrder(c.lang), ...CHOSEN.filter((sub) => mine(c, sub).length)];

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
  const own = order.flatMap((s) => mine(c, s))       // the school subjects only: a chosen one waits for her tap
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
