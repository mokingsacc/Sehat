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
// Since W4 (WEBSITE.md 3.4 and 3.5) each event also carries `to`, the ids of the servers it goes to (her class
// seats', else her first seat's), and `got`, those that have it: it is sent to each with that server's own token
// when that server is in reach, and leaves the queue once all of them have it. One waiting for her class's server
// is kept 60 days (`k`), not 14. Its time `t` comes from the phone's clock corrected by the skew it knew (`sk`, the
// offset it was stamped with); when a later contact shows the clock had jumped, the difference is added before it is
// sent (never more than a day back: a clock that ran ahead is pulled back by the server, which takes no future minute).

import * as hub from './hub.js';

const KEY = 'qalam.events.v1';
const MAX_QUEUE = 500;           // a phone away from the hub for months keeps the newest 500,
const DAY = 24 * 3600e3;
const MAX_AGE = 14 * DAY;          // from the last 14 days; older ones are dropped without a word (C2.5)
const LONG_AGE = 60 * DAY;         // one waiting for her class's server: 60 days (W4, WEBSITE.md 3.4)
const BATCH = 100;
// the verbs a phone may send (hub/tutor_hub/events.py); the hub writes the others itself. Since P15 a sheet's items
// too (C2.3): check.item (0 wrong, 1 right first time, 2 right later), hint.rung (1 to 3) and check.dispute, each
// with the item as lesson:n
export const VERBS = { 'lesson.start': { value: false }, 'lesson.done': { value: true }, 'check.done': { value: true },
  'check.item': { value: true, item: true, range: [0, 2] }, 'hint.rung': { value: true, item: true, range: [1, 3] },
  'check.dispute': { value: false, item: true },
  // P25a: a warm-up item (spaced review): the lesson's step as lesson:n, 0 wrong or 1 right on her first try
  'recall.item': { value: true, item: true, range: [0, 1] } };
const LESSON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ITEM = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*):([1-9][0-9]?)$/;
const DIGIT_RUN = /[0-9]{5,}/;      // the hub refuses these, so nothing like a phone number hides in an id

let seq = 0;
let sending = null;
let started = false;
// account.js says which token a learner has on a server, which server is in reach and the clock's skew now, and
// hears when the server does not know her token (configure())
let tokenFor = () => null;
let onRefused = () => {};
let serverNow = () => null;
let skewNow = () => 0;
export function configure({ token, refused, server, skew } = {}) {
  if (token) tokenFor = token;
  if (refused) onRefused = refused;
  if (server) serverNow = server;
  if (skew) skewNow = skew;
}

// an event's time as the server should read it: its stamp, moved by how far the skew changed since (a day back at most)
export function when(e, skew = skewNow()) {
  const t = Number.isFinite(e.t) ? e.t : Date.parse(e.at + ':00Z');
  return Number.isFinite(e.sk) ? t + Math.max(skew - e.sk, -DAY) : t;
}
const targetsOf = (e) => (Array.isArray(e.to) && e.to.length ? e.to : ['?']);   // from before W4: her unplaced seat
const fresh = (e, now = Date.now()) => !(now + skewNow() - when(e) > (e.k ? LONG_AGE : MAX_AGE));

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
export const wire = ({ n, l, t, sk, to, got, k, ...e }) => ({ ...e, at: minute(new Date(when({ ...e, t, sk }))) });
export function pending(learner) {
  return read().filter((e) => !learner || e.l === learner).map(wire);
}

// the queue as kept, for tests and for account.js
export const queued = (learner) => read().filter((e) => !learner || e.l === learner);

// her unplaced seat found its server (state.placeSeat): her events for it go there
export function retarget(learner, from, to) {
  const q = read();
  let changed = false;
  for (const e of q) {
    if (e.l !== learner || !targetsOf(e).includes(from)) continue;
    e.to = [...new Set(targetsOf(e).map((x) => (x === from ? to : x)))];
    changed = true;
  }
  if (changed) write(q);
}

// add one event for a learner on this phone and try to send it; a verb or object the hub would refuse is never queued
export function record(verb, object = null, value = null, learner = null, { to = [], long = false, t = Date.now(), sk = 0 } = {}) {
  if (typeof learner !== 'string' || !learner) return false;
  const v = VERBS[verb];
  const id = v && v.item && typeof object === 'string' ? (object.match(ITEM) || [])[1] : object;
  if (!v || (v.item && !id) || (object !== null && !(typeof id === 'string' && object.length <= 64 && LESSON.test(id) && !DIGIT_RUN.test(id)))) return false;
  if (v.value !== (value !== null)) return false;
  if (v.range && !(Number.isInteger(value) && value >= v.range[0] && value <= v.range[1])) return false;
  const e = { n: `${Date.now()}.${++seq}`, l: learner, at: minute(new Date(t)), t, sk, to: [...to], got: [], verb, object };
  if (long) e.k = 1;
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

// the server in reach takes the events meant for it that it has not got yet, with that learner's token there
const forServer = (e, sid) => targetsOf(e).includes(sid) && !(e.got || []).includes(sid);

async function sendAll() {
  const waiting = new Set();             // learners whose events stay this time (no token, or not known)
  while (hub.online()) {
    const sid = serverNow();
    if (!sid) break;
    const first = read().find((e) => forServer(e, sid) && !waiting.has(e.l) && tokenFor(e.l, sid));
    if (!first) break;
    const token = tokenFor(first.l, sid);
    const batch = read().filter((e) => e.l === first.l && forServer(e, sid)).slice(0, BATCH);
    let refused = false;
    try {
      await hub.sendEvents(batch.map(wire), token);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { waiting.add(first.l); onRefused(first.l, e.status); continue; }
      refused = e.status === 400 || e.status === 422;
      if (!refused) break;                 // not sent: keep them for the next try
      console.warn('events refused by the hub', e.message);
    }
    // this server has them (or refused them for good): each leaves the queue once every server it goes to has it
    const sent = new Set(batch.map((e) => e.n));
    write(read().flatMap((e) => {
      if (!sent.has(e.n)) return [e];
      const got = [...new Set([...(e.got || []), sid])];
      return targetsOf(e).every((x) => got.includes(x)) ? [] : [{ ...e, got }];
    }));
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
