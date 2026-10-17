// What the phone remembers: the learners who use it, their band, year or track and language, their text size and
// theme, lessons done, sheets printed and questions asked. It stays on this phone only (the hub keeps no names).
// Storage can fail (private mode, full): the app then still works, it just forgets on reload. Starting and
// finishing a lesson also join the events queue (events.js) as a verb and the lesson id, and only for a learner
// whose grown-up agreed (consent); the server learns which learner token sent them, never a name.
//
// qalam.v2 holds no name, ever (F3). A learner is an alias picture (aliases.js, given when she is added), an optional
// nickname she may type in Settings (never sent), her band, and these per-learner settings: lock (lock.js), consent
// {kind, version, at, sent}, text ('normal' or 'large', "Bigger text") and theme ('phone', 'light' or 'dark').
// Since W4 (WEBSITE.md 3.3) her place on each server is a seat, `seats: {<server id>: seat}`: when she joins
// (account.js) the server's answer gives the seat its token, number and cohort {id, label}; `code` is the class code
// she joined with (kept so the phone can join again if the server forgets her), `consent` the grown-up's agreement
// to that server's own text, `asked` that its consent screen was answered (agreed or "Not now"), `sentBand` the
// band the server has, `joined` when. A token goes only to the server whose id issued it (hub.js checks every call).
// The seat '?' is one not placed yet: a learner who joined before W4 (with `base`, the address she used then, the
// only one it is ever tried at), or one added away from every server. The learner record still reads `token`,
// `number`, `cohort`, `code`, `consent`, `asked` and `sentBand`: those of the seat of the server in reach (else of
// the last one), so the screens need not know about seats. `forget` lists tokens of learners removed or withdrawn
// whose server record is still to be deleted, each with the server it belongs to. `clock` is the device's own
// {dev, skew, last, n}: a random id, the server's time minus this phone's, the latest time it made or saw (3.5), and
// the counter of the stamps made in that ms.
// Since W5 (WEBSITE.md 3.5 and 3.8) every write is stamped, so two copies of her record can be merged (bag.js): save()
// compares each learner with the record it last saw and gives each changed part the clock's next stamp (stamps.js),
// in `st` {part: stamp}; a removed question, question of her own or contest leaves `gone` {part: stamp}; `dead` lists
// her tokens that died (a 401, a fold, a new token, "Stop sharing"), so a copy from another phone never brings one
// back; `bagx` keeps what a newer app's bag held that this one does not know; `bag` is her school bag's code and
// keys {code, k, f, w} (bag.js), never sent. A value from before W5 has no stamp, the oldest.
// The v1 record (qalam.v1, which could hold a child's name) is migrated once, the name dropped, and removed.

import { known, pickFree } from './aliases.js';
import { bandOf, BANDS, THEMES, TRACKS } from './bands.js';
import * as events from './events.js';
import { next as nextStamp, ms as stampMs, parts, restamp, seen as seenStamp, valid as validStamp } from './stamps.js';

const KEY = 'qalam.v2';
const OLD = 'qalam.v1';
const empty = () => ({ v: 2, active: null, learners: [], forget: [], here: null, clock: cleanClock() });
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
// W4: the seats (WEBSITE.md 3.3); declared before the first load() below reads them
const SEAT_KEYS = ['token', 'number', 'cohort', 'code', 'consent', 'asked', 'sentBand'];
const NO_SEAT = { token: null, number: null, cohort: null, code: null, consent: null, asked: false, sentBand: null };
const SID = /^(?:[0-9a-f]{20}|b:[\x21-\x7e]{1,200}|\?)$/;
export const PENDING = '?';
let here = null;               // the server in reach (its hello.id), null away from every server
let hereBase = null;           // the address it answered at ('' is this website)
// P32: her own questions' limits; above `data`, which is cleaned with them as the module loads
export const MADE_MAX = 50;
export const MADE_CHARS = 300;
const MADE_STATUS = ['waiting', 'ok', 'change'];
const MADE_CHIPS = ['spelling', 'answer_wrong', 'unclear', 'unsafe', 'not_school'];
const str = (x, n = MADE_CHARS) => (typeof x === 'string' ? x.slice(0, n) : '');
// W5: each learner's stamped parts and tokens as save() last saw them (stamps.js parts)
const seenParts = new Map();
const seenTokens = new Map();
let data = loaded(load());

function loaded(d) {
  seenParts.clear();
  seenTokens.clear();
  for (const l of d.learners) { seenParts.set(l.id, parts(l)); seenTokens.set(l.id, tokensOf(l)); }
  return d;
}

function tokensOf(l) {
  const out = new Set();
  for (const seat of Object.values(l.seats || {})) for (const t of [seat.token, ...(seat.also || [])]) if (t) out.add(t);
  return out;
}

// what a write changed: its parts stamped, and her tokens that left every seat listed as dead
function stampAll() {
  for (const l of data.learners) {
    seenParts.set(l.id, restamp(l, seenParts.get(l.id) || new Map(), data.clock));
    const had = seenTokens.get(l.id);
    const has = tokensOf(l);
    const left = had ? [...had].filter((t) => !has.has(t)) : [];
    if (left.length) l.dead = cleanDead([...(l.dead || []), ...left]);
    seenTokens.set(l.id, has);
  }
}

function rid() {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2);
}

// the only fields a learner record keeps: anything else (a name from v1, a stray field) is dropped
function clean(l) {
  const year = Number.isInteger(l.year) && l.year >= 0 && l.year <= 12 ? l.year : null;
  const band = l.band === 'ad' ? 'ad' : bandOf({ year }) || (BANDS.includes(l.band) ? l.band : 'p1');
  return view({
    id: typeof l.id === 'string' && l.id ? l.id : rid(),
    band,
    year: band === 'ad' ? null : year ?? { ey: 0, p1: 1, p2: 4, s1: 7, s2: 10 }[band],
    track: band === 'ad' ? (TRACKS.includes(l.track) ? l.track : 'literacy') : null,
    lang: ['prs', 'ps', 'en'].includes(l.lang) ? l.lang : 'prs',
    picture: known(l.picture) ? l.picture : null,
    nickname: typeof l.nickname === 'string' ? l.nickname.slice(0, 20) : '',
    lock: l.lock && typeof l.lock === 'object' && typeof l.lock.hash === 'string' ? l.lock : null,
    lockOffered: l.lockOffered === true,
    seats: cleanSeats(l),
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
    // 7b (C4.10): an adult's study time, {at: "19:00", min: 30} or 'off' once she answered "A time to study"
    ...(cleanStudy(l.study) !== null ? { study: cleanStudy(l.study) } : {}),
    // P25b (C4.2): her certificates, [{path, id, month}], never a name (the paper itself is in the cache); since P31
    // a contest's path is `contest:<id>`
    ...(cleanCerts(l.certs).length ? { certs: cleanCerts(l.certs) } : {}),
    // P26: an adult on the literacy track has answered "You can read now. Use the reader look?" (asked once)
    ...(l.readerAsked === true ? { readerAsked: true } : {}),
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
    // P29 (C4.7): where the Quran reader was last, [surah, verse]; the reader sends no events
    ...(Array.isArray(l.quran) && l.quran.length === 2 && l.quran.every(Number.isInteger) && l.quran[0] >= 1
      && l.quran[0] <= 114 && l.quran[1] >= 1 && l.quran[1] <= 286 ? { quran: [l.quran[0], l.quran[1]] } : {}),
    // P28 (C4.6): the university checklist's steps she ticked (numbers 1 to 12), kept on this phone and never sent
    ...(cleanUni(l.uni).length ? { uni: cleanUni(l.uni) } : {}),
    // P32 (C4.8): her own questions (at most 50), kept on this phone; one she sent for a check keeps its number
    // there and the verdict that came back (modules/made.js)
    ...(cleanMade(l.made).length ? { made: cleanMade(l.made) } : {}),
    // P30a (C6.2): the last live class she saw end, so a stale hello never offers it again; nothing else of a class
    ...(typeof l.liveSeen === 'string' && /^[a-z0-9]{16}$/.test(l.liveSeen) ? { liveSeen: l.liveSeen } : {}),
    ...(l.floorSeen === true ? { floorSeen: true } : {}),          // she read the floor's explainer once (P30b)
    // P31 (C6.5): the contests she joined (at most 50): her answers until she sends them and after, for "See the
    // answers" once the key comes; the percent, right and n the server sent back. Never a place or anyone else's
    ...(cleanContests(l.contests).length ? { contests: cleanContests(l.contests) } : {}),
    // W5: the stamps, tombstones and dead tokens the bag merges by; a newer app's parts; her bag's code and keys
    ...(Object.keys(cleanStamps(l.st, 3000)).length ? { st: cleanStamps(l.st, 3000) } : {}),
    ...(Object.keys(cleanGone(l.gone)).length ? { gone: cleanGone(l.gone) } : {}),
    ...(cleanDead(l.dead).length ? { dead: cleanDead(l.dead) } : {}),
    ...(cleanBagx(l.bagx) ? { bagx: cleanBagx(l.bagx) } : {}),
    ...(cleanBag(l.bag) ? { bag: cleanBag(l.bag) } : {}),
  });
}

// W5's parts of a learner (stamps.js, bag.js): stamps by part name; at most `n`, the newest
function cleanStamps(o, n) {
  if (!o || typeof o !== 'object') return {};
  const ok = Object.entries(o).filter(([k, v]) => k.length <= 200 && validStamp(v));
  if (ok.length > n) ok.sort((a, b) => (a[1] < b[1] ? 1 : -1)).splice(n);
  return Object.fromEntries(ok);
}
// tombstones: at most as many per list as the list keeps (bag.js CAPS), the newest
function cleanGone(o) {
  const all = cleanStamps(o, 1000);
  const out = {};
  for (const [list, n] of [['asks', 30], ['made', 50], ['contests', 50]]) {
    Object.assign(out, cleanStamps(Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(list + ':'))), n));
  }
  return out;
}
function cleanDead(v) {
  return Array.isArray(v) ? [...new Set(v.filter((t) => typeof t === 'string' && TOKEN.test(t)))].slice(-50) : [];
}
function cleanBagx(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  try { return Object.keys(x).length && JSON.stringify(x).length <= 16384 ? x : null; } catch { return null; }
}
function cleanBag(b) {
  const hex = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  return b && typeof b === 'object' && typeof b.code === 'string' && /^\d{16}$/.test(b.code) && hex(b.k) && hex(b.f) && hex(b.w)
    ? { code: b.code, k: b.k, f: b.f, w: b.w } : null;
}

// a seat (W4): the fields that came with joining one server, and its consent; null when it holds nothing
function cleanSeat(x) {
  if (!x || typeof x !== 'object') return null;
  const seat = {
    token: typeof x.token === 'string' && TOKEN.test(x.token) ? x.token : null,
    number: Number.isInteger(x.number) && x.number > 0 && x.number < 1000 ? x.number : null,
    cohort: x.cohort && typeof x.cohort.id === 'string' ? { id: x.cohort.id, label: String(x.cohort.label || '') } : null,
    code: typeof x.code === 'string' && CODE.test(x.code) ? x.code : null,
    consent: cleanConsent(x.consent),
    asked: x.asked === true,
    sentBand: BANDS.includes(x.sentBand) ? x.sentBand : null,
    joined: Number.isInteger(x.joined) && x.joined > 0 ? x.joined : null,
    // the unplaced seat of a learner from before W4: the address it was last used at ('' is this website)
    ...(typeof x.base === 'string' ? { base: x.base.slice(0, 200) } : {}),
    // more tokens of hers for the same server, to fold into this one (/api/me/merge, account.js)
    ...(Array.isArray(x.also) && x.also.some((t) => typeof t === 'string' && TOKEN.test(t))
      ? { also: [...new Set(x.also.filter((t) => typeof t === 'string' && TOKEN.test(t) && t !== x.token))].slice(0, 4) } : {}),
  };
  return seat.token || seat.code || seat.consent || seat.asked ? seat : null;
}

function cleanSeats(l) {
  const out = {};
  if (l.seats && typeof l.seats === 'object') {
    for (const [k, v] of Object.entries(l.seats)) {
      const seat = SID.test(k) ? cleanSeat(v) : null;
      if (seat) out[k] = seat;
    }
    return out;
  }
  // a learner from before W4 (WEBSITE.md 3.11): her one token and what came with it become the unplaced seat, tried
  // only at the address the phone last used (account.js places it under that server's id, or drops it on a 401)
  const legacy = cleanSeat({ ...Object.fromEntries(SEAT_KEYS.map((k) => [k, l[k]])), base: lastBase() });
  if (legacy) {
    if (!legacy.token) delete legacy.base;
    out[PENDING] = legacy;
  }
  return out;
}

// the address the app last reached a server at, as hub.js keeps it; before W4 it kept only another address than
// this website's, so none kept means this website ('') (the Android app never asks its own page, so '' is never
// tried there)
function lastBase() {
  try {
    const b = JSON.parse(localStorage.getItem('qalam.cache.hub'));
    return typeof b === 'string' ? b : '';
  } catch { return ''; }
}

function cleanClock(c) {
  const ok = c && typeof c === 'object';
  return {
    dev: ok && typeof c.dev === 'string' && /^[0-9a-f]{16}$/.test(c.dev) ? c.dev : rid(),
    skew: ok && Number.isFinite(c.skew) ? Math.round(c.skew) : 0,
    last: ok && Number.isFinite(c.last) && c.last > 0 ? Math.floor(c.last) : 0,
    n: ok && Number.isInteger(c.n) && c.n >= 0 && c.n < 46656 ? c.n : 0,
  };
}

function cleanForget(f) {
  if (!Array.isArray(f)) return [];
  const out = [];
  for (const x of f) {
    if (typeof x === 'string' && TOKEN.test(x)) out.push({ t: x, s: null, b: lastBase() });   // from before W4
    else if (x && typeof x.t === 'string' && TOKEN.test(x.t)) {
      out.push({ t: x.t, s: typeof x.s === 'string' && SID.test(x.s) && x.s !== PENDING ? x.s : null,
        b: typeof x.b === 'string' ? x.b.slice(0, 200) : null });
    }
  }
  return out.slice(-50);
}

// the learner as the screens read her: her seat's fields for the server in reach (else the last one, else her
// unplaced seat), never stored with her
function view(l) {
  for (const k of SEAT_KEYS) {
    Object.defineProperty(l, k, { get: () => (seatOf(l) || NO_SEAT)[k], enumerable: false, configurable: true });
  }
  return l;
}

// (its helpers live inside it: the store is read while this module loads, before later constants exist)
function cleanContests(v) {
  if (!Array.isArray(v)) return [];
  const CONTEST_ID = /^[a-z][a-z0-9-]{1,47}$/;
  const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const count = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const answerOf = (a) => (count(a, 0, 9) || (typeof a === 'string' && a.length <= 40) ? a : null);
  const seen = new Set();
  return v.filter((x) => x && typeof x.id === 'string' && CONTEST_ID.test(x.id) && !seen.has(x.id) && seen.add(x.id)
    && count(x.joined, 1, 8.64e15) && typeof x.closes === 'string' && MINUTE.test(x.closes))
    .slice(-50)
    .map((x) => ({
      id: x.id, subject: typeof x.subject === 'string' && /^[a-z]{2,16}$/.test(x.subject) ? x.subject : null,
      joined: x.joined, closes: x.closes,
      answers: (Array.isArray(x.answers) ? x.answers : []).slice(0, 30).map(answerOf),
      ...(count(x.n, 1, 30) && count(x.right, 0, x.n) && count(x.percent, 0, 100) && count(x.at, 1, 8.64e15)
        ? { n: x.n, right: x.right, percent: x.percent, at: x.at } : {}),
    }));
}

function cleanMade(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.filter((x) => x && typeof x.id === 'string' && /^[a-z0-9]{6,16}$/.test(x.id) && !seen.has(x.id) && seen.add(x.id)
    && typeof x.q === 'string' && x.q.trim() && typeof x.a === 'string' && x.a.trim())
    .slice(-MADE_MAX)
    .map((x) => ({
      id: x.id, q: str(x.q), a: str(x.a), why: str(x.why), lang: ['prs', 'ps', 'en'].includes(x.lang) ? x.lang : 'prs',
      lesson: typeof x.lesson === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x.lesson) ? x.lesson : null,
      at: Number.isInteger(x.at) ? x.at : 0, due: Number.isInteger(x.due) ? x.due : 0,
      ...(Number.isInteger(x.sent) && x.sent > 0 ? { sent: x.sent } : {}),
      ...(MADE_STATUS.includes(x.status) ? { status: x.status } : {}),
      ...(Array.isArray(x.chips) && x.chips.some((c) => MADE_CHIPS.includes(c))
        ? { chips: [...new Set(x.chips.filter((c) => MADE_CHIPS.includes(c)))] } : {}),
      ...(typeof x.reply === 'string' && x.reply.trim() ? { reply: str(x.reply) } : {}),
    }));
}

function cleanUni(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => Number.isInteger(x) && x >= 1 && x <= 12))].sort((a, b) => a - b);
}

function cleanCerts(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x.path === 'string' && /^(contest:)?[a-z0-9][a-z0-9-]{0,47}$/.test(x.path)
    && typeof x.id === 'string' && /^QC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(x.id)
    && typeof x.month === 'string' && /^\d{4}-\d{2}$/.test(x.month))
    .slice(-50).map((x) => ({ path: x.path, id: x.id, month: x.month,
      // W4 (WEBSITE.md 3.4): the server that issued it, which can check it (its /v/ page)
      ...(typeof x.server === 'string' && SID.test(x.server) && x.server !== PENDING ? { server: x.server } : {}) }));
}

// a study time: on the half hour from 5:00 to 22:30, 15, 30, 45 or 60 minutes long (day.js STUDY); else null
function cleanStudy(v) {
  if (v === 'off') return 'off';
  if (!v || typeof v !== 'object' || typeof v.at !== 'string' || !/^\d\d:(00|30)$/.test(v.at)) return null;
  const m = Number(v.at.slice(0, 2)) * 60 + Number(v.at.slice(3));
  return m >= 300 && m <= 1350 && [15, 30, 45, 60].includes(v.min) ? { at: v.at, min: v.min } : null;
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
    forget: [], here: null, clock: cleanClock() };
}

function load() {
  if (preview) {
    return { v: 2, active: 'preview', forget: [], here: null, clock: cleanClock(),
      learners: pictures([clean({ id: 'preview', band: preview.band, lang: preview.lang, track: 'reader', asked: true })]) };
  }
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 2 && Array.isArray(d.learners)) {
      return { v: 2, active: typeof d.active === 'string' ? d.active : null, learners: pictures(d.learners.map(clean)),
        forget: cleanForget(d.forget), here: typeof d.here === 'string' && SID.test(d.here) && d.here !== PENDING ? d.here : null,
        clock: cleanClock(d.clock) };
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
  stampAll();
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
  const c = clean({ year, band, track, lang, seats: {}, picture: pickFree(data.learners.map((l) => l.picture)) });
  data.learners.push(c);
  data.active = c.id;
  if (code) setSeat(c.id, writeKey(c), { code });
  save();
  return c;
}

// a patch may hold seat fields (token, number, cohort, code, consent, asked, sentBand): they go to her seat of the
// server in reach (away from every server, the last one's if she has it, else her unplaced seat)
export function updateChild(id, patch) {
  const i = data.learners.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const { name, ...rest } = patch || {};             // a name is never kept
  const seatPart = {};
  for (const k of SEAT_KEYS) if (k in rest) { seatPart[k] = rest[k]; delete rest[k]; }
  const l = clean({ ...data.learners[i], ...rest });
  data.learners[i] = l;
  if (Object.keys(seatPart).length) setSeat(id, writeKey(l), seatPart);
  save();
  return data.learners[i];
}

// seats (W4, WEBSITE.md 3.3)

// the seat the screens read: the server in reach's, else (away from every server) the last one's; else her unplaced
// seat, unless it is a pre-W4 token for an address other than the one in reach
function readKey(l) {
  const at = here || data.here;
  if (at && l.seats[at]) return at;
  const p = l.seats[PENDING];
  return p && (!p.token || !here || p.base === hereBase) ? PENDING : at;
}
function writeKey(l) {
  if (here) return here;
  return data.here && l.seats[data.here] ? data.here : PENDING;
}
export function seatOf(l, sid = l ? readKey(l) : null) { return (l && sid && l.seats[sid]) || null; }
export const seats = (l) => (l ? l.seats : {});

// change (or make) one seat; a seat left holding nothing goes
export function setSeat(id, sid, patch) {
  const l = byId(id);
  if (!l || !SID.test(sid)) return null;
  const now = { ...(l.seats[sid] || {}), ...patch };
  if (patch.token && !now.joined) now.joined = Date.now();
  const seat = cleanSeat(now);
  if (seat) l.seats[sid] = seat; else delete l.seats[sid];
  save();
  return seat;
}

export function dropSeat(id, sid) {
  const l = byId(id);
  if (l && l.seats[sid]) { delete l.seats[sid]; save(); }
}

// the unplaced seat becomes the seat of the server `sid` (account.js, once that server knows its token or it has
// none). A seat she already has there keeps its own fields; a second token for it waits to be merged into hers.
export function placeSeat(id, sid) {
  const l = byId(id);
  const p = l && l.seats[PENDING];
  if (!p || !SID.test(sid) || sid === PENDING) return null;
  const { base, ...from } = p;
  const to = l.seats[sid];
  let seat = from;
  if (to) {
    seat = { ...from, ...Object.fromEntries(Object.entries(to).filter(([, v]) => v !== null && v !== false)) };
    if (to.consent && from.consent && (from.consent.at || '') > (to.consent.at || '')) seat.consent = from.consent;
    if (to.token && from.token && to.token !== from.token) seat.also = [...(to.also || []), from.token];
    else if (!to.token && from.token) Object.assign(seat, { token: from.token, number: from.number, cohort: from.cohort,
      sentBand: from.sentBand });
    seat.joined = Math.min(to.joined || Infinity, from.joined || Infinity);
    if (!Number.isFinite(seat.joined)) seat.joined = null;
  }
  delete l.seats[PENDING];
  const clean = cleanSeat(seat);
  if (clean) l.seats[sid] = clean;
  save();
  events.retarget(id, PENDING, sid);
  return clean;
}

// every seat goes ("Stop sharing"): their tokens are kept until each server is told
export function clearSeats(id) {
  const l = byId(id);
  if (!l) return;
  for (const [sid, seat] of Object.entries(l.seats)) {
    for (const t of [seat.token, ...(seat.also || [])]) if (t) forgetToken(t, sid === PENDING ? null : sid, seat.base ?? null);
  }
  l.seats = {};
  save();
}

// where a token came from: the seat (or a token waiting to be forgotten) that holds it, {sid, base}; null if none.
// hub.js sends a token only to that server, or, for the unplaced seat, only to the address it was last used at.
export function issuer(token) {
  if (!token) return null;
  for (const l of data.learners) {
    for (const [sid, seat] of Object.entries(l.seats)) {
      if (seat.token === token || (seat.also || []).includes(token)) return { sid, base: seat.base ?? null };
    }
  }
  const f = data.forget.find((x) => x.t === token);
  return f ? { sid: f.s || PENDING, base: f.b } : null;
}

// the server in reach (hub.js): its id and address, or null when none answers
export function setHere(sid, base = null) {
  here = sid && SID.test(sid) && sid !== PENDING ? sid : null;
  hereBase = here ? base : null;
  if (here && data.here !== here) { data.here = here; save(); }
}
export const serverHere = () => here;

// her events' servers (WEBSITE.md 3.4): the seats she joined with a class code and has consent for; with none, the
// first seat she has consent for. Empty: nobody agreed, so nothing is kept.
export function targets(l) {
  const agreed = Object.entries(l ? l.seats : {}).filter(([, x]) => x.consent);
  const cls = agreed.filter(([, x]) => x.code).map(([k]) => k);
  if (cls.length) return cls;
  agreed.sort((a, b) => (a[1].joined || Infinity) - (b[1].joined || Infinity));
  return agreed.length ? [agreed[0][0]] : [];
}

// the clock (WEBSITE.md 3.5): the server's time as this phone best knows it, never behind the latest time it made
// or saw, so a phone whose clock fell back to 2010 keeps stamping after what it knew
export const clock = () => data.clock;
// this phone, as a question names the phone that may send it (3.8: a question copied by her bag from another phone
// waits for that phone; "Send again" here makes it this one's)
export const device = () => data.clock.dev.slice(0, 8);
export const mine = (ask) => !ask || !ask.dev || ask.dev === device();
export function stamp() {
  const c = data.clock;
  const t = Math.max(Math.floor(Date.now() + c.skew), c.last);
  if (t > c.last) { c.last = t; c.n = 0; }
  return { t, sk: t - Date.now() };
}
export function setSkew(skew, serverNow) {
  if (!Number.isFinite(skew)) return;
  data.clock.skew = Math.round(skew);
  if (Number.isFinite(serverNow) && serverNow > data.clock.last) { data.clock.last = Math.floor(serverNow); data.clock.n = 0; }
  save();
}

export function byId(id) { return data.learners.find((l) => l.id === id) || null; }

// her record as a bag left it (bag.js unpack): kept as it is, its stamps not made again, and the clock moved past
// every stamp it holds; null when she is not on this phone
export function adopt(id, record) {
  const i = data.learners.findIndex((x) => x.id === id);
  if (i < 0 || !record || typeof record !== 'object') return null;
  stampAll();                                        // anything written before it keeps its own stamps
  const { name, ...rest } = record;
  const l = clean({ ...rest, id });
  data.learners[i] = l;
  for (const s of [...Object.values(l.st || {}), ...Object.values(l.gone || {})]) seenStamp(data.clock, s);
  seenParts.set(id, parts(l));
  seenTokens.set(id, tokensOf(l));
  save();
  return l;
}

// remove a learner from this phone: her record and her queued events go; her server record (if she joined) is
// deleted when the server is next in reach (account.js)
export function removeLearner(id) {
  const l = byId(id);
  if (!l) return false;
  clearSeats(id);
  data.learners = data.learners.filter((x) => x.id !== id);
  if (data.active === id) data.active = (data.learners[0] || {}).id || null;
  unlocked.delete(id);
  save();
  events.drop(id);
  return true;
}

// tokens whose server record must be deleted (a learner removed, or "Stop sharing"), each with its server's id (or,
// for a token from before W4, the address it was used at); sent only there
export function forgetToken(t, sid = null, base = null) {
  if (t && TOKEN.test(t) && !data.forget.some((x) => x.t === t)) data.forget.push({ t, s: sid, b: sid ? null : base });
  save();
}
// all of them, or those for the server `sid` answering at `base`
export function toForget(sid, base) {
  return data.forget.filter((x) => sid === undefined || x.s === sid || (!x.s && x.b === base)).map((x) => x.t);
}
export function forgotten(t) { data.forget = data.forget.filter((x) => x.t !== t); save(); }

// the learners unlocked since the app started (or came back after 5 minutes away): kept in memory only
const unlocked = new Set();
export const isUnlocked = (id) => unlocked.has(id);
export function unlock(id) { unlocked.add(id); }
export function lockAll() { unlocked.clear(); }

// an event for the learner using the phone, only with her grown-up's (or, for adults, her own) agreement, for the
// servers it goes to (targets) and stamped by the clock
export function record(verb, object = null, value = null) {
  const c = learner();
  const to = targets(c);
  if (!c || !to.length) return false;
  const long = to.some((sid) => c.seats[sid] && c.seats[sid].code);
  const ok = events.record(verb, object, value, c.id, { to, long, ...stamp() });
  save();
  return ok;
}

export function setActive(id) { data.active = id; save(); }

export function band(c = learner()) { return c ? c.band : null; }

export function markDone(lessonId, stars) {
  const c = child();
  if (!c) return;
  const old = c.done[lessonId];
  // `at` on the stamps' clock: a step stamped before it, on any phone, is of the run this ends (bag.js merge)
  c.done[lessonId] = { stars: Math.max(stars, old ? old.stars : 0), at: Math.max(stampMs(nextStamp(data.clock)), old ? old.at : 0) };
  delete c.step[lessonId];
  if (c.tries) delete c.tries[lessonId];
  save();
  record('lesson.done', lessonId, stars);
  keepStorage();
}

// after her first finished lesson the browser is asked to keep this site's storage when the phone runs short
// (WEBSITE.md 2.2 and 3.13 case 16): Chrome may evict an unpersisted origin, and her record is only here
let persistAsked = false;
function keepStorage() {
  if (persistAsked || preview) return;
  persistAsked = true;
  try {
    const s = globalThis.navigator && navigator.storage;
    if (s && s.persist) s.persisted().then((on) => on || s.persist()).catch(() => {});
  } catch { /* not offered here */ }
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
  const e = { k: rid(), ...entry, dev: data.clock.dev.slice(0, 8) };   // the phone that may send it (bag.js, 3.8)
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
export function reload() { data = loaded(load()); return data; }
