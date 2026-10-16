// Credits: everything outside Qalam that the lessons, pictures, clips and link cards use, from the hub's licence
// records (content/sources.json), and the fonts. Its look is for the design committee (C2): plain and
// token-styled for now. Reached from Who is learning until Settings exists (P10).

import { pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import { speak } from '../speech.js';
import { h, speakerBtn, topbar } from '../ui.js';

function row(title, lines, href) {
  const said = [title, ...lines].filter(Boolean).join('. ');
  return h('div', { class: 'card lined credit' },
    h('div', { class: 'row' }, h('b', { class: 'grow', dir: 'auto' }, title), speakerBtn(() => speak(said, 'en'), { size: 'sm' })),
    lines.filter(Boolean).map((t) => h('p', { dir: 'auto' }, t)),
    href ? h('a', { class: 'link', href, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr' }, href) : null);
}

export default async function credits() {
  const c = await hub.credits();
  const sources = (c && c.sources) || [];
  const linked = (c && c.linked) || [];
  const app = (c && c.app) || [];
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/who', title: s('credits') }),
    !c ? h('div', { class: 'empty' }, s('offline')) : null,
    c && !sources.length ? h('p', { class: 'pad muted' }, s('credits_none')) : null,
    sources.length ? h('div', { class: 'section-head' }, h('h2', {}, s('credits_used'))) : null,
    h('div', { class: 'stack pad' }, sources.map((src) => row(src.name,
      [src.owner, src.licence, ...src.items.map((i) => [i.line, pick(i.changes)].filter(Boolean).join(' '))],
      src.licence_url || src.url))),
    linked.length ? h('div', { class: 'section-head' }, h('h2', {}, s('credits_linked'))) : null,
    h('div', { class: 'stack pad' }, linked.map((src) => row(src.name, [src.owner], src.url))),
    app.length ? h('div', { class: 'section-head' }, h('h2', {}, s('credits_app'))) : null,
    h('div', { class: 'stack pad' }, app.map((a) => row(a.name, [a.owner, a.licence], a.url))));
  return { el, tab: null };
}
