// What the phone remembers: the learners who use it, their band, year or track and language, their text size and
// theme, lessons done, sheets printed and questions asked. It stays on this phone only (the hub keeps no names).
// Storage can fail (private mode, full): the app then still works, it just forgets on reload. Starting and
// finishing a lesson also join the events queue (events.js) as a verb and the lesson id, and only for a learner
// whose grown-up agreed (consent); the server learns which learner token sent them, never a name.
//
// qalam.v2 holds no name, ever (F3). A learner is an alias picture (aliases.js, given when she is added), an optional
// nickname she may type in Settings (never sent), her band, and these per-learner settings: lock (lock.js), consent
// {kind, version, at, sent}, text ('normal' or 'large', "Bigger text") and theme ('phone', 'light' or 'dark').
// When she joins (account.js) the server's answer adds token, number and cohort {id, label}; `code` is the class
// code she joined with (kept so the phone can join again if the server forgets her), `asked` that the consent screen
// was answered (agreed or "Not now"), `sentBand` the band the server has. `forget` lists tokens of learners removed or withdrawn whose server record is still to be deleted.
// The v1 record (qalam.v1, which could hold a child's name) is migrated once, the name dropped, and removed.

import { known, pickFree } from './aliases.js';
import { bandOf, BANDS, THEMES, TRACKS } from './bands.js';
import * as events from './events.js';

const KEY = 'qalam.v2';
const OLD = 'qalam.v1';
const empty = () => ({ v: 2, active: null, learners: [], forget: [] });
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const CODE = /^[A-HJKMNP-Z2-9]{8}$/;
const KINDS = ['guardian-on-phone', 'self', 'partner-paper'];
// declared before the first load() below reads them (a const read before its line throws, and the learners would be
// lost: P22's plan was, on every reload, until P25a moved this here)
const LESSON_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ITEM_KEY = /^[a-z0-9][a-z0-9-]{0,63}:[1-9][0-9]?$/;
export const RECALL_MAX = 300;
// A reviewer's preview (P17): /review/ shows a lesson step in a learner's look, in a frame opened at
// ?preview=<band>&lang=<lang>. That page keeps one learner in memory only: nothing is read from or written to this
// browser's storage, no event is kept (she has no consent), and she never joins.
export const preview = (() => {
  try {
    const q = new URLSearchParams((globalThis.location && globalThis.location.search) || '');
    const b = q.get('preview');
    const lang = ['prs', 'ps', 'en'].includes(q.get('lang')) ? q.get('lang') : 'prs';
    return BANDS.includes(b) ? { band: b, lang } : null;
  } catch { return null; }
})();
const memory = new Map();
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
    picture: known(l.picture) ? l.picture : null,
    nickname: typeof l.nickname === 'string' ? l.nickname.slice(0, 20) : '',
    lock: l.lock && typeof l.lock === 'object' && typeof l.lock.hash === 'string' ? l.lock : null,
    lockOffered: l.lockOffered === true,
    asked: l.asked === true,
    consent: cleanConsent(l.consent),
    token: typeof l.token === 'string' && TOKEN.test(l.token) ? l.token : null,
    number: Number.isInteger(l.number) && l.number > 0 && l.number < 1000 ? l.number : null,
    cohort: l.cohort && typeof l.cohort.id === 'string' ? { id: l.cohort.id, label: String(l.cohort.label || '') } : null,
    code: typeof l.code === 'string' && CODE.test(l.code) ? l.code : null,
    sentBand: BANDS.includes(l.sentBand) ? l.sentBand : null,
    text: l.text === 'large' ? 'large' : 'normal',
    theme: THEMES.includes(l.theme) ? l.theme : 'phone',
    done: l.done && typeof l.done === 'object' ? l.done : {},
    step: l.step && typeof l.step === 'object' ? l.step : {},
    prints: l.prints && typeof l.prints === 'object' ? l.prints : {},
    asks: Array.isArray(l.asks) ? l.asks : [],
    ...(l.tries && typeof l.tries === 'object' ? { tries: l.tries } : {}),
    ...(typeof l.last === 'string' ? { last: l.last } : {}),
    // C2.4 and P19: her school day, 'on' or 'off' (unset counts as on); her bells, kept only when she switched them
    // off; her start time moved by -120 to +120 minutes in steps of 30 (day.js). Never whether she is in school.
    ...(l.day === 'on' || l.day === 'off' ? { day: l.day } : {}),
    ...(l.bells === 'off' ? { bells: 'off' } : {}),
    ...(Number.isInteger(l.shift) && l.shift !== 0 && Math.abs(l.shift) <= 120 && l.shift % 30 === 0 ? { shift: l.shift } : {}),
    // P23, the Android app only: `mine` 'yes' or 'no' ("Is this phone yours?", asked after "Yes, Qalam is my
    // school"); `alarms` 'off' when she switched closed-app bells off (on by default once the phone is hers, C3.1)
    ...(l.mine === 'yes' || l.mine === 'no' ? { mine: l.mine } : {}),
    ...(l.alarms === 'off' ? { alarms: 'off' } : {}),
    // C2.3: she has heard "I won't tell you the answer" once, the first time she reached a third hint
    ...(l.told === true ? { told: true } : {}),
    // P22: her plan (a label and lesson ids; lessons a marked sheet added again, with when) and the goals that
    // found no lesson while offline, waiting to join the wishlist (sent without her token, outbox.js)
    ...(cleanPlan(l.plan) ? { plan: cleanPlan(l.plan) } : {}),
    ...(cleanWishes(l.wishes).length ? { wishes: cleanWishes(l.wishes) } : {}),
    // P25a (C4.1): her latest mark per lesson's sheet (percent right, for "mastered" in the skills graph), and her
    // spaced-review items, "<lesson>:<step>": [box, due day] (box 0: retired), at most 300 (modules/recall.js)
    ...(Object.keys(cleanMarks(l.marks)).length ? { marks: cleanMarks(l.marks) } : {}),
    ...(Object.keys(cleanRecall(l.recall)).length ? { recall: cleanRecall(l.recall) } : {}),
  };
}

function cleanMarks(m) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const [id, pct] of Object.entries(m).slice(-300)) {
    if (LESSON_ID.test(id) && Number.isInteger(pct) && pct >= 0 && pct <= 100) out[id] = pct;
  }
  return out;
}

function cleanRecall(r) {
  if (!r || typeof r !== 'object') return {};
  const ok = Object.entries(r).filter(([k, v]) => ITEM_KEY.test(k) && Array.isArray(v) && v.length === 2
    && Number.isInteger(v[0]) && v[0] >= 0 && v[0] <= 5 && Number.isInteger(v[1]) && v[1] >= 0);
  // over the cap: retired items go first, then the ones furthest from due
  const keep = ok.length <= RECALL_MAX ? ok
    : [...ok].sort((a, b) => (a[1][0] === 0) - (b[1][0] === 0) || a[1][1] - b[1][1]).slice(0, RECALL_MAX);
  return Object.fromEntries(keep.map(([k, v]) => [k, [v[0], v[1]]]));
}

function cleanPlan(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.lessons)) return null;
  const lessons = [...new Set(p.lessons.filter((id) => typeof id === 'string' && LESSON_ID.test(id)))].slice(0, 12);
  if (!lessons.length) return null;
  const again = {};
  for (const [id, at] of Object.entries(p.again && typeof p.again === 'object' ? p.again : {})) {
    if (lessons.includes(id) && Number.isFinite(at)) again[id] = at;
  }
  return { label: typeof p.label === 'string' ? p.label.slice(0, 60) : '', lessons, again,
    ...(typeof p.path === 'string' && LESSON_ID.test(p.path) ? { path: p.path } : {}) };
}

function cleanWishes(w) {
  if (!Array.isArray(w)) return [];
  return w.filter((x) => x && typeof x.q === 'string' && x.q.trim() && Number.isFinite(x.at))
    .map((x) => ({ q: x.q.slice(0, 200), lang: ['prs', 'ps', 'en'].includes(x.lang) ? x.lang : 'prs', at: x.at }))
    .slice(-5);
}

function cleanConsent(c) {
  if (!c || typeof c !== 'object' || !KINDS.includes(c.kind) || typeof c.version !== 'string') return null;
  return { kind: c.kind, version: c.version.slice(0, 32), at: typeof c.at === 'string' ? c.at.slice(0, 16) : null,
    sent: c.sent === true };
}

// every learner has a picture; one from before pictures gets one no other learner here has
function pictures(list) {
  for (const l of list) if (!l.picture) l.picture = pickFree(list.map((x) => x.picture).filter(Boolean));
  return list;
}

// v1 -> v2: each child becomes a learner, the name dropped
export function migrate(v1) {
  if (!v1 || v1.v !== 1 || !Array.isArray(v1.children)) return null;
  const learners = pictures(v1.children.filter((c) => c && typeof c === 'object').map(clean));
  return { v: 2, active: learners.some((l) => l.id === v1.active) ? v1.active : (learners[0] || {}).id || null, learners,
    forget: [] };
}

function load() {
  if (preview) {
    return { v: 2, active: 'preview', forget: [],
      learners: pictures([clean({ id: 'preview', band: preview.band, lang: preview.lang, track: 'reader', asked: true })]) };
  }
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 2 && Array.isArray(d.learners)) {
      return { v: 2, active: typeof d.active === 'string' ? d.active : null, learners: pictures(d.learners.map(clean)),
        forget: Array.isArray(d.forget) ? d.forget.filter((t) => typeof t === 'string' && TOKEN.test(t)) : [] };
    }
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
  if (preview) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked: keep going */ }
}

export function learners() { return data.learners; }
export function learner() {
  return data.learners.find((c) => c.id === data.active) || data.learners[0] || null;
}
// the older names, used by the screens
export const children = learners;
export const child = learner;

// a new learner: a year (0 to 12) or the adult door ({band: 'ad', track}), and the class code she came with; never a
// name. She gets a picture no other learner on this phone has.
export function addChild({ year = null, band = null, track = null, lang, code = null }) {
  const c = clean({ year, band, track, lang, code, picture: pickFree(data.learners.map((l) => l.picture)) });
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

export function byId(id) { return data.learners.find((l) => l.id === id) || null; }

// remove a learner from this phone: her record and her queued events go; her server record (if she joined) is
// deleted when the server is next in reach (account.js)
export function removeLearner(id) {
  const l = byId(id);
  if (!l) return false;
  if (l.token) forgetToken(l.token);
  data.learners = data.learners.filter((x) => x.id !== id);
  if (data.active === id) data.active = (data.learners[0] || {}).id || null;
  unlocked.delete(id);
  save();
  events.drop(id);
  return true;
}

// tokens whose server record must be deleted (a learner removed, or "Stop sharing")
export function forgetToken(t) {
  if (t && !data.forget.includes(t)) data.forget.push(t);
  save();
}
export function toForget() { return [...data.forget]; }
export function forgotten(t) { data.forget = data.forget.filter((x) => x !== t); save(); }

// the learners unlocked since the app started (or came back after 5 minutes away): kept in memory only
const unlocked = new Set();
export const isUnlocked = (id) => unlocked.has(id);
export function unlock(id) { unlocked.add(id); }
export function lockAll() { unlocked.clear(); }

// an event for the learner using the phone, only with her grown-up's (or, for adults, her own) agreement
export function record(verb, object = null, value = null) {
  const c = learner();
  if (!c || !c.consent) return false;
  return events.record(verb, object, value, c.id);
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
  record('lesson.done', lessonId, stars);
}

// her latest mark on a lesson's sheet (Check my sheet), kept on the phone whether or not events are sent
export function setMark(lessonId, pct) {
  const c = child();
  if (!c || !LESSON_ID.test(lessonId) || !Number.isFinite(pct)) return;
  const marks = { ...(c.marks || {}) };
  delete marks[lessonId];
  marks[lessonId] = Math.max(0, Math.min(100, Math.round(pct)));
  updateChild(c.id, { marks });
}

export function setStep(lessonId, i) {
  const c = child();
  if (!c) return;
  const fresh = c.step[lessonId] === undefined;      // not started, or started again after it was done
  c.step[lessonId] = i;
  c.last = lessonId;
  save();
  if (fresh) record('lesson.start', lessonId);
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
  if (c) { delete c.prints[lessonId]; c.prints[lessonId] = seed; save(); }    // the last got is last
}

// a question in her list; `k` is the phone's own key for it (the server's id comes once it is sent)
export function addAsk(entry) {
  const c = child();
  if (!c) return null;
  const e = { k: rid(), ...entry };
  c.asks.push(e);
  c.asks = c.asks.slice(-30);
  save();
  return e;
}

export function updateAsk(id, patch) {
  const c = child();
  const a = c && c.asks.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); save(); }
}

// change a question of any learner on this phone, by the phone's key (the outbox sends every learner's)
export function updateAskOf(learnerId, k, patch) {
  const l = byId(learnerId);
  const a = l && l.asks.find((x) => x.k === k);
  if (a) { Object.assign(a, patch); save(); }
  return a || null;
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
  if (preview) {
    if (value !== undefined) memory.set(key, value);
    return value ?? memory.get(key) ?? null;
  }
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem('qalam.cache.' + key));
    localStorage.setItem('qalam.cache.' + key, JSON.stringify(value));
  } catch { /* ignore */ }
  return value ?? null;
}

// for tests: read storage again
export function reload() { data = load(); return data; }
