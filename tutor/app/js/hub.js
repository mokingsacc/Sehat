// Talking to the village hub. Phones normally get this app from the hub itself, so the hub is "this website";
// the other addresses are for a copy of the app that came another way (the Android app later, or a laptop test).

import { latin } from './numbers.js';
import { cache } from './state.js';

const CANDIDATES = ['http://10.42.0.1', 'http://10.42.0.1:8080', 'http://qalam.lan', 'http://192.168.4.1:8080'];
let base = null;            // '' means the same website the app came from
let hello = null;
const listeners = new Set();

export function onChange(fn) { listeners.add(fn); }
export function info() { return hello; }
export function online() { return !!hello; }

// The modules switched on for this hub's cohort (hello.modules), kept on the phone for when the hub is out of reach.
// null means not known: a hub from before modules, or a first start away from the hub (modules.js then uses the
// built-in five, as the app always had).
function remember(h) {
  if (h && Array.isArray(h.modules)) cache('modules', h.modules);
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
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function connect() {
  // the app normally comes from the hub itself, so ask this website first
  let ok = location.protocol.startsWith('http') && (await found(['']));
  if (!ok) {
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
  const answers = await Promise.allSettled(tries.map((b) => get(b + '/api/hello', 3000)));
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
  try { hello = await get(url('/api/hello'), 3000); remember(hello); } catch { /* keep the last one */ }
  return hello;
}

export function url(path) { return (base ?? '') + path; }

async function call(path, { method = 'GET', body, pin, ms = 30000 } = {}) {
  if (base === null) throw Object.assign(new Error('offline'), { status: 0 });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const headers = { 'Content-Type': 'application/json' };
    // a PIN typed with Persian digits is sent as 0-9; a header with other letters would never leave the phone
    if (pin) headers['X-Teacher-Pin'] = latin(pin).replace(/[^\x21-\x7e]/g, '');
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

export const ask = (q) => call('/api/ask', { method: 'POST', body: q, ms: 90000 });
export const askStatus = (id) => call('/api/ask/' + id);
export const toTeacher = (id) => call(`/api/ask/${id}/teacher`, { method: 'POST' });
export const sendEvents = (list) => call('/api/events', { method: 'POST', body: { events: list }, ms: 15000 });
export const printSheet = (job, pin) => call('/api/print', { method: 'POST', body: job, pin });
export const printStatus = (id) => call('/api/print/' + id);
export const sheetKey = (id, seed, lang) => call(`/api/sheets/${encodeURIComponent(id)}/key?seed=${seed}&lang=${lang}`);
export const sheetUrl = (id, { seed = 0, lang = 'prs', kind = 'worksheet', name = '', pdf = false } = {}) =>
  url(`/api/sheets/${encodeURIComponent(id)}.${pdf ? 'pdf' : 'html'}?seed=${seed}&lang=${lang}&kind=${kind}` +
      (name ? '&name=' + encodeURIComponent(name) : ''));

export const teacher = {
  summary: (pin) => call('/api/teacher/summary', { pin }),
  queue: (pin) => call('/api/teacher/queue', { pin }),
  answer: (pin, id, body) => call('/api/teacher/answer/' + id, { method: 'POST', body, pin }),
  prints: (pin) => call('/api/teacher/prints', { pin }),
  card: (pin) => call('/api/teacher/hub-card', { method: 'POST', pin }),
};
