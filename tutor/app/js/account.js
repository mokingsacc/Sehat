// Each learner's record on the server (P10; DESIGN.md 6 and 7). The phone keeps the learner; the server keeps only a
// token's hash, the class, the band, the alias picture and number, and the consent record. sync() does what is
// waiting, whenever the server is in reach:
// - delete the records of learners removed from this phone or whose grown-up stopped sharing (`DELETE /api/me`);
// - join (`POST /api/join`) a learner who came with a class code (consent or not) or whose grown-up agreed;
// - send a consent given after joining, and a changed band (`POST /api/me`);
// - then send the events queue, which needs a token and a consent the server has.
// Nothing here is a name: the join carries band, language, picture, the class code and the consent record.

import * as events from './events.js';
import * as hub from './hub.js';
import { latin } from './numbers.js';
import * as state from './state.js';

export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';     // as the server makes them: no 0/O, 1/I/L

// a class code as typed or scanned ("k7qm 4prt", "K7QM-4PRT") -> "K7QM4PRT", or null if it cannot be one
export function normalCode(code) {
  if (typeof code !== 'string') return null;
  const c = latin(code).replace(/[\s\-_.]/g, '').toUpperCase();
  return c.length === 8 && [...c].every((ch) => CODE_LETTERS.includes(ch)) ? c : null;
}
export const showCode = (c) => (c ? c.slice(0, 4) + '-' + c.slice(4) : '');

// who agrees: a grown-up on the phone for school learners, the learner herself for adults
export const consentKind = (l) => (l && l.band === 'ad' ? 'self' : 'guardian-on-phone');

// she is to join and has not yet ("waiting to connect"): her grown-up agreed, or she came with a class code and the
// consent screen was answered (so the join carries the consent when there is one)
export const needsJoin = (l) => !!l && !l.token && !!(l.consent || (l.code && l.asked));

// events go only with a token and a consent the server has
const sendable = (l) => (l && l.token && l.consent && l.consent.sent ? l.token : null);

const notes = new Set();
// what the screens should say after a sync: 'code_not_found', 'code_wrong_class'
export function onNote(fn) { notes.add(fn); return () => notes.delete(fn); }
const note = (key) => notes.forEach((f) => f(key));

let running = null;
let again = false;

export function sync() {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        if (!hub.online()) break;
        await forgetAll();
        for (const l of state.learners()) await one(l.id);
        useCohort();
      } while (again && hub.online());
      await events.flush();
    } finally { running = null; }
  })();
  return running;
}

async function forgetAll() {
  for (const t of state.toForget()) {
    try { await hub.forget(t); state.forgotten(t); } catch (e) {
      if (e.status === 401) state.forgotten(t);          // already gone
      else if (!hub.online()) return;
    }
  }
}

async function one(id) {
  let l = state.byId(id);
  if (!l) return;
  if (needsJoin(l)) {
    const c = l.consent;
    const body = { band: l.band, lang: l.lang, picture: l.picture };
    if (l.code) body.cohort_code = l.code;
    if (c) body.consent = { kind: c.kind, version: c.version, at: c.at };
    try {
      const j = await hub.join(body);
      state.updateChild(id, { token: j.token, number: j.number, cohort: j.cohort, sentBand: l.band,
        consent: c ? { ...c, sent: true } : null });
    } catch (e) {
      if (e.status === 404 && l.code) { state.updateChild(id, { code: null }); note('code_not_found'); again = true; }
      else if (e.status === 422 && l.code) { state.updateChild(id, { code: null }); note('code_wrong_class'); again = true; }
      else if (e.status === 422 && c) state.updateChild(id, { consent: null });   // a text the server no longer has
    }
    return;
  }
  if (!l.token) return;
  try {
    if (l.consent && !l.consent.sent) {
      const c = l.consent;
      await hub.meUpdate(l.token, { consent: { kind: c.kind, version: c.version, at: c.at } });
      l = state.updateChild(id, { consent: { ...c, sent: true } });
    }
    if (l.sentBand !== l.band) {
      try { await hub.meUpdate(l.token, { band: l.band }); } catch (e) { if (e.status !== 422) throw e; }
      state.updateChild(id, { sentBand: l.band });      // a class not for her new year keeps the old band
    }
  } catch (e) {
    if (e.status === 401) unknown(id);
    else if (e.status === 422 && l.consent && !l.consent.sent) state.updateChild(id, { consent: null });
  }
}

// the server does not know her token (deleted after a year away, or another server): join again
function unknown(id) {
  state.updateChild(id, { token: null, number: null, cohort: null, sentBand: null });
  again = true;
}

// the grown-up (or the adult herself) held "Hold to agree"
export function agree(id, version) {
  const l = state.byId(id);
  if (!l || !version) return null;
  const out = state.updateChild(id, { consent: { kind: consentKind(l), version, at: events.minute(), sent: false },
    asked: true });
  sync();
  return out;
}

// "Stop sharing": the consent goes, her server record is deleted (now, or when the server is next in reach), her
// queued events are dropped, and she stays on this phone to learn as before
export function stopSharing(id) {
  const l = state.byId(id);
  if (!l) return null;
  if (l.token) state.forgetToken(l.token);
  events.drop(id);
  const out = state.updateChild(id, { consent: null, token: null, number: null, cohort: null, code: null, sentBand: null });
  sync();
  return out;
}

// remove a learner from this phone (Settings, behind her PIN): her server record goes too
export function remove(id) {
  state.removeLearner(id);
  sync();
}

// the learner using the phone decides which class hello and the routes answer for
let cohortNow;
export function useCohort() {
  const c = state.child();
  const id = (c && c.cohort && c.cohort.id) || null;
  if (id === cohortNow) return false;
  cohortNow = id;
  hub.setCohort(id);
  return true;
}

// once, from start-up
let started = false;
export function start() {
  if (started) return;
  started = true;
  events.configure({
    token: (id) => sendable(state.byId(id)),
    // the events wait; the next sync (start-up, or the server coming back) joins her again or resends the consent
    refused: (id, status) => {
      if (status === 401) unknown(id);
      else if (status === 403) {
        const l = state.byId(id);
        if (l && l.consent) state.updateChild(id, { consent: { ...l.consent, sent: false } });
      }
    },
  });
  useCohort();
  hub.onChange((ok) => { if (ok) sync(); });
}

// for tests
export function reset() { running = null; again = false; cohortNow = undefined; }
