// The speaker on every text, and "say it" (record yourself, hear it back).
// In order (DESIGN.md 9): a recorded clip (from the pack for lesson steps, or app/audio/<lang>/<key>.opus for the
// app's own words, named in that folder's manifest.json), then the phone's own voice if it has one for the
// language (most Android phones read Persian; few read Pashto yet), then the "voice not ready yet" note.
// No synthetic Dari or Pashto voice is ever shipped: every clip is a recording by a native speaker. Clips marked
// as placeholders (stand-ins to test the plumbing, not speech) are skipped unless a tester turns them on.

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

// text: plain text to read; lang: prs, ps or en; opts: a pack clip (URL or {url, placeholder}), or {audio, key}
// where key is the i18n key of an interface string, whose recorded clip plays first
export async function speak(text, lang, opts) {
  stop();
  const o = opts && typeof opts === 'object' && !('url' in opts) ? opts : { audio: opts };
  let url = packClip(o.audio);
  if (!url && o.key) url = clipUrl(await loadClips(lang), o.key, lang);
  if (url) {
    const a = new Audio(url);
    current = a;
    a.play().catch(() => sayWithVoice(text, lang));
    return;
  }
  sayWithVoice(text, lang);
}

// an interface string by its key: its clip, else the phone's voice reading the words
export function sayKey(key, lang, vars) { return speak(s(key, vars), lang, { key }); }

function sayWithVoice(text, lang) {
  const clean = String(text || '').replace(/\$/g, '').trim();
  const v = voiceFor(lang);
  if (!clean || !globalThis.speechSynthesis || !v) { toast(s('no_voice')); return; }
  const u = new SpeechSynthesisUtterance(clean);
  u.voice = v; u.lang = v.lang; u.rate = 0.9;
  speechSynthesis.speak(u);
}

// voices load late on some phones
if (globalThis.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

export function canRecord() {
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
