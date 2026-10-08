// Usage counts, version 2: added up on the phone and sent as one small total per finished day.
// No install id, no typed text, no names, no GPS. On by default (Mo, 2026-10-08: no question on first open); the switch in
// Settings and on the Privacy page turns it off, and then what was not sent yet is deleted.
// Until a district is chosen (the small question a day after the first open, Settings, or a disease-watch report), the
// totals are sent without one.
// Page time counts only while the page is on the screen, and stops 2 minutes after the last touch unless narration is playing.
// js/app.js calls init(ctx) once the book has loaded, page(route) after every render, and event(type) where it used to track().
let C = null; // helpers from app.js: S, store, T, L, esc, spk, ic, I, top, listenBar, disclaimer, choose, sayRow, render, isStandalone, platform, localDay, randId, isPlaying
const IDLE_MS = 120000, TICK_MS = 5000, KEEP_DAYS = 60, MAX_PAGES = 80, DAY = 864e5, RETRY_MS = 10 * 60000;
const SEG = /^[a-z0-9-]{1,30}$/;
const ACTS = new Set(['share', 'sendapp', 'a2hs', 'kid', 'dose', 'feedback', 'near', 'voice', 'lang']);
const U = { days: {}, cur: null, lastInput: Date.now(), lastTick: 0, timer: 0, saveT: 0, sending: false, retryT: 0, prevPage: null };

/* ---------- on unless switched off ---------- */
// config.consentVersion is sent with every upload, so the dashboard can tell which privacy wording the counts came under
const cfg = () => {
  const c = (C && C.S.shipped && C.S.shipped.config) || {}; // from the app itself, never from a book downloaded later
  return { v: String(c.consentVersion || '1').replace(/[^0-9A-Za-z._-]/g, '').slice(0, 20) || '1' };
};
const answer = () => (C ? C.store.get('consent', null) : null); // {ok, v, day}: set by the switch (or by the old first-open question)
export function allowed() {
  if (!C || !C.S.shipped) return false;
  const a = answer();
  return !a || a.ok !== false; // sent unless switched off
}
export function setConsent(ok) {
  if (!C) return;
  C.store.set('consent', { ok: !!ok, v: cfg().v, day: C.localDay() });
  C.store.set('stats', !!ok); // the old switch, kept in step
  if (!ok) { U.days = {}; save(true); } // stop sharing: what was not sent yet is deleted
  else { U.lastTick = Date.now(); send(); }
}

/* ---------- the district question: one small pop-up a day after the first open ---------- */
// st: {first: time of the first open, n: times asked, t: time of the last ask, has: a district is chosen}.
// Asked once 24 hours after the first open; after "Not now", once more 7 days later; then never again.
export const ASK_FIRST = DAY, ASK_AGAIN = 7 * DAY;
export function districtAskDue(st, now) {
  if (!st || st.has || !(st.first > 0)) return false;
  const n = st.n | 0;
  if (n === 0) return now - st.first >= ASK_FIRST;
  if (n === 1) return st.t > 0 && now - st.t >= ASK_AGAIN;
  return false;
}

/* ---------- start ---------- */
export function init(ctx) {
  C = ctx;
  // version 1 kept a permanent install id and a queue of raw events: both are deleted
  const hadId = !!C.store.get('iid', null);
  try { localStorage.removeItem('fhb.iid'); localStorage.removeItem('fhb.q'); } catch {}
  if (hadId && !C.store.get('installSent', false)) C.store.set('installSent', true); // already counted by the old app
  if (C.store.get('stats', true) === false && !answer()) C.store.set('consent', { ok: false, v: cfg().v, day: C.localDay() }); // they had switched counts off
  U.days = load();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, touched, { passive: true, capture: true });
  addEventListener('visibilitychange', onVisibility, true); // capture on window: runs before app.js stops the audio
  addEventListener('pagehide', () => { tick(); save(true); }); // usually already hidden: that time was counted at visibilitychange
  addEventListener('online', () => send());
  if (document.visibilityState === 'visible') { U.lastTick = Date.now(); appOpened(); startTimer(); }
  setTimeout(send, 2000);
}
function touched() {
  const now = Date.now();
  if (now - U.lastInput > IDLE_MS) { tick(); U.lastTick = now; } // back from idle: the idle time is not counted
  U.lastInput = now;
}
function onVisibility() {
  if (document.visibilityState === 'hidden') { tick(true); stopTimer(); save(true); }
  else { U.lastTick = Date.now(); U.lastInput = Date.now(); appOpened(); startTimer(); send(); }
}
function startTimer() { if (!U.timer) U.timer = setInterval(() => tick(), TICK_MS); }
function stopTimer() { clearInterval(U.timer); U.timer = 0; }

/* ---------- counting ---------- */
// the page id from the route: topic/<id>, home, ask, near, family, settings, kit, tool/breaths, tool/reading/temp …
export function pageId(r) {
  if (!r || !r.length || !r[0]) return 'home';
  if (r[0] === 'topic') return SEG.test(r[1] || '') ? 'topic/' + r[1] : 'home';
  const segs = [];
  for (const x of r.slice(0, 3)) { if (!/^[a-z0-9-]{1,40}$/.test(x) || (!segs.length && !SEG.test(x))) break; segs.push(x); }
  return segs.length ? segs.join('/') : 'home';
}
function today() {
  const day = C.localDay();
  if (!U.days[day]) { U.days[day] = { p: {} }; prune(); }
  const d = U.days[day];
  Object.assign(d, { lang: C.S.lang || 'fa', v: (C.S.book && C.S.book.version) || '', plat: C.platform(), sa: !!C.isStandalone() });
  return d;
}
const rec = (id) => { const d = today(); return (d.p[id] = d.p[id] || [0, 0, 0, 0]); }; // [ms on screen, opens, audio plays, opened from search]
function appOpened() { if (allowed()) { rec('_day')[1]++; dirty(); } }
// called by app.js after every render; a new page id is one "open"
export function page(r) {
  const id = pageId(r);
  if (U.cur === id) return;
  tick();
  const from = U.cur; U.cur = id;
  if (!allowed()) return;
  const x = rec(id); x[1]++;
  if (from === 'ask' && id.startsWith('topic/')) x[3]++; // opened from the symptom search (what was typed is never kept)
  dirty();
}
// time since the last tick goes to the page on screen, if the screen is visible and someone touched it in the last 2 minutes (or audio plays)
function tick(wasVisible = document.visibilityState === 'visible') {
  const now = Date.now(), last = U.lastTick || now; U.lastTick = now;
  if (!C || !U.cur || !wasVisible || !allowed()) return;
  let ms = Math.min(now - last, TICK_MS * 2); // a sleeping phone or a paused timer adds nothing
  if (!C.isPlaying()) ms = Math.min(ms, Math.max(0, U.lastInput + IDLE_MS - last));
  if (ms <= 0) return;
  rec(U.cur)[0] += ms; rec('_day')[0] += ms; dirty();
}
export function event(t, data = {}) {
  if (!C || !allowed()) return;
  if (t === 'play') { rec(U.cur || 'home')[2]++; rec('_day')[2]++; dirty(); return; }
  let a = null;
  if (ACTS.has(t)) a = t;
  else if (t === 'tool' && /^[a-z0-9-]{1,30}$/.test(String(data.p || ''))) a = 'tool-' + data.p;
  else if (t === 'reading' && /^[a-z0-9-]{1,12}$/.test(String(data.d || ''))) a = 'reading-' + data.d + (/^[a-z0-9-]{1,12}$/.test(String(data.lv || '')) ? '-' + data.lv : ''); // the level only, never the number
  if (!a) return; // views, opens and times are counted by page(); searches never
  rec('act/' + a)[1]++; dirty();
}

/* ---------- keeping the days on the phone (localStorage), at most 60 days ---------- */
function load() { const v = C.store.get('usage', null); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function prune() {
  const keep = new Date(Date.now() - KEEP_DAYS * DAY), cut = `${keep.getFullYear()}-${String(keep.getMonth() + 1).padStart(2, '0')}-${String(keep.getDate()).padStart(2, '0')}`;
  for (const d of Object.keys(U.days)) if (d < cut || !/^\d{4}-\d{2}-\d{2}$/.test(d)) delete U.days[d];
}
function dirty() { if (!U.saveT) U.saveT = setTimeout(() => save(true), 15000); }
function save(now) { if (!C || !now) return; clearTimeout(U.saveT); U.saveT = 0; C.store.set('usage', U.days); }

/* ---------- sending: each finished day once, when online and allowed ---------- */
const base = () => { const u = String((C.S.shipped && C.S.shipped.config && C.S.shipped.config.analyticsUrl) || '').trim(); return u ? u.replace(/\/e\/?$/, '').replace(/\/+$/, '') : ''; };
function body(day) {
  const d = U.days[day], ids = Object.keys(d.p).filter((id) => d.p[id].some((x) => x > 0));
  ids.sort((a, b) => (a === '_day' ? -1 : b === '_day' ? 1 : d.p[b][0] - d.p[a][0]));
  const pages = {};
  for (const id of ids.slice(0, MAX_PAGES)) { const x = d.p[id]; pages[id] = [Math.min(86400, Math.round(x[0] / 1000)), Math.min(1000, x[1]), Math.min(5000, x[2]), Math.min(x[1], x[3])].map((n) => Math.max(0, n | 0)); }
  if (!d.n) d.n = C.randId(); // a random id for this one upload, so a resend is not counted twice
  const sv = C.S.book && C.S.book.surveillance, dist = C.store.get('district', null);
  const known = sv && dist && [...(sv.districts || []), ...(sv.provinces || [])].some((x) => x.id === dist);
  return { n: d.n, day, d: known ? dist : null, lang: d.lang || 'fa', v: String(d.v || 'unknown').slice(0, 40).replace(/[^0-9A-Za-z._-]/g, '-'), plat: d.plat || 'other', sa: !!d.sa, cv: cfg().v, pages };
}
async function post(url, b) {
  try {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'text/plain' }, keepalive: true });
    return r.ok ? 'ok' : r.status === 400 ? 'refused' : 'later';
  } catch { return 'later'; }
}
export async function send() {
  if (!C || U.sending || !allowed() || !navigator.onLine) return;
  const b = base(); if (!b) return;
  U.sending = true; clearTimeout(U.retryT);
  let later = false;
  try {
    if (!C.store.get('installSent', false)) {
      const r = await post(b + '/i', { v: String((C.S.book && C.S.book.version) || 'unknown').slice(0, 40).replace(/[^0-9A-Za-z._-]/g, '-'), lang: C.S.lang || 'fa', plat: C.platform(), sa: !!C.isStandalone() });
      if (r === 'later') later = true; else C.store.set('installSent', true);
    }
    const now = C.localDay();
    for (const day of Object.keys(U.days).sort()) {
      if (later || day >= now) break;
      if (!Object.values(U.days[day].p || {}).some((x) => x.some((n) => n > 0))) { delete U.days[day]; continue; }
      const r = await post(b + '/u', body(day));
      if (r === 'later') { later = true; save(true); break; }
      delete U.days[day]; save(true); // sent, or refused by the server (never sent again)
    }
  } finally {
    U.sending = false;
    if (later) U.retryT = setTimeout(send, RETRY_MS);
  }
}

/* ---------- the rotating id for disease-watch reports ---------- */
// The server uses it only to count a report sent twice once; it changes every 30 days, so it is not a permanent id.
export function watchId() {
  let w = C.store.get('watchId', null); const now = Date.now();
  if (!w || typeof w.id !== 'string' || !(now - w.t < 30 * DAY && now >= w.t)) { w = { id: C.randId(), t: now }; C.store.set('watchId', w); }
  return w.id;
}

/* ---------- feedback: no phone numbers, and ask before recording ---------- */
const PHONE_RE = /[+＋]?[0-9۰-۹٠-٩](?:[\s\-–.()]*[0-9۰-۹٠-٩]){6,}/g;
export const cleanText = (s) => String(s || '').replace(PHONE_RE, '…');
export async function askVoice() {
  const { esc, T, sayRow } = C;
  const ok = await C.choose(`<h2>${esc(T('fbRecord'))}</h2>${sayRow('ui.fbVoiceAsk', 'dq')}<div class="places one"><button data-pick="yes">${esc(T('record'))}</button></div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`);
  return ok === 'yes';
}

/* ---------- the privacy page ---------- */
export function screenPrivacy() {
  const { esc, T, L, spk, ic, S } = C;
  const ids = Object.keys(S.book.narration).filter((k) => k.startsWith('ui.privacy.'));
  let html = C.top(T('privacy'), { back: '#/settings' }) + C.listenBar(ids);
  for (const id of ids) html += `<div class="blk tip" data-block="${esc(id)}">${ic(id === 'ui.privacy.voice' ? 'talk' : id === 'ui.privacy.watch' ? 'people' : id === 'ui.privacy.phone' ? 'phone' : 'check')}<div class="body">${esc(L(S.book.narration[id]))}</div>${spk(id)}</div>`;
  if (S.book.narration['ui.set.stats']) ids.push('ui.set.stats');
  html += `<div class="panel"><div class="srow" data-block="ui.set.stats">${ic('card')}<div class="grow"><div class="t">${esc(T(allowed() ? 'usageNowOn' : 'usageNowOff'))}</div><div class="s">${esc(T('usageStatsSub'))}</div></div>${S.book.narration['ui.set.stats'] ? spk('ui.set.stats') : ''}<button class="toggle" data-action="stats" aria-pressed="${allowed()}" aria-label="${esc(T('usageStats'))}"></button></div></div>`;
  return { html, nav: 'settings', adult: true };
}
