// Each learner's record on the server (P10; DESIGN.md 6 and 7). The phone keeps the learner; the server keeps only a
// token's hash, the class, the band, the alias picture and number, and the consent record. sync() does what is
// waiting, whenever the server is in reach:
// - delete the records of learners removed from this phone or whose grown-up stopped sharing (`DELETE /api/me`);
// - join (`POST /api/join`) a learner who came with a class code (consent or not) or whose grown-up agreed;
// - send a consent given after joining, and a changed band (`POST /api/me`);
// - then send the events queue, which needs a token and a consent the server has.
// Nothing here is a name: the join carries band, language, picture, the class code and the consent record.
// Since W4 (WEBSITE.md 3.3 and 3.11) all of this is per seat, for the server in reach only: a learner from before W4
// has her token placed under that server's id first (tried only at the address she last used; a 401 means she joins
// again), a 401 drops only that server's token, and two tokens of hers for one server are merged (/api/me/merge).
// Since W7 (3.10 and 3.13) a learner with a school bag is asked about it before a seat joins again: a bag stopped
// on another phone (her consent withdrawn, or a new code made there) keeps her seats from joining on their own; and
// "Make a new code" gives each seat a new token at its next contact (/api/me/token), so a lost phone's token dies.

import * as bagsync from './bagsync.js';
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
        const sid = hub.id();
        await forgetAll(sid);
        for (const l of state.learners()) await place(l.id, sid);
        for (const l of state.learners()) await one(l.id, sid);
        for (const l of state.learners()) await merge(l.id, sid);
        useCohort();
      } while (again && hub.online());
      await events.flush();
    } finally { running = null; }
  })();
  return running;
}

async function forgetAll(sid) {
  for (const t of state.toForget(sid, hub.where())) {
    try { await hub.forget(t); state.forgotten(t); } catch (e) {
      if (e.status === 401) state.forgotten(t);          // already gone
      else if (!hub.online()) return;
    }
  }
}

// her unplaced seat (WEBSITE.md 3.11): one with no token simply belongs to the first server in reach; a token from
// before W4 is asked about only at the address she last used, and becomes this server's seat if it knows it
async function place(id, sid) {
  const l = state.byId(id);
  const p = l && l.seats[state.PENDING];
  if (!p) return;
  if (!p.token) { state.placeSeat(id, sid); return; }
  if (p.base !== hub.where()) return;
  try {
    await hub.me(p.token);
    state.placeSeat(id, sid);
  } catch (e) {
    if (e.status !== 401) return;                                  // later
    state.setSeat(id, state.PENDING, { token: null, number: null, cohort: null, sentBand: null });
    state.placeSeat(id, sid);                                      // she joins again, as she would have before
    again = true;
  }
}

async function one(id, sid) {
  let l = state.byId(id);
  if (!l || hub.id() !== sid) return;
  if (needsJoin(l)) {
    if (l.bag && (await bagsync.check(id)) === 'stopped') return;     // she types her new code first (Settings)
    l = state.byId(id);
    if (!l || !needsJoin(l) || hub.id() !== sid) return;
    const c = l.consent;
    const body = { band: l.band, lang: l.lang, picture: l.picture };
    if (l.code) body.cohort_code = l.code;
    if (c) body.consent = { kind: c.kind, version: c.version, at: c.at };
    try {
      const j = await hub.join(body);
      state.setSeat(id, sid, { token: j.token, number: j.number, cohort: j.cohort, sentBand: l.band,
        consent: c ? { ...c, sent: true } : null });
    } catch (e) {
      if (e.status === 404 && l.code) { state.setSeat(id, sid, { code: null }); note('code_not_found'); again = true; }
      else if (e.status === 422 && l.code) { state.setSeat(id, sid, { code: null }); note('code_wrong_class'); again = true; }
      else if (e.status === 422 && c) state.setSeat(id, sid, { consent: null });   // a text the server no longer has
    }
    return;
  }
  if (!l.token) return;
  try {
    const seat = l.seats[sid];
    if (seat && seat.renew && seat.token === l.token) {
      const j = await hub.newToken(l.token);                // the old token dies on the server
      state.setSeat(id, sid, { token: j.token, renew: false });
      l = state.byId(id);
    }
    if (l.consent && !l.consent.sent) {
      const c = l.consent;
      await hub.meUpdate(l.token, { consent: { kind: c.kind, version: c.version, at: c.at } });
      state.setSeat(id, sid, { consent: { ...c, sent: true } });
      l = state.byId(id);
    }
    if (l.sentBand !== l.band) {
      try { await hub.meUpdate(l.token, { band: l.band }); } catch (e) { if (e.status !== 422) throw e; }
      state.setSeat(id, sid, { sentBand: l.band });      // a class not for her new year keeps the old band
    }
  } catch (e) {
    if (e.status === 401) unknown(id);
    else if (e.status === 422 && l.consent && !l.consent.sent) state.setSeat(id, sid, { consent: null });
  }
}

// two tokens of hers for this server (two devices joined it apart, W7's bag brings the second): the server folds
// the newer learner into the older and says which token stays. A 401 means hers was folded already: the other is hers.
async function merge(id, sid) {
  for (;;) {
    const l = state.byId(id);
    const seat = l && l.seats[sid];
    const other = seat && seat.token && (seat.also || [])[0];
    if (!other || hub.id() !== sid) return;
    const rest = (seat.also || []).slice(1);
    try {
      const k = await hub.merge(seat.token, other);
      state.setSeat(id, sid, { also: rest, number: k.number, cohort: k.cohort, ...(k.kept === 'other' ? { token: other } : {}) });
    } catch (e) {
      if (e.status === 409) state.setSeat(id, sid, { also: rest });      // another class: hers stays, the other ages out
      else if (e.status === 401) {
        try {
          const me = await hub.me(other);
          state.setSeat(id, sid, { token: other, also: rest, number: me.number, cohort: me.cohort });
        } catch (e2) {
          if (e2.status === 401) state.setSeat(id, sid, { also: rest }); else return;
        }
      } else return;
    }
  }
}

// the server in reach does not know her token there (deleted after a year away): that seat only joins again
function unknown(id) {
  const sid = hub.id();
  if (sid) state.setSeat(id, sid, { token: null, number: null, cohort: null, sentBand: null });
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
// "Stop sharing" ends every seat: each server deletes her record when it is next in reach
// Her school bag goes with it (3.8): a tombstone on the relay in reach now, on the others with her record there; and
// this phone forgets its code, so a bag made after a new agreement has a new one.
export function stopSharing(id) {
  const l = state.byId(id);
  if (!l) return null;
  if (l.bag) {
    bagsync.dropHere(id);                                  // reads her token before the seats are cleared below
    state.updateChild(id, { bag: null });
    bagsync.forget(id);
  }
  state.clearSeats(id);
  events.drop(id);
  sync();
  return state.byId(id);
}

// remove a learner from this phone (Settings, behind her PIN): her server records go too ("Everywhere"), and her
// bag on the relay in reach; `here` (only for a learner with a bag, whose record lives on elsewhere: "From this
// phone only") sends nothing
export function remove(id, { here = false } = {}) {
  const l = state.byId(id);
  if (l && l.bag && here) state.removeHere(id);
  else {
    if (l && l.bag) bagsync.dropHere(id);
    state.removeLearner(id);
  }
  bagsync.forget(id);
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
    token: (id, sid) => sendable(state.seatOf(state.byId(id), sid)),
    server: () => hub.id(),
    skew: () => state.clock().skew,
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
