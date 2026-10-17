// The school bag's core (WEBSITE.md 3.6 and 3.8, W5): her bag code, the keys it gives, the sealed bag, and the merge of
// two copies of her record. Nothing here reads or writes storage or the network: the relay (W6) and the screens (W7)
// call it, and state.js keeps the stamps it merges by (stamps.js). Loaded only when a bag is used (sw.js LAZY).
//
// The code: 16 digits, 15 from crypto.getRandomValues and a Damm check digit (sheetcode.js's table), about 50 bits.
// It shows as 4 groups of 4 in a left-to-right isolate, in Persian digits in Dari and Pashto; it is typed in either
// set of digits, and the check digit refuses one wrong digit or two swapped before anything is sent. On paper it is
// the text QR `Q1 BAG <16 digits>`, never a link.
//
// The keys: M = PBKDF2-HMAC-SHA256(code, "qalam-bag/1", 100 000 rounds); K, F and W = HKDF-SHA256(M, info "seal",
// "find" and "write"); for a relay r (its hello.id) F_r = HMAC(F, r) and W_r = HMAC(W, r). A relay sees only F_r and
// W_r, useless anywhere else. PBKDF2 runs in the browser's own crypto.subtle where the page has it (online, and the
// Android app's page) and in the vendored @noble/hashes where it does not (the hub's plain http): the same bytes.
//
// The seal: XChaCha20-Poly1305 (vendored @noble/ciphers) under K, a random 24-byte nonce, the associated data
// "qalam-bag/1|" + F, so a bag sealed for one code cannot pass for another's. The plaintext is a flag byte (0 plain,
// 1 deflated), the body's length (4 bytes) and the body, the JSON of the record (deflated where CompressionStream
// exists), padded with zeros to the next whole KB; sealed, at most 64 KB. The blob is the nonce and then the sealed
// plaintext with its tag.
//
// The record (v 1) holds only what travels (3.8); every part with a stamp holds it beside its value, [value, stamp]:
//   s         her settings, {name: [value or null, stamp]}: newest stamp
//   done      {lesson: [stars, at]}: the higher stars, the later time
//   step      {lesson: [step, stamp]}: newest stamp, dropped when older than the lesson's latest finish
//   tries     {lesson: {n: [[stamp, right], ...]}}: every first try, those older than the finish dropped; she reads
//             the earliest (a set, so the merge stays pure whatever order the copies meet in)
//   marks, recall, prints   {key: [value, stamp]}: newest stamp, at most 300 each (the newest)
//   uni       {tick: [ticked, stamp]}: newest stamp, so an untick travels too
//   asks, made, contests    {key: [item or null, stamp]}: newest stamp; null is a removed one (a tombstone, so it
//             never comes back); at most 30, 50 and 50, tombstones counted, the newest kept
//   certs     [{path, id, month, server}]: union by id, at most 50 (the latest months)
//   seats     {server id: {t: [{token, number, cohort, sentBand, joined}], code, asked, consent: [consent, stamp]}}:
//             union; her tokens for one server all kept (the oldest is used, the others wait for /api/me/merge);
//             consent newest stamp
//   dead      tokens that died (a 401, a merge, a new token, "Stop sharing"): never used again
// Anything else, from a newer app, is kept as it is (the larger JSON wins when two differ); a bag whose v is newer
// than VERSION is read and never written. Every rule is a join: merge is commutative, associative and idempotent
// (app/tests/bag.test.js checks it over random records).

import { xchacha20poly1305 } from './vendor/noble-ciphers/chacha.js';
import { hkdf } from './vendor/noble-hashes/hkdf.js';
import { hmac } from './vendor/noble-hashes/hmac.js';
import { pbkdf2Async } from './vendor/noble-hashes/pbkdf2.js';
import { sha256 } from './vendor/noble-hashes/sha2.js';
import { latin } from './numbers.js';
import { damm } from './sheetcode.js';
import { canon, ITEMS, MAPS, ms, newer, SCALARS, SERVER, valid } from './stamps.js';

export const VERSION = 1;
export const SALT = 'qalam-bag/1';
export const ROUNDS = 100000;            // measured in W5 (WEBSITE.md, "W5"); never below 50 000
export const MAX = 64 * 1024;            // sealed
export const CAPS = { marks: 300, recall: 300, prints: 300, asks: 30, made: 50, contests: 50, certs: 50 };
const KNOWN = ['v', 's', 'done', 'step', 'tries', ...MAPS.filter((m) => m !== 'step'), 'uni', ...Object.keys(ITEMS),
  'certs', 'seats', 'dead'];
const enc = new TextEncoder();
const dec = new TextDecoder();

export class BagError extends Error {
  // 'size' (over 64 KB), 'seal' (not a bag for this code, or damaged), 'inflate' (deflated, and this browser cannot
  // inflate)
  constructor(code) { super(`bag: ${code}`); this.code = code; }
}

// the code

export function newCode(fill = (a) => globalThis.crypto.getRandomValues(a)) {
  let s = '';
  while (s.length < 15) {
    for (const x of fill(new Uint8Array(24))) if (x < 250 && s.length < 15) s += String(x % 10);   // no bias
  }
  return s + damm(s);
}

// typed or scanned digits, Persian, Arabic-Indic or Latin, with any spaces or dashes: the code, or null when it is not
// 16 digits or the check digit refuses it
export function readCode(text) {
  const d = latin(text).replace(/[\s\-_.‎‏⁦-⁩]/g, '');
  return /^\d{16}$/.test(d) && damm(d) === 0 ? d : null;
}

export const groups = (code) => code.match(/\d{4}/g) || [];
const FA = '۰۱۲۳۴۵۶۷۸۹';
export function showCode(code, lang = 'prs') {
  const g = groups(code).join(' ');
  return `⁦${lang === 'en' ? g : g.replace(/\d/g, (d) => FA[d])}⁩`;
}
export const qrText = (code) => `Q1 BAG ${code}`;
export function fromQr(text) {
  const m = /^Q1 BAG (\d{16})$/.exec(String(text ?? '').trim());
  return m ? readCode(m[1]) : null;
}

// the keys

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(String(h).match(/[0-9a-f]{2}/g) || [], (x) => parseInt(x, 16));

// M; `native: false` always uses the vendored PBKDF2 (the hub's page)
export async function master(code, { rounds = ROUNDS, native = true } = {}) {
  const subtle = native && globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT),
        iterations: rounds }, key, 256));
    } catch { /* not offered here: the vendored one */ }
  }
  return pbkdf2Async(sha256, enc.encode(code), enc.encode(SALT), { c: rounds, dkLen: 32, asyncTick: 20 });
}

// {k, f, w} in hex, worked out once per device and kept with her learner (state.js `bag`)
export async function keys(code, opts) {
  const m = await master(code, opts);
  const part = (info) => hex(hkdf(sha256, m, undefined, enc.encode(info), 32));
  return { k: part('seal'), f: part('find'), w: part('write') };
}

// what one relay is given: F_r finds her bag there, W_r lets her write it (the relay keeps only a hash of each)
export function forRelay(k, id) {
  const r = enc.encode(String(id));
  return { f: hex(hmac(sha256, unhex(k.f), r)), w: hex(hmac(sha256, unhex(k.w), r)) };
}

// the seal

const aad = (k) => enc.encode(`${SALT}|${k.f}`);

async function squeeze(bytes, Stream) {
  if (typeof Stream !== 'function') return null;
  try {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate'))).arrayBuffer());
  } catch { return null; }
}

export async function seal(bag, k, { nonce = null, deflate = true } = {}) {
  const json = enc.encode(JSON.stringify(bag));
  const z = deflate ? await squeeze(json, globalThis.CompressionStream) : null;
  const body = z && z.length < json.length ? z : json;
  const size = Math.ceil((5 + body.length) / 1024) * 1024;
  if (24 + size + 16 > MAX) throw new BagError('size');
  const plain = new Uint8Array(size);
  plain[0] = body === json ? 0 : 1;
  new DataView(plain.buffer).setUint32(1, body.length);
  plain.set(body, 5);
  const iv = nonce || globalThis.crypto.getRandomValues(new Uint8Array(24));
  const sealed = xchacha20poly1305(unhex(k.k), iv, aad(k)).encrypt(plain);
  const out = new Uint8Array(24 + sealed.length);
  out.set(iv);
  out.set(sealed, 24);
  return out;
}

export async function open(blob, k) {
  if (!(blob instanceof Uint8Array) || blob.length > MAX || blob.length < 24 + 1024 + 16 || (blob.length - 40) % 1024) {
    throw new BagError('seal');
  }
  let plain;
  try {
    plain = xchacha20poly1305(unhex(k.k), blob.subarray(0, 24), aad(k)).decrypt(blob.subarray(24));
  } catch { throw new BagError('seal'); }
  const n = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(1);
  if (plain[0] > 1 || 5 + n > plain.length) throw new BagError('seal');
  let body = plain.subarray(5, 5 + n);
  if (plain[0] === 1) {
    if (typeof globalThis.DecompressionStream !== 'function') throw new BagError('inflate');
    body = await squeeze(body, globalThis.DecompressionStream);
    if (!body) throw new BagError('seal');
  }
  let bag;
  try { bag = JSON.parse(dec.decode(body)); } catch { throw new BagError('seal'); }
  if (!bag || typeof bag !== 'object' || Array.isArray(bag) || !Number.isInteger(bag.v) || bag.v < 1) throw new BagError('seal');
  return bag;
}

// a record that would seal over 64 KB loses, from the bag copy only (never from the phone), the oldest retired review
// items, then the oldest review items, marks, printed sheets, questions of her own and questions (3.13 case 7)
export async function sealFitted(bag, k, opts) {
  let b = bag;
  for (;;) {
    try { return { blob: await seal(b, k, opts), bag: b }; } catch (e) {
      if (!(e instanceof BagError) || e.code !== 'size') throw e;
      const smaller = trim(b);
      if (!smaller) throw e;
      b = smaller;
    }
  }
}

function trim(bag) {
  const b = { ...bag };
  const oldest = (o, pick = () => true) => Object.entries(o || {}).filter(pick).sort((x, y) => (x[1][1] < y[1][1] ? -1 : 1));
  const order = [['recall', ([, e]) => Array.isArray(e[0]) && e[0][0] === 0], ['recall'], ['marks'], ['prints'],
    ['made', ([, e]) => e[0] !== null], ['asks', ([, e]) => e[0] !== null], ['contests', ([, e]) => e[0] !== null]];
  for (const [part, pick] of order) {
    const list = oldest(b[part], pick);
    if (!list.length) continue;
    const drop = new Set(list.slice(0, Math.max(1, Math.ceil(list.length / 10))).map(([key]) => key));
    b[part] = Object.fromEntries(Object.entries(b[part]).filter(([key]) => !drop.has(key)));
    return b;
  }
  return null;
}

// the record

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const stampOr = (s) => (valid(s) ? s : '');
const pair = (e) => (Array.isArray(e) && e.length === 2 ? [e[0] === undefined ? null : e[0], stampOr(e[1])] : null);
const higher = (x, y) => (canon(x) >= canon(y) ? x : y);

// newest stamp; equal stamps, the larger JSON (only a bag edited by hand could tie)
function lww(x, y) {
  if (x[1] !== y[1]) return newer(x[1], y[1]) ? x : y;
  return higher(x, y);
}

function byKey(a, b, f) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? f(out[k], v) : v;
  return out;
}

// the newest n by stamp (then key), as an object
function newest(o, n) {
  const e = Object.entries(o);
  if (e.length <= n) return o;
  e.sort((x, y) => (x[1][1] === y[1][1] ? (x[0] < y[0] ? 1 : -1) : (newer(x[1][1], y[1][1]) ? -1 : 1)));
  return Object.fromEntries(e.slice(0, n));
}

// a record as it came (from a bag, perhaps from a newer app, perhaps damaged): the shape the merge needs, nothing
// more; values are checked by state.js when she uses them
export function tidy(bag) {
  const b = obj(bag);
  const pairs = (o) => Object.fromEntries(Object.entries(obj(o)).map(([k, e]) => [k, pair(e)]).filter(([, e]) => e));
  const out = { v: Number.isInteger(b.v) && b.v > 0 ? b.v : VERSION, s: pairs(b.s) };
  out.done = Object.fromEntries(Object.entries(obj(b.done)).filter(([, e]) => Array.isArray(e) && e.length === 2
    && Number.isFinite(e[0]) && Number.isFinite(e[1])).map(([k, e]) => [k, [e[0], e[1]]]));
  for (const m of [...MAPS, 'uni', ...Object.keys(ITEMS)]) out[m] = pairs(b[m]);
  out.tries = {};
  for (const [lesson, t] of Object.entries(obj(b.tries))) {
    const per = {};
    for (const [n, list] of Object.entries(obj(t))) {
      const ok = (Array.isArray(list) ? list : []).filter((e) => Array.isArray(e) && e.length === 2)
        .map((e) => [stampOr(e[0]), e[1]]);
      if (ok.length) per[n] = ok;
    }
    if (Object.keys(per).length) out.tries[lesson] = per;
  }
  out.certs = (Array.isArray(b.certs) ? b.certs : []).filter((c) => c && typeof c.id === 'string');
  out.seats = {};
  for (const [sid, x] of Object.entries(obj(b.seats))) {
    const s = obj(x);
    out.seats[sid] = { t: (Array.isArray(s.t) ? s.t : []).filter((e) => e && typeof e.token === 'string'),
      code: typeof s.code === 'string' ? s.code : null, asked: s.asked === true,
      consent: pair(s.consent) || [null, ''] };
  }
  out.dead = [...new Set((Array.isArray(b.dead) ? b.dead : []).filter((t) => typeof t === 'string'))].sort();
  for (const [k, v] of Object.entries(b)) if (!KNOWN.includes(k)) out[k] = v;
  return out;
}

function seatJoin(x, y) {
  const t = new Map();
  for (const e of [...x.t, ...y.t]) {
    const o = t.get(e.token);
    if (!o) { t.set(e.token, e); continue; }
    const j = { token: e.token };
    for (const f of new Set([...Object.keys(o), ...Object.keys(e)])) {
      if (f === 'token') continue;
      const [x1, y1] = [o[f] ?? null, e[f] ?? null];
      j[f] = x1 === null ? y1 : y1 === null ? x1 : higher(x1, y1);
    }
    t.set(e.token, j);
  }
  return { t: [...t.values()], code: x.code === null ? y.code : y.code === null ? x.code : higher(x.code, y.code),
    asked: x.asked || y.asked, consent: lww(x.consent, y.consent) };
}

// the merge of two records (3.8)
export function merge(a, b) {
  a = tidy(a);
  b = tidy(b);
  const out = { v: Math.max(a.v, b.v) };
  out.s = byKey(a.s, b.s, lww);
  out.done = byKey(a.done, b.done, (x, y) => [Math.max(x[0], y[0]), Math.max(x[1], y[1])]);
  const finished = (lesson) => (out.done[lesson] ? out.done[lesson][1] : -Infinity);
  out.step = Object.fromEntries(Object.entries(byKey(a.step, b.step, lww)).filter(([l, e]) => ms(e[1]) > finished(l)));
  out.tries = {};
  for (const lesson of new Set([...Object.keys(a.tries), ...Object.keys(b.tries)])) {
    const per = {};
    for (const n of new Set([...Object.keys(a.tries[lesson] || {}), ...Object.keys(b.tries[lesson] || {})])) {
      const all = new Map();
      for (const e of [...((a.tries[lesson] || {})[n] || []), ...((b.tries[lesson] || {})[n] || [])]) {
        if (ms(e[0]) > finished(lesson)) all.set(canon(e), e);
      }
      if (all.size) per[n] = [...all.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([, e]) => e);
    }
    if (Object.keys(per).length) out.tries[lesson] = per;
  }
  for (const m of ['marks', 'recall', 'prints']) out[m] = newest(byKey(a[m], b[m], lww), CAPS[m]);
  out.uni = byKey(a.uni, b.uni, lww);
  for (const list of Object.keys(ITEMS)) out[list] = newest(byKey(a[list], b[list], lww), CAPS[list]);
  const certs = new Map();
  for (const c of [...a.certs, ...b.certs]) certs.set(c.id, certs.has(c.id) ? higher(certs.get(c.id), c) : c);
  out.certs = [...certs.values()].sort((x, y) => (canon([x.month, x.id]) < canon([y.month, y.id]) ? -1 : 1))
    .slice(-CAPS.certs);
  out.dead = [...new Set([...a.dead, ...b.dead])].sort();
  const dead = new Set(out.dead);
  out.seats = {};
  for (const [sid, seat] of Object.entries(byKey(a.seats, b.seats, seatJoin))) {
    const t = seat.t.filter((e) => !dead.has(e.token)).sort((x, y) => (x.token < y.token ? -1 : 1));
    if (t.length || seat.code !== null || seat.asked || seat.consent[0] !== null || seat.consent[1]) {
      out.seats[sid] = { ...seat, t };
    }
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (KNOWN.includes(k)) continue;
    out[k] = !(k in a) ? b[k] : !(k in b) ? a[k] : higher(a[k], b[k]);
  }
  return out;
}

// a bag this app may write back: none from a newer app (3.8: "update Qalam to keep in step")
export const writable = (bag) => tidy(bag).v <= VERSION;

// her learner record (state.js) as a bag record: only what travels
export function pack(l) {
  const st = obj(l.st);
  const gone = obj(l.gone);
  const x = obj(l.bagx);
  const at = (k) => stampOr(st[k]);
  const b = { v: VERSION, s: {} };
  for (const f of SCALARS) if (st[f] || (l[f] !== undefined && l[f] !== null)) b.s[f] = [l[f] ?? null, at(f)];
  for (const [f, e] of Object.entries(obj(x.s))) if (!SCALARS.includes(f) && pair(e)) b.s[f] = pair(e);
  b.done = Object.fromEntries(Object.entries(obj(l.done)).map(([k, d]) => [k, [d.stars, d.at]]));
  for (const m of MAPS) b[m] = Object.fromEntries(Object.entries(obj(l[m])).map(([k, v]) => [k, [v, at(`${m}:${k}`)]]));
  b.tries = {};
  for (const [lesson, t] of Object.entries(obj(l.tries))) {
    b.tries[lesson] = Object.fromEntries(Object.entries(obj(t)).map(([n, ok]) => [n, [[at(`tries:${lesson}:${n}`), ok]]]));
  }
  b.uni = {};
  for (const n of l.uni || []) b.uni[n] = [true, at(`uni:${n}`)];
  for (const k of Object.keys(st)) if (k.startsWith('uni:') && !(k.slice(4) in b.uni)) b.uni[k.slice(4)] = [false, at(k)];
  for (const [list, key] of Object.entries(ITEMS)) {
    b[list] = {};
    for (const item of l[list] || []) if (item[key] !== undefined) b[list][item[key]] = [item, at(`${list}:${item[key]}`)];
    for (const [k, s] of Object.entries(gone)) if (k.startsWith(`${list}:`)) b[list][k.slice(list.length + 1)] ??= [null, stampOr(s)];
  }
  b.certs = Array.isArray(l.certs) ? l.certs : [];
  b.seats = {};
  for (const [sid, seat] of Object.entries(obj(l.seats))) {
    if (!SERVER.test(sid)) continue;           // the unplaced seat, and a server without an id, stay on this phone
    const t = [];
    if (seat.token) t.push({ token: seat.token, number: seat.number, cohort: seat.cohort, sentBand: seat.sentBand, joined: seat.joined });
    for (const token of seat.also || []) t.push({ token });
    b.seats[sid] = { t, code: seat.code ?? null, asked: seat.asked === true, consent: [seat.consent ?? null, at(`consent:${sid}`)] };
  }
  for (const k of Object.keys(st)) {
    const sid = k.startsWith('consent:') ? k.slice(8) : null;
    if (sid && SERVER.test(sid) && !b.seats[sid]) b.seats[sid] = { t: [], code: null, asked: false, consent: [null, at(k)] };
  }
  b.dead = Array.isArray(l.dead) ? l.dead : [];
  for (const [k, v] of Object.entries(x)) if (k !== 's' && !KNOWN.includes(k)) b[k] = v;
  return tidy(b);
}

// the record `bag` laid over learner `l`: what travels is the merge of hers and the bag's, so nothing of hers is lost;
// what never travels (her nickname, "Is this phone yours?", the closed-app bells, her wishes, the unplaced seat and
// seats of servers without an id, her bag's keys) stays as it is. state.js `adopt` keeps the result without stamping
// it again. A bag restored on a new phone goes over a learner with nothing stamped ({id, seats: {}}), never over one
// made by addChild, whose new settings would be newer than hers.
export function unpack(bag, l) {
  const b = merge(pack(l), bag);
  const out = { ...l };
  const st = {};
  const gone = {};
  const x = {};
  for (const [f, [v, s]] of Object.entries(b.s)) {
    if (!SCALARS.includes(f)) { (x.s ||= {})[f] = [v, s]; continue; }
    if (v === null) delete out[f]; else out[f] = v;
    if (s) st[f] = s;
  }
  out.done = Object.fromEntries(Object.entries(b.done).map(([k, [stars, at]]) => [k, { stars, at }]));
  const ordered = (o) => Object.entries(o).sort((p, q) => (p[1][1] === q[1][1] ? 0 : newer(q[1][1], p[1][1]) ? -1 : 1));
  for (const m of MAPS) {
    out[m] = {};
    for (const [k, [v, s]] of ordered(b[m])) { out[m][k] = v; if (s) st[`${m}:${k}`] = s; }
  }
  out.tries = {};
  for (const [lesson, per] of Object.entries(b.tries)) {
    out.tries[lesson] = {};
    for (const [n, list] of Object.entries(per)) {
      const [s, ok] = list[0];                    // sorted: the earliest first try
      out.tries[lesson][n] = ok;
      if (s) st[`tries:${lesson}:${n}`] = s;
    }
  }
  if (!Object.keys(out.tries).length) delete out.tries;
  out.uni = [];
  for (const [n, [on, s]] of Object.entries(b.uni)) { if (on === true) out.uni.push(Number(n)); if (s) st[`uni:${n}`] = s; }
  out.uni.sort((p, q) => p - q);
  for (const [list, key] of Object.entries(ITEMS)) {
    const keep = [];
    for (const [k, [item, s]] of Object.entries(b[list])) {
      if (item === null) { if (s) gone[`${list}:${k}`] = s; continue; }
      keep.push([{ ...item, [key]: k }, s]);
      if (s) st[`${list}:${k}`] = s;
    }
    keep.sort((p, q) => ((p[0].at || 0) - (q[0].at || 0)) || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
    out[list] = keep.map(([item]) => item);
  }
  out.certs = b.certs;
  out.seats = Object.fromEntries(Object.entries(obj(l.seats)).filter(([sid]) => !SERVER.test(sid)));
  for (const [sid, seat] of Object.entries(b.seats)) {
    if (!SERVER.test(sid)) continue;
    const [first, ...rest] = [...seat.t].sort((p, q) => ((p.joined ?? Infinity) - (q.joined ?? Infinity))
      || (p.token < q.token ? -1 : 1));       // her oldest token here; the others wait to be folded into it
    const one = { token: first ? first.token : null, number: first ? first.number ?? null : null,
      cohort: first ? first.cohort ?? null : null, sentBand: first ? first.sentBand ?? null : null,
      joined: first ? first.joined ?? null : null, code: seat.code, consent: seat.consent[0], asked: seat.asked,
      ...(rest.length ? { also: rest.map((e) => e.token) } : {}) };
    if (seat.consent[1]) st[`consent:${sid}`] = seat.consent[1];
    if (one.token || one.code || one.consent || one.asked) out.seats[sid] = one;
  }
  out.dead = b.dead;
  for (const [k, v] of Object.entries(b)) if (!KNOWN.includes(k)) x[k] = v;
  out.st = st;
  out.gone = gone;
  if (Object.keys(x).length) out.bagx = x; else delete out.bagx;
  return out;
}
