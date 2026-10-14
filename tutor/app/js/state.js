// What the phone remembers: the children who use it, their year and language, lessons done, sheets printed and
// questions asked. It stays on this phone only (the hub keeps no names). Storage can fail (private mode, full):
// the app then still works, it just forgets on reload.

const KEY = 'qalam.v1';
const empty = () => ({ v: 1, device: rid(), active: null, children: [] });
let data = load();

function rid() {
  const a = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2);
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 1 && Array.isArray(d.children)) return d;
  } catch { /* first run, or storage is blocked */ }
  return empty();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked: keep going */ }
}

export function device() { return data.device; }
export function children() { return data.children; }

export function child() {
  return data.children.find((c) => c.id === data.active) || data.children[0] || null;
}

export function addChild({ name, year, lang }) {
  const c = { id: rid(), name: (name || '').trim().slice(0, 30), year, lang, done: {}, step: {}, prints: {}, asks: [] };
  data.children.push(c);
  data.active = c.id;
  save();
  return c;
}

export function updateChild(id, patch) {
  const c = data.children.find((x) => x.id === id);
  if (c) { Object.assign(c, patch); save(); }
  return c;
}

export function setActive(id) { data.active = id; save(); }

// years 0 (not in school yet) to 6 get the bold, big look; 7 to 12 the clean one
export function mode(c = child()) { return c && c.year >= 7 ? 'big' : 'small'; }

export function markDone(lessonId, stars) {
  const c = child();
  if (!c) return;
  const old = c.done[lessonId];
  c.done[lessonId] = { stars: Math.max(stars, old ? old.stars : 0), at: Date.now() };
  delete c.step[lessonId];
  save();
}

export function setStep(lessonId, i) {
  const c = child();
  if (c) { c.step[lessonId] = i; c.last = lessonId; save(); }
}

export function rememberPrint(lessonId, seed) {
  const c = child();
  if (c) { c.prints[lessonId] = seed; save(); }
}

export function addAsk(entry) {
  const c = child();
  if (!c) return;
  c.asks.push(entry);
  c.asks = c.asks.slice(-30);
  save();
}

export function updateAsk(id, patch) {
  const c = child();
  const a = c && c.asks.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); save(); }
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
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem('qalam.cache.' + key));
    localStorage.setItem('qalam.cache.' + key, JSON.stringify(value));
  } catch { /* ignore */ }
  return value ?? null;
}
