// Stamps for the school bag (WEBSITE.md 3.5 and 3.8, W5): a hybrid logical clock, and the names of the parts of a
// learner's record that carry one. state.js stamps every part a write changed (its save() compares the record with
// the one it last saw), and bag.js merges two records part by part, newest stamp first, where a rule asks for it.
//
// A stamp is one string, `<ms>.<counter>.<device>`: the time in ms (9 base-36 digits), a counter (3 base-36 digits)
// that orders changes within one ms, and 8 hex digits of the device's id. Every part is fixed in width, so two stamps
// compare as plain strings: ms, then counter, then device. '' is "no stamp", older than any stamp (a value written
// before W5). The time is max(the phone's time + the server's skew, the latest stamp made or seen), so a phone whose
// clock fell back to 2010 still stamps after everything it knew, and one running years ahead wins only concurrent
// changes to a setting until real time catches up. Nothing caps a stamp, so every merge stays pure (3.5).

export const STAMP = /^[0-9a-z]{9}\.[0-9a-z]{3}\.[0-9a-f]{8}$/;
const MS_MAX = 36 ** 9 - 1;              // the year 5188
const N_MAX = 36 ** 3 - 1;

export const ms = (s) => (s ? parseInt(s.slice(0, 9), 36) : 0);
export const counter = (s) => (s ? parseInt(s.slice(10, 13), 36) : 0);
export const make = (t, n, dev) => `${Math.min(Math.max(0, Math.floor(t)), MS_MAX).toString(36).padStart(9, '0')}.${
  n.toString(36).padStart(3, '0')}.${String(dev).slice(0, 8).padEnd(8, '0')}`;
export const newer = (a, b) => (a || '') > (b || '');
export const valid = (s) => typeof s === 'string' && STAMP.test(s);

// the next stamp of `clock` ({dev, skew, last, n}, kept by state.js), changing it; `now` is the phone's own time
export function next(clock, now = Date.now()) {
  const wall = Math.floor(now + (clock.skew || 0));
  if (wall > clock.last) { clock.last = wall; clock.n = 0; } else if ((clock.n || 0) >= N_MAX) { clock.last += 1; clock.n = 0; } else clock.n = (clock.n || 0) + 1;
  return make(clock.last, clock.n, clock.dev);
}

// a stamp seen in a bag: the clock never stamps before it again
export function seen(clock, s) {
  if (!valid(s)) return;
  const t = ms(s), n = counter(s);
  if (t > clock.last) { clock.last = t; clock.n = n; } else if (t === clock.last && n > (clock.n || 0)) clock.n = n;
}

// one JSON for one value whatever the order its keys were written in, so equal values compare equal
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// The parts of a record that carry a stamp, by name (3.8): her settings (one stamp each); her place in a lesson and
// each first try; each mark, review item, printed sheet and university tick; each question, question of her own and
// contest (a removed one leaves a tombstone); each seat's consent. Lessons done and certificates need none: they
// merge by the higher value and by union.
export const SCALARS = ['band', 'year', 'track', 'lang', 'text', 'theme', 'day', 'bells', 'shift', 'study',
  'readerAsked', 'told', 'last', 'quran', 'plan', 'lock', 'picture', 'lockOffered', 'floorSeen', 'liveSeen'];
export const MAPS = ['step', 'marks', 'recall', 'prints'];       // {key: value}: removing one needs no tombstone
export const ITEMS = { asks: 'k', made: 'id', contests: 'id' };   // lists of items with a key: removing one does
export const SERVER = /^[0-9a-f]{20}$/;                          // a seat the bag carries: a server with a hello.id

// every stamped part of learner `l`, name -> its value's JSON
export function parts(l) {
  const out = new Map();
  for (const f of SCALARS) if (l[f] !== undefined && l[f] !== null) out.set(f, canon(l[f]));
  for (const m of MAPS) for (const [k, v] of Object.entries(l[m] || {})) out.set(`${m}:${k}`, canon(v));
  for (const [lesson, t] of Object.entries(l.tries || {})) {
    for (const [n, ok] of Object.entries(t || {})) out.set(`tries:${lesson}:${n}`, canon(ok));
  }
  for (const n of l.uni || []) out.set(`uni:${n}`, 'true');
  for (const [list, key] of Object.entries(ITEMS)) for (const x of l[list] || []) out.set(`${list}:${x[key]}`, canon(x));
  for (const [sid, seat] of Object.entries(l.seats || {})) {
    if (SERVER.test(sid) && seat.consent) out.set(`consent:${sid}`, canon(seat.consent));
  }
  return out;
}

// what a write changed, stamped: `before` is parts() of the record as last seen. A changed or new part gets the next
// stamp (a part nothing changed keeps what it has, so a value from before W5 stays the oldest); a removed setting, tick or consent too (its removal travels); a removed question, question of her own or
// contest leaves a tombstone in `gone`; a removed step, try, mark, review item or print loses its stamp (a finished
// lesson ends the others' steps and tries by its time, and the rest leave only by the caps).
export function restamp(l, before, clock, now = Date.now()) {
  const after = parts(l);
  const st = { ...(l.st || {}) };
  const gone = { ...(l.gone || {}) };
  let changed = false;
  for (const [k, v] of after) {
    if (before.get(k) !== v) { st[k] = next(clock, now); delete gone[k]; changed = true; }
  }
  for (const k of before.keys()) {
    if (after.has(k)) continue;
    changed = true;
    const kind = k.slice(0, k.indexOf(':') < 0 ? k.length : k.indexOf(':'));
    if (SCALARS.includes(k) || kind === 'uni' || kind === 'consent') st[k] = next(clock, now);
    else if (kind in ITEMS) { gone[k] = next(clock, now); delete st[k]; } else delete st[k];
  }
  if (changed) { l.st = st; l.gone = gone; }
  return after;
}
