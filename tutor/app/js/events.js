// What the learner did (a lesson started or done, a sheet marked on Check my sheet), as verbs and ids only, queued on the phone and sent to the hub when it is in reach
// (POST /api/events, at most 100 at a time). An event is { at, verb, object, value }: the UTC minute, a verb the
// hub knows, an id (a lesson) and a number when the verb has one. Never a name, never anything typed: the hub
// refuses any other field, and so the queue holds no other field.
// A batch the hub refuses (an old app sending a verb the hub no longer takes) is dropped, so it cannot block the
// queue; a batch that did not arrive (no hub, a busy hub) stays for the next try.

import * as hub from './hub.js';

const KEY = 'qalam.events.v1';
const MAX_QUEUE = 500;           // a phone away from the hub for months keeps the newest 500
const BATCH = 100;
// the verbs a phone may send (hub/tutor_hub/events.py); the hub writes the others itself
export const VERBS = { 'lesson.start': { value: false }, 'lesson.done': { value: true }, 'check.done': { value: true } };
const LESSON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DIGIT_RUN = /[0-9]{5,}/;      // the hub refuses these, so nothing like a phone number hides in an id

let seq = 0;
let sending = null;
let started = false;

function read() {
  try {
    const q = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(q)) return q;
  } catch { /* first run, or storage is blocked */ }
  return [];
}

function write(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* full or blocked: the events are lost, nothing else */ }
}

export const minute = (d = new Date()) => d.toISOString().slice(0, 16);

// the events waiting to be sent, as the hub will get them
export function pending() { return read().map(({ n, ...e }) => e); }

// add one event to the queue and try to send it; a verb or object the hub would refuse is never queued
export function record(verb, object = null, value = null) {
  const v = VERBS[verb];
  if (!v || (object !== null && !(typeof object === 'string' && object.length <= 64 && LESSON.test(object) && !DIGIT_RUN.test(object)))) return false;
  if (v.value !== (value !== null)) return false;
  const e = { n: `${Date.now()}.${++seq}`, at: minute(), verb, object };
  if (value !== null) e.value = value;
  write([...read(), e].slice(-MAX_QUEUE));
  if (hub.online()) flush();
  return true;
}

// send what is queued while the hub is in reach; resolves when the queue is empty or the hub cannot take more
export function flush() {
  if (sending) return sending;
  sending = (async () => {
    try {
      while (hub.online()) {
        const batch = read().slice(0, BATCH);
        if (!batch.length) break;
        let refused = false;
        try {
          await hub.sendEvents(batch.map(({ n, ...e }) => e));
        } catch (e) {
          refused = e.status === 400 || e.status === 422;
          if (!refused) break;                 // not sent: keep them for the next try
          console.warn('events refused by the hub', e.message);
        }
        const sent = new Set(batch.map((e) => e.n));
        write(read().filter((e) => !sent.has(e.n)));
      }
    } finally { sending = null; }
  })();
  return sending;
}

// from start-up: send what earlier visits left, and again each time the hub comes back
export function start() {
  if (started) return;
  started = true;
  hub.onChange((ok) => { if (ok) flush(); });
  if (hub.online()) flush();
}

// for tests
export function reset() { write([]); sending = null; }
