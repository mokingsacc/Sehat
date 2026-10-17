// The Quran set on the phone (P29, C4.7), shared by the reader (screens/quran.js) and a Quran lesson's ayah step.
// Everything comes from the hub's set, verbatim: /quran/index.json (the surahs and the credits) and one surah at a
// time from /quran/surah/<n>.json, kept by the service worker once fetched (never the whole Quran by default; the
// recitation per verse, /quran/audio/<edition>/<s>_<a>.mp3, likewise). Nothing here is typed in: no verse, no
// translation, no name of a surah but Tanzil's.
// The voice rule for scripture (C4.7, question 6): a verse and its translation never take the phone's voice. The
// verse's play button is its recitation; a translation has a speaker only where a native speaker's recording exists.
// Their elements carry class `scripture` and data-voice="none", so the page speaker skips them (ui.js readText) and
// the browser check allows them no phone speaker.
// Search is code only: a surah's number, "surah:verse" in either digit set, its name as Tanzil writes it (Arabic or
// transliterated), or an exact word of the translation in her language among the surahs on the phone.

import { getLang, s } from './i18n.js';
import * as hub from './hub.js';
import { latin } from './numbers.js';
import { play, stop } from './speech.js';
import { h, playIcon, speakerBtn } from './ui.js';

let index = null;
const surahs = new Map();          // n -> the surah, this visit (the service worker keeps the files)

async function get(path) {
  const r = await fetch(hub.url(path), { cache: 'no-cache' });
  if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status });
  return r.json();
}

export async function load() {
  if (index) return index;
  try { index = await get('/quran/index.json'); } catch { index = null; }
  return index;
}

export async function surah(n) {
  if (surahs.has(n)) return surahs.get(n);
  try {
    const d = await get(`/quran/surah/${n}.json`);
    surahs.set(n, d);
    return d;
  } catch { return null; }
}

export const cached = () => [...surahs.keys()];

// the translation shown: her language's, else the other one the set has
export function trLang(idx = index, lang = getLang()) {
  const have = (idx && idx.langs) || [];
  return have.includes(lang) ? lang : have.includes('prs') ? 'prs' : have[0] || null;
}

// spelling for matching, as plan.js matches her words, and Uthmani's marks and wasla away
export const fold = (t) => String(t || '').toLowerCase().replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')
  .replace(/ٱ/g, 'ا').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/‌/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const nameKey = (t) => fold(t).replace(/^(ال|al |an |ar |as |ash |at |az |ad |adh )/, '').replace(/[\s-]/g, '')
  .replace(/([aeiou])\1/g, '$1');                     // Tanzil's "Al-Faatiha" is found as "fatiha" too

// what she typed: {kind: 'surah', n} | {kind: 'verse', s, a} | {kind: 'word', w} | null
export function parseQuery(text, idx = index) {
  const t = latin(String(text || '')).trim().replace(/[٫،؛]/g, ':').replace(/\s*[:.]\s*/g, ':');
  let m;
  if ((m = t.match(/^(\d{1,3})$/)) && +m[1] >= 1 && +m[1] <= 114) return { kind: 'surah', n: +m[1] };
  if ((m = t.match(/^(\d{1,3}):(\d{1,3})$/))) {
    const sx = idx && idx.surahs[+m[1] - 1];
    if (sx && +m[2] >= 1 && +m[2] <= sx.ayas) return { kind: 'verse', s: +m[1], a: +m[2] };
    return null;
  }
  if (/^[\d:]+$/.test(t)) return null;              // a number out of range is no word to search
  const key = nameKey(t);
  if (!key) return null;
  const hit = idx && idx.surahs.find((x) => nameKey(x.ar) === key || nameKey(x.tname) === key);
  if (hit) return { kind: 'surah', n: hit.n };
  const w = fold(t);
  return w.length > 1 && !/\s/.test(w) ? { kind: 'word', w } : null;
}

// verses whose translation in `lang` holds the exact word, among the surahs given
export function findWord(w, list, lang) {
  const out = [];
  for (const d of list) {
    for (const v of d.verses) {
      const tr = v.tr && v.tr[lang];
      if (tr && fold(tr.t).split(' ').includes(w)) out.push({ s: d.n, a: v.a, ar: d.ar });
    }
  }
  return out;
}

// the recitation of one verse, never the phone's voice
export function recite(v, { onend } = {}) {
  if (!v.audio) return null;
  return play(hub.url(v.audio.url), { onend, onfail: () => {} });
}

// "Repeat after": the verse, then a pause as long as the verse for her to say it, three times; nothing is recorded
export function repeatAfter(v, onStep) {
  let n = 0;
  let timer = null;
  let stopped = false;
  const once = () => {
    if (stopped) return;
    n += 1;
    onStep(n);
    recite(v, { onend: (a) => {
      if (stopped || n >= 3) { onStep(0); return; }
      timer = setTimeout(once, Math.round((a.duration || 3) * 1000));
    } });
  };
  once();
  return () => { stopped = true; clearTimeout(timer); stop(); onStep(0); };
}

// a translation's own speaker: it plays the native speaker's recording, never the phone's voice (the browser check
// allows a speaker inside scripture only when it is marked data-recorded)
function recordedSpeaker(url) {
  const b = speakerBtn(() => play(url), { size: 'sm' });
  b.setAttribute('data-recorded', '');
  return b;
}

// one verse: its text (Amiri Quran), its play button, its translation (a speaker only where recorded) and its
// notes folded; `clip` is the translation's recording, where a lesson has one
export function verseView(v, { lang, credits, clip = null, playing = false, big = false } = {}) {
  const tr = lang && v.tr ? v.tr[lang] : null;
  const notes = tr && tr.f ? tr.f.split(/\n+/).filter((x) => x.trim()) : [];
  return h('div', { class: 'ayah' + (playing ? ' playing' : ''), id: `v${v.s}-${v.a}` },
    h('div', { class: 'ayah-head' },
      h('span', { class: 'ayah-n', 'data-silent': '' }, `${v.s}:${v.a}`),
      v.audio ? h('button', { type: 'button', class: 'round recite', 'aria-label': s('quran_listen'),
        onClick: () => recite(v) }, playIcon(22)) : h('small', { class: 'muted' }, s('quran_no_audio'))),
    h('p', { class: 'scripture verse' + (big ? ' big' : ''), lang: 'ar', dir: 'rtl', 'data-voice': 'none' }, v.ar),
    tr ? h('div', { class: 'scripture tr row', lang: lang === 'ps' ? 'ps' : 'fa-AF', dir: 'rtl', 'data-voice': 'none' },
      h('p', { class: 'grow' }, tr.t),
      clip ? recordedSpeaker(clip) : null) : null,
    notes.length ? h('details', { class: 'notes scripture', 'data-voice': 'none' },
      h('summary', {}, s('quran_notes', { n: notes.length })), notes.map((x) => h('p', { dir: 'rtl' }, x))) : null,
    credits && tr ? h('p', { class: 'muted small credit', dir: 'ltr', lang: 'en' }, (credits.tr[lang] || {}).line || '') : null);
}

// the exact credit lines and Tanzil's notice, folded
export function creditBlock(cr) {
  if (!cr) return null;
  return h('div', { class: 'source-note quran-credit', dir: 'ltr', lang: 'en' },
    h('p', {}, cr.text, cr.edition ? ` (${cr.edition}) ` : ' ',
      h('a', { href: 'https://tanzil.net/', target: '_blank', rel: 'noopener' }, 'tanzil.net')),      // Tanzil's terms: a link
    Object.values(cr.tr || {}).map((t) => h('p', {}, t.line, ' ', t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener' }, 'QuranEnc.com') : null)),
    cr.audio ? h('p', {}, cr.audio.line) : null,
    cr.notice ? h('details', { class: 'notes' }, h('summary', {}, s('quran_notice')),
      h('pre', { class: 'notice' }, cr.notice)) : null);
}
