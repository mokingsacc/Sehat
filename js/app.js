// Family Health Book: app logic. Plain ES modules, no build step, works offline.
import { toJalali, fromJalali, monthLength } from './jalali.js';
import { makeZip } from './zip.js';
import { initTools } from './tools.js';
import { initFinder } from './search-ui.js'; // the symptom finder's results (js/search.js ranks the pages)
import { initGrowth } from './growth.js'; // growth tracker: #/growth (charts, results, how to measure)
import { initShare } from './share.js'; // Share Sehat: #/share (the app file on Android, the link and a QR code on the web)
import * as Stats from './stats.js';
import { openAnimation, animPoster } from './anim.js'; // explainer animations (public API only; see docs/ANIMATIONS.md)
import { applyOverlay, FORMAT as OV_FORMAT } from './overlay.js'; // changes published from the editor (docs/EDITOR_AND_RELEASES.md)
window.SEHAT_STARTED = true; // index.html shows an "update your browser" message if the app never gets this far

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('fhb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fhb.' + k, JSON.stringify(v)); } catch {} },
};
const S = {
  book: null,
  lang: store.get('lang', null),
  voice: store.get('voice', null), // 'f' = a woman's voice, 'm' = a man's voice
  speed: store.get('speed', 1),
  get stats() { return Stats.allowed(); }, set stats(v) { Stats.setConsent(v); }, // usage counts allowed? (consent, js/stats.js)
  watch: store.get('watch', true), // "Help watch for outbreaks" (also needs stats on)
  kids: store.get('kids', []),
  kid: store.get('kid', null),
  queueIds: [],
  installEvt: null,
  swReg: null,
  shipped: null, // { version, built, config } of the book that came with the app
};
const RTL = (lg) => lg !== 'en';
const DIG = '۰۱۲۳۴۵۶۷۸۹';
const num = (n) => (S.lang === 'en' ? String(n) : String(n).replace(/\d/g, (d) => DIG[d]));
const T = (key, vars) => {
  const L = S.book.ui[key]; let s = L ? (L[S.lang] == null ? L.en : L[S.lang]) : key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
};
const L = (obj) => (obj ? (obj[S.lang] != null ? obj[S.lang] : obj.en != null ? obj.en : '') : ''); // plain checks: old Android phones cannot read newer syntax
const isAdultTopic = (t) => t && (t.section === 'women' || t.section === 'everyone');

/* ---------- icons (app chrome) ---------- */
const I = {
  spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  back: '<svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  fwd: '<svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>',
  child: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
  adults: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M14 20a4.5 4.5 0 0 1 8 0"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h12l4 4v12H4z"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  // people without faces (no eyes or features): a woman in a headscarf, a man in a pakol hat
  woman: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4.5c-6.4 0-10.5 4.8-10.5 10.8v4.2c0 2.2-1.2 3.6-3.5 5.2C8 33 7 38.5 6.5 44h35c-.5-5.5-1.5-11-4.5-19.3-2.3-1.6-3.5-3-3.5-5.2v-4.2c0-6-4.1-10.8-10.5-10.8z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="24" cy="16" r="6.3" fill="currentColor"/></svg>',
  man: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 44c0-9.5 7.2-16 16-16s16 6.5 16 16z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="24" cy="17.5" r="7.5" fill="currentColor"/><path d="M15 11c0-3.8 4-6.5 9-6.5s9 2.7 9 6.5v1.8H15z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};
const ic = (name, cls = 'ic') => { const u = `url('img/icons/${esc(name || '_dot')}.svg')`; return `<span class="${cls}" style="-webkit-mask-image:${u};mask-image:${u}" aria-hidden="true"></span>`; };

/* ---------- audio: a speaker next to every block ---------- */
// Narration comes in "slots": a language and a voice (f = woman, m = man), e.g. audio/fa-m/<id>.mp3.
// A clip plays from the chosen voice, else the other voice of the same language, else the phone's own speech.
const AUDIO_CACHE = 'fhb-audio-v1';
const otherVoice = (v) => (v === 'm' ? 'f' : 'm');
const slotOf = (lg = S.lang, v = S.voice) => `${lg || 'fa'}-${v === 'm' ? 'm' : 'f'}`;
const slotsFor = (slot, strict) => (strict ? [slot] : [slot, slot.slice(0, 3) + otherVoice(slot.slice(3))]);
const clipSrc = (id, slot) => (S.book.audio[slot] && S.book.audio[slot][id]) || null;
const hasAudio = (id, slot = slotOf(), strict = false) => slotsFor(slot, strict).some((s) => clipSrc(id, s) || REC.has(s + '/' + id));
const spk = (id, label) => `<button class="spk${hasAudio(id) ? '' : ' none'}" data-say="${esc(id)}" aria-label="${esc(label || T('listen'))}">${I.spk}</button>`;

const P = { audio: new Audio(), ids: [], i: 0, on: false, url: null, token: 0, slot: 'fa-f', strict: false };
P.audio.preload = 'auto';
P.audio.addEventListener('ended', () => advance());
P.audio.addEventListener('error', () => advance());

async function clipUrl(id, slot = slotOf(), strict = false) {
  for (const s of slotsFor(slot, strict)) {
    const rec = await REC.get(s + '/' + id);
    if (rec) return URL.createObjectURL(rec.blob);
    const src = clipSrc(id, s);
    if (src) { const blob = await getClip(src); if (blob) return URL.createObjectURL(blob); }
  }
  return null;
}
// a clip from the phone if it is there, otherwise from the internet; kept on the phone after the first play
async function getClip(src) {
  let c = null;
  try { c = await caches.open(AUDIO_CACHE); const hit = await c.match(src); if (hit) return await hit.blob(); } catch {}
  try {
    const r = await fetch(src); if (!r.ok) return null;
    const blob = await r.blob();
    // with the service worker running, it keeps the clip itself
    if (c && !(navigator.serviceWorker && navigator.serviceWorker.controller)) c.put(src, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } })).catch(() => {});
    DL.have.add(abs(src)); packsUI();
    return blob;
  } catch { return null; }
}
function ttsVoice(lg = S.lang) {
  if (!('speechSynthesis' in window)) return null;
  const want = { fa: ['fa', 'prs'], ps: ['ps', 'pbt', 'pbu'], en: ['en'] }[lg] || [];
  return speechSynthesis.getVoices().find((v) => want.some((w) => v.lang.toLowerCase().startsWith(w))) || null;
}
function sayTTS(id, token) {
  const lg = P.slot.slice(0, 2);
  const v = ttsVoice(lg); const txt = S.book.narration[id] && S.book.narration[id][lg];
  if (!v || !txt) return false;
  const u = new SpeechSynthesisUtterance(txt); u.voice = v; u.lang = v.lang; u.rate = S.speed;
  u.onend = () => { if (token === P.token) advance(); };
  speechSynthesis.speak(u); return true;
}
function mark(id) {
  $$('.speaking').forEach((e) => e.classList.remove('speaking'));
  if (!id) return;
  const el = document.querySelector(`[data-block="${CSS.escape(id)}"]`) || document.querySelector(`.spk[data-say="${CSS.escape(id)}"]`);
  if (el) { el.classList.add('speaking'); const r = el.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function updateListenBar() {
  const b = $('.listen'); if (!b) return;
  b.classList.toggle('on', P.on && P.ids.length > 1);
  $('.pp', b).innerHTML = P.on && P.ids.length > 1 ? I.stop : I.play;
  $('.lt', b).textContent = P.on && P.ids.length > 1 ? T('playing') : T('listenPage');
  $('.prog', b).textContent = P.on && P.ids.length > 1 ? `${num(P.i + 1)} / ${num(P.ids.length)}` : '';
}
// opt.slot: play in this language and voice; opt.strict: only that voice (the voice samples)
// Returns a promise that resolves 'ended' when the last clip has finished or 'stopped' when it was cut off,
// or null when there is nothing to play (the animation player then uses its own timer).
function play(ids, opt = {}) {
  stopAudio();
  const token = ++P.token;
  P.slot = opt.slot || slotOf(); P.strict = !!opt.strict;
  P.ids = ids.filter((id) => S.book.narration[id]); P.i = 0; P.on = true;
  if (!P.ids.length) { P.on = false; return null; }
  const any = P.ids.some((id) => hasAudio(id, P.slot, P.strict)) || ttsVoice(P.slot.slice(0, 2));
  if (!any) { if (!opt.quiet) toast(T('noAudio')); P.on = false; mark(P.ids[0]); setTimeout(() => mark(null), 1500); return null; }
  const done = new Promise((r) => { P.resolve = r; });
  updateListenBar(); playCurrent(token);
  return done;
}
async function playCurrent(token) {
  if (token !== P.token || !P.on) return;
  const id = P.ids[P.i]; mark(id); updateListenBar();
  const url = await clipUrl(id, P.slot, P.strict);
  if (token !== P.token) return;
  if (url) {
    if (P.url) URL.revokeObjectURL(P.url);
    P.url = url; P.audio.src = url; P.audio.playbackRate = S.speed;
    track('play', { id });
    try { await P.audio.play(); } catch { advance(); }
  } else if (!sayTTS(id, token)) {
    if (P.ids.length === 1) toast(T('noAudio'));
    setTimeout(() => token === P.token && advance(), P.ids.length === 1 ? 1200 : 350);
  }
}
function advance() {
  if (!P.on) return;
  P.i++;
  if (P.i >= P.ids.length) { stopAudio(); return; }
  playCurrent(P.token);
}
function stopAudio() {
  if (P.resolve) { const r = P.resolve; P.resolve = null; r(P.on && P.i >= P.ids.length ? 'ended' : 'stopped'); }
  P.token++; P.on = false; try { P.audio.pause(); } catch {}
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  mark(null); updateListenBar();
}

/* ---------- local recordings (IndexedDB) for the recording mode ---------- */
const REC = {
  keys: new Set(), db: null,
  open() {
    return new Promise((res) => {
      if (!('indexedDB' in window)) return res(null);
      const r = indexedDB.open('fhb', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('rec');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => res(null);
    });
  },
  async init() {
    await this.open(); if (!this.db) return; const keys = await this.tx('readonly', (s) => s.getAllKeys()); (keys || []).forEach((k) => this.keys.add(k));
    // recordings made before voices existed ("fa/<id>") become the woman's voice ("fa-f/<id>")
    for (const k of [...this.keys]) {
      const m = /^(fa|ps|en)\/(.+)$/.exec(k); if (!m) continue;
      const to = `${m[1]}-f/${m[2]}`, v = await this.get(k);
      if (v && !this.keys.has(to)) await this.put(to, v);
      await this.del(k);
    }
  },
  tx(mode, fn) { return new Promise((res) => { if (!this.db) return res(null); const t = this.db.transaction('rec', mode); const q = fn(t.objectStore('rec')); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); },
  has(k) { return this.keys.has(k); },
  async get(k) { return this.keys.has(k) ? this.tx('readonly', (s) => s.get(k)) : null; },
  async put(k, v) { await this.tx('readwrite', (s) => s.put(v, k)); this.keys.add(k); },
  async del(k) { await this.tx('readwrite', (s) => s.delete(k)); this.keys.delete(k); },
};

/* ---------- usage counts: daily totals added up on the phone, no install id (js/stats.js) ---------- */
const A = {
  rq: store.get('rq', []), // disease-watch reports and search signals, sent to <stats server>/r
};
function track(t, data = {}) { Stats.event(t, data); }
function flush() { flushReports(); Stats.send(); }
function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function platform() { const u = navigator.userAgent; return /iPhone|iPad|iPod/.test(u) ? 'ios' : /Android/.test(u) ? 'android' : 'other'; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { stopAudio(); flushReports(); }
  else if (!DL.active) startDownloads();
});
addEventListener('online', () => { flush(); sendFeedback(); clearTimeout(DL.retry); DL.wait = 15000; startDownloads(); });
addEventListener('offline', () => packsUI());

/* ---------- disease watch: "does someone in your home have this now?" ---------- */
// Definitions come from content/src/syndromes.json (book.surveillance). A "yes" asks the district once (kept on
// the phone) and an age group, then queues one report: syndrome, definition version, district, age group, day,
// a random report id and the random install id. No names, no GPS, no free text. The same syndrome from this phone
// counts once per 14 days. Symptom-finder searches that match a syndrome are queued as a weaker "search" signal
// (once per syndrome per day). Everything waits in the queue offline and is sent to <stats server>/r.
const SV = () => (S.book && S.book.surveillance) || null;
const watching = () => !!(S.stats && S.watch && SV());
const svSyn = (id) => (SV() ? SV().syndromes.find((x) => x.id === id) : null);
const pad2 = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const randId = () => (crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join(''));
const reportUrl = () => { const u = String((S.book && S.book.config && S.book.config.analyticsUrl) || '').trim(); return u ? u.replace(/\/e\/?$/, '') + '/r' : ''; };
function svRecent(sid) { const last = store.get('svSent', {})[sid]; return !!last && dayDiff(last, localDay()) < ((SV() && SV().dedupeDays) || 14); }
function svAskable(sid) {
  if (!watching() || !svSyn(sid) || svRecent(sid)) return false;
  const no = store.get('svNo', {})[sid]; return !(no && Date.now() - no < 3 * DAY); // after "no", ask again in 3 days
}
const svFor = (key, ids) => (SV() ? SV().syndromes.filter((x) => (x[key] || []).some((i) => ids.includes(i))).map((x) => x.id) : []);
const placeName = (id) => { const sv = SV(); const p = sv && [...sv.districts, ...sv.provinces].find((x) => x.id === id); return p ? L(p.name) : ''; };
function sayRow(id, cls = 'rq') { return `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(L(S.book.narration[id]))}</div>${spk(id)}</div>`; }
// the question cards for these syndromes (only those that can be asked now); returns html and the narration ids
function reportCards(sids) {
  const list = sids.filter(svAskable).slice(0, 3), ids = [];
  const html = list.map((sid) => {
    ids.push('ui.syn.' + sid, 'ui.report');
    return `<div class="report" data-report="${esc(sid)}">${sayRow('ui.syn.' + sid, 'rq sign')}${sayRow('ui.report', 'rq q')}<div class="row2"><button class="sbtn yes" data-rep="yes" data-syn="${esc(sid)}">${esc(T('reportYes'))}</button><button class="sbtn no" data-rep="no" data-syn="${esc(sid)}">${esc(T('reportNo'))}</button></div></div>`;
  }).join('');
  return { html, ids };
}
// a dialog with big choice buttons; resolves with the chosen value, or null when closed
function choose(html) {
  return new Promise((res) => {
    dialog(html, (w) => w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) { w.remove(); res(b.dataset.pick); } else if (e.target === w || e.target.closest('[data-close]')) res(null);
    }));
  });
}
async function svPickDistrict(force) {
  const sv = SV(); let d = store.get('district', null);
  if (d && !force && [...sv.districts, ...sv.provinces].some((x) => x.id === d)) return d;
  const btn = (x) => `<button data-pick="${esc(x.id)}">${esc(L(x.name))}</button>`;
  d = await choose(`<h2>${esc(L(sv.province.name))}</h2>${sayRow('ui.district', 'dq')}<div class="places">${sv.districts.map(btn).join('')}<button data-pick="__other" class="other">${esc(T('otherProvince'))}</button></div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`);
  if (d === '__other') d = await choose(`<h2>${esc(T('chooseProvince'))}</h2>${sayRow('ui.province', 'dq')}<div class="places">${sv.provinces.map(btn).join('')}</div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`);
  if (d) store.set('district', d);
  return d;
}
async function svYes(sid, card) {
  if (!svAskable(sid)) return;
  const d = await svPickDistrict(false); if (!d) return;
  const a = await choose(`${sayRow('ui.ageGroup', 'dq')}<div class="places one">${SV().ageGroups.map((x) => `<button data-pick="${esc(x.id)}">${esc(L(x.name))}</button>`).join('')}</div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`);
  if (!a || !svQueue(sid, d, a)) return;
  if (card) { card.classList.add('done'); card.innerHTML = sayRow('ui.reportThanks'); }
  if (hasAudio('ui.reportThanks') || ttsVoice()) play(['ui.reportThanks']);
}
function svQueue(sid, d, a) {
  const syn = svSyn(sid); if (!syn || !watching() || svRecent(sid)) return false;
  const day = localDay();
  A.rq.push({ k: 'r', id: randId(), s: sid, dv: syn.version, d, a, day });
  if (A.rq.length > 300) A.rq = A.rq.slice(-300);
  store.set('rq', A.rq);
  const sent = store.get('svSent', {}); sent[sid] = day; store.set('svSent', sent);
  setTimeout(flushReports, 500);
  return true;
}
// a symptom-finder search or picture that matches a syndrome: a weaker signal, once per syndrome per day
function svSignal(symIds) {
  if (!watching()) return;
  const day = localDay(), seen = store.get('svSig', {}); let added = false;
  for (const sid of svFor('symptoms', symIds)) {
    if (seen[sid] === day) continue;
    seen[sid] = day; added = true;
    A.rq.push({ k: 's', s: sid, dv: svSyn(sid).version, d: store.get('district', null), day });
  }
  if (!added) return;
  if (A.rq.length > 300) A.rq = A.rq.slice(-300);
  store.set('svSig', seen); store.set('rq', A.rq);
}
// Reports leave the phone only when the server has answered "ok" (a beacon only means "queued by the browser", so it is
// not used). Sending again is safe: each report has its own id and the server ignores one it already has.
let rqSending = false;
async function flushReports() {
  const url = reportUrl();
  if (rqSending || !url || !watching() || !A.rq.length || !navigator.onLine) return;
  rqSending = true;
  const batch = A.rq.slice(0, 50), body = JSON.stringify({ iid: Stats.watchId(), v: S.book && S.book.version, items: batch });
  let more = false;
  try {
    // keepalive: the request still finishes when the app is closed or goes to the background
    const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: body.length < 60000 });
    if (r.ok || r.status === 400) { // 400: the server can never use this batch, so it is not sent again
      const sent = new Set(batch);
      A.rq = A.rq.filter((x) => !sent.has(x)); store.set('rq', A.rq); more = A.rq.length > 0;
    }
  } catch {} finally { rqSending = false; }
  if (more) setTimeout(flushReports, 1000);
}

/* ---------- toast & dialog ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function dialog(html, onMount) {
  const w = document.createElement('div'); w.className = 'dialog-wrap'; w.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) w.remove(); });
  document.body.appendChild(w); if (onMount) onMount(w); return w;
}

/* ---------- layout pieces ---------- */
function listenBar(ids) { S.queueIds = ids; return `<button class="listen" data-action="listen"><span class="pp">${I.play}</span><span class="lt">${esc(T('listenPage'))}</span><span class="prog"></span></button>`; }
function top(title, { back = '#/home', right = '' } = {}) {
  return `<div class="top">${back ? `<a class="round" href="${back}" aria-label="${esc(T('back'))}">${I.back}</a>` : ''}<h1>${esc(title)}</h1>${right}</div>`;
}
function nav(active) {
  const item = (k, href, icon, label) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${icon}<span>${esc(label)}</span></a>`;
  return `<nav class="nav">${item('home', '#/home', I.home, T('home'))}${item('children', '#/children', I.child, T('children'))}${item('adults', '#/adults', I.adults, T('adults'))}${item('family', '#/family', I.book, T('family'))}${item('settings', '#/settings', I.gear, T('settings'))}</nav>`;
}
function langPill() {
  return `<div class="langpill" role="group" aria-label="${esc(T('language'))}">${['fa', 'ps'].map((lg) => `<button data-lang="${lg}" aria-pressed="${S.lang === lg}">${esc(S.book.langNames[lg])}</button>`).join('')}</div>`;
}
function disclaimer() { return `<div class="disc" data-block="ui.disclaimer">${I.warn.replace('<svg', '<svg style="width:26px;height:26px;flex:0 0 auto;color:#9A6F00"')}<div style="flex:1">${esc(L(S.book.narration['ui.disclaimer']))}</div>${spk('ui.disclaimer')}</div>`; }

/* ---------- screens ---------- */
function screenWelcome() {
  const b = S.book;
  const btn = (lg) => `<div class="langbtn"><button class="spk" data-say-lang="${lg}" aria-label="${esc(b.langNames[lg])}">${I.spk}</button><button class="big" data-setlang="${lg}" lang="${lg}">${esc(b.langNames[lg])}</button><button class="go" data-setlang="${lg}" aria-label="${esc(b.langNames[lg])}">${I.fwd}</button></div>`;
  return { html: `<div class="welcome"><div class="pic"><img src="img/app/welcome.svg" alt=""></div>
    <h1>${esc(b.ui.appName.fa)}<br>${esc(b.ui.appName.ps)}</h1>
    <p class="tl">${esc(b.ui.chooseLang.fa)} · ${esc(b.ui.chooseLang.ps)}</p>
    ${btn('fa')}${btn('ps')}
    <button class="en" data-setlang="en">English</button></div>`, nav: false };
}

// after the language: choose a woman's or a man's voice (each card has a speaker that plays a sample in that voice)
const voiceCount = (lg, v) => Object.keys(S.book.audio[lg + '-' + v] || {}).length;
function voiceCards(attr) {
  const lg = S.lang, sel = S.voice || (voiceCount(lg, 'm') > voiceCount(lg, 'f') ? 'm' : 'f');
  return `<div class="voices">${['f', 'm'].map((v) => `<div class="voicebtn"><button class="big" ${attr}="${v}" aria-pressed="${v === sel}">${v === 'f' ? I.woman : I.man}<span class="vt">${esc(T(v === 'f' ? 'woman' : 'man'))}</span>${voiceCount(lg, v) ? '' : `<span class="vs">${esc(T('noClipsYet'))}</span>`}</button><button class="spk" data-sample="${v}" aria-label="${esc(T('listen'))} · ${esc(T(v === 'f' ? 'woman' : 'man'))}">${I.spk}</button></div>`).join('')}</div>`;
}
function sampleId(slot) { return ['ui.welcome', 'ui.voice', 'ui.home'].find((id) => clipSrc(id, slot)) || 'ui.welcome'; }
function screenVoice() {
  let html = `<div class="welcome voicestep"><div class="top"><button class="round" data-action="relang" aria-label="${esc(T('back'))}">${I.back}</button><h1>${esc(T('chooseVoice'))}</h1></div>`;
  if (S.book.narration['ui.voice']) html += `<div class="blk lead" data-block="ui.voice"><div class="body">${esc(L(S.book.narration['ui.voice']))}</div>${spk('ui.voice')}</div>`;
  html += voiceCards('data-setvoice') + '</div>';
  return { html, nav: false };
}

function nextDueAll() {
  const v = S.book.topics.vaccines; if (!v) return null;
  let best = null;
  for (const k of S.kids) { const n = nextDue(k); if (n && (!best || n.due < best.due)) best = { ...n, kid: k }; }
  return best;
}

function screenHome() {
  const b = S.book, ids = ['ui.home'];
  const mods = (b.config && b.config.home) || ['emergency', 'install', 'ask', 'nextVaccine', 'sections', 'quick', 'tools', 'kit', 'near', 'feedback', 'disclaimer'];
  let html = top(T('appName'), { back: '', right: langPill() });
  let shareShown = false;
  const bar = listenBar(ids); // the Emergency button, when it is first, goes above the "listen to this page" bar
  if (mods[0] !== 'emergency') html += bar;
  const M = {
    emergency() { // big, red, first: age picker, then the first-aid pages for that age
      if (!(b.config && b.config.emergency && b.config.emergency.length)) return '';
      ids.push('ui.emergency');
      return `<div class="embtn" data-block="ui.emergency"><a href="#/emergency" class="grow" data-action="emergency">${I.warn.replace('<svg', '<svg class="ew"')}<span class="tx"><span class="t">${esc(T('emergency'))}</span><span class="s">${esc(T('emergencySub'))}</span></span></a>${spk('ui.emergency')}</div>`;
    },
    install() {
      if (!(S.installEvt || (platform() === 'ios' && !isStandalone()))) return '';
      ids.push('ui.install');
      return `<div class="banner" data-block="ui.install">${ic('phone')}<button class="grow" data-action="install" style="text-align:start"><div class="t">${esc(T('install'))}</div><div class="s">${esc(T('installSub'))}</div></button>${spk('ui.install')}</div>`;
    },
    share() { if (shareShown) return ''; shareShown = true; ids.push(SH.homeSay()); return SH.homeCard(); }, // Share Sehat (js/share.js)
    sendApp() { return M.share(); }, // the older name of the same card
    growth() { ids.push('ui.growth'); return `<div class="grid2">${GR.homeTile()}</div>`; }, // growth tracker tile (js/growth.js)
    ask() {
      ids.push('ui.ask');
      return `<div class="askcard" data-block="ui.ask"><a href="#/ask" class="grow"><div class="t">${esc(T('ask'))}</div><div class="s">${esc(T('askSub'))}</div></a><a href="#/ask" class="mic" aria-label="${esc(T('ask'))}">${I.mic}</a>${spk('ui.ask')}</div>`;
    },
    nextVaccine() { const k = nextDueAll(); if (!k || k.done) return ''; ids.push(k.visit.id); return nextCard(k, true); },
    sections() {
      const card = (href, img, title, sub, sayId, cls) => `<div class="hero-card ${cls}"><a href="${href}" class="pic" tabindex="-1" aria-hidden="true"><img src="${img}" alt=""></a><div class="row"><a href="${href}" class="grow"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></a>${spk(sayId)}</div></div>`;
      const nC = b.sections.children.length, nA = new Set([...b.sections.women, ...b.sections.everyone]).size;
      ids.push('ui.children', 'ui.adults');
      return card('#/children', 'img/app/home-children.svg', T('children'), T('topicsCount', { n: num(nC) }), 'ui.children', '') + card('#/adults', 'img/app/home-adults.svg', T('adults'), T('topicsCount', { n: num(nA) }), 'ui.adults', 'adult');
    },
    quick() {
      const q = (href, icon, title, sayId, cls = '') => `<div class="quick ${cls}"><a href="${href}" style="display:contents">${ic(icon)}<span class="t">${esc(title)}</span></a>${spk(sayId)}</div>`;
      let h = '<div class="grid2">';
      if (b.topics.vaccines) h += q('#/topic/vaccines', 'syringe', T('vaccines'), 'vaccines.title');
      if (b.topics['danger-child']) h += q('#/topic/danger-child', 'warning', L(b.topics['danger-child'].title), 'danger-child.title', 'danger');
      h += q('#/family', 'card', T('myFamily'), 'ui.family');
      if (b.topics['first-aid']) h += q('#/topic/first-aid', 'wound', L(b.topics['first-aid'].title), 'first-aid.title');
      return h + '</div>';
    },
    near() { ids.push('ui.near'); return `<div class="banner" data-block="ui.near">${ic('hospital')}<a class="grow" href="#/near"><div class="t">${esc(T('near'))}</div><div class="s">${esc(T('nearSub'))}</div></a>${spk('ui.near')}</div>`; },
    feedback() { ids.push('ui.feedback'); return `<div class="banner fbk" data-block="ui.feedback">${ic('talk')}<a class="grow" href="#/feedback"><div class="t">${esc(T('feedback'))}</div><div class="s">${esc(T('feedbackSub'))}</div></a>${spk('ui.feedback')}</div>`; },
    disclaimer() { ids.push('ui.disclaimer'); return disclaimer(); },
    tools() { ids.push('ui.breaths', 'ui.reading'); return TL.homeTools(); }, // breathing counter, "what does the number mean?"
    kit() { ids.push('ui.kit'); return TL.homeKit(); }, // home health kit
  };
  for (const m of mods) if (M[m]) { html += M[m](); if (m === 'emergency' && m === mods[0]) html += bar; }
  return { html, nav: 'home' };
}

function topicCard(tid) {
  const t = S.book.topics[tid]; if (!t) return '';
  const adult = isAdultTopic(t) ? ' adult' : '';
  return `<div class="tcard${adult}"><a class="pic" href="#/topic/${tid}" tabindex="-1" aria-hidden="true"><img src="${esc(t.image)}" alt="" loading="lazy"></a><div class="row"><a href="#/topic/${tid}" style="flex:1 1 auto"><div class="t">${esc(L(t.title))}</div><div class="s">${esc(L(t.summary))}</div></a>${spk(tid + '.title')}</div></div>`;
}
// first-aid and emergency pages (sections.emergency) are listed in their own group at the end of a list
const emSet = () => new Set(S.book.sections.emergency || []);
function emGroup(list, ids) {
  if (!list.length) return '';
  ids.push('ui.emergencyList', ...list.map((t) => t + '.title'));
  return `<div class="group-h em" data-block="ui.emergencyList"><a class="t" href="#/emergency">${esc(T('emergency'))}</a><span class="ln"></span>${spk('ui.emergencyList')}</div><div class="tlist">${list.map(topicCard).join('')}</div>`;
}
function screenChildren() {
  const em = emSet(), all = S.book.sections.children, main = all.filter((t) => !em.has(t));
  const ids = ['ui.children', ...main.map((t) => t + '.title')];
  let html = `<div class="blk lead" data-block="ui.children"><div class="body">${esc(L(S.book.narration['ui.children']))}</div>${spk('ui.children')}</div>`;
  html += `<div class="tlist">${main.map(topicCard).join('')}</div>` + emGroup(all.filter((t) => em.has(t)), ids);
  return { html: top(T('children')) + listenBar(ids) + html, nav: 'children' };
}
function screenAdults() {
  const s = S.book.sections, em = emSet(), every = s.everyone.filter((t) => !em.has(t));
  const ids = ['ui.adults', 'ui.women', ...s.women.map((t) => t + '.title'), 'ui.everyone', ...every.map((t) => t + '.title')];
  let html = `<div class="blk lead" data-block="ui.adults"><div class="body">${esc(L(S.book.narration['ui.adults']))}</div>${spk('ui.adults')}</div>`;
  const group = (key, list) => `<div class="group-h" data-block="ui.${key}"><span class="t">${esc(T(key))}</span><span class="ln"></span>${spk('ui.' + key)}</div><div class="tlist">${list.map(topicCard).join('')}</div>`;
  html += group('women', s.women) + group('everyone', every) + emGroup(s.everyone.filter((t) => em.has(t)), ids);
  return { html: top(T('adults')) + listenBar(ids) + html, nav: 'adults', adult: true };
}

function blockHtml(b, n) {
  if (b.type === 'lead') return `<div class="blk lead" data-block="${esc(b.id)}"><div class="body">${esc(L(b.text))}</div>${spk(b.id)}</div>`;
  if (b.type === 'step') return `<div class="blk step${b.picture ? ' haspic' : ''}" data-block="${esc(b.id)}">${b.picture ? `<img class="fig" src="${esc(b.picture)}" alt="" loading="lazy">` : ''}<div class="pic">${ic(b.icon)}</div><div class="body"><div class="h"><span class="num">${num(n)}</span><span>${esc(L(b.title))}</span></div><div class="x">${esc(L(b.text))}</div></div>${spk(b.id)}</div>`;
  if (b.type === 'link') return TL.linkBlock(b); // opens a tool, the home kit or another topic
  if (b.type === 'anim') return animBlock(b); // a still picture with a play button: opens the animation player
  if (b.type === 'tip') return `<div class="blk tip" data-block="${esc(b.id)}">${ic(b.icon || 'check')}<div class="body">${esc(L(b.text))}</div>${spk(b.id)}</div>`;
  if (b.type === 'alert' || b.type === 'dont') {
    const cls = b.type === 'dont' ? 'dont' : b.level === 'soon' ? 'soon' : 'urgent';
    return `<div class="alert ${cls}"><div class="ah" data-block="${esc(b.id)}">${b.type === 'dont' ? ic('no') : I.warn.replace('<svg', '<svg class="ic" style="background:none;-webkit-mask:none;mask:none"')}<div style="flex:1">${esc(L(b.title))}</div>${spk(b.id)}</div>${b.items.map((it) => `<div class="item" data-block="${esc(it.id)}"><div class="pic">${ic(it.icon)}</div><div class="x">${esc(L(it.text))}</div>${spk(it.id)}</div>`).join('')}</div>`;
  }
  return '';
}
function blockIds(b) { return b.type === 'alert' || b.type === 'dont' ? [b.id, ...b.items.map((i) => i.id)] : b.type === 'anim' ? [animSay(b)] : [b.id]; }

/* ---------- explainer animations (js/anim.js; anim/<name>.js) ---------- */
// An "anim" block: a poster (one still scene) with a big play button and the title with a speaker.
// anim = an animation or a group (cpr: the age picker); pick = go straight to one variant (cpr-baby).
// Its speaker reads the block's own title, or the animation's title (anim.<name>.title) when it has none.
const animSay = (b) => (b.title ? b.id : `anim.${b.pick || b.anim}.title`);
const POSTER_SCENE = { cpr: ['cpr-adult', 4], 'cpr-newborn': ['cpr-newborn', 4], 'cpr-baby': ['cpr-baby', 4], 'cpr-child': ['cpr-child', 4], 'cpr-adult': ['cpr-adult', 4] };
function animBlock(b) {
  const sid = animSay(b), title = b.title ? L(b.title) : L(S.book.narration[sid]), name = b.pick || b.anim;
  const [pa, ps] = POSTER_SCENE[name] || [name, 0];
  return `<div class="blk anim-block" data-block="${esc(sid)}"><button class="poster" data-action="anim" data-anim="${esc(b.anim)}"${b.pick ? ` data-variant="${esc(b.pick)}"` : ''} data-poster="${esc(pa)}" data-scene="${ps}" aria-label="${esc(title)}"><span class="play">${I.play}</span></button><div class="row"><span class="t">${esc(title)}</span>${spk(sid)}</div></div>`;
}
// fill the posters on the page with still pictures (after each render; the files load once and stay cached)
function fillPosters() {
  for (const el of $$('[data-poster]:not(.filled)')) {
    el.classList.add('filled');
    animPoster(el.dataset.poster, +el.dataset.scene || 0).then((svg) => { if (el.isConnected) el.insertAdjacentHTML('afterbegin', svg); }).catch(() => {});
  }
}
const AN = { ctl: null };
async function openAnim(name, pick) {
  stopAudio();
  track('tool', { p: 'anim-' + (pick || name) });
  const canPlay = (ids) => ids.some((id) => hasAudio(id)) || !!ttsVoice();
  try {
    AN.ctl = await openAnimation(name, {
      lang: S.lang, t: T, ...(pick ? { pick } : {}),
      text: (id) => L(S.book.narration[id]),
      play: (ids) => (canPlay(ids) ? play(ids, { quiet: true }) : null), // null: no voice on this phone, the player times each scene
      stop: stopAudio,
      onClose: () => { stopAudio(); AN.ctl = null; },
    });
  } catch { AN.ctl = null; toast(T('noAudio')); }
}

/* ---------- the Emergency screen: who needs help, then that age's first-aid pages ---------- */
const EM = { speak: false, back: null };
const emAges = () => (S.book.config && S.book.config.emergency) || [];
function emCarRow(text) { return `<div class="em-car" data-block="ui.emergency">${ic('car')}<div class="body">${esc(text)}</div>${spk('ui.emergency')}</div>`; }
function screenEmergency(age) {
  const b = S.book, a = emAges().find((x) => x.id === age);
  if (EM.speak) { EM.speak = false; setTimeout(() => { if (hasAudio('ui.emergency') || ttsVoice()) play(['ui.emergency'], { quiet: true }); }, 0); }
  if (!a) {
    const ids = ['ui.emergency', 'ui.emergencyWho'];
    let html = top(T('emergency')) + listenBar(ids) + emCarRow(L(b.narration['ui.emergency']));
    html += `<div class="em-who" data-block="ui.emergencyWho"><h2>${esc(T('emergencyWho'))}</h2>${spk('ui.emergencyWho')}</div>`;
    html += `<div class="em-ages">${emAges().map((x) => `<a class="em-age" href="#/emergency/${esc(x.id)}"><span class="em-pic"${x.anim ? ` data-poster="${esc(x.anim)}" data-scene="0"` : ''}>${x.anim ? '' : ic(x.icon)}</span><span class="row">${ic(x.icon)}<span class="t">${esc(T(x.label))}</span></span></a>`).join('')}</div>`;
    const all = (b.sections.emergency || []).filter((t) => b.topics[t]);
    if (all.length) { html += `<details class="em-all"><summary>${esc(T('allEmergencies'))}</summary>${all.map(emRow).join('')}</details>`; }
    html += nearBanner();
    return { html, nav: 'home' };
  }
  const cpr = b.topics[a.cpr], list = (a.topics || []).filter((t) => b.topics[t]);
  const ids = ['ui.emergency', ...(cpr ? [a.cpr + '.title'] : []), ...list.map((t) => t + '.title')];
  let html = top(T(a.label), { back: '#/emergency' }) + listenBar(ids) + emCarRow(T('sendForCar'));
  if (cpr) {
    html += `<div class="em-cpr" data-block="${esc(a.cpr)}.title"><a class="grow" href="#/topic/${esc(a.cpr)}">${ic('breathe')}<span class="tx"><span class="t">${esc(T('notBreathing'))}</span><span class="s">${esc(L(cpr.title))}</span></span></a>${spk(a.cpr + '.title')}`;
    if (a.anim) html += `<button class="em-watch" data-action="anim" data-anim="cpr" data-variant="${esc(a.anim)}">${I.play}<span>${esc(T('watchHow'))}</span></button>`;
    html += `</div>`;
  }
  if (list.length) html += `<div class="group-h"><span class="t">${esc(T('otherEmergencies'))}</span><span class="ln"></span></div>${list.map(emRow).join('')}`;
  html += nearBanner();
  return { html, nav: 'home', adult: a.id === 'adult' };
}
function emRow(tid) {
  const t = S.book.topics[tid];
  return `<div class="erow${isAdultTopic(t) ? ' adult' : ''}" data-block="${esc(tid)}.title"><a class="grow" href="#/topic/${esc(tid)}"><img src="${esc(t.image)}" alt="" loading="lazy"><span class="t">${esc(L(t.title))}</span></a>${spk(tid + '.title')}</div>`;
}
function nearBanner() { return `<div class="banner" data-block="ui.near">${ic('hospital')}<a class="grow" href="#/near"><div class="t">${esc(T('near'))}</div><div class="s">${esc(T('nearSub'))}</div></a>${spk('ui.near')}</div>`; }

function screenTopic(tid) {
  // own topics only: "#/topic/constructor" must not reach the object's built-in properties
  const t = Object.prototype.hasOwnProperty.call(S.book.topics, tid) ? S.book.topics[tid] : null;
  if (!t || typeof t !== 'object') return screenHome();
  if (tid === 'vaccines') return screenVaccines(t);
  const ids = [tid + '.title'];
  let n = 0, body = '';
  for (const b of t.blocks) { if (b.type === 'step') n++; body += blockHtml(b, n); ids.push(...blockIds(b)); }
  const rc = reportCards(svFor('topics', [tid])); body += rc.html; ids.push(...rc.ids);
  ids.push('ui.disclaimer');
  const kit = TL.isKitTopic(tid), back = kit ? '#/kit' : EM.back || (t.section === 'children' ? '#/children' : '#/adults');
  let html = `<div class="topic-hero"><img src="${esc(t.image)}" alt=""><a class="round" href="${back}" aria-label="${esc(T('back'))}">${I.back}</a></div>`;
  html += `<div class="title-row" data-block="${tid}.title"><h1>${esc(L(t.title))}</h1>${spk(tid + '.title')}</div>`;
  html += listenBar(ids) + body + disclaimer();
  if (t.sources && t.sources.length) html += `<details class="sources"><summary>${esc(T('sources'))}</summary><ul>${t.sources.map((s) => `<li dir="ltr">${esc(s)}</li>`).join('')}</ul></details>`;
  track('view', { p: 'topic/' + tid });
  return { html, nav: kit ? 'home' : t.section === 'children' ? 'children' : 'adults', adult: isAdultTopic(t) };
}

function screenVaccines(v) {
  const ids = ['vaccines.title', v.lead.id, ...v.visits.map((x) => x.id), ...(v.notes || []).map((x) => x.id), ...(v.women ? [v.women.id] : [])];
  let html = `<div class="topic-hero"><img src="${esc(v.image)}" alt=""><a class="round" href="#/children" aria-label="${esc(T('back'))}">${I.back}</a></div>`;
  html += `<div class="title-row" data-block="vaccines.title"><h1>${esc(L(v.title))}</h1>${spk('vaccines.title')}</div>`;
  html += listenBar(ids);
  html += `<div class="blk lead" data-block="${v.lead.id}"><div class="body">${esc(L(v.lead.text))}</div>${spk(v.lead.id)}</div>`;
  for (const b of v.anims || []) { html += animBlock(b); ids.splice(ids.indexOf(v.lead.id) + 1, 0, animSay(b)); }
  for (const vis of v.visits) {
    html += `<div class="visit"><span class="dot"></span><div class="card" data-block="${esc(vis.id)}"><div class="age"><span class="grow">${esc(L(vis.age))}</span>${spk(vis.id)}</div>${vis.doses.map((d) => `<div class="dose"><b>${esc(L(d.name))}</b><span>${esc(L(d.protects))}</span></div>`).join('')}</div></div>`;
  }
  for (const nt of v.notes || []) html += `<div class="blk tip" data-block="${esc(nt.id)}">${ic(nt.icon || 'check')}<div class="body">${esc(L(nt.text))}</div>${spk(nt.id)}</div>`;
  if (v.women) html += `<div class="blk step adult" data-block="${esc(v.women.id)}"><div class="pic">${ic('pregnant')}</div><div class="body"><div class="h">${esc(L(v.women.title))}</div><div class="x">${esc(L(v.women.text))}</div>${(v.women.doses || []).map((d, i) => `<div class="dose"><b>Td ${num(i + 1)}</b><span>${esc(L(d.when))}</span></div>`).join('')}</div>${spk(v.women.id)}</div>`;
  html += `<a class="btn" href="#/family">${ic('card')} ${esc(T('myFamily'))}</a>`;
  html += disclaimer();
  track('view', { p: 'topic/vaccines' });
  return { html, nav: 'children' };
}

/* ---------- family record ---------- */
const DAY = 864e5;
const todayISO = () => localDay(); // the phone's own date (not UTC: before 04:30 in Kabul UTC is still yesterday)
function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00'); const j = toJalali(d);
  return `${num(j.jd)} ${S.book.months[S.lang][j.jm - 1]} ${num(j.jy)}`;
}
function ageText(dobISO) {
  const days = Math.floor((Date.now() - new Date(dobISO + 'T12:00:00')) / DAY);
  if (days < 60) return T('ageDays', { n: num(Math.max(days, 0)) });
  if (days < 730) return T('ageMonths', { n: num(Math.floor(days / 30.44)) });
  return T('ageYears', { n: num(Math.floor(days / 365.25)) });
}
function nextDue(k) {
  const v = S.book.topics.vaccines; if (!v || !k.dob) return null;
  const dob = new Date(k.dob + 'T12:00:00');
  for (const vis of v.visits) {
    if (k.given && k.given[vis.id]) continue;
    return { visit: vis, due: new Date(dob.getTime() + vis.ageDays * DAY) };
  }
  return { done: true, due: new Date(8.64e15) };
}
function nextCard(n, withName) {
  if (n.done) return `<div class="next ok">${I.check.replace('<svg', '<svg style="width:28px;height:28px"')}<div style="flex:1"><div class="t">${esc(T('allDone'))}</div></div></div>`;
  // whole calendar days from today to the due day (the label changes at midnight, not at noon)
  const iso = localDay(n.due), days = dayDiff(localDay(), iso);
  const when = days < 0 ? T('overdue') : days === 0 ? T('dueToday') : days === 1 ? T('dueTomorrow') : T('dueIn', { n: num(days) });
  const cls = days < 0 ? '' : days <= 14 ? '' : 'later';
  return `<div class="next ${cls}" data-block="${esc(n.visit.id)}">${ic('calendar')}<a href="#/family" style="flex:1"><div class="t">${withName && n.kid ? esc(n.kid.name) + ' · ' : ''}${esc(T('nextVaccine'))}: ${esc(L(n.visit.age))}</div><div class="s">${esc(fmtDate(iso))} · ${esc(when)}</div></a>${spk(n.visit.id)}</div>`;
}
function saveKids() { store.set('kids', S.kids); store.set('kid', S.kid); }

function screenFamily() {
  const v = S.book.topics.vaccines;
  const ids = ['ui.family'];
  let html = top(T('myFamily')) + listenBar(ids);
  html += `<div class="blk lead" data-block="ui.family"><div class="body">${esc(L(S.book.narration['ui.family']))}</div>${spk('ui.family')}</div>`;
  html += `<div class="chips">${S.kids.map((k) => `<button class="chip" data-kid="${k.id}" aria-pressed="${k.id === S.kid}">${esc(k.name)}</button>`).join('')}<button class="chip add" data-action="addkid">+ ${esc(T('addChild'))}</button></div>`;
  const k = S.kids.find((x) => x.id === S.kid) || S.kids[0];
  if (!k) { html += `<p class="muted center">${esc(T('noChildren'))}</p>`; return { html, nav: 'family' }; }
  S.kid = k.id;
  html += `<div class="kid"><div class="av">${esc(k.name.slice(0, 1))}</div><div style="flex:1"><div class="n">${esc(k.name)}</div><div class="m">${esc(fmtDate(k.dob))} · ${esc(T(k.sex === 'f' ? 'girl' : 'boy'))} · ${esc(ageText(k.dob))}</div></div><button class="round" data-action="editkid" aria-label="${esc(T('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button></div>`;
  const n = nextDue(k); if (n) { html += nextCard(n, false); if (!n.done) ids.push(n.visit.id); }
  if (v) {
    html += `<div class="panel"><h2>${esc(T('vaccineCard'))}</h2><p class="muted" style="margin:0 0 4px">${esc(T('tapToMark'))}</p>`;
    const dob = new Date(k.dob + 'T12:00:00');
    for (const vis of v.visits) {
      const g = k.given && k.given[vis.id]; const due = localDay(new Date(dob.getTime() + vis.ageDays * DAY));
      const isNext = n && !n.done && n.visit.id === vis.id;
      html += `<button class="vrow ${g ? 'done' : isNext ? 'due' : ''}" data-visit="${esc(vis.id)}"><span class="ck">${g ? I.check : ''}</span><span style="flex:1"><div class="a">${esc(L(vis.age))}</div><div class="d">${g ? esc(T('given')) + ' · ' + esc(fmtDate(g)) : esc(fmtDate(due))} · ${esc(vis.doses.map((d) => L(d.name)).join('، '))}</div></span></button>`;
    }
    html += `</div>`;
  }
  html += GR.familyPanel(k); // weight, length, arm tape and the latest result (js/growth.js)
  html += `<p class="muted center">${esc(L(S.book.narration['ui.family']))}</p>`;
  track('view', { p: 'family' });
  return { html, nav: 'family' };
}

function dateSelects(prefix, iso) {
  const j = toJalali(iso ? new Date(iso + 'T12:00:00') : new Date());
  const yNow = toJalali(new Date()).jy;
  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  let d = '', m = '', y = '';
  for (let i = 1; i <= 31; i++) d += opt(i, num(i), i === j.jd);
  S.book.months[S.lang].forEach((name, i) => (m += opt(i + 1, name, i + 1 === j.jm)));
  for (let i = yNow; i >= yNow - 18; i--) y += opt(i, num(i), i === j.jy);
  return `<div class="three"><select name="${prefix}d" aria-label="${esc(T('day'))}">${d}</select><select name="${prefix}m" aria-label="${esc(T('month'))}">${m}</select><select name="${prefix}y" aria-label="${esc(T('year'))}">${y}</select></div>`;
}
function readDate(form, prefix) {
  const jy = +form[prefix + 'y'].value, jm = +form[prefix + 'm'].value; let jd = +form[prefix + 'd'].value;
  jd = Math.min(jd, monthLength(jy, jm));
  const g = fromJalali(jy, jm, jd);
  return `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`;
}
function kidDialog(k) {
  const isNew = !k; k = k || { id: 'k' + Date.now().toString(36), name: '', sex: 'm', dob: todayISO(), given: {}, weights: [] };
  dialog(`<form class="form" id="kidform"><h2>${esc(isNew ? T('addChild') : T('edit'))}</h2>
    <label>${esc(T('childName'))}</label><input name="name" required maxlength="40" value="${esc(k.name)}" autocomplete="off">
    <label>${esc(T('birthDate'))}</label>${dateSelects('b', k.dob)}
    <div class="row2" style="margin-top:12px"><button type="button" class="chip" data-sex="m" aria-pressed="${k.sex !== 'f'}" style="flex:1">${esc(T('boy'))}</button><button type="button" class="chip" data-sex="f" aria-pressed="${k.sex === 'f'}" style="flex:1">${esc(T('girl'))}</button></div>
    <button class="btn" type="submit">${esc(T('save'))}</button>
    ${isNew ? '' : `<button class="btn danger" type="button" data-action="delkid">${esc(T('delete'))}</button>`}
    <button class="btn ghost" type="button" data-close>${esc(T('cancel'))}</button></form>`, (w) => {
    const f = $('#kidform', w); let sex = k.sex;
    $$('[data-sex]', w).forEach((b) => b.addEventListener('click', () => { sex = b.dataset.sex; $$('[data-sex]', w).forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    f.addEventListener('submit', (e) => {
      e.preventDefault(); const name = f.name.value.trim(); if (!name) return;
      Object.assign(k, { name, sex, dob: readDate(f, 'b') });
      if (isNew) S.kids.push(k); S.kid = k.id; saveKids(); track('kid', { n: S.kids.length }); w.remove(); render();
    });
    const del = $('[data-action=delkid]', w);
    if (del) del.addEventListener('click', () => { if (confirm(T('deleteChildQ'))) { S.kids = S.kids.filter((x) => x.id !== k.id); S.kid = S.kids[0] ? S.kids[0].id : null; saveKids(); w.remove(); render(); } });
    if (isNew) setTimeout(() => f.name.focus(), 50);
  });
}
function visitDialog(k, vis) {
  const g = k.given && k.given[vis.id];
  dialog(`<form class="form" id="vform"><h2>${esc(L(vis.age))}</h2><p class="muted">${esc(vis.doses.map((d) => L(d.name)).join('، '))}</p>
    <label>${esc(T('given'))}</label>${dateSelects('g', g || todayISO())}
    <button class="btn" type="submit">${I.check.replace('<svg', '<svg style="width:22px;height:22px"')} ${esc(T('given'))}</button>
    ${g ? `<button class="btn danger" type="button" data-action="ungive">${esc(T('notGiven'))}</button>` : ''}
    <button class="btn ghost" type="button" data-close>${esc(T('cancel'))}</button></form>`, (w) => {
    const f = $('#vform', w);
    f.addEventListener('submit', (e) => { e.preventDefault(); k.given = k.given || {}; k.given[vis.id] = readDate(f, 'g'); saveKids(); track('dose', { v: vis.id }); w.remove(); render(); });
    const u = $('[data-action=ungive]', w); if (u) u.addEventListener('click', () => { delete k.given[vis.id]; saveKids(); w.remove(); render(); });
  });
}

/* ---------- smart downloads: only the chosen voice, pack by pack, most important first ---------- */
// The app shell (code, pictures, words) is precached by the service worker; audio never is.
// After the voice step the "urgent" pack downloads quietly, then children, women, everyone (book.packs),
// two clips at a time, skipping clips already on the phone, so it resumes after a lost signal or a closed app.
// On saveData or 2G only the urgent pack downloads by itself; Settings shows the rest with a Download button.
const PACKS = ['urgent', 'children', 'women', 'everyone'];
const DL = { run: 0, active: false, slot: null, cur: null, again: false, waiting: false, full: false, retry: null, wait: 15000, have: new Set() };
const abs = (u) => new URL(u, location.href).href;
const slowNet = () => { const c = navigator.connection; return !!(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || ''))); };
function packList(slot) {
  const b = S.book, ids = (b.packs && b.packs.ids) || { everyone: b.order || Object.keys(b.narration) };
  const size = (sl, p) => (b.packs && b.packs.size && b.packs.size[sl] && b.packs.size[sl][p]) || [0, 0];
  const sib = slotsFor(slot)[1];
  return PACKS.map((p) => {
    const urls = []; let own = 0, other = 0;
    for (const id of ids[p] || []) {
      const a = clipSrc(id, slot), o = a ? null : clipSrc(id, sib);
      if (a) { urls.push(a); own++; } else if (o) { urls.push(o); other++; } // a clip missing in this voice comes from the other voice
    }
    const [b1, n1] = size(slot, p), [b2, n2] = size(sib, p);
    return { id: p, urls: [...new Set(urls)], bytes: (n1 ? (b1 / n1) * own : 0) + (n2 ? (b2 / n2) * other : 0) };
  });
}
const wantStore = () => store.get('dlWant', {});
function wanted(slot) {
  const asked = wantStore()[slot] || [];
  if (!store.get('dlAuto', true)) return new Set(asked); // after "Delete voices": only what the person asks for
  return new Set([...(slowNet() ? ['urgent'] : PACKS), ...asked]);
}
function wantPack(slot, p) { const w = wantStore(); w[slot] = [...new Set([...(w[slot] || []), p])]; store.set('dlWant', w); }
async function refreshHave() { try { const c = await caches.open(AUDIO_CACHE); DL.have = new Set((await c.keys()).map((r) => r.url)); } catch {} return DL.have; }
function stopDownloads() { DL.run++; DL.active = false; DL.cur = null; DL.waiting = false; clearTimeout(DL.retry); DL.wait = 15000; }
async function startDownloads() {
  if (!S.book || !S.lang || !S.voice || !('caches' in window)) return;
  const slot = slotOf();
  if (DL.active && DL.slot === slot) { DL.again = true; return; }
  const run = ++DL.run; Object.assign(DL, { slot, active: true, again: false, waiting: false, full: false }); clearTimeout(DL.retry);
  let failed = false, complete = true;
  try {
    const c = await caches.open(AUDIO_CACHE); await refreshHave();
    for (const pack of packList(slot)) {
      if (run !== DL.run) return;
      const todo = pack.urls.filter((u) => !DL.have.has(abs(u)));
      if (!todo.length) continue;
      if (!wanted(slot).has(pack.id)) { complete = false; continue; }
      if (!navigator.onLine) { failed = true; break; }
      DL.cur = pack.id; packsUI();
      let i = 0;
      const worker = async () => {
        while (!failed && run === DL.run && i < todo.length) {
          if (!navigator.onLine) { failed = true; break; } // signal gone: stop; the 'online' event resumes
          const u = todo[i++];
          try {
            const r = await fetch(u);
            if (r.ok) { await c.put(u, r); DL.have.add(abs(u)); DL.wait = 15000; packsUI(); }
            else { complete = false; if (r.status >= 500) failed = true; } // missing clip: skip it; server trouble: try later
          } catch (e) { failed = e && e.name === 'QuotaExceededError' ? 'full' : true; }
        }
      };
      await Promise.all([worker(), worker()]); // two at a time
      if (failed) break;
    }
    if (!failed && complete && run === DL.run) await dropOldClips(c);
  } catch { failed = failed || true; } finally {
    if (run === DL.run) {
      DL.active = false; DL.cur = null;
      if (failed === 'full') DL.full = true;
      else if (failed) { DL.waiting = true; DL.retry = setTimeout(startDownloads, DL.wait); DL.wait = Math.min(DL.wait * 2, 300000); }
      else if (DL.again) setTimeout(startDownloads, 0);
      packsUI();
    }
  }
}
// clips replaced by a newer recording (same file, new ?v=) are removed so they do not fill the phone
async function dropOldClips(c) {
  const cur = new Map();
  for (const sl of Object.keys(S.book.audio || {})) for (const u of Object.values(S.book.audio[sl])) { const a = new URL(u, location.href); cur.set(a.origin + a.pathname, a.href); }
  for (const req of await c.keys()) { const a = new URL(req.url), now = cur.get(a.origin + a.pathname); if (now && now !== a.href) { await c.delete(req); DL.have.delete(req.url); } }
}
const fmt1 = (x) => num(x >= 100 ? Math.round(x) : x.toFixed(1)).replace('.', S.lang === 'en' ? '.' : '٫');
const mbText = (bytes) => (bytes >= 1e9 ? T('gb', { n: fmt1(bytes / 1e9) }) : T('mb', { n: fmt1(Math.max(bytes, 1e5) / 1e6) }));
let packsT = 0;
function packsUI() {
  if (packsT || !document.getElementById('packs')) return;
  packsT = setTimeout(() => { packsT = 0; const el = document.getElementById('packs'); if (el) el.innerHTML = packsHtml(); }, 120);
}
function packsHtml() {
  const slot = slotOf(), want = wanted(slot);
  const name = { urgent: T('packUrgent'), children: T('children'), women: T('women'), everyone: T('everyone') };
  let h = slowNet() && store.get('dlAuto', true) ? `<p class="muted">${esc(T('slowNet'))}</p>` : '';
  for (const p of packList(slot)) {
    const total = p.urls.length, have = p.urls.filter((u) => DL.have.has(abs(u))).length, pct = total ? Math.floor((have / total) * 100) : 0;
    const done = total && have >= total; let st, btn = '';
    if (!total) st = T('noClipsYet');
    else if (done) st = T('downloaded');
    else if (DL.full) st = T('phoneFull');
    else if (DL.cur === p.id) st = `${T('downloading')} ${num(pct)}%`;
    else if (want.has(p.id) && (DL.waiting || !navigator.onLine)) st = T('waitingNet') + (have ? ` · ${num(pct)}%` : '');
    else if (want.has(p.id) && DL.active) st = T('queued');
    else st = have ? T('partDownloaded', { n: num(pct) + '%' }) : T('notDownloaded');
    if (total && !done && DL.cur !== p.id && !(want.has(p.id) && (DL.active || DL.waiting))) btn = `<button class="sbtn" data-dlpack="${p.id}">${esc(T('download'))}</button>`;
    const size = p.bytes ? ' · ' + mbText(p.bytes) : '';
    h += `<div class="srow pack" data-pack="${p.id}" data-state="${done ? 'done' : DL.cur === p.id ? 'busy' : 'todo'}">${ic(p.id === 'urgent' ? 'warning' : p.id === 'children' ? 'baby' : p.id === 'women' ? 'pregnant' : 'people')}<div class="grow"><div class="t">${esc(name[p.id])}</div><div class="s">${esc(st + size)}</div>${total && !done && (have || DL.cur === p.id) ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>${done ? `<span class="sbtn ok">${I.check.replace('<svg', '<svg style="width:18px;height:18px"')}</span>` : btn}</div>`;
  }
  return h;
}
async function storageText() {
  if (!(navigator.storage && navigator.storage.estimate)) return '';
  try { const e = await navigator.storage.estimate(); return e.quota ? T('storageInfo', { used: mbText(e.usage || 0), free: mbText(Math.max(0, e.quota - (e.usage || 0))) }) : ''; } catch { return ''; }
}
// ask the browser once to keep the book's storage (it is then less likely to clear it when the phone is full)
async function persistOnce(force) {
  if (!(navigator.storage && navigator.storage.persist) || store.get('persisted', false) || (!force && store.get('persistAsked', false))) return;
  store.set('persistAsked', true);
  try { if (await navigator.storage.persist()) store.set('persisted', true); } catch {}
}
// change language or voice: start the new voice's urgent pack, offer to delete the old voice's clips
async function setVoice(lang, voice) {
  const old = S.lang && S.voice ? slotOf() : null;
  S.lang = lang; S.voice = voice === 'm' ? 'm' : 'f'; store.set('lang', S.lang); store.set('voice', S.voice);
  const now = slotOf();
  if (old === now) return;
  track('voice', { to: now }); store.set('dlAuto', true);
  stopDownloads(); startDownloads();
  if (old) offerDeleteOld(old, now);
}
async function offerDeleteOld(old, now) {
  if (store.get('keepSlots', []).includes(old)) return;
  await refreshHave();
  const keep = new Set(packList(now).flatMap((p) => p.urls.map(abs))), urls = []; let bytes = 0;
  for (const p of packList(old)) for (const u of p.urls) { const a = abs(u); if (DL.have.has(a) && !keep.has(a)) { urls.push(a); bytes += p.urls.length ? p.bytes / p.urls.length : 0; } }
  if (!urls.length) return;
  const name = `${S.book.langNames[old.slice(0, 2)]} · ${T(old.endsWith('-m') ? 'man' : 'woman')}`;
  dialog(`<h2>${esc(T('voices'))}</h2><p style="font-size:18px">${esc(T('deleteOldVoiceQ', { name, n: bytes ? mbText(bytes) : T('clips', { n: num(urls.length) }) }))}</p>
    <button class="btn danger" data-oldvoice="delete">${esc(T('delete'))}</button><button class="btn ghost" data-close data-oldvoice="keep">${esc(T('keep'))}</button>`, (w) => {
    $('[data-oldvoice=delete]', w).addEventListener('click', async () => {
      w.remove();
      try { const c = await caches.open(AUDIO_CACHE); for (const u of urls) { await c.delete(u); DL.have.delete(u); } } catch {}
      packsUI(); showStorage();
    });
    $('[data-oldvoice=keep]', w).addEventListener('click', () => store.set('keepSlots', [...new Set([...store.get('keepSlots', []), old])]));
  });
}
async function deleteVoices() {
  if (!confirm(T('deleteVoicesQ'))) return;
  stopDownloads(); store.set('dlAuto', false); store.set('dlWant', {}); store.set('keepSlots', []);
  try { await caches.delete(AUDIO_CACHE); } catch {}
  DL.have = new Set(); render();
}
async function showStorage() { const t = await storageText(); const el = $('#storage'); if (el) el.textContent = t; }
function screenSettings() {
  const ids = ['ui.settings', SH.homeSay(), 'ui.watch', 'ui.disclaimer'];
  let html = top(T('settings')) + listenBar(ids);
  html += `<div class="blk lead" data-block="ui.settings"><div class="body">${esc(L(S.book.narration['ui.settings']))}</div>${spk('ui.settings')}</div>`;
  html += `<div class="panel">`;
  html += `<div class="srow">${ic('talk')}<div class="grow"><div class="t">${esc(T('language'))}</div></div><div class="seg">${['fa', 'ps', 'en'].map((lg) => `<button data-lang="${lg}" aria-pressed="${S.lang === lg}">${esc(S.book.langNames[lg])}</button>`).join('')}</div></div>`;
  html += `<div class="srow">${ic('clock')}<div class="grow"><div class="t">${esc(T('speed'))}</div></div><div class="seg"><button data-speed="1" aria-pressed="${S.speed === 1}">${esc(T('normal'))}</button><button data-speed="0.85" aria-pressed="${S.speed !== 1}">${esc(T('slower'))}</button></div></div>`;
  html += `</div><div class="panel" id="voicepanel"><h2>${esc(T('voices'))}</h2>${voiceCards('data-voice')}<div id="packs">${packsHtml()}</div>`;
  html += `<div class="srow">${ic('no')}<button class="grow" data-action="delvoices" style="text-align:start"><div class="t">${esc(T('deleteVoices'))}</div><div class="s">${esc(T('deleteVoicesSub'))}</div></button></div><p class="muted" id="storage"></p>`;
  html += `</div><div class="panel">`;
  html += `<div class="srow">${ic('check')}<div class="grow"><div class="t" id="upd-t">${esc(T('upToDate'))}</div><div class="s">${esc(T('version'))} ${esc(S.book.version)}${S.book.edition ? ' · ' + esc(S.book.edition) : ''} · ${esc(T('offline'))}</div></div><button class="sbtn" data-action="checkupd">${esc(T('checkUpdates'))}</button></div>`;
  html += SH.settingsRow(); // Share Sehat (js/share.js): the app file, the link, the QR code
  html += `<div class="srow">${ic('card')}<div class="grow"><div class="t">${esc(T('usageStats'))}</div><div class="s">${esc(T('usageStatsSub'))}</div></div><button class="toggle" data-action="stats" aria-pressed="${S.stats}" aria-label="${esc(T('usageStats'))}"></button></div>`;
  html += `<a class="srow" href="#/privacy">${ic('check')}<div class="grow"><div class="t">${esc(T('privacy'))}</div><div class="s">${esc(T('privacySub'))}</div></div>${I.fwd.replace('<svg', '<svg style="width:20px;height:20px;color:#6B655E"')}</a>`;
  if (SV()) {
    html += `<div class="srow watch" data-block="ui.watch">${ic('people')}<div class="grow"><div class="t">${esc(T('watch'))}</div><div class="s">${esc(L(S.book.narration['ui.watch']))}</div>${S.stats ? '' : `<div class="s warnline">${esc(T('watchNeedsStats'))}</div>`}</div>${spk('ui.watch')}<button class="toggle" data-action="watch" aria-pressed="${watching()}" aria-label="${esc(T('watch'))}"${S.stats ? '' : ' disabled'}></button></div>`;
    if (watching() || S.stats) { const d = store.get('district', null); html += `<div class="srow">${ic('house')}<div class="grow"><div class="t">${esc(T('myDistrict'))}</div><div class="s" id="mydistrict">${esc(d ? placeName(d) : T('notChosen'))}</div></div><button class="sbtn" data-action="district">${esc(T('change'))}</button></div>`; }
  }
  html += `<a class="srow" href="#/studio">${ic('talk')}<div class="grow"><div class="t">${esc(T('recordMode'))}</div><div class="s">${esc(T('recordModeSub'))}</div></div>${I.fwd.replace('<svg', '<svg style="width:20px;height:20px;color:#6B655E"')}</a>`;
  html += `</div>` + disclaimer();
  html += `<p class="muted center" dir="ltr">Sehat · ${esc(S.book.version)}${S.book.edition ? ' · ' + esc(S.book.edition) : ''}<br>Content based on WHO guidance (IMCI, PCPNC, Facts for Life). Draft for review. Icons: Health Icons (MIT). Font: Noto Naskh Arabic (OFL).</p>`;
  setTimeout(async () => { await refreshHave(); packsUI(); showStorage(); }, 0);
  return { html, nav: 'settings', adult: true };
}

/* ---------- recording mode (for the people who record narration) ---------- */
// the reader picks the slot they record: their language and their voice (woman or man)
const ST = { slot: store.get('studioSlot', null) || (store.get('studioLang', null) ? store.get('studioLang', null) + '-f' : null), i: store.get('studioI', 0), rec: null, chunks: [], on: false, stream: null };
function screenStudio() {
  ST.slot = ST.slot || slotOf(S.lang === 'en' ? 'fa' : S.lang, S.voice);
  const lg = ST.slot.slice(0, 2);
  const order = S.book.order; ST.i = Math.min(Math.max(ST.i, 0), order.length - 1);
  const id = order[ST.i]; const L2 = S.book.narration[id] || {};
  const done = order.filter((k) => REC.has(ST.slot + '/' + k)).length;
  const topicId = id.split('.')[0]; const tt = S.book.topics[topicId];
  const where = id.startsWith('ui.') ? T('appName') : tt ? L(tt.title) : '';
  let html = top(T('studioTitle'), { back: '#/settings' });
  html += `<div class="studio-slots">${['fa-f', 'fa-m', 'ps-f', 'ps-m'].map((sl) => `<button data-studioslot="${sl}" aria-pressed="${ST.slot === sl}">${sl.endsWith('m') ? I.man : I.woman}<span>${esc(S.book.langNames[sl.slice(0, 2)])} · ${esc(T(sl.endsWith('m') ? 'man' : 'woman'))}</span></button>`).join('')}</div>`;
  html += `<p class="muted">${esc(T('studioHelp'))}</p>`;
  html += `<div class="studio-meta"><span>${esc(T('recordedOf', { a: num(done), b: num(order.length) }))}</span><span dir="ltr">${ST.i + 1} / ${order.length} · ${esc(id)}</span></div><div class="bar"><i style="width:${(done / order.length) * 100}%"></i></div>`;
  html += `<div class="muted">${esc(where)} · ${esc(T('studioReadThis'))}</div>`;
  html += `<div class="studio-text" dir="${lg === 'en' ? 'ltr' : 'rtl'}" lang="${lg}">${esc(L2[lg] || '')}</div>`;
  html += `<p class="muted" dir="ltr" style="margin-top:-4px">${esc(L2.en || '')}</p>`;
  html += `<div class="studio-ctl"><button class="round" data-action="sprev" aria-label="${esc(T('previous'))}">${I.back}</button><button class="recbig${ST.on ? ' on' : ''}" data-action="srec" aria-label="${esc(T('record'))}">${ST.on ? I.stop.replace('<svg', '<svg fill="#fff"') : I.mic}</button><button class="round" data-action="snext" aria-label="${esc(T('next'))}">${I.fwd}</button></div>`;
  html += `<p class="center" style="margin:6px 0">${ST.on ? esc(T('recording')) : REC.has(ST.slot + '/' + id) ? `<button class="sbtn" data-action="splay">${esc(T('play'))} ▶</button>` : ''}</p>`;
  html += `<button class="btn" data-action="sexport">${esc(T('exportRec'))}</button><p class="muted center">${esc(T('exportRecSub'))}</p>`;
  return { html, nav: false, adult: true };
}
async function studioRecord() {
  if (ST.on) { ST.rec && ST.rec.state !== 'inactive' && ST.rec.stop(); return; }
  try { ST.stream = ST.stream || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })); }
  catch { toast(T('micDenied')); return; }
  const id = S.book.order[ST.i];
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', ''].find((t) => !t || (window.MediaRecorder && MediaRecorder.isTypeSupported(t)));
  ST.chunks = []; ST.rec = new MediaRecorder(ST.stream, type ? { mimeType: type } : undefined);
  ST.rec.ondataavailable = (e) => e.data.size && ST.chunks.push(e.data);
  ST.rec.onstop = async () => {
    ST.on = false; const blob = new Blob(ST.chunks, { type: ST.rec.mimeType || 'audio/webm' });
    if (blob.size > 1500) await REC.put(ST.slot + '/' + id, { blob, type: blob.type, ts: Date.now() });
    render();
  };
  ST.rec.start(); ST.on = true; render();
}
async function studioExport() {
  const files = [], manifest = [];
  // zip folders are the slots: fa-f/<id>.webm, ps-m/<id>.m4a … (tools/import_recordings.py reads the voice from them)
  for (const k of [...REC.keys].filter((k) => /^(fa|ps|en)-[fm]\//.test(k)).sort()) {
    const r = await REC.get(k); if (!r) continue;
    const ext = /mp4|aac|m4a/.test(r.type) ? 'm4a' : /ogg/.test(r.type) ? 'ogg' : 'webm';
    files.push({ name: `${k}.${ext}`, data: new Uint8Array(await r.blob.arrayBuffer()) }); manifest.push({ key: k, type: r.type, ts: r.ts });
  }
  if (!files.length) { toast(T('noClipsYet')); return; }
  files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify({ app: 'family-health-book', version: S.book.version, layout: 'slots', clips: manifest }, null, 1)) });
  const name = `recordings-${new Date().toISOString().slice(0, 10)}.zip`;
  const file = new File([makeZip(files)], name, { type: 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch {} }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- symptom finder ("say what is wrong") ---------- */
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ٰٟ‌‍ـ]/g, '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ۀ/g, 'ه')
  .replace(/[۰-۹]/g, (d) => DIG.indexOf(d)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function findSymptoms(q) {
  const nq = ' ' + norm(q) + ' ';
  if (nq.trim().length < 2) return { syms: [], blocks: [] };
  const scored = [];
  for (const s of S.book.symptoms || []) {
    let score = 0;
    for (const lg of ['fa', 'ps', 'en']) for (const w of s.words[lg] || []) {
      const nw = norm(w); if (!nw) continue;
      if (nq.includes(' ' + nw + ' ')) score += 3 + nw.length / 4; else if (nw.length >= 3 && nq.includes(nw)) score += 2;
    }
    if (score) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // also search every narrated text in the current language (block-level hits)
  const words = nq.trim().split(' ').filter((w) => w.length >= 3);
  const blocks = [];
  if (words.length) for (const [id, Lx] of Object.entries(S.book.narration)) {
    if (id.startsWith('ui.')) continue;
    const txt = ' ' + norm(Lx[S.lang] || '') + ' ' + norm(Lx.en) + ' ';
    const hits = words.filter((w) => txt.includes(w)).length;
    if (hits) blocks.push({ id, hits: hits / words.length });
  }
  blocks.sort((a, b) => b.hits - a.hits);
  return { syms: scored.map((x) => x.s), blocks: blocks.filter((b) => b.hits >= 0.5).slice(0, 8) };
}
const ASK = { q: '', rec: null };
function screenAsk() {
  const ids = ['ui.ask'];
  let html = top(T('ask')) + listenBar(ids);
  html += `<div class="blk lead" data-block="ui.ask"><div class="body">${esc(L(S.book.narration['ui.ask']))}</div>${spk('ui.ask')}</div>`;
  const canMic = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  html += `<form class="askbox" id="askform"><input id="askq" value="${esc(ASK.q)}" placeholder="${esc(T('askPlaceholder'))}" autocomplete="off" enterkeyhint="search">${canMic ? `<button type="button" class="mic" data-action="mic" aria-label="${esc(T('ask'))}">${I.mic}</button>` : ''}</form>`;
  html += `<div id="askres">${askResults()}</div>`;
  html += `<h2 class="sub-h">${esc(T('orPick'))}</h2><div class="symgrid">${(S.book.symptoms || []).map((s) => `<button class="sym" data-sym="${esc(s.id)}">${ic(s.icon)}<span>${esc(L(s.label))}</span></button>`).join('')}</div>`;
  return { html, nav: 'home' };
}
function askResults(symId, live) {
  let syms = [], blocks = [];
  if (symId) syms = (S.book.symptoms || []).filter((s) => s.id === symId);
  else if (ASK.q) {
    // typed or said: js/search.js ranks the pages (live while typing). The disease-watch signal and report cards
    // still come from the symptom list, and only once the search is sent.
    if (live) return FD.results(ASK.q, true);
    const top3 = findSymptoms(ASK.q).syms.slice(0, 3).map((s) => s.id);
    svSignal(top3);
    return FD.results(ASK.q) + reportCards(svFor('symptoms', top3)).html;
  }
  else return '';
  const topicsSeen = new Set(); let out = '';
  for (const s of syms.slice(0, 3)) {
    if (s.note) out += `<div class="blk tip"><div class="body">${esc(L(s.note))}</div></div>`;
    for (const tid of s.go) { if (topicsSeen.has(tid)) continue; topicsSeen.add(tid); out += resultCard(tid); }
  }
  for (const b of blocks) {
    const tid = b.id.split('.')[0]; const t = S.book.topics[tid]; if (!t) continue;
    const txt = L(S.book.narration[b.id]);
    out += `<a class="hit" href="#/topic/${tid}/${encodeURIComponent(b.id)}"><span class="ht">${esc(L(t.title))}</span><span class="hx">${esc(txt.length > 110 ? txt.slice(0, 110) + '…' : txt)}</span></a>`;
  }
  const top3 = syms.slice(0, 3).map((s) => s.id);
  svSignal(top3);
  if (out) out += reportCards(svFor('symptoms', top3)).html;
  return out ? `<h2 class="sub-h">${esc(T('results'))}</h2>${out}` : `<div class="blk tip"><div class="body">${esc(T('noResults'))}</div></div>`;
}
function resultCard(tid) {
  const t = S.book.topics[tid]; if (!t) return '';
  return `<div class="rcard${isAdultTopic(t) ? ' adult' : ''}"><a href="#/topic/${tid}" class="rimg" tabindex="-1" aria-hidden="true"><img src="${esc(t.image)}" alt=""></a><a href="#/topic/${tid}" class="rt"><b>${esc(L(t.title))}</b><span>${esc(L(t.summary))}</span></a>${spk(tid + '.title')}</div>`;
}
async function startMic(btn) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return;
  if (!navigator.onLine) { toast(T('micOffline')); return; }
  // speaking uses the phone's internet speech service (the voice goes to Google): say so once, before the first use
  if (!store.get('micOk', false)) {
    const ok = await choose(`<h2>${esc(T('ask'))}</h2>${sayRow('ui.micNotice', 'dq')}<div class="places one"><button data-pick="yes">${esc(T('micUse'))}</button></div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`);
    if (ok !== 'yes') return;
    store.set('micOk', true);
  }
  const r = new R(); r.lang = { fa: 'fa-IR', ps: 'ps-AF', en: 'en-GB' }[S.lang] || 'fa-IR'; r.interimResults = true; r.maxAlternatives = 3;
  btn.classList.add('on'); toast(T('listening'));
  r.onresult = (e) => { const txt = [...e.results].map((x) => x[0].transcript).join(' '); $('#askq').value = txt; if (e.results[e.results.length - 1].isFinal) { ASK.q = txt; $('#askres').innerHTML = askResults(); } };
  r.onerror = () => { btn.classList.remove('on'); toast(T('micOffline')); };
  r.onend = () => btn.classList.remove('on');
  r.start();
}

/* ---------- feedback: a voice note or a written note, sent when online ---------- */
const FB = { rec: null, chunks: [], blob: null, on: false, stream: null };
function screenFeedback() {
  const ids = ['ui.feedback'];
  let html = top(T('feedback')) + listenBar(ids);
  html += `<div class="blk lead" data-block="ui.feedback"><div class="body">${esc(L(S.book.narration['ui.feedback']))}</div>${spk('ui.feedback')}</div>`;
  html += `<div class="center"><button class="recbig${FB.on ? ' on' : ''}" data-action="fbrec" aria-label="${esc(T('fbRecord'))}">${FB.on ? I.stop.replace('<svg', '<svg fill="#fff"') : I.mic}</button><div class="muted">${FB.on ? esc(T('recording')) : FB.blob ? esc(T('fbRecorded')) + ' ✓' : esc(T('fbRecord'))}</div>${FB.blob && !FB.on ? `<button class="sbtn" data-action="fbplay" style="margin-top:6px">${esc(T('play'))} ▶</button>` : ''}</div>`;
  html += `<form class="form" id="fbform"><label for="fbtext">${esc(T('fbWrite'))}</label><p class="muted warnline fbwarn" id="fbwarn">${esc(T('fbNoNames'))}</p><textarea name="text" id="fbtext" aria-describedby="fbwarn" rows="4" maxlength="2000" style="font:inherit;font-size:18px;width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:14px"></textarea><button class="btn" type="submit">${esc(T('fbSend'))}</button></form>`;
  return { html, nav: 'home' };
}
async function fbRecord() {
  if (FB.on) { FB.rec && FB.rec.state !== 'inactive' && FB.rec.stop(); return; }
  if (!FB.asked) { if (!(await Stats.askVoice())) return; FB.asked = true; } // ask before recording: sent, not linked to anyone, deleted after 90 days
  try { FB.stream = FB.stream || (await navigator.mediaDevices.getUserMedia({ audio: true })); } catch { toast(T('micDenied')); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', ''].find((t) => !t || (window.MediaRecorder && MediaRecorder.isTypeSupported(t)));
  FB.chunks = []; FB.rec = new MediaRecorder(FB.stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined);
  FB.rec.ondataavailable = (e) => e.data.size && FB.chunks.push(e.data);
  FB.rec.onstop = () => { FB.on = false; FB.blob = new Blob(FB.chunks, { type: FB.rec.mimeType || 'audio/webm' }); render(); };
  FB.rec.start(); FB.on = true; setTimeout(() => FB.on && FB.rec.stop(), 120000); render();
}
async function fbSubmit(text) {
  if (!text && !FB.blob) return;
  const item = { ts: Date.now(), lang: S.lang, text: Stats.cleanText(text || ''), page: lastPage, blob: FB.blob || null, type: FB.blob ? FB.blob.type : '' };
  await REC.put('fb/' + item.ts, item);
  FB.blob = null; track('feedback', { p: item.blob ? 'voice' : 'text' });
  toast(T('fbThanks')); location.hash = '#/home'; sendFeedback();
}
async function sendFeedback() {
  const url = S.book.config && S.book.config.feedbackUrl; if (!url || !navigator.onLine) return;
  for (const k of [...REC.keys].filter((k) => k.startsWith('fb/'))) {
    const it = await REC.get(k); if (!it) continue;
    let audio = '';
    if (it.blob) { const buf = new Uint8Array(await it.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); audio = btoa(s); }
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ v: S.book.version, lang: it.lang, ts: it.ts, text: Stats.cleanText(it.text), page: it.page, type: it.type, audio }) });
      if (r.ok || r.status === 400) await REC.del(k); // 400: the server cannot use it (for example an empty note), so it is not kept
    } catch { return; }
  }
}

/* ---------- nearest clinics (GPS, works offline with the built-in list) ---------- */
const NEAR = { pos: store.get('lastPos', null), busy: false };
function distKm(a, b) {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function screenNear() {
  const ids = ['ui.near'];
  const list = ((S.book.facilities && S.book.facilities.facilities) || []).filter((f) => f.status !== 'closed');
  let html = top(T('near')) + listenBar(ids);
  html += `<div class="blk lead" data-block="ui.near"><div class="body">${esc(L(S.book.narration['ui.near']))}</div>${spk('ui.near')}</div>`;
  html += `<button class="btn" data-action="locate">${ic('house')} ${esc(NEAR.busy ? T('locating') : T('findMe'))}</button>`;
  if (!list.length) { html += `<p class="muted center">${esc(T('noFacilities'))}</p>`; return { html, nav: 'home' }; }
  const me = NEAR.pos;
  const rows = list.map((f) => ({ f, d: me ? distKm(me, f) : null, b: me ? bearing(me, f) : 0 })).sort((a, b) => (a.d || 0) - (b.d || 0));
  // hospitals and maternity first, whatever the distance; then the nearest other clinics and doctors
  const isMain = (f) => /hospital|maternity|chc|bhc/.test(f.type || '');
  const main = rows.filter((r) => isMain(r.f)).slice(0, 6), other = rows.filter((r) => !isMain(r.f)).slice(0, 12);
  const shown = [...main, ...other];
  if (me) html += nearMap(me, shown.slice(0, 3).concat(other.slice(0, 5)).filter((r, i, a) => a.indexOf(r) === i), shown);
  const card = (r) => { const { f, d, b } = r, n = shown.indexOf(r) + 1;
    const svc = (f.services || []).map((s) => `<span class="svc">${esc(T('svc_' + s))}</span>`).join('');
    return `<div class="fac"><div class="fh"><b>${me ? `<span class="facn${isMain(f) ? ' h' : ''}">${num(n)}</span> ` : ''}${esc(L(f.name))}</b>${d != null ? `<span class="dist"><svg viewBox="0 0 24 24" style="transform:rotate(${Math.round(b)}deg)" aria-hidden="true"><path d="M12 2 19 21 12 17 5 21z" fill="currentColor"/></svg>${esc(T('km', { n: num(d < 10 ? d.toFixed(1) : Math.round(d)) }))}</span>` : ''}</div>
      <div class="muted">${esc(T('ft_' + (f.type || 'other')))}${f.district ? ' · ' + esc(f.district) : ''}</div><div class="svcs">${svc}</div>
      <div class="row2">${f.phone ? `<a class="sbtn" href="tel:${esc(f.phone)}">${ic('phone')} ${esc(f.phone)}</a>` : ''}<a class="sbtn" href="https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}" target="_blank" rel="noopener">${esc(T('directions'))}</a></div></div>`; };
  if (main.length) html += `<div class="group-h"><span class="t">${esc(T('nearHospitals'))}</span><span class="ln"></span></div>` + main.map(card).join('');
  if (other.length) html += `<div class="group-h"><span class="t">${esc(T('nearOther'))}</span><span class="ln"></span></div>` + other.map(card).join('');
  html += `<p class="muted center">${esc(T('nearIncomplete'))}</p><p class="muted center" style="font-size:13px" dir="ltr">${esc(T('mapCredit'))}</p>`;
  return { html, nav: 'home' };
}
function nearMap(me, rows, shown) {
  // a simple offline map: you in the middle, clinics placed by direction and distance (square-root scale so near and far both fit)
  const maxD = Math.max(1, ...rows.map((r) => r.d)); const W = 320, C = W / 2, R = C - 22;
  const dots = rows.map((r) => { const i = shown.indexOf(r); const a = (r.b - 90) * Math.PI / 180, k = Math.sqrt(r.d / maxD) * R; return `<g><circle cx="${C + Math.cos(a) * k}" cy="${C + Math.sin(a) * k}" r="9" fill="${/hospital|maternity|chc|bhc/.test(r.f.type || '') ? '#B6322D' : '#1F6F7A'}"/><text x="${C + Math.cos(a) * k}" y="${C + Math.sin(a) * k + 4}" text-anchor="middle" font-size="10" fill="#fff" font-family="sans-serif">${num(i + 1)}</text></g>`; }).join('');
  return `<svg class="nearmap" viewBox="0 0 ${W} ${W}" aria-hidden="true"><circle cx="${C}" cy="${C}" r="${R}" fill="#EAF3F4" stroke="#BFCBC9"/><circle cx="${C}" cy="${C}" r="${R / 2}" fill="none" stroke="#BFCBC9" stroke-dasharray="4 4"/><text x="${C}" y="14" text-anchor="middle" font-size="12" fill="#6B655E" font-family="sans-serif">N</text>${dots}<circle cx="${C}" cy="${C}" r="8" fill="#22201D" stroke="#fff" stroke-width="3"/></svg>`;
}
function locate() {
  if (!navigator.geolocation) { toast(T('locFail')); return; }
  NEAR.busy = true; render();
  navigator.geolocation.getCurrentPosition((p) => { NEAR.pos = { lat: p.coords.latitude, lon: p.coords.longitude }; store.set('lastPos', NEAR.pos); NEAR.busy = false; track('near'); render(); },
    () => { NEAR.busy = false; toast(T('locFail')); render(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 600000 });
}
let lastPage = 'home';

/* ---------- tools: breathing counter, reading checker, home health kit (js/tools.js) ---------- */
const TL = initTools({ S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, hasAudio, ttsVoice, track, listenBar, disclaimer, topicCard, render: () => render() });
const FD = initFinder({ S, esc, T, L, ic, I, spk, isAdultTopic });
const GR = initGrowth({ S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, hasAudio, ttsVoice, track, listenBar, disclaimer, top, toast, store, dateSelects, readDate, fmtDate, todayISO, ageText, saveKids, topicCard, render: () => render() });
const SH = initShare({ S, esc, T, L, num, ic, I, spk, track, listenBar, disclaimer, top, toast, platform, mbText });

/* ---------- router & rendering ---------- */
function route() { return (location.hash || '#/home').slice(2).split('/'); }
function render() {
  const app = $('#app');
  if (!S.book) return;
  document.documentElement.lang = S.lang || 'fa';
  document.documentElement.dir = RTL(S.lang || 'fa') ? 'rtl' : 'ltr';
  let r = route(), out;
  try { // a broken link or page must never leave the app stuck on the loading screen
  if (!S.lang) out = screenWelcome();
  else if (!S.voice) out = screenVoice();
  else if (r[0] !== 'privacy' && Stats.showConsent()) out = Stats.screenConsent();
  else if (r[0] === 'privacy') out = Stats.screenPrivacy();
  else if (r[0] === 'topic') out = screenTopic(r[1]);
  else if (r[0] === 'children') out = screenChildren();
  else if (r[0] === 'adults') out = screenAdults();
  else if (r[0] === 'family') out = screenFamily();
  else if (r[0] === 'settings') out = screenSettings();
  else if (r[0] === 'studio') out = screenStudio();
  else if (r[0] === 'ask') out = screenAsk();
  else if (r[0] === 'feedback') out = screenFeedback();
  else if (r[0] === 'near') out = screenNear();
  else if (r[0] === 'kit') out = TL.screenKit();
  else if (r[0] === 'emergency') out = screenEmergency(r[1]);
  else if (r[0] === 'tool') out = TL.screenTool(r[1], r[2]) || screenHome();
  else if (r[0] === 'growth') out = GR.screen(r[1]);
  else if (r[0] === 'share') out = SH.screen();
  else out = screenHome();
  } catch (err) { if (r[0] === 'home') throw err; r = ['home']; out = screenHome(); }
  app.innerHTML = `<main class="page${out.adult ? ' adult' : ''}">${out.html}</main>${out.nav ? nav(out.nav) : ''}`;
  if (P.on) updateListenBar();
  lastPage = r.join('/') || 'home';
  Stats.page(!S.lang ? ['welcome'] : !S.voice ? ['voice'] : r[0] !== 'privacy' && Stats.showConsent() ? ['consent'] : r);
  if (r[0] === 'topic' && r[2]) setTimeout(() => { const el = document.querySelector(`[data-block="${CSS.escape(decodeURIComponent(r[2]))}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('speaking'); setTimeout(() => el.classList.remove('speaking'), 2500); } }, 60);
  const af = $('#askform'); if (af) af.addEventListener('submit', (e) => { e.preventDefault(); ASK.q = $('#askq').value; $('#askres').innerHTML = askResults(); $('#askq').blur(); });
  // live results while typing; the cards are redrawn only when they change (fast on slow phones)
  if (af) { $('#askq').addEventListener('input', (e) => { ASK.q = e.target.value; FD.show($('#askres'), askResults(null, true)); }); setTimeout(FD.warm, 30); }
  const ff = $('#fbform'); if (ff) ff.addEventListener('submit', (e) => { e.preventDefault(); fbSubmit(ff.text.value.trim()); });
  fillPosters();
}
let lastHash = location.hash;
addEventListener('hashchange', () => {
  if (AN.ctl && AN.ctl.close) AN.ctl.close(); // leaving the page closes the animation player too
  // a page opened from the Emergency screen goes back there
  const now = location.hash.split('/');
  if (now[1] === 'topic') { if (lastHash.startsWith('#/emergency')) EM.back = lastHash; } else EM.back = null;
  stopAudio(); render();
  const r = route(); if (r[0] !== 'topic' && r[0] !== 'family') track('view', { p: r[0] || 'home' });
  if (location.hash.split('/')[1] !== lastHash.split('/')[1] || location.hash !== lastHash) scrollTo(0, 0);
  lastHash = location.hash;
});

/* ---------- one click handler for everything ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, [data-block]'); if (!t) return;
  const d = t.dataset;
  if (d.say) { e.preventDefault(); if (P.on && P.ids.length === 1 && P.ids[0] === d.say) stopAudio(); else play([d.say]); return; }
  if (d.sayLang) { e.preventDefault(); const prev = S.lang; S.lang = d.sayLang; play(['ui.welcome'], { slot: slotOf(d.sayLang) }); S.lang = prev; return; }
  if (d.sample) { e.preventDefault(); const sl = slotOf(S.lang, d.sample); if (P.on && P.strict && P.slot === sl) stopAudio(); else play([sampleId(sl)], { slot: sl, strict: true }); return; }
  if (d.setlang) {
    stopAudio(); track('lang', { to: d.setlang });
    if (S.voice) setVoice(d.setlang, S.voice); else { S.lang = d.setlang; store.set('lang', S.lang); }
    location.hash = '#/home'; render(); return;
  }
  if (d.setvoice) { stopAudio(); await setVoice(S.lang, d.setvoice); persistOnce(); location.hash = '#/home'; render(); return; }
  if (d.voice) { stopAudio(); await setVoice(S.lang, d.voice); render(); return; }
  if (d.lang) { stopAudio(); await setVoice(d.lang, S.voice); render(); return; }
  if (d.speed) { S.speed = +d.speed; store.set('speed', S.speed); render(); return; }
  if (d.kid) { S.kid = d.kid; saveKids(); render(); return; }
  if (d.visit) { const k = S.kids.find((x) => x.id === S.kid); const vis = S.book.topics.vaccines.visits.find((x) => x.id === d.visit); if (k && vis) visitDialog(k, vis); return; }
  if (d.dlpack) { if (!navigator.onLine) { toast(T('offlineNow')); return; } wantPack(slotOf(), d.dlpack); persistOnce(); t.disabled = true; t.textContent = T('downloading'); DL.full = false; startDownloads(); return; }
  if (d.rep) {
    const card = t.closest('.report');
    if (d.rep === 'no') { const no = store.get('svNo', {}); no[d.syn] = Date.now(); store.set('svNo', no); if (card) card.remove(); toast(T('thanks')); }
    else svYes(d.syn, card);
    return;
  }
  if (d.sym) { ASK.q = ''; const q = $('#askq'); if (q) q.value = ''; $('#askres').innerHTML = askResults(d.sym); $('#askres').scrollIntoView({ behavior: 'smooth' }); return; }
  if (d.studioslot) { ST.slot = d.studioslot; store.set('studioSlot', ST.slot); render(); return; }
  switch (d.action) {
    case 'listen': if (P.on && P.ids.length > 1) stopAudio(); else play(S.queueIds); return;
    case 'addkid': kidDialog(null); return;
    case 'editkid': kidDialog(S.kids.find((x) => x.id === S.kid)); return;
    case 'addweight': location.hash = '#/growth/add'; return;
    case 'install': doInstall(); return;
    case 'sendapp': case 'share': location.hash = '#/share'; return; // one sharing feature: the Share Sehat screen (js/share.js)
    case 'stats': S.stats = !S.stats; if (!S.stats) { A.rq = []; store.set('rq', []); } render(); return;
    case 'watch': if (!S.stats) return; S.watch = !S.watch; store.set('watch', S.watch); if (!S.watch) { A.rq = []; store.set('rq', []); } render(); return;
    case 'district': if (await svPickDistrict(true)) render(); return;
    case 'checkupd': checkUpdate(true); return;
    case 'srec': studioRecord(); return;
    case 'snext': ST.i++; store.set('studioI', ST.i); render(); return;
    case 'sprev': ST.i--; store.set('studioI', ST.i); render(); return;
    case 'splay': { const r = await REC.get(ST.slot + '/' + S.book.order[ST.i]); if (r) { P.audio.src = URL.createObjectURL(r.blob); P.audio.play(); } return; }
    case 'sexport': studioExport(); return;
    case 'mic': startMic(t); return;
    case 'fbrec': fbRecord(); return;
    case 'fbplay': if (FB.blob) { P.audio.src = URL.createObjectURL(FB.blob); P.audio.play(); } return;
    case 'locate': locate(); return;
    case 'relang': stopAudio(); S.lang = null; store.set('lang', null); render(); return;
    case 'delvoices': deleteVoices(); return;
    case 'anim': e.preventDefault(); openAnim(d.anim, d.variant); return;
    case 'emergency': EM.speak = true; return; // the link opens #/emergency, which reads ui.emergency aloud
  }
  // tapping the text of a block also reads it
  if (t.matches('[data-block]') && !e.target.closest('a,button')) play([t.dataset.block]);
});

/* ---------- install, share, updates ---------- */
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (route()[0] === 'home' || !location.hash) render(); });
addEventListener('appinstalled', () => { S.installEvt = null; track('a2hs'); persistOnce(true); render(); });
async function doInstall() {
  if (S.installEvt) { S.installEvt.prompt(); const c = await S.installEvt.userChoice; track('a2hs-prompt', { ok: c.outcome }); S.installEvt = null; render(); return; }
  dialog(`<h2>${esc(T('install'))}</h2><p style="font-size:18px">${esc(T('installIos'))}</p><button class="btn" data-close>${esc(T('close'))}</button>`);
}
async function checkUpdate(manual) {
  if (!navigator.onLine) { if (manual) toast(T('offlineNow')); return; }
  let msg = null;
  try {
    if (S.swReg) await S.swReg.update();
    const r = await fetch('content/version.json', { cache: 'no-store' }); const v = await r.json();
    /* a new app version: the new service worker is installing; we reload when it takes over */
    msg = v.version && v.version !== S.shipped.version ? 'downloading' : 'upToDate';
  } catch {}
  if (contentUrl()) { try { if (await remoteUpdate()) msg = 'updated'; else msg = msg || 'upToDate'; } catch {} }
  if (manual) toast(T(msg || 'offlineNow'));
}

/* ---------- content published from the dashboard editor (config.contentUrl) ---------- */
// The editor publishes an "overlay": only the parts it changed, each with a fingerprint of the app text it started
// from and the time it was saved (js/overlay.js, docs/EDITOR_AND_RELEASES.md). The phone keeps the overlay in Cache
// Storage and lays it over the book that came with the app, every time the app starts, also offline. So a new app
// release keeps the editor's changes, and a publish does not undo the release's own fixes.
const RB = { cache: 'fhb-content', key: 'content/overlay.json', old: 'content/remote-book.json' };
const contentUrl = () => String((S.shipped && S.shipped.config && S.shipped.config.contentUrl) || '').trim().replace(/\/+$/, '');
const goodOverlay = (o) => !!o && o.format === OV_FORMAT && typeof o.version === 'string' && Array.isArray(o.units);
function goodBook(b) {
  try {
    if (!b || typeof b.version !== 'string' || isNaN(Date.parse(b.built))) return false;
    if (!b.topics || !b.narration || !b.ui || !b.audio || !b.config || !Array.isArray(b.order) || !b.months || !b.langNames) return false;
    for (const sec of ['children', 'women', 'everyone']) if (!Array.isArray(b.sections[sec]) || !b.sections[sec].every((t) => b.topics[t])) return false;
    for (const [tid, t] of Object.entries(b.topics)) {
      if (!t || !t.title) return false;
      if (tid === 'vaccines') { if (!Array.isArray(t.visits) || !t.lead) return false; continue; }
      if (!Array.isArray(t.blocks) || !t.blocks.every((x) => x && x.id && x.type && (!(x.type === 'alert' || x.type === 'dont') || Array.isArray(x.items)))) return false;
    }
    return true;
  } catch { return false; }
}
// addresses (stats, feedback, share, contentUrl) always come from the app itself, not from the downloaded book
// book.audio is keyed by slot ("fa-f"); a book from before voices (keyed "fa") counts as the woman's voice
function normBook(b) {
  const a = b.audio && typeof b.audio === 'object' ? b.audio : {};
  for (const lg of ['fa', 'ps', 'en']) if (a[lg] && typeof a[lg] === 'object') { a[lg + '-f'] = { ...a[lg], ...(a[lg + '-f'] || {}) }; delete a[lg]; }
  b.audio = a; return b;
}
// the shipped book with the overlay laid over it; false (and the book unchanged) when the result would not work
function useOverlay(ov) {
  if (!goodOverlay(ov)) return false;
  let b;
  try { b = normBook(applyOverlay(S.shippedBook, ov).book); } catch { return false; }
  if (!goodBook(b)) return false;
  const c = { ...(b.config || {}) };
  for (const k of ['appUrl', 'analyticsUrl', 'feedbackUrl', 'contentUrl']) c[k] = S.shipped.config[k]; // addresses always come from the app itself
  b.config = c; S.book = b; S.overlay = ov.version;
  return true;
}
async function savedOverlay() {
  try {
    const c = await caches.open(RB.cache);
    c.delete(RB.old).catch(() => {}); // the whole book that older app versions kept: no longer used
    const r = await c.match(RB.key); return r ? await r.json() : null;
  } catch { return null; }
}
async function remoteUpdate() {
  const base = contentUrl(); if (!base) return false;
  const v = await (await fetch(base + '/content/version.json', { cache: 'no-store' })).json();
  if (!v || typeof v.version !== 'string' || v.version === S.overlay) return false;
  const r = await fetch(base + '/content/overlay.json', { cache: 'no-store' }); if (!r.ok) return false;
  const txt = await r.text(); const ov = JSON.parse(txt);
  if (!useOverlay(ov)) return false;
  try { await (await caches.open(RB.cache)).put(RB.key, new Response(txt, { headers: { 'Content-Type': 'application/json' } })); } catch {}
  render(); toast(T('updated'));
  startDownloads();
  return true;
}
/* ---------- start ---------- */
async function start() {
  await REC.init();
  let txt;
  try { txt = await (await fetch('content/book.json')).text(); S.book = normBook(JSON.parse(txt)); }
  catch { $('#app').innerHTML = '<p style="padding:40px;text-align:center">⚠︎</p>'; return; }
  S.shippedBook = JSON.parse(txt); // kept as it came, to lay a newer overlay over it later
  S.shipped = { version: S.book.version, built: S.book.built, config: S.book.config || {} };
  if (contentUrl()) { const ov = await savedOverlay(); if (ov) useOverlay(ov); }
  Stats.init({ S, store, T, L, esc, spk, ic, I, top, listenBar, choose, sayRow, stopAudio, render: () => render(), isStandalone, platform, localDay, randId, isPlaying: () => P.on });
  if (!S.kid && S.kids[0]) S.kid = S.kids[0].id;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      S.swReg = await navigator.serviceWorker.register('sw.js');
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }
        toast(T('updated')); setTimeout(() => location.reload(), 1200);
      });
    } catch {}
  }
  if (S.voice && isStandalone()) persistOnce();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  setTimeout(() => checkUpdate(false), 3000);
  startDownloads();
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', () => { if (!DL.active) startDownloads(); packsUI(); });
  flush(); sendFeedback();
}
start().catch((e) => { console.error(e); if (window.sehatBootFail) window.sehatBootFail(); });
