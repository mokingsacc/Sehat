// Sehat finder results: turns the ranked page ids from js/search.js into cards (picture or icon, title, one line,
// speaker). It writes no advice: every card opens an existing page, section, tool or screen. Plain ES module, offline.
// js/app.js calls initFinder(ctx) once with its own helpers and puts finder.results(query) under the search box.
import { createSearch } from './search.js';

export function initFinder(ctx) {
  const { S, esc, T, L, ic, I, spk, isAdultTopic } = ctx;
  let eng = null, engBook = null;
  const engine = () => { if (engBook !== S.book) { eng = createSearch(S.book); engBook = S.book; } return eng; };
  const say = (id) => L(S.book.narration[id]);
  const cut = (s, n = 110) => (s.length > n ? s.slice(0, n) + '…' : s);
  const DEV = { temp: 'kit-thermometer', bp: 'kit-bp', sugar: 'kit-glucometer', spo2: 'kit-oximeter', muac: 'kit-muac' };
  const img = (src) => `<img src="${esc(src)}" alt="" decoding="async">`;
  const icon = (name) => `<span class="ricon">${name === 'warn' ? I.warn : ic(name)}</span>`;
  // what a screen or tool card shows: [picture, title, line, narration id]
  function about(key) {
    const kit = S.book.topics['kit-buy'];
    switch (key) {
      case 'emergency': return [icon('warn'), T('emergency'), T('emergencySub'), 'ui.emergency'];
      case 'kit': return [kit ? img(kit.image) : icon('card'), T('kit'), T('kitSub'), 'ui.kit'];
      case 'near': return [img('img/pics/row-near.svg'), T('near'), T('nearSub'), 'ui.near'];
      case 'family': return [icon('card'), T('myFamily'), '', 'ui.family'];
      case 'children': return [img('img/app/home-children.svg'), T('children'), '', 'ui.children'];
      case 'adults': return [img('img/app/home-adults.svg'), T('adults'), '', 'ui.adults'];
      case 'tool/breaths': return [icon('breathing-fast'), T('breaths'), T('breathsSub'), 'ui.breaths'];
      case 'tool/reading': return [icon('bp'), T('reading'), T('readingSub'), 'ui.reading'];
    }
    const t = S.book.topics[DEV[key.split('/')[2]]];
    return t ? [img(t.image), L(t.title), T('reading'), DEV[key.split('/')[2]] + '.title'] : null;
  }
  function card(r) {
    let pic, title, line, sayId, adult = false;
    const t = S.book.topics[r.id];
    if (t) {
      pic = img(t.image); title = L(t.title); line = L(t.summary); sayId = r.id + '.title'; adult = isAdultTopic(t);
      const b = r.target && (t.blocks || []).find((x) => x.id === r.target);
      if (b) line = L(b.title) || say(b.id) || line; // the section the words point to
    } else {
      const a = about(r.id); if (!a) return '';
      [pic, title, line, sayId] = a;
    }
    const badge = r.danger ? `<span class="rbadge">${I.warn}${esc(T('emergency'))}</span>` : '';
    return `<div class="rcard${r.danger ? ' danger' : ''}${adult ? ' adult' : ''}"><a href="${esc(r.route)}" class="rimg">${pic}</a>` +
      `<a href="${esc(r.route)}" class="rt">${badge}<b>${esc(title)}</b>${line ? `<span>${esc(cut(line, 140))}</span>` : ''}</a>${spk(sayId)}</div>`;
  }
  // "These pages can help", with its speaker (as the group headings in the lists)
  const head = () => (S.book.narration['ui.results'] ? `<div class="group-h sayh" data-block="ui.results"><h2 class="t">${esc(T('results'))}</h2>${spk('ui.results')}</div>` : `<h2 class="sub-h">${esc(T('results'))}</h2>`);
  // nothing matched: never a blank screen. The "see a health worker" line, then the ways in: Emergency, Children,
  // Adults and the nearest clinic.
  function none() {
    const id = S.book.narration['ui.askNone'] ? 'ui.askNone' : null;
    const note = `<div class="blk tip"${id ? ` data-block="${id}"` : ''}><div class="body">${esc(id ? say(id) : T('noResults'))}</div>${id ? spk(id) : ''}</div>`;
    return note + ['emergency', 'children', 'adults', 'near'].map((k) => card({ id: k, route: '#/' + k, danger: false })).join('');
  }
  /** Result cards for what someone typed or said (top 5, danger pages first with the red badge). live = still typing:
   *  nothing until there are 2 letters, and the "nothing found" help only once a word or two is there. */
  function results(q, live) {
    const n = String(q || '').trim().length;
    if (!n || (live && n < 2)) return '';
    let res = [];
    try { res = engine().rank(q, S.lang, { limit: 5 }); } catch (e) { console.warn('search', e); }
    const html = res.map(card).join('');
    return html ? head() + html : live && n < 5 ? '' : none();
  }
  /** Put result html into el while typing: cards that stay the same keep their element (no picture reload). */
  function show(el, html) {
    // (skip only when el still shows what this function put there: a sent search or a picture may have replaced it)
    if (el.liveHtml === html && (html ? el.firstElementChild && el.firstElementChild.liveKey : !el.children.length)) return;
    el.liveHtml = html;
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const old = new Map(); for (const c of el.children) if (c.liveKey) old.set(c.liveKey, c);
    const next = [...tpl.content.children].map((c) => {
      const k = c.outerHTML, o = old.get(k);
      if (o) { old.delete(k); return o; }
      c.liveKey = k; return c;
    });
    while (el.firstChild) el.removeChild(el.firstChild); // (replaceChildren is missing on older Android phones)
    for (const c of next) el.appendChild(c);
  }
  /** Build the word index for the reader's language ahead of the first letter typed. */
  function warm() { try { engine().warm(S.lang); } catch {} }
  return { results, show, warm, rank: (q, o) => engine().rank(q, S.lang, o), engine };
}
