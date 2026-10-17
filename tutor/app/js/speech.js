// The speaker on every text, and "say it" (record yourself, hear it back).
// In order (DESIGN.md 9, C5.6): a clip in the language's one voice, then the phone's own voice if it has one for the
// language, then the "voice not ready yet" note. Every text Qalam writes is voiced at build time by tools/voice.py
// (Gemini's text-to-speech, one woman's voice per language); a clip is found by its text's hash (textHash, the same
// hash the tool names the file by), so any string, lesson text or consent line on screen finds its clip, and a text
// joined from several (a page read aloud, "title. note") plays its parts' clips one after another. The app's own
// clips are app/audio/<lang>/<hash>.opus, listed in that folder's manifest.json; a pack's come with its lessons
// (`voices`) and its steps (`audio`). The clips stay out of the APK: the Android app fetches them from the hub or the
// online home, and plays the phone's voice where it cannot. The phone's voice is reached only for a text no build has
// voiced yet (a name, a number she typed), so a learner hears one voice per language. Scripture is never voiced:
// readText skips data-voice="none", and no verse or translation has a clip.
// Since P27a (C4.4) an English or Chinese lesson takes no phone voice at all (`recorded: true`): every word she
// copies is a clip, so an unvoiced one says "not recorded yet" rather than a phone reading it.
// "Say it" records only in a browser (P27a, C4.4): the APK has no microphone (C3.6, its bridge says so) and the hub's
// plain http gives a page none, so there the step is "hear it, say it" with no mic drawn.

import * as android from './android.js';
import { url as hubUrl } from './hub.js';
import { s } from './i18n.js';
import { sha256 } from './sha256.js';
import { toast } from './ui.js';

const VOICE_LANG = { prs: ['fa-AF', 'fa-IR', 'fa'], ps: ['ps-AF', 'ps'], en: ['en-GB', 'en-US', 'en'],
  zh: ['zh-CN', 'zh'] };
const manifests = new Map();          // lang -> Promise of the manifest's clips {hash: seconds}
const voiced = new Map();             // lang -> Map(hash -> clip URL): the app's clips and the packs' given so far
const local = new Map();              // lang -> Map(hash -> Blob): the voice pack kept on this phone (voicepack.js)
const localFiles = new Map();         // 'bells/start.opus' -> Blob, from the same pack
const blobUrls = new WeakMap();
const ready = new Set();              // languages with clips loaded
let current = null;
let turn = 0;                         // each speak() takes a turn; a sequence of clips stops when another starts

function voiceFor(lang) {
  const voices = (globalThis.speechSynthesis && speechSynthesis.getVoices()) || [];
  for (const want of VOICE_LANG[lang] || []) {
    const v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(want.toLowerCase()));
    if (v) return v;
  }
  return null;
}

// the form a text is hashed in, as tools/voice.py: NFC, no $ (maths marks), one space, no final full stop
export function norm(t) {
  return String(t ?? '').normalize('NFC').replace(/\$/g, '').replace(/\s+/g, ' ').trim().replace(/[.۔]+$/, '').trim();
}
export const textHash = (t) => sha256(norm(t)).slice(0, 12);

// where the app's clips are: this website, or (the Android app, which carries no clips) the hub or online home
function appClip(lang, h) {
  const path = `/audio/${lang}/${h}.opus`;
  return android.isApp() ? hubUrl(path) : path;
}

// placeholders (a pack's stand-in clips, not speech) play only for a tester: localStorage qalam.clips = "placeholders"
export function placeholdersOn() {
  try { return globalThis.localStorage && localStorage.getItem('qalam.clips') === 'placeholders'; } catch { return false; }
}

// a pack clip from the hub, {url, placeholder}, or a plain URL
export function packClip(a, placeholders = placeholdersOn()) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  return a.url && (!a.placeholder || placeholders) ? a.url : null;
}

// clips the hub gives with a lesson or the pack list: {lang: {hash: path}}; toUrl turns a path into an address
export function addVoices(map, toUrl = (u) => u) {
  for (const [lang, clips] of Object.entries(map || {})) {
    if (!clips || typeof clips !== 'object') continue;
    if (!voiced.has(lang)) voiced.set(lang, new Map());
    for (const [h, u] of Object.entries(clips)) if (typeof u === 'string') voiced.get(lang).set(h, toUrl(u));
  }
}

// the voice pack on this phone: {hash: Blob} for a language, and its other sounds {path: Blob}; these play first
export function addLocal(lang, clips, files = {}) {
  local.set(lang, new Map(Object.entries(clips || {})));
  for (const [p, b] of Object.entries(files || {})) localFiles.set(p, b);
  if (local.get(lang).size) ready.add(lang);
}
const blobUrl = (b) => { if (!blobUrls.has(b)) blobUrls.set(b, URL.createObjectURL(b)); return blobUrls.get(b); };

// a sound's address: the pack's copy when this phone has one (the APK carries no audio), else its own path
export function soundUrl(url) {
  const m = /audio\/(bells\/[\w.-]+)$/.exec(String(url || ''));
  const b = m && localFiles.get(m[1]);
  return b ? blobUrl(b) : url;
}

// the app's clips for a language: its manifest's {hash: seconds}, registered for clipFor. The Android app carries no
// audio, so it asks the hub or the online home, and asks again later if they were out of reach.
export function loadClips(lang) {
  if (!manifests.has(lang)) {
    const at = android.isApp() ? hubUrl(`/audio/${lang}/manifest.json`) : `audio/${lang}/manifest.json`;
    manifests.set(lang, fetch(at).then((r) => (r.ok ? r.json() : android.isApp() ? Promise.reject(new Error(r.status)) : {}))
      .then((m) => {
        const clips = (m && m.clips && typeof m.clips === 'object') ? m.clips : {};
        const map = {};
        for (const h of Object.keys(clips)) if (/^[0-9a-f]{12}$/.test(h)) map[h] = appClip(lang, h);
        addVoices({ [lang]: map });
        if (Object.keys(map).length) ready.add(lang);
        return clips;
      }).catch(() => { manifests.delete(lang); return {}; }));
  }
  return manifests.get(lang);
}

// the clip for exactly this text, or null
export function clipFor(text, lang) {
  const l = local.get(lang), m = voiced.get(lang);
  if (!(l && l.size) && !(m && m.size)) return null;
  const h = textHash(text);
  const b = l && l.get(h);
  return b ? blobUrl(b) : (m && m.get(h)) || null;
}

// A text cut where sentences end, then put back together from the longest runs that have clips: [{url} or {text}]
// in reading order. `parts` is one text or a list (a page's text nodes); each part is covered on its own.
const END = /[.!?؟。،:;]\s+|\s+·\s+/g;
export function cover(parts, lang) {
  const out = [];
  for (const part of Array.isArray(parts) ? parts : [parts]) {
    const t = String(part ?? '').trim();
    if (!t) continue;
    const cuts = [0];
    for (const m of t.matchAll(END)) cuts.push(m.index + m[0].length);
    cuts.push(t.length);
    const n = cuts.length - 1;
    const best = Array(n + 1).fill(null);      // best[j]: [covered letters, plan] for the text up to cut j
    best[0] = [0, []];
    for (let j = 1; j <= n; j++) {
      for (let i = 0; i < j; i++) {
        if (!best[i]) continue;
        const piece = t.slice(cuts[i], cuts[j]);
        const url = clipFor(piece, lang);
        const gain = url ? norm(piece).length : 0;
        if (!url && j - i > 1) continue;         // an unvoiced stretch goes one piece at a time
        const score = best[i][0] + gain;
        if (!best[j] || score > best[j][0]) best[j] = [score, [...best[i][1], url ? { url } : { text: piece.trim() }]];
      }
    }
    for (const x of best[n][1]) {               // neighbouring unvoiced pieces read as one
      const last = out[out.length - 1];
      if (x.text && last && last.text) last.text += ' ' + x.text; else out.push(x);
    }
  }
  return out.filter((x) => x.url || norm(x.text));
}

// true if every part of this text has a clip
export function hasClip(text, lang) { const p = cover(text, lang); return p.length > 0 && p.every((x) => x.url); }

// true if this phone can read the language aloud, with its clips or its own voice (used to read pages to young
// children without a tap)
export function hasVoice(lang) { return ready.has(lang) || !!voiceFor(lang); }

export function stop() {
  turn += 1;
  if (current) { current.pause(); current = null; }
  if (globalThis.speechSynthesis) speechSynthesis.cancel();
}

// clips one after another; onfail if the first cannot play (no network to the hub, say)
function playAll(urls, onfail) {
  const mine = turn;
  const next = (i) => {
    if (mine !== turn || i >= urls.length) { if (mine === turn) current = null; return; }
    const a = new Audio(urls[i]);
    current = a;
    a.addEventListener('ended', () => next(i + 1));
    a.play().catch(() => { if (mine === turn) (i === 0 ? onfail() : next(i + 1)); });
  };
  next(0);
}

const wordy = (t) => /[\p{L}]/u.test(t);

// text: plain text to read, or a list of texts read in order; lang: prs, ps, en or zh; opts: a pack clip (URL or
// {url, placeholder}), or {audio, key, shown, recorded}: `audio` the step's own clip; `key` the i18n key the text came
// from (kept for callers; the text's hash finds the clip); with `shown`, a phone without a voice shows the words in a
// toast instead of "voice not ready" (the school day's bells: P19); with `recorded`, only a clip plays, never the
// phone's voice (P27a)
export async function speak(text, lang, opts) {
  stop();
  const mine = turn;
  const o = opts && typeof opts === 'object' && !('url' in opts) ? opts : { audio: opts };
  const all = Array.isArray(text) ? text.filter(Boolean).join(' ') : text;
  const fallback = () => (o.recorded ? toast(s('not_recorded')) : sayWithVoice(all, lang, o.shown));
  const url = packClip(o.audio);
  if (url) { playAll([url], fallback); return; }
  await loadClips(lang);
  if (mine !== turn) return;
  const plan = cover(text, lang);
  const urls = plan.filter((x) => x.url).map((x) => x.url);
  const gaps = plan.filter((x) => x.text);
  if (!urls.length) { fallback(); return; }
  // every part voiced, or the parts without a clip are only numbers and marks: her one voice. Otherwise the phone's
  // voice reads it all (never two voices in one text), and with no phone voice the clips that exist play.
  if (!gaps.length || o.recorded || !gaps.some((g) => wordy(g.text)) || !voiceFor(lang)) playAll(urls, fallback);
  else sayWithVoice(all, lang, o.shown);
}

// a recording only, never the phone's voice (P29: a verse's recitation, a translation's reading): onend after it
// has played to its end, onfail when it cannot play ("not recorded yet" unless onfail says otherwise)
export function play(url, { onend, onfail } = {}) {
  stop();
  const a = new Audio(url);
  current = a;
  a.addEventListener('ended', () => { if (current === a) current = null; if (onend) onend(a); });
  a.play().catch(() => (onfail ? onfail() : toast(s('not_recorded'))));
  return a;
}

// an interface string by its key: its clip, else the phone's voice reading the words
export function sayKey(key, lang, vars, opts = {}) { return speak(s(key, vars), lang, { key, ...opts }); }

function sayWithVoice(text, lang, shown = false) {
  const clean = String(text || '').replace(/\$/g, '').trim();
  const v = voiceFor(lang);
  if (!clean || !globalThis.speechSynthesis || !v) { toast(shown && clean ? clean : s('no_voice')); return; }
  const u = new SpeechSynthesisUtterance(clean);
  u.voice = v; u.lang = v.lang; u.rate = 0.9;
  speechSynthesis.speak(u);
}

// Sounds that play without a tap (the school day's bells, P19). Browsers block sound until the page has had a tap,
// so the first tap anywhere unlocks it (C3.1): an AudioContext is made and resumed inside that tap, and the bells are
// fetched and decoded then, so the first bell is not blocked. Where Web Audio cannot decode a file, a plain Audio
// element plays it, which a page that has had a tap may also do.
let actx = null;
const decoded = new Map();          // url -> Promise of an AudioBuffer, or null

export function unlockAudio(preload = []) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  try {
    if (!actx && AC) actx = new AC();
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    if (actx) {                                  // a silent sample, played inside the tap
      const src = actx.createBufferSource();
      src.buffer = actx.createBuffer(1, 1, 22050);
      src.connect(actx.destination);
      src.start(0);
    }
  } catch { actx = null; }
  for (const url of preload) buffer(url);
}

// unlock on the first tap or key, once
export function unlockOnFirstTap(preload = []) {
  if (!globalThis.document) return;
  const go = () => {
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('keydown', go, true);
    unlockAudio(preload);
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

function buffer(url) {
  if (!actx) return Promise.resolve(null);
  if (!decoded.has(url)) {
    decoded.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => new Promise((ok, no) => actx.decodeAudioData(b, ok, no))).catch(() => null));
  }
  return decoded.get(url);
}

// play a short sound file; true if it could start
export async function chime(url) {
  url = soundUrl(url);
  if (actx && actx.state === 'suspended') await actx.resume().catch(() => {});
  if (actx && actx.state === 'running') {
    const b = await buffer(url);
    if (b) {
      const src = actx.createBufferSource();
      src.buffer = b;
      src.connect(actx.destination);
      src.start(0);
      return true;
    }
  }
  try { await new Audio(url).play(); return true; } catch { return false; }
}

// voices load late on some phones
if (globalThis.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

export function canRecord() {
  const app = globalThis.QalamAndroid;
  if (app) { try { if (typeof app.canRecord !== 'function' || app.canRecord() !== true) return false; } catch { return false; } }
  if (globalThis.isSecureContext === false) return false;
  return !!(globalThis.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && globalThis.MediaRecorder);
}

// one tap starts, the next tap stops and plays the child's own voice back; nothing is saved or sent
export function recorder(onState) {
  let rec = null, chunks = [], stream = null;
  return async function toggle() {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch { toast(s('error')); return; }
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      onState(false);
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      stop();
      current = new Audio(url);
      current.onended = () => URL.revokeObjectURL(url);
      current.play().catch(() => {});
    };
    rec.start();
    onState(true);
    setTimeout(() => { if (rec && rec.state === 'recording') rec.stop(); }, 8000);   // never record for long
  };
}
