// Talking to the village hub, or to the online home. Phones normally get this app from the server itself, so the
// server is "this website"; the other addresses are for a copy of the app that came another way (the Android app, or
// a laptop test). An app from an https site never tries them, since they are plain http, except the Android app
// (P23): its page is the APK's own, so it tries the hub's addresses (its network settings allow only those over
// http) and then the online home it was built for.

import * as android from './android.js';
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
  if (android.isApp()) return android.onlineHome() ? 'online' : 'hub';
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
  // the app normally comes from the hub itself, so ask this website first (never in the APK: its page is its own)
  const app = android.isApp();
  let ok = !app && location.protocol.startsWith('http') && (await found(['']));
  if (!ok && (app || location.protocol !== 'https:')) {
    const tries = [];
    const saved = cache('hub');
    const online = android.onlineHome();
    if (saved && (!app || CANDIDATES.includes(saved))) tries.push(saved);   // in the APK the online home always comes last
    for (const c of CANDIDATES) if (!tries.includes(c) && location.origin !== c) tries.push(c);
    if (online && !tries.includes(online)) tries.push(online);       // the village hub first, then the online home
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
    cache('graphs', Array.isArray(j.graphs) ? j.graphs : []);
    return j.packs;
  } catch { return cache('packs') || []; }
}

// the skills graphs (P25a) that came with the packs: content only, kept for when the hub is out of reach
export const graphs = () => cache('graphs') || [];

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

// university preparation (P28): the checklist and the cards, kept for offline (the checklist works without the hub;
// the cards open only online). Nothing she ticks or opens is sent
export async function university() {
  try {
    const j = await call('/api/m/university', { ms: 8000 });
    cache('university', j);
    return j;
  } catch { return cache('university'); }
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
// the school day's timetable for her band (P19): no token, so the request says nothing about who asks (F5); the
// learner's class is added as ?cohort= like every route's
// "I want to learn this" (P22): her typed goal, never with her token; a miss joins the cohort's wishlist screened
export const plan = (body) => call('/api/m/plan', { method: 'POST', body, ms: 15000 });
export const timetable = (band) => call('/api/m/timetable?band=' + encodeURIComponent(band), { ms: 8000 });
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
// certificates (P25b): earned with her token from her own events; printed on the hub with the id only; checked
export const certEarn = (body, token) => call('/api/m/cert', { method: 'POST', body, token, ms: 20000 });
export const certPrint = (body) => call('/api/m/cert/print', { method: 'POST', body });
export const photoMark = (body, token) => call('/api/m/photo/mark', { method: 'POST', body, token, ms: 60000 });
export const sheetKey = (id, seed, lang) => call(`/api/sheets/${encodeURIComponent(id)}/key?seed=${seed}&lang=${lang}`);
// the phone keeps no name, so none is sent: she writes hers in the sheet's name box by hand. `print` opens the
// browser's print dialog as the sheet loads ("Print or save as PDF", where there is no hub printer)
export const sheetUrl = (id, { seed = 0, lang = 'prs', pdf = false, print = false } = {}) =>
  url(`/api/sheets/${encodeURIComponent(id)}.${pdf ? 'pdf' : 'html'}?seed=${seed}&lang=${lang}${print ? '&print=1' : ''}`);

// "I have a code from my teacher" (P20): the six digits she was given open a new PIN; the lock is the phone's
export const pinReset = (token, code) => call('/api/me/pin-reset', { method: 'POST', body: { code }, token, ms: 15000 });
