// What the phone remembers: the learners who use it, their band, year or track and language, their text size and
// theme, lessons done, sheets printed and questions asked. It stays on this phone only (the hub keeps no names).
// Storage can fail (private mode, full): the app then still works, it just forgets on reload. Starting and
// finishing a lesson also join the events queue (events.js) as a verb and the lesson id, never the learner.
//
// qalam.v2 holds no name, ever (F3). A learner is an alias picture (chosen with sign-up, P10), an optional
// nickname she may type in Settings (P10; never sent), her band, and these per-learner settings:
// lock (P10), consent (P10), text ('normal' or 'large', "Bigger text") and theme ('phone', 'light' or 'dark').
// The v1 record (qalam.v1, which could hold a child's name) is migrated once, the name dropped, and removed.

import { bandOf, BANDS, THEMES, TRACKS } from './bands.js';
import * as events from './events.js';

const KEY = 'qalam.v2';
const OLD = 'qalam.v1';
const empty = () => ({ v: 2, active: null, learners: [] });
let data = load();

function rid() {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2);
}

// the only fields a learner record keeps: anything else (a name from v1, a stray field) is dropped
function clean(l) {
  const year = Number.isInteger(l.year) && l.year >= 0 && l.year <= 12 ? l.year : null;
  const band = l.band === 'ad' ? 'ad' : bandOf({ year }) || (BANDS.includes(l.band) ? l.band : 'p1');
  return {
    id: typeof l.id === 'string' && l.id ? l.id : rid(),
    band,
    year: band === 'ad' ? null : year ?? { ey: 0, p1: 1, p2: 4, s1: 7, s2: 10 }[band],
    track: band === 'ad' ? (TRACKS.includes(l.track) ? l.track : 'literacy') : null,
    lang: ['prs', 'ps', 'en'].includes(l.lang) ? l.lang : 'prs',
    picture: typeof l.picture === 'string' ? l.picture : null,
    nickname: typeof l.nickname === 'string' ? l.nickname.slice(0, 20) : '',
    lock: l.lock && typeof l.lock === 'object' ? l.lock : null,
    consent: l.consent && typeof l.consent === 'object' ? l.consent : null,
    text: l.text === 'large' ? 'large' : 'normal',
    theme: THEMES.includes(l.theme) ? l.theme : 'phone',
    done: l.done && typeof l.done === 'object' ? l.done : {},
    step: l.step && typeof l.step === 'object' ? l.step : {},
    prints: l.prints && typeof l.prints === 'object' ? l.prints : {},
    asks: Array.isArray(l.asks) ? l.asks : [],
    ...(l.tries && typeof l.tries === 'object' ? { tries: l.tries } : {}),
    ...(typeof l.last === 'string' ? { last: l.last } : {}),
  };
}

// v1 -> v2: each child becomes a learner, the name dropped
export function migrate(v1) {
  if (!v1 || v1.v !== 1 || !Array.isArray(v1.children)) return null;
  const learners = v1.children.filter((c) => c && typeof c === 'object').map(clean);
  return { v: 2, active: learners.some((l) => l.id === v1.active) ? v1.active : (learners[0] || {}).id || null, learners };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 2 && Array.isArray(d.learners)) return { ...d, learners: d.learners.map(clean) };
  } catch { /* first run, or storage is blocked */ }
  try {
    const moved = migrate(JSON.parse(localStorage.getItem(OLD)));
    if (moved) {
      localStorage.setItem(KEY, JSON.stringify(moved));
      localStorage.removeItem(OLD);            // the old record could hold a name: it does not stay on the phone
      return moved;
    }
  } catch { /* storage blocked: start empty */ }
  return empty();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked: keep going */ }
}

export function learners() { return data.learners; }
export function learner() {
  return data.learners.find((c) => c.id === data.active) || data.learners[0] || null;
}
// the older names, used by the screens
export const children = learners;
export const child = learner;

// a new learner: a year (0 to 12) or the adult door ({band: 'ad', track}); never a name
export function addChild({ year = null, band = null, track = null, lang }) {
  const c = clean({ year, band, track, lang });
  data.learners.push(c);
  data.active = c.id;
  save();
  return c;
}

export function updateChild(id, patch) {
  const i = data.learners.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const { name, ...rest } = patch || {};             // a name is never kept
  data.learners[i] = clean({ ...data.learners[i], ...rest });
  save();
  return data.learners[i];
}

export function setActive(id) { data.active = id; save(); }

export function band(c = learner()) { return c ? c.band : null; }

export function markDone(lessonId, stars) {
  const c = child();
  if (!c) return;
  const old = c.done[lessonId];
  c.done[lessonId] = { stars: Math.max(stars, old ? old.stars : 0), at: Date.now() };
  delete c.step[lessonId];
  if (c.tries) delete c.tries[lessonId];
  save();
  events.record('lesson.done', lessonId, stars);
}

export function setStep(lessonId, i) {
  const c = child();
  if (!c) return;
  const fresh = c.step[lessonId] === undefined;      // not started, or started again after it was done
  c.step[lessonId] = i;
  c.last = lessonId;
  save();
  if (fresh) events.record('lesson.start', lessonId);
}

// right or wrong on the first try, per question step, kept until the lesson is done so stars stay fair
// when a child leaves half way and comes back
export function firstTries(lessonId) {
  const c = child();
  return { ...((c && c.tries && c.tries[lessonId]) || {}) };
}

export function firstTry(lessonId, i, ok) {
  const c = child();
  if (!c) return;
  const t = ((c.tries ||= {})[lessonId] ||= {});
  if (t[i] === undefined) { t[i] = ok; save(); }
}

export function rememberPrint(lessonId, seed) {
  const c = child();
  if (c) { c.prints[lessonId] = seed; save(); }
}

export function addAsk(entry) {
  const c = child();
  if (!c) return;
  c.asks.push(entry);
  c.asks = c.asks.slice(-30);
  save();
}

export function updateAsk(id, patch) {
  const c = child();
  const a = c && c.asks.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); save(); }
}

// the teacher's PIN is kept only until this browser tab is closed
export function pin(value) {
  try {
    if (value === undefined) return sessionStorage.getItem('qalam.pin') || '';
    if (value) sessionStorage.setItem('qalam.pin', value); else sessionStorage.removeItem('qalam.pin');
  } catch { /* blocked: the teacher types it each time */ }
  return value || '';
}

// small caches so the lists and opened lessons still show when the hub is out of reach
export function cache(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem('qalam.cache.' + key));
    localStorage.setItem('qalam.cache.' + key, JSON.stringify(value));
  } catch { /* ignore */ }
  return value ?? null;
}

// for tests: read storage again
export function reload() { data = load(); return data; }
