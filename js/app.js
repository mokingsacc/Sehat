// Family Health Book: app logic. Plain ES modules, no build step, works offline.
import { toJalali, fromJalali, monthLength } from './jalali.js';
import { makeZip } from './zip.js';
import { initTools } from './tools.js';
import { initFinder } from './search-ui.js'; // the symptom finder's results (js/search.js ranks the pages)
import { initGrowth } from './growth.js'; // growth tracker: #/growth (charts, results, how to measure)
import { initShare } from './share.js'; // Share Sehat: #/share (the app file on Android, the link and a QR code on the web)
import { initFamily } from './family.js'; // family records: #/family (people, vaccines, weight, medicines, doctor's notes, readings)
import { initNumpad } from './numpad.js'; // the big number pad that says each number
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
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="19" r="3" fill="currentColor"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>',
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
  if (navigator.onLine === false) return null; // no internet: straight to the fallback (other voice, phone speech, note)
  // a weak signal must not leave the speaker silent for long: give up after 12 s and use the fallback
  const ac = window.AbortController ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 12000) : 0;
  try {
    const r = await fetch(src, ac ? { signal: ac.signal } : {}); if (!r.ok) return null;
    const blob = await r.blob(); clearTimeout(tm);
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
// the small "listen to this page" button in the header; updateListenBar() drives both kinds
function listenIcon(ids) { S.queueIds = ids; return `<button class="listen hl-ic" data-action="listen" aria-label="${esc(T('listenPage'))}"><span class="pp">${I.play}</span><span class="lt"></span><span class="prog"></span></button>`; }
// top(title, {back, right, listen}): the bar at the top of a screen. render() adds the red Emergency button
// (and on the three tab screens the settings gear) to the first .top or .topic-hero of every screen outside the emergency flow.
function top(title, { back = '#/home', right = '', listen = null } = {}) {
  return `<div class="top">${back ? `<a class="round" href="${back}" aria-label="${esc(T('back'))}">${I.back}</a>` : ''}<h1>${esc(title)}</h1>${listen ? listenIcon(listen) : ''}${right}</div>`;
}
// the big title of a screen with its speaker (the tab screens and the lists start with it)
function titleRow(title, sayId) { return `<div class="title-row" data-block="${esc(sayId)}"><h1>${esc(title)}</h1>${spk(sayId)}</div>`; }
const emPill = () => `<a class="empill" href="#/emergency" data-action="emergency">${I.warn}<span>${esc(T('emergency'))}</span></a>`;
const gearBtn = () => `<a class="round gear" href="#/settings" aria-label="${esc(T('settings'))}">${I.gear}</a>`;
// bottom bar: three tabs, each a picture icon and a name; tapping one also says its name
const TABS = [['health', '#/home', 'heart', 'health'], ['house', '#/house', 'house', 'house'], ['family', '#/family', 'family', 'family']];
function nav(active) {
  active = { home: 'health', children: 'health', adults: 'health' }[active] || active; // older screens name the old tabs
  return `<nav class="nav">${TABS.map(([k, href, icon, label]) => `<a href="${href}" data-tabsay="ui.tab.${k}"${k === active ? ' aria-current="page"' : ''}><span class="tabic">${ic(icon)}</span><span>${esc(T(label))}</span></a>`).join('')}</nav>`;
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

// a big button: picture or icon, a title (and a short line), and a big speaker (home screens: docs/HOME_LAYOUT.md)
function bigBtn(cls, href, visual, title, sub, sayId, ids, action) {
  ids.push(sayId);
  const open = href ? `<a href="${href}" class="grow"${action ? ` data-action="${action}"` : ''}>` : `<button type="button" class="grow" data-action="${action}">`;
  return `<div class="hbtn ${cls}" data-block="${esc(sayId)}">${open}<span class="hv">${visual}</span><span class="tx"><span class="t">${esc(title)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>${href ? '</a>' : '</button>'}${spk(sayId)}</div>`;
}
const picImg = (src) => `<img src="${esc(src)}" alt="" loading="lazy">`;
// a list from config.lists as a big picture row
function listBtn(name, ids) { const c = LISTS()[name]; return c && listOf(name).length ? bigBtn('list', '#/s/' + name, picImg(listPic(c)), T(c.title), T(c.sub), c.say, ids) : ''; }
// the tab screens: no back button, the app's name on the left of the bar
const tabTop = (ids) => top(T('appName'), { back: '', listen: ids });

// Health (the start screen, #/home): config.home, top to bottom
function screenHome() {
  const b = S.book, ids = ['ui.tab.health'], cfg = b.config || {};
  const mods = cfg.home || ['nextVaccine', 'emergency', 'firstAid', 'ask', 'children', 'adults', 'hospital', 'share', 'feedback'];
  let html = tabTop(ids);
  let shareShown = false, emCard = false;
  const M = {
    // only when a vaccine is due within 7 days or is late: a slim strip (the full card is in Family)
    nextVaccine() {
      const k = nextDueAll(); if (!k || k.done) return '';
      const days = Math.ceil((k.due - Date.now()) / DAY); if (days > 7) return '';
      ids.push(k.visit.id);
      const when = days < 0 ? T('overdue') : days === 0 ? T('dueToday') : T('dueIn', { n: num(days) });
      return `<div class="vstrip${days < 0 ? ' late' : ''}" data-block="${esc(k.visit.id)}">${ic('calendar')}<a class="grow" href="#/family">${esc(k.kid.name)} · ${esc(T('nextVaccine'))}: ${esc(L(k.visit.age))} · ${esc(when)}</a>${spk(k.visit.id)}</div>`;
    },
    // the biggest thing on the screen: red, one word; opens "who needs help?" and reads it aloud
    emergency() { if ((cfg.emergency || []).length) emCard = true; return (cfg.emergency || []).length ? bigBtn('em', '#/emergency', I.warn, T('emergency'), '', 'ui.emergency', ids, 'emergency') : ''; },
    firstAid() { const f = cfg.firstAid; return f ? bigBtn('fa', '#/firstaid', picImg(topicPic(b.topics[f.image])), T(f.title), T(f.sub), f.say, ids) : ''; },
    ask() { return bigBtn('ask', '#/ask', I.mic, T('ask'), T('askSub'), 'ui.ask', ids); },
    children() { return bigBtn('sec', '#/children', picImg('img/app/home-children.svg'), T('children'), T('childrenSub'), 'ui.children', ids); },
    adults() { return bigBtn('sec adult', '#/adults', picImg('img/app/home-adults.svg'), T('adults'), T('adultsSub'), 'ui.adults', ids); },
    sections() { return M.children() + M.adults(); },
    // Share Sehat (config.shareCard: the share screen, when this version has it); otherwise the phone's own share sheet
    share() {
      if (shareShown) return ''; shareShown = true;
      const c = cfg.shareCard || {}, and = typeof SH !== 'undefined' ? SH.homeSay() === c.say : !!window.FHBAndroid;
      const say = and ? c.say : c.webSay || c.say, sub = and ? c.sub : c.webSub || c.sub;
      const pic = picImg('img/pics/row-share.svg'); // a small scene, cropped like the hospital and first-aid rows
      if (c.href && b.ui[c.title] && b.narration[say]) return bigBtn('share pic', c.href, pic, T(c.title), sub && b.ui[sub] ? T(sub) : '', say, ids);
      return bigBtn('share pic', '', pic, T('share'), T('shareSub'), 'ui.share', ids, 'share');
    },
    feedback() { return bigBtn('fbk pic', '#/feedback', picImg('img/pics/row-feedback.svg'), T('feedback'), T('feedbackSub'), 'ui.feedback', ids); },
    install() { return S.installEvt || (platform() === 'ios' && !isStandalone()) ? bigBtn('inst', '', ic('phone'), T('install'), T('installSub'), 'ui.install', ids, 'install') : ''; },
    sendApp() { return M.share(); }, // the older name of the same card
    growth() { ids.push('ui.growth'); return `<div class="grid2">${GR.homeTile()}</div>`; }, // growth tracker tile (js/growth.js)
    near() { return bigBtn('near', '#/near', ic('hospital'), T('near'), T('nearSub'), 'ui.near', ids); },
    disclaimer() { ids.push('ui.disclaimer'); return disclaimer(); },
  };
  for (const m of mods) html += M[m] ? M[m]() : listBtn(m, ids);
  return { html, nav: 'health', healthTab: true, emCard };
}

// Home (#/house): the house and everyday life. config.house: lists from config.lists (home safety, food and garden, well-being, home kit)
function screenHouse() {
  const ids = ['ui.tab.house', 'ui.house'];
  let html = tabTop(ids) + titleRow(T('house'), 'ui.house');
  for (const m of (S.book.config && S.book.config.house) || ['safety', 'food', 'wellbeing', 'kit']) html += listBtn(m, ids);
  track('view', { p: 'house' });
  return { html, nav: 'house' };
}

// a topic's picture: its own, or (for the pages that share a general picture) the first step picture
function topicPic(t) {
  if (!t) return 'img/app/placeholder.svg';
  if (!/-generic\.svg$/.test(t.image)) return t.image;
  const b = (t.blocks || []).find((x) => x.picture); return b ? b.picture : t.image;
}
// a topic in a list: a big row with its picture, title, a short line and a big speaker
function topicRow(tid) {
  const t = S.book.topics[tid]; if (!t) return '';
  const href = `#/topic/${tid}`;
  return `<div class="trow${isAdultTopic(t) ? ' adult' : ''}" data-block="${esc(tid)}.title"><a class="grow" href="${href}"><span class="tp"><img src="${esc(topicPic(t))}" alt="" loading="lazy"></span><span class="tx"><span class="t">${esc(L(t.title))}</span><span class="s">${esc(L(t.summary))}</span></span></a>${spk(tid + '.title')}</div>`;
}
const topicCard = topicRow; // js/tools.js lists topics with it too
// tool rows (growth chart, breathing counter, "what does the number mean?"); growth shows once this version has it
// [href, icon, title, sub, sayId, picture]: the picture is a small scene cropped like a topic row's (the icon is the fallback)
const TOOL_ROWS = {
  growth: ['#/growth', 'growth', 'growth', 'growthSub', 'ui.growth', 'img/pics/row-growth.svg'],
  breaths: ['#/tool/breaths', 'breathing-fast', 'breaths', '', 'ui.breaths', 'img/pics/row-breaths.svg'],
  reading: ['#/tool/reading', 'bp', 'reading', '', 'ui.reading', 'img/pics/row-reading.svg'],
};
function toolRow(x, ids) {
  const r = TOOL_ROWS[x]; if (!r || !S.book.ui[r[2]] || !S.book.narration[r[4]]) return '';
  if (x === 'growth' && !(S.book.ui.growth && S.book.narration['ui.growth'])) return '';
  ids.push(r[4]);
  return `<div class="trow tool" data-block="${esc(r[4])}"><a class="grow" href="${r[0]}">${r[5] ? `<span class="tp"><img src="${esc(r[5])}" alt="" loading="lazy"></span>` : `<span class="tp ticon">${ic(r[1])}</span>`}<span class="tx"><span class="t">${esc(T(r[2]))}</span>${r[3] && S.book.ui[r[3]] ? `<span class="s">${esc(T(r[3]))}</span>` : ''}</span></a>${spk(r[4])}</div>`;
}
// a group heading inside a list: its title and a big speaker
const groupHead = (title, sayId, cls = '') => `<div class="group-h${cls}" data-block="${esc(sayId)}"><h2 class="t">${esc(title)}</h2>${spk(sayId)}</div>`;

/* ---------- Children and Adults (#/children, #/adults): config.listGroups, in order ---------- */
// a group: {title, say, topics} (or rest: true, every topic of the section not shown anywhere else) or {tools: [...]}
function sectionTopics(which) { const s = S.book.sections; return which === 'children' ? s.children : [...new Set([...s.women, ...s.everyone])]; }
// topics people reach from somewhere else: the emergency and first-aid pages, and the lists with their own page
function shownElsewhere() {
  const g = new Set(S.book.sections.emergency || []);
  for (const n of Object.keys(LISTS())) for (const t of listOf(n)) g.add(t);
  for (const t of ((S.book.config && S.book.config.firstAid) || {}).topics || []) g.add(t);
  return g;
}
function screenGroups(which) {
  const b = S.book, groups = ((b.config && b.config.listGroups) || {})[which] || [{ rest: true, title: which, say: 'ui.' + which }];
  const all = sectionTopics(which), placed = new Set();
  for (const g of groups) for (const t of g.topics || []) placed.add(t);
  const away = shownElsewhere(), ids = ['ui.' + which];
  let body = '';
  for (const g of groups) {
    if (g.tools) { body += g.tools.map((x) => toolRow(x, ids)).join(''); continue; }
    const list = (g.rest ? all.filter((t) => !placed.has(t) && (!away.has(t) || (g.include || []).includes(t))) : g.topics || []).filter((t) => b.topics[t]);
    if (!list.length) continue;
    ids.push(g.say, ...list.map((t) => t + '.title'));
    body += groupHead(T(g.title), g.say, g.danger ? ' danger' : '') + list.map(topicRow).join('');
  }
  const html = top('', { back: '#/home', listen: ids }) + titleRow(T(which), 'ui.' + which) + body + disclaimer();
  return { html, nav: 'health', adult: which === 'adults' };
}
function screenChildren() { return screenGroups('children'); }
function screenAdults() { return screenGroups('adults'); }

/* ---------- lists with their own page (#/s/<name>): config.lists + sections.json (kit, home safety, hospital, food and garden, well-being) ---------- */
const LISTS = () => (S.book.config && S.book.config.lists) || {};
const listOf = (name) => ((S.book.sections || {})[name] || []).filter((t) => S.book.topics[t]);
const listPic = (c) => (c && S.book.topics[c.image] ? topicPic(S.book.topics[c.image]) : 'img/app/placeholder.svg');
const listTab = (name) => ((LISTS()[name] || {}).tab === 'health' ? 'health' : 'house');
// the list page a topic belongs to when its own section list does not show it (kit and hospital pages, most food pages)
const ownList = (tid, t) => (S.book.sections[t.section] || []).includes(tid) ? null : Object.keys(LISTS()).find((n) => listOf(n).includes(tid)) || null;
const LB = { back: null }; // where a list page goes back to (the screen it was opened from)
function screenList(name) {
  const c = LISTS()[name]; if (!c) return screenHome();
  const list = listOf(name), tab = listTab(name), ids = [c.say];
  let body = (c.tools || []).map((x) => toolRow(x, ids)).join('');
  if (c.near) { ids.push('ui.near'); body += `<div class="trow tool near" data-block="ui.near"><a class="grow" href="#/near"><span class="tp ticon">${ic('hospital')}</span><span class="tx"><span class="t">${esc(T('near'))}</span><span class="s">${esc(T('nearSub'))}</span></span></a>${spk('ui.near')}</div>`; }
  ids.push(...list.map((t) => t + '.title'));
  body += list.map(topicRow).join('');
  if (!list.length) body += `<div class="empty">${ic(c.icon || 'check')}<p>${esc(T('comingSoon'))}</p></div>`;
  const back = LB.back || (tab === 'health' ? '#/home' : '#/house');
  const html = top('', { back, listen: ids }) + `<div class="lhero"><img src="${esc(listPic(c))}" alt=""></div>` + titleRow(T(c.title), c.say) + body + disclaimer();
  return { html, nav: tab, adult: !c.child };
}

/* ---------- CPR and first aid (#/firstaid): CPR by age, then every first-aid page as a picture ---------- */
function picTile(tid, cls = '') {
  const t = S.book.topics[tid]; if (!t) return '';
  return `<div class="ptile${cls}" data-block="${esc(tid)}.title"><a href="#/topic/${esc(tid)}"><span class="pp"><img src="${esc(topicPic(t))}" alt="" loading="lazy"></span><span class="t">${esc(L(t.title))}</span></a>${spk(tid + '.title')}</div>`;
}
function ageCard(x, href) {
  return `<div class="em-age" data-block="ui.${esc(x.label)}"><a href="${href}"><span class="em-pic"${x.anim ? ` data-poster="${esc(x.anim)}" data-scene="0"` : ''}>${x.anim ? '' : ic(x.icon)}</span><span class="t">${esc(T(x.label + 'Short'))}</span></a>${spk('ui.' + x.label)}</div>`;
}
function screenFirstAid() {
  const b = S.book, f = (b.config && b.config.firstAid) || {}, ages = emAges(), cpr = new Set(ages.map((x) => x.cpr));
  const list = [...(f.topics || []), ...(b.sections.emergency || []).filter((t) => !cpr.has(t))].filter((t, i, a) => b.topics[t] && a.indexOf(t) === i);
  const ids = [f.say, 'ui.cprWho', ...ages.map((x) => 'ui.' + x.label), 'ui.firstAidAll', ...list.map((t) => t + '.title')];
  let html = top('', { back: '#/home', listen: ids }) + titleRow(T(f.title || 'firstAid'), f.say);
  html += groupHead(T('notBreathing'), 'ui.cprWho', ' danger') + `<div class="em-ages">${ages.map((x) => ageCard(x, '#/topic/' + x.cpr)).join('')}</div>`;
  html += groupHead(T('firstAidAll'), 'ui.firstAidAll') + `<div class="ptiles">${list.map((t) => picTile(t)).join('')}</div>` + disclaimer();
  track('view', { p: 'firstaid' });
  return { html, nav: 'health' };
}

function blockHtml(b, n) {
  if (b.type === 'lead') return `<div class="blk lead" data-block="${esc(b.id)}"><div class="body">${esc(L(b.text))}</div>${spk(b.id)}</div>`;
  if (b.type === 'step') return `<div class="blk step${b.picture ? ' haspic' : ''}" data-block="${esc(b.id)}">${b.picture ? `<img class="fig" src="${esc(b.picture)}" alt="" loading="lazy">` : ''}<div class="pic">${ic(b.icon)}</div><div class="body"><div class="h"><span class="num">${num(n)}</span><span>${esc(L(b.title))}</span></div><div class="x">${esc(L(b.text))}</div></div>${spk(b.id)}</div>`;
  if (b.type === 'link') { const h = TL.linkBlock(b); return b.urgent ? h.replace('class="blk link"', 'class="blk link urgent"') : h; } // opens a tool, the home kit or another topic; urgent: a red row to the Health side
  // what the clinic or the hospital does for this problem: a building icon, no number
  if (b.type === 'clinic') return `<div class="blk clinic" data-block="${esc(b.id)}"><div class="pic">${ic(b.icon || 'clinic')}</div><div class="body"><div class="h">${esc(L(b.title))}</div><div class="x">${esc(L(b.text))}</div></div>${spk(b.id)}</div>`;
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
// Few words, big targets, pictures first. Opened by a tap on an Emergency button, it reads itself aloud.
const EM = { speak: false, back: null };
const emAges = () => (S.book.config && S.book.config.emergency) || [];
function emCarRow() { return `<div class="em-car" data-block="ui.sendForCar">${ic('car')}<div class="body">${esc(T('sendForCar'))}</div>${spk('ui.sendForCar')}</div>`; }
function screenEmergency(age) {
  const b = S.book, a = emAges().find((x) => x.id === age);
  if (!a) {
    const ids = ['ui.emergency', 'ui.emergencyWho'];
    if (EM.speak) { EM.speak = false; setTimeout(() => { if (hasAudio('ui.emergency') || ttsVoice()) play(['ui.emergency', 'ui.emergencyWho'], { quiet: true }); }, 0); }
    let html = top(T('emergency'), { back: '#/home', listen: ids }) + emCarRow() + nearRow();
    ids.splice(1, 0, 'ui.sendForCar', 'ui.near');
    html += `<div class="em-who" data-block="ui.emergencyWho"><h2>${esc(T('emergencyWho'))}</h2>${spk('ui.emergencyWho')}</div>`;
    html += `<div class="em-ages">${emAges().map((x) => ageCard(x, '#/emergency/' + x.id)).join('')}</div>`;
    ids.push(...emAges().map((x) => 'ui.' + x.label));
    const all = (b.sections.emergency || []).filter((t) => b.topics[t]);
    if (all.length) html += `<details class="em-all"><summary>${esc(T('allEmergencies'))}</summary>${all.map(emRow).join('')}</details>`;
    return { html, nav: 'health' };
  }
  EM.speak = false;
  const cpr = b.topics[a.cpr], list = (a.topics || []).filter((t) => b.topics[t]);
  const ids = [...(cpr ? [a.cpr + '.title'] : []), 'ui.sendForCar', ...list.map((t) => t + '.title')];
  let html = top(T(a.label + 'Short'), { back: '#/emergency', listen: ids });
  if (cpr) {
    html += `<div class="em-cpr" data-block="${esc(a.cpr)}.title"><a class="grow" href="#/topic/${esc(a.cpr)}">${ic('breathe')}<span class="t">${esc(T('notBreathing'))}</span></a>${spk(a.cpr + '.title')}`;
    if (a.anim) html += `<button class="em-watch" data-action="anim" data-anim="cpr" data-variant="${esc(a.anim)}">${I.play}<span>${esc(T('watchHow'))}</span></button>`;
    html += `</div>`;
  }
  html += emCarRow().replace('em-car"', 'em-car slim"');
  if (list.length) html += `<div class="ptiles">${list.map((t) => picTile(t, isAdultTopic(b.topics[t]) ? ' adult' : '')).join('')}</div>`;
  return { html, nav: 'health', adult: a.id === 'adult' };
}
function emRow(tid) {
  const t = S.book.topics[tid];
  return `<div class="erow${isAdultTopic(t) ? ' adult' : ''}" data-block="${esc(tid)}.title"><a class="grow" href="#/topic/${esc(tid)}"><img src="${esc(topicPic(t))}" alt="" loading="lazy"><span class="t">${esc(L(t.title))}</span></a>${spk(tid + '.title')}</div>`;
}
function nearRow() { return `<div class="em-near" data-block="ui.near">${ic('hospital')}<a class="grow" href="#/near">${esc(T('near'))}</a>${spk('ui.near')}</div>`; }
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
  const own = ownList(tid, t), back = EM.back || (own ? '#/s/' + own : t.section === 'children' ? '#/children' : '#/adults');
  const from = /^#\/s\/([\w-]+)/.exec(back || ''), tab = from && LISTS()[from[1]] && listOf(from[1]).includes(tid) ? listTab(from[1]) : own && !/^#\/(emergency|firstaid|children|adults)/.test(back) ? listTab(own) : 'health';
  let html = `<div class="topic-hero"><img src="${esc(topicPic(t))}" alt=""><a class="round" href="${back}" aria-label="${esc(T('back'))}">${I.back}</a></div>`;
  html += `<div class="title-row" data-block="${tid}.title"><h1>${esc(L(t.title))}</h1>${spk(tid + '.title')}</div>`;
  html += listenBar(ids) + body + disclaimer();
  if (t.sources && t.sources.length) html += `<details class="sources"><summary>${esc(T('sources'))}</summary><ul>${t.sources.map((s) => `<li dir="ltr">${esc(s)}</li>`).join('')}</ul></details>`;
  track('view', { p: 'topic/' + tid });
  return { html, nav: tab, adult: isAdultTopic(t) };
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
  if (k.pic === 'woman' || k.pic === 'man') return null; // adults: the women's tetanus vaccine is on their own record
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
  return `<div class="next ${cls}" data-block="${esc(n.visit.id)}">${ic('calendar')}<a href="#/family" style="flex:1"><div class="t">${withName && n.kid ? esc(FM.nameOf(n.kid)) + ' · ' : ''}${esc(T('nextVaccine'))}: ${esc(L(n.visit.age))}</div><div class="s">${esc(fmtDate(iso))} · ${esc(when)}</div></a>${spk(n.visit.id)}</div>`;
}
function saveKids() { store.set('kids', S.kids); store.set('kid', S.kid); }

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
/* ---------- smart downloads: only the chosen voice, pack by pack, most important first ---------- */
// The app shell (code, pictures, words) is precached by the service worker; audio never is.
// After the voice step the "urgent" pack downloads quietly, then children, women, everyone (book.packs),
// two clips at a time, skipping clips already on the phone, so it resumes after a lost signal or a closed app.
// On saveData, 2G or mobile data only the urgent pack downloads by itself; Settings shows the rest with a Download button.
// Inside the urgent pack the Emergency screen and CPR come first (urgentFirst).
const PACKS = ['urgent', 'children', 'women', 'everyone'];
const DL = { run: 0, active: false, slot: null, cur: null, again: false, waiting: false, full: false, retry: null, wait: 15000, have: new Set() };
const abs = (u) => new URL(u, location.href).href;
// slow or paid-for internet (data saver, 2G, or mobile data): only the urgent pack downloads by itself; Wi-Fi gets everything
const slowNet = () => { const c = navigator.connection; return !!(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '') || /^(cellular|wimax|bluetooth)$/.test(c.type || ''))); };
// download order inside the urgent pack: the Emergency screen, CPR and its films first, then the other emergency pages,
// then the other urgent pages and red boxes, then page titles, then the rest of the interface
function urgentFirst(list) {
  const b = S.book, cfg = b.config || {}, em = cfg.emergency || [];
  const cpr = new Set(em.map((a) => a.cpr).filter(Boolean));
  const emUi = new Set(['ui.emergency', 'ui.emergencyWho', 'ui.sendForCar', 'ui.near', 'ui.cprFirstAid'].concat(em.map((a) => 'ui.' + a.label)));
  const emPages = new Set([].concat(...em.map((a) => a.topics || []), (b.sections || {}).emergency || [], (cfg.firstAid || {}).topics || []));
  const rank = (id) => {
    const tid = id.split('.')[0];
    if (emUi.has(id) || cpr.has(tid) || /^anim\.cpr[-.]/.test(id)) return 0;
    if (emPages.has(tid)) return 1;
    if (id.startsWith('ui.')) return 4;
    if (id === tid + '.title') return 3;
    return 2;
  };
  return list.map((id, i) => [rank(id), i, id]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]); // stable on old WebViews too
}
function packList(slot) {
  const b = S.book, ids = (b.packs && b.packs.ids) || { everyone: b.order || Object.keys(b.narration) };
  const size = (sl, p) => (b.packs && b.packs.size && b.packs.size[sl] && b.packs.size[sl][p]) || [0, 0];
  const sib = slotsFor(slot)[1];
  return PACKS.map((p) => {
    const urls = []; let own = 0, other = 0;
    for (const id of p === 'urgent' ? urgentFirst(ids[p] || []) : ids[p] || []) {
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
// the voice chosen for this language: each language remembers its own; a language not chosen yet starts with the woman's voice
const voiceFor = (lang) => store.get('voiceBy', {})[lang] || (lang === S.lang && S.voice) || 'f';
// change language or voice: start the new voice's urgent pack, offer to delete the old voice's clips
async function setVoice(lang, voice) {
  const old = S.lang && S.voice ? slotOf() : null;
  S.lang = lang; S.voice = voice === 'm' ? 'm' : 'f'; store.set('lang', S.lang); store.set('voice', S.voice);
  store.set('voiceBy', Object.assign(store.get('voiceBy', {}), { [lang]: S.voice })); // each language keeps its own voice
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
  html += `</div><div class="panel" id="voicepanel"><h2>${esc(T('voices'))}</h2><p class="muted">${esc(T('voiceFor', { lang: S.book.langNames[S.lang] || S.lang }))}</p>${voiceCards('data-voice')}<div id="packs">${packsHtml()}</div>`;
  html += `<div class="srow">${ic('no')}<button class="grow" data-action="delvoices" style="text-align:start"><div class="t">${esc(T('deleteVoices'))}</div><div class="s">${esc(T('deleteVoicesSub'))}</div></button></div><p class="muted" id="storage"></p>`;
  html += `</div><div class="panel">`;
  html += `<div class="srow">${ic('check')}<div class="grow"><div class="t" id="upd-t">${esc(T('upToDate'))}</div><div class="s">${esc(T('version'))} ${esc(S.book.version)}${S.book.edition ? ' · ' + esc(S.book.edition) : ''} · ${esc(T('offline'))}</div></div><button class="sbtn" data-action="checkupd">${esc(T('checkUpdates'))}</button></div>`;
  html += SH.settingsRow(); // Share Sehat (js/share.js): the app file, the link, the QR code
  ids.push('ui.feedback');
  html += `<div class="srow" data-block="ui.feedback">${ic('talk')}<a class="grow" href="#/feedback"><div class="t">${esc(T('feedback'))}</div><div class="s">${esc(T('feedbackSub'))}</div></a>${spk('ui.feedback')}</div>`;
  if (S.installEvt || (platform() === 'ios' && !isStandalone())) { ids.push('ui.install'); html += `<div class="srow" data-block="ui.install">${ic('phone')}<button class="grow" data-action="install" style="text-align:start"><div class="t">${esc(T('install'))}</div><div class="s">${esc(T('installSub'))}</div></button>${spk('ui.install')}</div>`; }
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
const TL = initTools({ S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, hasAudio, ttsVoice, track, listenBar, disclaimer, topicCard, saveReading: (r) => FM.saveReading(r), render: () => render() });
const FD = initFinder({ S, esc, T, L, ic, I, spk, isAdultTopic });
const NP = initNumpad({ S, esc, T, L, num, I, spk, play, dialog, toast });
const GR = initGrowth({ S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, hasAudio, ttsVoice, track, listenBar, disclaimer, top, toast, store, dateSelects, readDate, fmtDate, todayISO, ageText, saveKids, topicCard, NP, nameOf: (k) => FM.nameOf(k), children: () => FM.children(), render: () => render() });
const SH = initShare({ S, esc, T, L, num, ic, I, spk, track, listenBar, disclaimer, top, toast, platform, mbText });
const FM = initFamily({ S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, track, listenBar, disclaimer, top, toast, store, dialog, dateSelects, readDate, fmtDate, todayISO, ageText, saveKids, NP, render: () => render() });

/* ---------- titles that fit ----------
   A big title never breaks a word in two and never runs into its speaker button: on a narrow phone, with a wide
   font or with the phone's large-text setting, the title gets a little smaller instead (down to 70%). The header
   (app name, Listen, Emergency, settings) shrinks its name and the Emergency word together. */
const FIT_SEL = 'main .hbtn .t, main .trow .t, main .title-row h1, main .sbig .t, main .tcard .t, main .pn'; // .pn: a person's name in Family
function wordsWidth(el) { // the widest word, in px
  let max = 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const re = /\S+/g; let m;
    while ((m = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); let x = 0; const rs = rg.getClientRects(); for (let i = 0; i < rs.length; i++) x += rs[i].width; if (x > max) max = x; }
  }
  return max;
}
function roomOf(el) { const cs = getComputedStyle(el); return el.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 1; } // 1 px to spare: a word that only just fits still wraps
function fitText() {
  try {
    const els = document.querySelectorAll(FIT_SEL);
    for (let i = 0; i < els.length; i++) {
      const el = els[i]; if (el.style.fontSize) el.style.fontSize = ''; // (no write when nothing was shrunk: long lists stay fast)
      if (!el.clientWidth) continue;
      let size = parseFloat(getComputedStyle(el).fontSize); const min = size * (el.classList.contains('pn') ? 0.6 : 0.7); // a name may get a little smaller still
      while (size > min && wordsWidth(el) > roomOf(el) + 0.5) { size -= 1; el.style.fontSize = size + 'px'; }
    }
    const top = document.querySelector('main .top'); if (!top) return;
    const h = top.querySelector('h1'), pill = top.querySelector('.empill span');
    if (!h) return;
    if (h.style.fontSize) h.style.fontSize = ''; if (pill && pill.parentNode.style.fontSize) pill.parentNode.style.fontSize = '';
    let hs = parseFloat(getComputedStyle(h).fontSize), ps = pill ? parseFloat(getComputedStyle(pill).fontSize) : 0;
    const hmin = hs * 0.6, pmin = ps * 0.75; // (a long name in the bar: smaller rather than cut in two)
    while (wordsWidth(h) > roomOf(h) + 0.5 && (hs > hmin || ps > pmin)) {
      if (hs > hmin) { hs -= 1; h.style.fontSize = hs + 'px'; }
      if (pill && ps > pmin) { ps -= 1; pill.parentNode.style.fontSize = ps + 'px'; }
    }
  } catch (e) {}
}
let fitT = 0;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitText, 120); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitText); // the Dari and Pashto font arrives after the first paint
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { clearTimeout(fitT); fitT = setTimeout(fitText, 60); }); // and a font that loads later (Latin names in the Dari and Pashto books)

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
  else if (r[0] === 'family') out = FM.screen(r[1]);
  else if (r[0] === 'settings') out = screenSettings();
  else if (r[0] === 'studio') out = screenStudio();
  else if (r[0] === 'ask') out = screenAsk();
  else if (r[0] === 'feedback') out = screenFeedback();
  else if (r[0] === 'near') out = screenNear();
  else if (r[0] === 's') out = screenList(r[1]);
  else if (r[0] === 'house') out = screenHouse();
  else if (r[0] === 'firstaid') out = screenFirstAid();
  else if (LISTS()[r[0]]) { history.replaceState(null, '', '#/s/' + r[0]); r = route(); out = screenList(r[1]); } // old addresses: #/kit, #/safety ...
  else if (r[0] === 'emergency') out = screenEmergency(r[1]);
  else if (r[0] === 'tool') out = TL.screenTool(r[1], r[2]) || screenHome();
  else if (r[0] === 'growth') out = GR.screen(r[1]);
  else if (r[0] === 'share') out = SH.screen();
  else out = screenHome();
  } catch (err) { if (r[0] === 'home') throw err; r = ['home']; out = screenHome(); }
  app.innerHTML = `<main class="page${out.adult ? ' adult' : ''}">${out.html}</main>${out.nav ? nav(out.nav) : ''}`;
  // the red Emergency button on every screen outside the emergency flow (and the setup screens), except the Health tab,
  // whose big red Emergency card is right below; the gear on the tab screens
  const inEm = r[0] === 'emergency' || (r[0] === 'topic' && /^#\/emergency/.test(EM.back || ''));
  if (out.nav && !inEm) {
    const host = $('main .top, main .topic-hero', app);
    if (host) host.insertAdjacentHTML('beforeend', (out.emCard ? '' : emPill()) + ((out.healthTab || ['house', 'family'].includes(r[0])) && host.matches('.top') ? gearBtn() : ''));
  }
  if (P.on) updateListenBar();
  lastPage = r.join('/') || 'home';
  Stats.page(!S.lang ? ['welcome'] : !S.voice ? ['voice'] : r[0] !== 'privacy' && Stats.showConsent() ? ['consent'] : r);
  if (r[0] === 'topic' && r[2]) setTimeout(() => { const el = document.querySelector(`[data-block="${CSS.escape(decodeURIComponent(r[2]))}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('speaking'); setTimeout(() => el.classList.remove('speaking'), 2500); } }, 60);
  const af = $('#askform'); if (af) af.addEventListener('submit', (e) => { e.preventDefault(); ASK.q = $('#askq').value; $('#askres').innerHTML = askResults(); $('#askq').blur(); });
  // live results while typing; the cards are redrawn only when they change (fast on slow phones)
  if (af) { $('#askq').addEventListener('input', (e) => { ASK.q = e.target.value; FD.show($('#askres'), askResults(null, true)); }); setTimeout(FD.warm, 30); }
  const ff = $('#fbform'); if (ff) ff.addEventListener('submit', (e) => { e.preventDefault(); fbSubmit(ff.text.value.trim()); });
  fillPosters();
  fitText();
}
let lastHash = location.hash;
addEventListener('hashchange', () => {
  if (AN.ctl && AN.ctl.close) AN.ctl.close(); // leaving the page closes the animation player too
  // a page opened from the Emergency screen or a list (children, adults, #/s/...) goes back there
  const now = location.hash.split('/');
  if (now[1] === 'topic') { if (/^#\/(emergency|s\/|children|adults|firstaid)/.test(lastHash)) EM.back = lastHash; } else EM.back = null;
  // a list page goes back to the screen it was opened from (Health, Home, Children, Adults); from a topic it keeps that
  const was = lastHash.split('/')[1];
  if (now[1] === 's') { if (was !== 'topic' && was !== 's') LB.back = lastHash || '#/home'; } else if (now[1] !== 'topic') LB.back = null;
  stopAudio(); render();
  if (S.tabSay) { const id = S.tabSay; S.tabSay = null; if (hasAudio(id) || ttsVoice()) play([id], { quiet: true }); }
  const r = route(); if (r[0] !== 'topic' && r[0] !== 'family') track('view', { p: r[0] || 'home' });
  if (location.hash.split('/')[1] !== lastHash.split('/')[1] || location.hash !== lastHash) scrollTo(0, 0);
  lastHash = location.hash;
});

/* ---------- one click handler for everything ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, [data-block]'); if (!t) return;
  const d = t.dataset;
  if (d.tabsay) { const id = d.tabsay; if (t.getAttribute('aria-current') === 'page') play([id], { quiet: true }); else S.tabSay = id; return; }
  if (d.say) { e.preventDefault(); if (P.on && P.ids.length === 1 && P.ids[0] === d.say) stopAudio(); else play([d.say]); return; }
  if (d.sayLang) { e.preventDefault(); const prev = S.lang; S.lang = d.sayLang; play(['ui.welcome'], { slot: slotOf(d.sayLang) }); S.lang = prev; return; }
  if (d.sample) { e.preventDefault(); const sl = slotOf(S.lang, d.sample); if (P.on && P.strict && P.slot === sl) stopAudio(); else play([sampleId(sl)], { slot: sl, strict: true }); return; }
  if (d.setlang) {
    stopAudio(); track('lang', { to: d.setlang });
    if (S.voice) setVoice(d.setlang, voiceFor(d.setlang)); else { S.lang = d.setlang; store.set('lang', S.lang); }
    location.hash = '#/home'; render(); return;
  }
  if (d.setvoice) { stopAudio(); await setVoice(S.lang, d.setvoice); persistOnce(); location.hash = '#/home'; render(); return; }
  if (d.voice) { stopAudio(); await setVoice(S.lang, d.voice); render(); return; }
  if (d.lang) { stopAudio(); await setVoice(d.lang, voiceFor(d.lang)); render(); return; }
  if (d.speed) { S.speed = +d.speed; store.set('speed', S.speed); render(); return; }
  if (d.kid) { S.kid = d.kid; saveKids(); render(); return; }
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
    case 'addkid': location.hash = '#/family/add'; return;
    case 'editkid': location.hash = '#/family/edit'; return;
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
// The Android app carries no narration (it stays a small file to pass from phone to phone): its clips come from the
// website (config.appUrl) and are kept on the phone like on the website (packs, or the first time each one plays).
const IN_APK = location.hostname === 'appassets.androidplatform.net';
function normBook(b) {
  const a = b.audio && typeof b.audio === 'object' ? b.audio : {};
  for (const lg of ['fa', 'ps', 'en']) if (a[lg] && typeof a[lg] === 'object') { a[lg + '-f'] = { ...a[lg], ...(a[lg + '-f'] || {}) }; delete a[lg]; }
  const site = (S.shipped && S.shipped.config.appUrl) || (b.config && b.config.appUrl) || '';
  if (IN_APK && /^https:\/\//.test(site)) {
    for (const sl of Object.keys(a)) for (const id of Object.keys(a[sl] || {})) if (/^audio\//.test(a[sl][id])) a[sl][id] = new URL(a[sl][id], site).href;
  }
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
