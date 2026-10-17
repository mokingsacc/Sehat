// Spaced review (P25a, C4.1; module `recall`, as `review` is the reviewers' module). It lives on the phone and plays
// as a short warm-up inside the next lesson, so Home gains nothing.
// - A finished lesson adds up to three items: its steps marked `recall: true`, else its last two `choice` or `number`
//   steps. Quran and seerah lessons add none, and nothing is added or played in early years (`ey`).
// - Five boxes, due after 1, 3, 7, 21 and 60 days: right moves an item up a box, wrong sends it back to box 1, right in
//   box 5 retires it (kept as box 0, so finishing the lesson again does not add it again). At most 300 (state.js).
// - When the big button, the Now card or a plan's card starts a lesson (#/lesson/<id>?warm=1) and items are due, up
//   to three play first (lowest box, then oldest), each exactly as in its own lesson. None in a lesson opened from a
//   hint, and none whose lesson is not on the phone (its steps cached by hub.lesson).
// - Event `recall.item` (lesson:n, 0 or 1) from the phone's queue, only with consent (state.record).
// The module has no slot and no setting for the learner; it is on in `open` and new cohorts (C4.1).

import { allows, on } from '../modules.js';
import * as state from '../state.js';

export const BOXES = [1, 3, 7, 21, 60];
export const PER_LESSON = 3;
export const WARM = 3;
const NONE = ['quran', 'seerah'];
const ASKS = new Set(['choice', 'number']);
const DAY = 86400000;

export const today = (now = Date.now()) => Math.floor(now / DAY);
export const canRecall = (c) => !!c && c.band !== 'ey' && on('recall') && allows('recall', c.band);

// the steps of a lesson that become items (1-based), three at most
export function itemsOf(L) {
  if (!L || !Array.isArray(L.steps) || NONE.includes(L.subject)) return [];
  const asks = L.steps.map((st, k) => ({ st, n: k + 1 })).filter((x) => x.st && ASKS.has(x.st.kind));
  const marked = asks.filter((x) => x.st.recall === true);
  return (marked.length ? marked : asks.slice(-2)).slice(0, PER_LESSON).map((x) => x.n);
}

// a finished lesson: its items join box 1, due tomorrow (one she already has keeps its box)
export function add(c, L, now = Date.now()) {
  if (!canRecall(c)) return 0;
  const r = { ...(c.recall || {}) };
  let n = 0;
  for (const k of itemsOf(L)) {
    const key = `${L.id}:${k}`;
    if (!r[key]) { r[key] = [1, today(now) + BOXES[0]]; n += 1; }
  }
  if (n) state.updateChild(c.id, { recall: r });
  return n;
}

const stepOf = (key) => {
  const [lid, n] = key.split(':');
  const L = state.cache('lesson.' + lid);
  const st = L && Array.isArray(L.steps) ? L.steps[Number(n) - 1] : null;
  return st && ASKS.has(st.kind) ? { lid, n: Number(n), step: st, lesson: L } : null;
};

// the warm-up before `lessonId`: up to three due items from other lessons on the phone, lowest box then oldest
export function due(c, lessonId, now = Date.now()) {
  if (!canRecall(c)) return [];
  const d = today(now);
  return Object.entries(c.recall || {})
    .filter(([k, [box, at]]) => box >= 1 && at <= d && !k.startsWith(lessonId + ':'))
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[0].localeCompare(b[0]))
    .map(([k]) => ({ key: k, ...stepOf(k) }))
    .filter((x) => x.step)
    .slice(0, WARM);
}

// her first try on a warm-up item: its box moves, and the event joins the queue (with consent)
export function answer(c, key, ok, now = Date.now()) {
  const r = { ...(c.recall || {}) };
  const [box] = r[key] || [1];
  const next = ok ? box + 1 : 1;
  r[key] = next > BOXES.length ? [0, today(now)] : [next, today(now) + BOXES[next - 1]];
  state.updateChild(c.id, { recall: r });
  state.record('recall.item', key, ok ? 1 : 0);
  return r[key];
}
