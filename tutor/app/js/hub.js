// Talking to the village hub, or to the online home. Phones normally get this app from the server itself, so the
// server is "this website"; the other addresses are for a copy of the app that came another way (the Android app
// later, or a laptop test). An app from an https site never tries them: they are plain http.

import { latin } from './numbers.js';
import { cache } from './state.js';

const CANDIDATES = ['http://10.42.0.1', 'http://10.42.0.1:8080', 'http://qalam.lan', 'http://192.168.4.1:8080'];
let base = null;            // '' means the same website the app came from
let hello = null;
let cohortId = null;        // the class the learner using the phone joined (P10), when it is not the server's own
const listeners = new Set();

// the learner's class: hello's modules and every route's module check are then that class's (`?cohort=`)
export function setCohort(id) { cohortId = typeof id === 'string' && id ? id : null; }
function withCohort(path) {
  if (!cohortId || !path.startsWith('/api/') || /[?&]cohort=/.test(path)) return path;
  return path + (path.includes('?') ? '&' : '?') + 'cohort=' + encodeURIComponent(cohortId);
}

export function onChange(fn) { listeners.add(fn); }
export function info() { return hello; }
export function online() { return !!hello; }

// 'hub' (the village hub) or 'online' (the Worker): hello says; away from both, what it said last, else an https
// page is the online home
export function home() {
  if (hello && (hello.home === 'online' || hello.home === 'hub')) return hello.home;
  const saved = cache('home');
  if (saved === 'online' || saved === 'hub') return saved;
  return globalThis.location && location.protocol === 'https:' ? 'online' : 'hub';
}

// The modules switched on for this hub's cohort (hello.modules), kept on the phone for when the hub is out of reach.
// null means not known: a hub from before modules, or a first start away from the hub (modules.js then uses the
// built-in five, as the app always had).
function remember(h) {
  if (h && Array.isArray(h.modules)) cache('modules', h.modules);
  if (h && (h.home === 'online' || h.home === 'hub')) cache('home', h.home);
}
export function moduleList() {
  if (hello) return Array.isArray(hello.modules) ? hello.modules : null;
  const saved = cache('modules');
  return Array.isArray(saved) ? saved : null;
}

async function get(url, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error(r.status), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

// hello for the learner's class; a server that does not know the class (404) answers for its own
async function helloFrom(b, ms) {
  try { return await get(b + withCohort('/api/hello'), ms); } catch (e) {
    if (e.status === 404 && cohortId) return get(b + '/api/hello', ms);
    throw e;
  }
}

export async function connect() {
  // the app normally comes from the hub itself, so ask this website first
  let ok = location.protocol.startsWith('http') && (await found(['']));
  if (!ok && location.protocol !== 'https:') {
    const tries = [];
    const saved = cache('hub');
    if (saved) tries.push(saved);
    for (const c of CANDIDATES) if (!tries.includes(c) && location.origin !== c) tries.push(c);
    ok = await found(tries);
  }
  listeners.forEach((f) => f(ok));
  return ok;
}

// ask every address at once (3 seconds at most) and keep the first one, in this order, that answers
async function found(tries) {
  const answers = await Promise.allSettled(tries.map((b) => helloFrom(b, 3000)));
  const i = answers.findIndex((a) => a.status === 'fulfilled' && a.value && a.value.hub);
  base = i >= 0 ? tries[i] : null;
  hello = i >= 0 ? answers[i].value : null;
  if (base) cache('hub', base);
  remember(hello);
  return !!hello;
}

// fresh printer and AI state, for the screens that show them
export async function refresh() {
  if (base === null) return null;
  try { hello = await helloFrom(base, 3000); remember(hello); } catch (e) {
    if (!e.status) lost();      // no answer at all: out of reach; an error reply keeps the last one
  }
  return hello;
}

// the phone lost its connection (the browser says so, or the server stopped answering): the chip says "Offline"
// (or "No hub") at once, and the next round looks again
export function lost() {
  if (!hello) return;
  hello = null;
  listeners.forEach((f) => f(false));
}

export function url(path) { return (base ?? '') + withCohort(path); }

async function call(path, { method = 'GET', body, pin, token, ms = 30000 } = {}) {
  if (base === null) throw Object.assign(new Error('offline'), { status: 0 });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const headers = { 'Content-Type': 'application/json' };
    // a PIN typed with Persian digits is sent as 0-9; a header with other letters would never leave the phone
    if (pin) headers['X-Teacher-Pin'] = latin(pin).replace(/[^\x21-\x7e]/g, '');
    if (token) headers['X-Learner-Token'] = token;
    const r = await fetch(url(path), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || j.detail || r.status), { status: r.status });
    return j;
  } catch (e) {
    if (e.status === undefined && e.name !== 'AbortError') { hello = null; listeners.forEach((f) => f(false)); }   // the hub went away
    throw e;
  } finally { clearTimeout(t); }
}

export async function packs() {
  try {
    const j = await call('/api/packs', { ms: 8000 });
    cache('packs', j.packs);
    return j.packs;
  } catch { return cache('packs') || []; }
}

export async function lesson(id) {
  try {
    const l = await call('/api/lessons/' + encodeURIComponent(id), { ms: 8000 });
    cache('lesson.' + id, l);
    return l;
  } catch { return cache('lesson.' + id); }
}

// link cards (online only: they open a page elsewhere) and the credits (kept for when the hub is out of reach)
export async function links({ subject, year } = {}) {
  const q = new URLSearchParams();
  if (subject) q.set('subject', subject);
  if (year !== undefined && year !== null) q.set('year', String(year));
  try { return (await call('/api/links?' + q, { ms: 8000 })).links || []; } catch { return []; }
}

export async function credits() {
  try {
    const j = await call('/api/credits', { ms: 8000 });
    cache('credits', j);
    return j;
  } catch { return cache('credits'); }
}

export const ask = (q, token) => call('/api/ask', { method: 'POST', body: q, token, ms: 90000 });
export const askStatus = (id) => call('/api/ask/' + id);
export const toTeacher = (id) => call(`/api/ask/${id}/teacher`, { method: 'POST' });
// Homework help's "Check my answer" (P15): right or not yet, never the answer; three tries a question
export const checkAnswer = (id, answer, token) => call('/api/m/homework/check', { method: 'POST', body: { id, answer }, token });
export const sendEvents = (list, token) => call('/api/events', { method: 'POST', body: { events: list }, token, ms: 15000 });

// learners (P10): joining, her own record, withdrawing, and the consent text the server names
export const join = (body) => call('/api/join', { method: 'POST', body, ms: 15000 });
export const me = (token) => call('/api/me', { token, ms: 15000 });
export const meUpdate = (token, body) => call('/api/me', { method: 'POST', body, token, ms: 15000 });
export const forget = (token) => call('/api/me', { method: 'DELETE', token, ms: 15000 });
export async function consentText(lang, version) {
  const key = `consent.${lang}.${version}`;
  try {
    const j = await call(`/api/consent?lang=${lang}&version=${encodeURIComponent(version)}`, { ms: 8000 });
    cache(key, j);
    return j;
  } catch { return cache(key); }
}
// the consent version the server names; kept on the phone so a grown-up can agree while the server is out of reach
export function consentVersion() {
  if (hello && typeof hello.consent === 'string') { cache('consent', hello.consent); return hello.consent; }
  const saved = cache('consent');
  return typeof saved === 'string' ? saved : null;
}
export const printSheet = (job, pin) => call('/api/print', { method: 'POST', body: job, pin });
export const printStatus = (id) => call('/api/print/' + id);
// a photo's strip of answer cells (P14): readings come back, never marks; the strip is not kept anywhere
export const photoMark = (body, token) => call('/api/m/photo/mark', { method: 'POST', body, token, ms: 60000 });
export const sheetKey = (id, seed, lang) => call(`/api/sheets/${encodeURIComponent(id)}/key?seed=${seed}&lang=${lang}`);
// the phone keeps no name, so none is sent: she writes hers in the sheet's name box by hand. `print` opens the
// browser's print dialog as the sheet loads ("Print or save as PDF", where there is no hub printer)
export const sheetUrl = (id, { seed = 0, lang = 'prs', pdf = false, print = false } = {}) =>
  url(`/api/sheets/${encodeURIComponent(id)}.${pdf ? 'pdf' : 'html'}?seed=${seed}&lang=${lang}${print ? '&print=1' : ''}`);

export const teacher = {
  summary: (pin) => call('/api/teacher/summary', { pin }),
  queue: (pin) => call('/api/teacher/queue', { pin }),
  answer: (pin, id, body) => call('/api/teacher/answer/' + id, { method: 'POST', body, pin }),
  prints: (pin) => call('/api/teacher/prints', { pin }),
  card: (pin) => call('/api/teacher/hub-card', { method: 'POST', pin }),
};
