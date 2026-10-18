// Credits (DESIGN-C2C3-SPECS.md item 6; Settings → Credits): everything outside Qalam that the lessons on this phone
// use, grouped by source (the server's /api/credits, from the packs' licence records), the sites link cards open,
// the interface voices, and the app's fonts, sounds and code (app/credits.json). Each source opens one level to show
// its items, licence and source. Every word Qalam writes is in the learner's language; an owner's name, a title and
// a licence name stay as the owner wrote them (P9 look-over, ruling 3). Voices are credited as the recorders choose:
// "a native Dari speaker" unless a recorder asked in writing for her name. Offline the text still shows (kept on the
// phone) and the outside links are switched off.

import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import { loadClips, speak } from '../speech.js';
import { cache } from '../state.js';
import { h, speakerBtn, topbar } from '../ui.js';

const say = (t) => () => speak(t, getLang());

async function appCredits() {
  try {
    const r = await fetch('credits.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); cache('appcredits', j); return j; }
  } catch { /* offline: the copy kept on the phone */ }
  return cache('appcredits') || {};
}

// the languages whose interface clips are real recordings (placeholder chimes are not voices)
async function voices(doc) {
  const out = [];
  for (const lang of Object.keys(doc.voices || {})) {
    const clips = await loadClips(lang);
    if (Object.values(clips || {}).some((c) => c && !c.placeholder && c.speaker !== 'placeholder')) {
      out.push((doc.voices[lang] && doc.voices[lang].credit) || s('voice_' + lang));
    }
  }
  return out;
}

const head = (title) => h('div', { class: 'section-head' }, h('h2', {}, title), speakerBtn(say(title), { size: 'sm' }));

function outLink(href, label, online) {
  if (!href) return null;
  return online
    ? h('a', { class: 'link', href, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, label)
    : h('span', { class: 'link off', 'aria-disabled': 'true', title: s('link_offline') }, label);
}

function sourceRow(src, online) {
  const top = [src.name, src.owner].filter(Boolean).join(' · ');
  const items = (src.items || []).map((i) => [i.line, pick(i.changes)].filter(Boolean).join(' '));
  return h('details', { class: 'card lined credit' },
    h('summary', { class: 'row' }, h('b', { class: 'grow', dir: 'auto' }, top),
      speakerBtn((e) => { e.preventDefault(); speak([top, ...items].join('. '), getLang()); }, { size: 'sm' })),
    h('div', { class: 'stack' },
      items.map((t) => h('p', { dir: 'auto' }, t)),
      src.licence ? h('p', { class: 'muted', dir: 'auto' }, src.licence) : null,
      h('div', { class: 'row wrap' }, outLink(src.licence_url, s('licence'), online), outLink(src.url, s('source'), online))));
}

function plainRow(title, line, href, online) {
  const text = [title, line].filter(Boolean).join(': ');
  return h('div', { class: 'card lined credit' },
    h('div', { class: 'row' }, h('p', { class: 'grow', dir: 'auto' }, h('b', {}, title), line ? ': ' + line : ''),
      speakerBtn(say(text), { size: 'sm' })),
    href ? h('div', { class: 'row wrap' }, outLink(href, s('source'), online)) : null);
}

export default async function credits() {
  const [c, mine] = await Promise.all([hub.credits(), appCredits()]);
  const online = hub.online();
  const sources = (c && c.sources) || [];
  const linked = (c && c.linked) || [];
  const voiceLines = await voices(mine);
  const app = [...(mine.fonts || []), ...(mine.sounds || []), ...(mine.code || [])];
  const el = h('div', { class: 'screen credits' },
    topbar({ back: '#/settings', title: s('credits') }),
    h('div', { class: 'pad' }, h('div', { class: 'row' }, h('p', { class: 'grow lead' }, s('credits_intro')),
      speakerBtn(say(s('credits_intro')), { size: 'sm' }))),
    !sources.length && !linked.length ? h('p', { class: 'pad muted' }, s('credits_none')) : null,
    sources.length ? [head(s('credits_used')), h('div', { class: 'stack pad' }, sources.map((src) => sourceRow(src, online)))] : null,
    linked.length ? [head(s('credits_linked')),
      h('div', { class: 'stack pad' }, linked.map((src) => plainRow(src.owner || src.name, s('credits_theirs'), src.url, online)))] : null,
    voiceLines.length ? [head(s('credits_voices')),
      h('div', { class: 'stack pad' }, voiceLines.map((v) => plainRow(v, null, null, online)))] : null,
    app.length ? [head(s('credits_app')),
      h('div', { class: 'stack pad' }, app.map((a) => plainRow(a.name, [a.owner, a.licence].filter(Boolean).join(' · '), a.url, online)))] : null);
  return { el, tab: null };
}
