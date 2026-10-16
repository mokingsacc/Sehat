// What the phone remembers: the children who use it, their year and language, lessons done, sheets printed and
// questions asked. It stays on this phone only (the hub keeps no names). Storage can fail (private mode, full):
// the app then still works, it just forgets on reload. Starting and finishing a lesson also join the events queue
// (events.js) as a verb and the lesson id, never the child.

import * as events from './events.js';

const KEY = 'qalam.v1';
const empty = () => ({ v: 1, active: null, children: [] });
let data = load();

function rid() {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2);
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 1 && Array.isArray(d.children)) return d;
  } catch { /* first run, or storage is blocked */ }
  return empty();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked: keep going */ }
}

export function children() { return data.children; }

export function child() {
  return data.children.find((c) => c.id === data.active) || data.children[0] || null;
}

export function addChild({ name, year, lang }) {
  const c = { id: rid(), name: (name || '').trim().slice(0, 30), year, lang, done: {}, step: {}, prints: {}, asks: [] };
  data.children.push(c);
  data.active = c.id;
  save();
  return c;
}

export function updateChild(id, patch) {
  const c = data.children.find((x) => x.id === id);
  if (c) { Object.assign(c, patch); save(); }
  return c;
}

export function setActive(id) { data.active = id; save(); }

// years 0 (not in school yet) to 6 get the bold, big look; 7 to 12 the clean one
export function mode(c = child()) { return c && c.year >= 7 ? 'big' : 'small'; }

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
