// The speaker on every text, and "say it" (record yourself, hear it back).
// In order (DESIGN.md 9): a recorded clip (from the pack for lesson steps, or app/audio/<lang>/<key>.opus for the
// app's own words, named in that folder's manifest.json), then the phone's own voice if it has one for the
// language (most Android phones read Persian; few read Pashto yet), then the "voice not ready yet" note.
// No synthetic Dari or Pashto voice is ever shipped: every clip is a recording by a native speaker. Clips marked
// as placeholders (stand-ins to test the plumbing, not speech) are skipped unless a tester turns them on.
// Since P27a (C4.4) an English or Chinese lesson takes no phone voice at all (`recorded: true`): every word she
// copies is a human voice, so an unrecorded one says "not recorded yet" rather than a phone reading it.
// "Say it" records only in a browser (P27a, C4.4): the APK has no microphone (C3.6, its bridge says so) and the hub's
// plain http gives a page none, so there the step is "hear it, say it" with no mic drawn.

import { s } from './i18n.js';
import { toast } from './ui.js';

const VOICE_LANG = { prs: ['fa-AF', 'fa-IR', 'fa'], ps: ['ps-AF', 'ps'], en: ['en-GB', 'en-US', 'en'] };
const manifests = new Map();          // lang -> Promise of {key: clip}
let current = null;

function voiceFor(lang) {
  const voices = (globalThis.speechSynthesis && speechSynthesis.getVoices()) || [];
  for (const want of VOICE_LANG[lang] || []) {
    const v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(want.toLowerCase()));
    if (v) return v;
  }
  return null;
}

// placeholders play only for a tester: localStorage qalam.clips = "placeholders"
export function placeholdersOn() {
  try { return globalThis.localStorage && localStorage.getItem('qalam.clips') === 'placeholders'; } catch { return false; }
}

// the clip to play for an interface key, or null: a real recording, or a placeholder only when a tester asked
export function clipUrl(clips, key, lang, placeholders = placeholdersOn()) {
  const c = clips && key ? clips[key] : null;
  if (!c || typeof c.file !== 'string' || c.synthetic) return null;
  if (c.placeholder && !placeholders) return null;
  return `audio/${lang}/${c.file}`;
}

// a pack clip from the hub, {url, placeholder}, or a plain URL
export function packClip(a, placeholders = placeholdersOn()) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  return a.url && (!a.placeholder || placeholders) ? a.url : null;
}

export function loadClips(lang) {
  if (!manifests.has(lang)) {
    manifests.set(lang, fetch(`audio/${lang}/manifest.json`).then((r) => (r.ok ? r.json() : {}))
      .then((m) => (m && m.clips) || {}).catch(() => ({})));
  }
  return manifests.get(lang);
}

// true if this phone can read the language aloud (used to read pages to young children without a tap)
export function hasVoice(lang) { return !!voiceFor(lang); }

export function stop() {
  if (current) { current.pause(); current = null; }
  if (globalThis.speechSynthesis) speechSynthesis.cancel();
}

// text: plain text to read; lang: prs, ps, en or zh; opts: a pack clip (URL or {url, placeholder}), or {audio, key,
// shown, recorded} where key is the i18n key of an interface string, whose recorded clip plays first; with `shown`, a
// phone without a voice shows the words in a toast instead of "voice not ready" (the school day's bells: P19); with
// `recorded`, only a recording plays, never the phone's voice (P27a)
export async function speak(text, lang, opts) {
  stop();
  const o = opts && typeof opts === 'object' && !('url' in opts) ? opts : { audio: opts };
  let url = packClip(o.audio);
  if (!url && o.key) url = clipUrl(await loadClips(lang), o.key, lang);
  if (url) {
    const a = new Audio(url);
    current = a;
    a.play().catch(() => (o.recorded ? toast(s('not_recorded')) : sayWithVoice(text, lang, o.shown)));
    return;
  }
  if (o.recorded) { toast(s('not_recorded')); return; }
  sayWithVoice(text, lang, o.shown);
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
