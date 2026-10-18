// The school bag on the move (WEBSITE.md 3.6 to 3.13, W7): her bag made, pulled, merged and pushed with the relay in
// reach, found by its code on a new phone, saved as a file, stopped, and made again under a new code. bag.js does
// the crypto and the merge (and loads only here, when a bag is used); this file decides when, with which relay and
// with which of her tokens. Nothing of the code or the keys ever leaves the phone: a relay is given F_r and W_r for
// itself alone, and the sealed bag.
//
// What this phone knows of each relay, per learner, is kept in its cache (`qalam.cache.bag.<learner>`), never in the
// bag: `gone`, the day a relay said her bag was stopped (410: her consent withdrawn or a new code made on another
// phone; nothing is pulled or pushed again until the new code is typed or made here, and her seats do not join again
// on their own, 3.13 cases 12 and 13), and per relay `{etag, held, st, home, cv, day}`: the etag, a hash of the
// record that relay holds as this phone last knew it, the state the screens show ('saved', 'waiting', 'consent' (her
// consent there does not name the bag), 'newer' (a newer app wrote it: read, never written), 'inflate' (this
// browser cannot open it)), whether it is the centre or online, and the consent version a 403 answered.
//
// When (3.9): a pull at start, whenever a relay comes back, and on "Sync now"; a push when her record holds what the
// relay's does not, 30 seconds after a change (a lesson, a mark, a setting), when the app goes to the background
// with something unsent, and on "Sync now". On the hub's Wi-Fi without limits; online on mobile data at most every
// 30 minutes and 6 times a day, once a day under Save-Data. A 412 is pull, merge and push again, up to 3 times.

import * as hub from './hub.js';
import * as state from './state.js';
import { canon, SERVER } from './stamps.js';

export const lib = () => import('./bag.js');

const DAY_PUSHES = 6;
const DATA_GAP = 30 * 60e3;
const SOON = 30e3;
const SPACING = 11e3;              // the relay keeps one stored write each 10 seconds per bag
const LIMITED = 5 * 60e3;          // and 30 writes an hour per token
const today = () => new Date(Date.now()).toISOString().slice(0, 10);

// what this phone knows of her bag on each relay
const KEY = (id) => 'bag.' + id;
function memo(id) {
  const m = state.cache(KEY(id));
  return { gone: m && typeof m.gone === 'string' ? m.gone : null, at: m && m.at && typeof m.at === 'object' ? m.at : {} };
}
const keep = (id, m) => { state.cache(KEY(id), m); };
export function forget(id) { state.cache(KEY(id), null); }
export const stopped = (id) => !!memo(id).gone;

// 'saved', 'waiting' or 'none' for the centre and for online, and whether it was stopped, for Settings
export function status(id) {
  const m = memo(id);
  const out = { gone: m.gone, hub: null, online: null, newer: false, inflate: false, consent: false };
  for (const r of Object.values(m.at)) {
    const where = r.home === 'hub' ? 'hub' : 'online';
    if (r.st === 'newer') out.newer = true;
    if (r.st === 'inflate') out.inflate = true;
    if (r.st === 'consent') out.consent = true;
    if (out[where] !== 'saved') out[where] = r.st === 'saved' ? 'saved' : 'waiting';
  }
  return out;
}

// two FNV-1a hashes, 16 hex digits: the record a relay holds, compared, never sent
function hash(text) {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
// one form of a record, whatever produced it (the merge with nothing tidies and caps it as every merge does)
const held = (B, record) => hash(canon(B.merge(record, {})));

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(text) {
  const s = atob(String(text));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// the push budget on mobile data (3.9); the hub's Wi-Fi and a Wi-Fi connection have none
function budget() {
  const b = state.cache('bag.budget');
  return b && b.day === today() ? b : { day: today(), n: 0, last: (b && b.last) || 0 };
}
function mayPush(force) {
  if (force || hub.home() === 'hub') return true;
  const c = globalThis.navigator && navigator.connection;
  if (c && (c.type === 'wifi' || c.type === 'ethernet')) return true;
  const b = budget();
  if (c && c.saveData) return b.n < 1;
  return b.n < DAY_PUSHES && Date.now() - b.last >= DATA_GAP;
}
function spent() {
  const b = budget();
  state.cache('bag.budget', { day: b.day, n: b.n + 1, last: Date.now() });
}

// her school bag: a new code and its keys, kept with her learner (`bag`), on this phone only. The first push comes
// with the next sync (at once when a relay is in reach and her consent there names the bag).
export async function make(id) {
  const B = await lib();
  const code = B.newCode();
  const k = await B.keys(code);
  if (!state.byId(id)) return null;
  state.updateChild(id, { bag: { code, ...k } });
  keep(id, { gone: null, at: {} });
  return code;
}

// "Make a new code" (3.10, behind her PIN): the bag sealed again under a new code; its first write on each relay
// makes the old bag there a tombstone (one bag per seat), and each of her seats asks its server for a new token at
// the next contact (account.js), so a lost phone's copy dies everywhere
export async function newCode(id) {
  const B = await lib();
  const code = B.newCode();
  const k = await B.keys(code);
  const l = state.byId(id);
  if (!l) return null;
  for (const [sid, seat] of Object.entries(l.seats)) if (SERVER.test(sid) && seat.token) state.setSeat(id, sid, { renew: true });
  state.updateChild(id, { bag: { code, ...k } });
  keep(id, { gone: null, at: {} });
  return code;
}

// her seat's token on the relay in reach, when this server issued it
const tokenHere = (l, sid) => { const t = l && l.seats[sid] && l.seats[sid].token; return t && hub.mayCarry(t) ? t : null; };
const writable = (seat, r) => !!(seat && seat.token && seat.consent && seat.consent.sent
  && !(r.st === 'consent' && r.cv === seat.consent.version));

// pull, merge and (when she has something the relay lacks) push, with the relay in reach
async function syncOne(id, { push = true, force = false, quiet = false } = {}) {
  let l = state.byId(id);
  const sid = hub.id();
  if (!l || !l.bag || !hub.relays() || !SERVER.test(sid || '')) return null;
  const m = memo(id);
  if (m.gone) return 'stopped';
  const B = await lib();
  const rk = B.forRelay(l.bag, sid);
  const r = { ...(m.at[sid] || {}), home: hub.home() };
  const save = (st) => { if (st) r.st = st; m.at[sid] = r; keep(id, m); return r.st; };
  if (quiet && r.etag && r.held === held(B, B.pack(l))) return save('saved');     // nothing new: no request at all
  let waited = false;
  try {
    for (let round = 0; round < 4; round++) {
      l = state.byId(id);
      if (!l || !l.bag) return null;
      let relay = null;                                     // the record the relay holds, when it sent one
      try {
        const j = await hub.bagGet({ f: rk.f, ...(r.etag ? { etag: r.etag } : {}) }, tokenHere(l, sid));
        r.etag = j.etag;
        try { relay = await B.open(unb64(j.blob), l.bag); } catch (e) {
          if (e && e.code === 'inflate') return save('inflate');    // never written over: another phone can open it
          r.held = null;                                   // damaged or forged (3.13 case 8): this copy replaces it
        }
      } catch (e) {
        if (e.status === 410) { m.gone = today(); return save('waiting'); }
        if (e.status === 404) { r.etag = null; r.held = null; } else if (e.status !== 304) throw e;
      }
      if (relay) {
        state.adopt(id, B.unpack(relay, l));
        state.standIn(id);
        r.held = held(B, relay);
        if (!B.writable(relay)) return save('newer');
      }
      l = state.byId(id);
      const mine = B.pack(l);
      if (r.held && held(B, relay ? B.merge(relay, mine) : mine) === r.held) return save('saved');
      const seat = l.seats[sid];
      if (!push || !writable(seat, r)) return save(r.st === 'consent' ? 'consent' : 'waiting');
      if (!mayPush(force)) return save('waiting');
      const { blob } = await B.sealFitted(mine, l.bag);
      try {
        const j = await hub.bagPut({ f: rk.f, w: rk.w, if: r.etag || 'new', blob: b64(blob) }, seat.token);
        spent();
        r.etag = j.etag;
        r.held = held(B, mine);
        r.day = today();
        return save('saved');
      } catch (e) {
        if (e.status === 412) continue;                    // another phone wrote first: pull, merge, push again
        if (e.status === 410) { m.gone = today(); return save('waiting'); }
        if (e.status === 403) { r.cv = seat.consent.version; return save('consent'); }
        if (e.status === 429 && !waited) {                // one stored write each 10 seconds per bag: wait once
          waited = true;
          round--;
          await new Promise((ok) => setTimeout(ok, SPACING));
          continue;
        }
        if (e.status === 429) { later(LIMITED); return save('waiting'); }   // the hour's writes used up
        throw e;
      }
    }
    return save('waiting');
  } catch { return save('waiting'); }          // out of reach, or the server failed: the next trigger tries again
}

let running = null;
let again = false;
let busy = false;
// every learner on this phone with a bag, with the relay in reach
export function syncAll(opts = {}) {
  if (running) { again = true; return running; }
  running = (async () => {
    await null;                  // so `running` is set before the finally below can clear it
    busy = true;
    try {
      do {
        again = false;
        for (const l of state.learners()) if (l.bag) await syncOne(l.id, opts);
      } while (again);
    } finally { busy = false; running = null; pending = false; }
  })();
  return running;
}
export const syncLearner = (id, opts) => syncOne(id, opts);

// before a seat of hers joins again (account.js): a pull, once a visit for each relay, so a bag stopped elsewhere
// (410) stops her seats from joining again on their own
const checked = new Set();
export async function check(id) {
  const l = state.byId(id);
  if (!l || !l.bag) return 'none';
  if (stopped(id)) return 'stopped';
  const key = `${id}@${hub.id()}`;
  if (!checked.has(key)) { checked.add(key); await syncOne(id, { push: false }); }
  return stopped(id) ? 'stopped' : 'ok';
}

// the push 30 seconds after a change, and at once when the app goes to the background with something unsent
let timer = null;
let pending = false;
function later(ms = SOON) {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncAll({ quiet: true }); }, ms);
}
let started = false;
export function start() {
  if (started) return;
  started = true;
  state.onSaved(() => { if (!busy && state.learners().some((l) => l.bag)) later(); });
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && pending) { clearTimeout(timer); syncAll({ quiet: true }); }
    });
  } catch { /* no document (tests) */ }
}

// her bag on the relay in reach made a tombstone ("Stop sharing", "Everywhere"), with the token she has there; the
// token is read before anything else, so a seat cleared just after still sends it (hub.js knows its issuer)
export async function dropHere(id) {
  const l = state.byId(id);
  const sid = hub.id();
  const token = tokenHere(l, sid);
  if (!l || !l.bag || !token || !hub.relays()) return false;
  const B = await lib();
  const rk = B.forRelay(l.bag, sid);
  try { await hub.bagDelete({ f: rk.f, w: rk.w }, token); return true; } catch { return false; }
}

// a new phone (3.10): the bag for `code` on the relay in reach. {k, bag, etag} when found; else {k, why}: 'none'
// (not at this relay yet), 'gone' (stopped), 'offline', 'slow' (429), 'damaged' or 'inflate'
export async function lookUp(code) {
  const B = await lib();
  const k = await B.keys(code);
  if (!hub.relays()) return { k, why: 'offline' };
  const sid = hub.id();
  try {
    const j = await hub.bagGet({ f: B.forRelay(k, sid).f });
    try { return { k, sid, etag: j.etag, bag: await B.open(unb64(j.blob), k) }; } catch (e) {
      return { k, why: e && e.code === 'inflate' ? 'inflate' : 'damaged' };
    }
  } catch (e) {
    return { k, why: e.status === 404 ? 'none' : e.status === 410 ? 'gone' : e.status === 429 ? 'slow' : 'offline' };
  }
}

// a sealed bag file (the file route: no relay, no consent), opened with her code
export async function openFile(bytes, code) {
  const B = await lib();
  const k = await B.keys(code);
  try { return { k, bag: await B.open(bytes, k) }; } catch (e) { return { k, why: e && e.code === 'inflate' ? 'inflate' : 'damaged' }; }
}

// what "Found: … Is this you?" shows of a bag: her picture, her number (on this server, else any), her year or door,
// and how many lessons she finished. Never a name: the bag holds none.
export function summary(bag, sid = hub.id()) {
  const s = (bag && bag.s) || {};
  const v = (f) => (Array.isArray(s[f]) ? s[f][0] : null);
  const seats = (bag && bag.seats) || {};
  const seat = seats[sid] || Object.values(seats).find((x) => x && Array.isArray(x.t) && x.t.length) || null;
  const number = seat && Array.isArray(seat.t) ? (seat.t.find((t) => Number.isInteger(t.number)) || {}).number ?? null : null;
  return { picture: v('picture'), band: v('band'), year: v('year'), track: v('track'), lang: v('lang'), number,
    lessons: Object.keys((bag && bag.done) || {}).length, lock: !!v('lock') };
}

// "Yes, this is me": the found bag laid over a learner with nothing stamped (never one made by addChild, whose new
// settings would be newer than hers), kept as a new learner on this phone with her bag's keys
export async function restore(found, code) {
  const B = await lib();
  const rec = B.unpack(found.bag, { id: 'new', seats: {} });
  delete rec.id;
  const l = state.restore({ ...rec, bag: { code, ...found.k } });
  if (l && found.sid) {
    keep(l.id, { gone: null, at: { [found.sid]: { etag: found.etag, held: held(B, found.bag), st: B.writable(found.bag) ? 'saved' : 'newer', home: hub.home() } } });
  }
  return l;
}

// a bag of hers laid over learner `id` on this phone (a bag file, or the new code typed after "stopped"): her keys
// become this code's, and the stop is over
export async function mergeInto(id, found, code) {
  const B = await lib();
  const l = state.byId(id);
  if (!l) return null;
  const out = state.adopt(id, { ...B.unpack(found.bag, l), bag: { code, ...found.k } });
  state.standIn(id);
  keep(id, { gone: null, at: {} });
  return out;
}

// "This is also me" (3.10, behind both PINs): learner `other`, on this phone, folded into `id` by the same rules;
// her seats' tokens meet in one seat and the servers fold them (/api/me/merge); `other` leaves this phone only
export async function fold(id, other) {
  const B = await lib();
  const a = state.byId(id);
  const b = state.byId(other);
  if (!a || !b || a === b) return null;
  const bagKeys = a.bag || b.bag || null;
  const out = state.adopt(id, { ...B.unpack(B.pack(b), a), ...(bagKeys ? { bag: bagKeys } : {}) });
  state.removeHere(other);
  forget(other);
  state.standIn(id);
  return out;
}

// her bag as a file, sealed under her code (3.10 "No relay at all"): about 10 KB
export async function file(id) {
  const B = await lib();
  const l = state.byId(id);
  if (!l || !l.bag) return null;
  return (await B.sealFitted(B.pack(l), l.bag)).blob;
}
export const FILE_NAME = 'qalam-bag.qbag';

// for tests
export function reset() { running = null; again = false; busy = false; pending = false; clearTimeout(timer); timer = null; checked.clear(); }
