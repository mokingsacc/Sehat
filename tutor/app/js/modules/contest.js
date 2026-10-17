// Contests on the phone (the `contest` module, P31; DESIGN-C6-SPECS.md C6.5 and C6.6). A contest is a short set of
// questions from signed lessons that her class's admin opened for a while; she answers each once, sends them, and
// hears "Sent. You took part!" with how many were right. Never a place, a class list or anyone else's score.
// - Entry: Home's secondary card "Contest: Maths week 3" (priority 20, under a live class's 25) while one is open or
//   opens within 7 days and she has not sent it; the subject page's "Contests" row where any is known. Never for
//   early years. The screens (#/contest, #/contest/<id>, .../run, .../answers) are screens/contest.js, loaded when
//   opened.
// - The list comes from GET /api/m/contest with her token (her class from it, her band and language), read again at
//   most every 5 minutes while online and kept per learner in the cache for Home.
// - Kept per learner (state.js `contests`, at most 50): {id, subject, joined, closes, answers} from Start, and
//   {right, n, percent, at} once the hub marked them. The questions (no answers in them) and the title are in the
//   cache (`contest.<id>`), for the run and for "See the answers" after the close, which marks her kept answers
//   against the key here on the phone.

import * as hub from '../hub.js';
import { getLang, pick, s } from '../i18n.js';
import { allows, on } from '../modules.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { h, icon, said, speakerBtn } from '../ui.js';

const EVENT = 'qalam-day';             // Home redraws on it (the timetable's own event)
const FRESH_MS = 5 * 60e3;
const SOON_MS = 7 * 864e5;
const LATE_MS = 10 * 60e3;             // the hub still takes answers 10 minutes after the close
let lastAsk = { key: '', at: 0 };

export const canContest = (c) => !!c && c.band !== 'ey' && on('contest') && allows('contest', c.band);

// a server minute ("2027-10-25T08:00", UTC) as milliseconds
export const ms = (minute) => Date.parse(`${minute}:00Z`);

// later (over a week away), soon, open, late (the 10 minutes after the close) or closed
export function phase(x, now = Date.now()) {
  const a = ms(x.opens_at);
  const b = ms(x.closes_at || x.closes);
  if (now < a - SOON_MS) return 'later';
  if (now < a) return 'soon';
  if (now < b) return 'open';
  return now < b + LATE_MS ? 'late' : 'closed';
}

export const title = (x) => (x && x.title ? pick(x.title) : '');
export const listed = (c) => (canContest(c) ? state.cache('contests.' + c.id) || [] : []);
export const recordOf = (c, id) => ((c && c.contests) || []).find((x) => x.id === id) || null;
export const kept = (id) => state.cache('contest.' + id);
export const isSent = (r) => !!r && Number.isInteger(r.percent);

// the contest as the list or the phone's own copy knows it: {id, title, subject, opens_at, closes_at, minutes, n,
// certificate}, or null
export function find(c, id) {
  const x = listed(c).find((y) => y.id === id);
  if (x) return x;
  const k = kept(id);
  return k ? { id, title: k.title, subject: k.subject, opens_at: k.opens_at, closes_at: k.closes_at, minutes: k.minutes,
    n: (k.questions || []).length, certificate: !!k.certificate } : null;
}

// every contest she can see in a subject (or all): the list's and the ones she joined, newest window first
export function known(c, subject = null) {
  const out = new Map();
  for (const x of listed(c)) out.set(x.id, x);
  for (const r of (c && c.contests) || []) if (!out.has(r.id) && find(c, r.id)) out.set(r.id, find(c, r.id));
  return [...out.values()].filter((x) => !subject || x.subject === subject)
    .sort((a, b) => ms(b.opens_at) - ms(a.opens_at) || a.id.localeCompare(b.id));
}

// her best in a subject, from her own sent contests: {right, n} with the highest percent, or null
export function best(c, subject) {
  const mine = ((c && c.contests) || []).filter((r) => isSent(r) && r.subject === subject);
  if (!mine.length) return null;
  const top = mine.reduce((a, b) => (b.percent > a.percent ? b : a));
  return { right: top.right, n: top.n };
}

// save her record of one contest (merged with what is there)
export function keep(c, id, patch) {
  const rest = (c.contests || []).filter((r) => r.id !== id);
  const before = recordOf(c, id) || { id };
  state.updateChild(c.id, { contests: [...rest, { ...before, ...patch }] });
  return recordOf(state.byId(c.id), id);
}

// read the list again (at most every 5 minutes unless forced); Home redraws when it changed
export async function refresh(c, force = false) {
  if (!canContest(c) || !c.token || !hub.online()) return listed(c);
  const key = c.id + '|' + getLang();
  if (!force && lastAsk.key === key && Date.now() - lastAsk.at < FRESH_MS) return listed(c);
  lastAsk = { key, at: Date.now() };
  try {
    const j = await hub.contests(getLang(), c.token);
    const list = Array.isArray(j.contests) ? j.contests.filter((x) => x && typeof x.id === 'string') : [];
    const before = JSON.stringify(listed(c));
    state.cache('contests.' + c.id, list);
    if (JSON.stringify(list) !== before && typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
    return list;
  } catch {
    return listed(c);
  }
}

// the one Home shows: open before soon, the earliest first, and only one she has not sent
export function next(c, now = Date.now()) {
  const rank = { open: 0, soon: 1 };
  return listed(c).filter((x) => phase(x, now) in rank && !isSent(recordOf(c, x.id)) && !x.mine)
    .sort((a, b) => rank[phase(a, now)] - rank[phase(b, now)] || ms(a.opens_at) - ms(b.opens_at))[0] || null;
}

function offerCard(ctx) {
  const x = next(ctx.child);
  const t = s('contest_of', { t: title(x) });
  return h('section', { class: 'card lined pad-card contest-offer' },
    h('div', { class: 'row' },
      h('a', { class: 'grow row contest-link', href: '#/contest/' + encodeURIComponent(x.id) },
        h('span', { class: 'sbadge s-' + x.subject, 'aria-hidden': 'true', style: { width: '42px', height: '42px' } }, icon('flag', 24, 2.2)),
        h('span', { class: 'grow' }, h('b', { dir: 'auto' }, t),
          h('small', { class: 'muted' }, s('contest_shape', { n: x.n, m: x.minutes }))), icon('chev', 22)),
      speakerBtn(() => speak(t, getLang()), { size: 'sm' })));
}

export function register(shell) {
  shell.offer('home.action', { id: 'contest-next', role: 'secondary', priority: 20,
    when: (ctx) => canContest(ctx.child) && !!next(ctx.child), render: offerCard });
  // the list is read when the phone reaches the hub or the internet, and every 5 minutes while the app is in view
  hub.onChange((up) => { if (up) refresh(state.child()); });
  refresh(state.child());
  setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh(state.child());
  }, FRESH_MS);
}

// the subject page's row (C6.6): "Contests", with her best there when she has one
export function subjectRow(c, subject) {
  if (!canContest(c) || !known(c, subject).length) return null;
  const b = best(c, subject);
  return h('nav', { class: 'subjects contest-row' },
    said(h('a', { href: '#/contest?subject=' + encodeURIComponent(subject) },
      h('span', { class: 'sbadge s-' + subject, style: { width: '42px', height: '42px' } }, icon('flag', 24)),
      h('span', { class: 'grow' }, h('b', {}, s('contests')),
        b ? h('small', { class: 'muted' }, s('contest_best', { s: s(subject), a: b.right, b: b.n })) : null),
      icon('chev', 22))));
}
