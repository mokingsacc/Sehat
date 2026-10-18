// The PIN lock (DESIGN.md 8): a privacy curtain on a shared phone, not security. Four digits per learner, optional,
// never for early years. The PIN never leaves the phone and nothing about the lock is sent to any server.
// Stored in the learner's record as lock {salt, hash, tries, until, rounds, last, resetAt}:
// - hash: 10,000 rounds of SHA-256 over the salt and the PIN (sha256.js; crypto.subtle needs a secure page);
// - five wrong tries: wait 1 minute, then 15, then 60 (the hub's teacher-PIN rule), in `until`; a quiet day
//   starts the waits again from one minute;
// - "I forgot": `resetAt` = now + 24 hours, shown to whoever opens the lock; her right PIN cancels it; after it
//   the next opener chooses a new PIN. Nothing is deleted.
// Pure functions of (lock, input, now), so the rules are tested without a screen (app/tests/lock.test.js).

import { latin } from './numbers.js';
import { hex, sha256Bytes } from './sha256.js';

export const ROUNDS = 10000;
export const WAITS = [60e3, 15 * 60e3, 60 * 60e3];
export const RESET_MS = 24 * 3600e3;
export const TRIES = 5;
const DAY = 24 * 3600e3;

// "۱۲۳۴" or "1234" -> "1234"; anything that is not four digits -> null
export function digits(pin) {
  const d = latin(String(pin ?? '')).replace(/\s/g, '');
  return /^[0-9]{4}$/.test(d) ? d : null;
}

export function hashPin(salt, pin) {
  const enc = new TextEncoder();
  const tail = enc.encode(salt + ':' + pin);
  let h = sha256Bytes(tail);
  const buf = new Uint8Array(32 + tail.length);
  for (let i = 1; i < ROUNDS; i++) {
    buf.set(h, 0);
    buf.set(tail, 32);
    h = sha256Bytes(buf);
  }
  return hex(h);
}

function salt() {
  const a = new Uint8Array(12);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return hex(a);
}

export function make(pin) {
  const d = digits(pin);
  if (!d) throw new Error('four digits');
  const s = salt();
  return { salt: s, hash: hashPin(s, d), tries: 0, until: 0, rounds: 0, last: 0, resetAt: null };
}

// how long she must wait before trying again (ms), 0 if she may try now
export const waitLeft = (lock, now = Date.now()) => Math.max(0, (lock && lock.until) || 0) > now ? lock.until - now : 0;

// try a PIN: {ok, lock} with the lock's new state (tries counted, waits set, a waiting reset cancelled by the right PIN)
export function attempt(lock, pin, now = Date.now()) {
  const l = { ...lock };
  if (waitLeft(l, now)) return { ok: false, lock: l, wait: waitLeft(l, now) };
  if (l.rounds && now - (l.last || 0) > DAY) l.rounds = 0;
  const d = digits(pin);
  if (d && hashPin(l.salt, d) === l.hash) {
    return { ok: true, lock: { ...l, tries: 0, until: 0, rounds: 0, resetAt: null } };
  }
  l.tries = (l.tries || 0) + 1;
  if (l.tries >= TRIES) {
    l.until = now + WAITS[Math.min(l.rounds || 0, WAITS.length - 1)];
    l.rounds = (l.rounds || 0) + 1;
    l.last = now;
    l.tries = 0;
  }
  return { ok: false, lock: l, wait: waitLeft(l, now) };
}

// "I forgot": the 24-hour countdown starts (once; asking again does not restart it)
export const startReset = (lock, now = Date.now()) => ({ ...lock, resetAt: lock.resetAt || now + RESET_MS });
export const resetLeft = (lock, now = Date.now()) => (lock && lock.resetAt ? Math.max(0, lock.resetAt - now) : null);
export const resetDue = (lock, now = Date.now()) => !!(lock && lock.resetAt && lock.resetAt <= now);
// whole hours left, rounded up, for "a reset is waiting · 17 hours left"
export const hoursLeft = (lock, now = Date.now()) => Math.ceil((resetLeft(lock, now) || 0) / 3600e3);

// the lock is for learners older than early years
export const allowed = (band) => band !== 'ey';
