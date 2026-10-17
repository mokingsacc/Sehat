// What the learner did (a lesson started or done, a sheet and its items marked on Check my sheet), as verbs and ids only, queued on the phone and sent to the hub when it is in reach
// (POST /api/events, at most 100 at a time). An event is { at, verb, object, value }: the UTC minute, a verb the
// hub knows, an id (a lesson) and a number when the verb has one. Never a name, never anything typed: the hub
// refuses any other field, and so the queue holds no other field.
// A batch the hub refuses (an old app sending a verb the hub no longer takes) is dropped, so it cannot block the
// queue; a batch that did not arrive (no hub, a busy hub) stays for the next try.
// Since P10 each queued event carries `l`, the id of the learner on this phone it belongs to (never sent), and is
// sent with her learner token. Only learners whose grown-up agreed have events (state.record checks); a learner
// with no token yet keeps hers until she has joined. The server answering 401 (it does not know her token) or 403
// (it has no consent for her) keeps the events and tells account.js, which joins her again or sends the consent.

import * as hub from './hub.js';

const KEY = 'qalam.events.v1';
const MAX_QUEUE = 500;           // a phone away from the hub for months keeps the newest 500,
const MAX_AGE = 14 * 24 * 3600e3;   // from the last 14 days; older ones are dropped without a word (C2.5)
const BATCH = 100;
// the verbs a phone may send (hub/tutor_hub/events.py); the hub writes the others itself. Since P15 a sheet's items
// too (C2.3): check.item (0 wrong, 1 right first time, 2 right later), hint.rung (1 to 3) and check.dispute, each
// with the item as lesson:n
export const VERBS = { 'lesson.start': { value: false }, 'lesson.done': { value: true }, 'check.done': { value: true },
  'check.item': { value: true, item: true, range: [0, 2] }, 'hint.rung': { value: true, item: true, range: [1, 3] },
  'check.dispute': { value: false, item: true } };
const LESSON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ITEM = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*):([1-9][0-9]?)$/;
const DIGIT_RUN = /[0-9]{5,}/;      // the hub refuses these, so nothing like a phone number hides in an id

let seq = 0;
let sending = null;
let started = false;
// account.js says which token a learner has and hears when the server does not know it (configure())
let tokenFor = () => null;
let onRefused = () => {};
export function configure({ token, refused } = {}) {
  if (token) tokenFor = token;
  if (refused) onRefused = refused;
}

const fresh = (e, now = Date.now()) => !(now - Date.parse(e.at + ':00Z') > MAX_AGE);

function read() {
  try {
    const q = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(q)) return q.filter((e) => e && fresh(e));
  } catch { /* first run, or storage is blocked */ }
  return [];
}

function write(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* full or blocked: the events are lost, nothing else */ }
}

export const minute = (d = new Date()) => d.toISOString().slice(0, 16);

// the events waiting to be sent, as the hub will get them
export function pending(learner) {
  return read().filter((e) => !learner || e.l === learner).map(({ n, l, ...e }) => e);
}

// add one event for a learner on this phone and try to send it; a verb or object the hub would refuse is never queued
export function record(verb, object = null, value = null, learner = null) {
  if (typeof learner !== 'string' || !learner) return false;
  const v = VERBS[verb];
  const id = v && v.item && typeof object === 'string' ? (object.match(ITEM) || [])[1] : object;
  if (!v || (v.item && !id) || (object !== null && !(typeof id === 'string' && object.length <= 64 && LESSON.test(id) && !DIGIT_RUN.test(id)))) return false;
  if (v.value !== (value !== null)) return false;
  if (v.range && !(Number.isInteger(value) && value >= v.range[0] && value <= v.range[1])) return false;
  const e = { n: `${Date.now()}.${++seq}`, l: learner, at: minute(), verb, object };
  if (value !== null) e.value = value;
  write([...read(), e].slice(-MAX_QUEUE));
  if (hub.online()) flush();
  return true;
}

// send what is queued while the hub is in reach; resolves when the queue is empty or the hub cannot take more. A call
// while a send is running runs once more after it (a learner may have got her token meanwhile).
let more = false;
export function flush() {
  if (sending) { more = true; return sending; }
  sending = (async () => {
    try {
      do { more = false; await sendAll(); } while (more && hub.online());
    } finally { sending = null; }
  })();
  return sending;
}

async function sendAll() {
  const waiting = new Set();             // learners whose events stay this time (no token, or not known)
  while (hub.online()) {
    const first = read().find((e) => !waiting.has(e.l) && tokenFor(e.l));
    if (!first) break;
    const token = tokenFor(first.l);
    const batch = read().filter((e) => e.l === first.l).slice(0, BATCH);
    let refused = false;
    try {
      await hub.sendEvents(batch.map(({ n, l, ...e }) => e), token);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { waiting.add(first.l); onRefused(first.l, e.status); continue; }
      refused = e.status === 400 || e.status === 422;
      if (!refused) break;                 // not sent: keep them for the next try
      console.warn('events refused by the hub', e.message);
    }
    const sent = new Set(batch.map((e) => e.n));
    write(read().filter((e) => !sent.has(e.n)));
  }
}

// from start-up: send what earlier visits left, and again each time the hub comes back
export function start() {
  if (started) return;
  started = true;
  hub.onChange((ok) => { if (ok) flush(); });
  if (hub.online()) flush();
}

// a learner removed from this phone, or whose grown-up stopped sharing: her queued events go too
export function drop(learner) { write(read().filter((e) => e.l !== learner)); }

// for tests
export function reset() { write([]); sending = null; more = false; }
