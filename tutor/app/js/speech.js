// The speaker on every text, and "say it" (record yourself, hear it back).
// A recorded clip from the pack is used first; otherwise the phone's own voice if it has one for the language
// (most Android phones read Persian; few read Pashto yet, so Pashto packs need recorded clips).

import { s } from './i18n.js';
import { toast } from './ui.js';

const VOICE_LANG = { prs: ['fa-AF', 'fa-IR', 'fa'], ps: ['ps-AF', 'ps'], en: ['en-GB', 'en-US', 'en'] };
let current = null;

function voiceFor(lang) {
  const voices = (globalThis.speechSynthesis && speechSynthesis.getVoices()) || [];
  for (const want of VOICE_LANG[lang] || []) {
    const v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(want.toLowerCase()));
    if (v) return v;
  }
  return null;
}

// true if this phone can read the language aloud (used to read pages to young children without a tap)
export function hasVoice(lang) { return !!voiceFor(lang); }

export function stop() {
  if (current) { current.pause(); current = null; }
  if (globalThis.speechSynthesis) speechSynthesis.cancel();
}

// text: plain text to read; lang: prs, ps or en; audio: a clip URL from the pack, if there is one
export function speak(text, lang, audio) {
  stop();
  if (audio) {
    current = new Audio(audio);
    current.play().catch(() => sayWithVoice(text, lang));
    return;
  }
  sayWithVoice(text, lang);
}

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
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && globalThis.MediaRecorder);
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
