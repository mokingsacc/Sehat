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
  const KIT = (id) => id === 'kit' || /^kit-/.test(id);
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
  // r.badge: the red badge's words (default Emergency); r.age: "child", "adult" or "pregnant", said on the card
  function card(r) {
    let pic, title, line, sayIds, adult = false;
    const t = S.book.topics[r.id];
    if (t) {
      // the speaker reads the title, who the page is for (when the card says it), then the line under the title
      pic = img(t.image); title = L(t.title); line = L(t.summary); sayIds = [r.id + '.title', AGE_SAY[r.age], r.id + '.summary']; adult = isAdultTopic(t);
      const b = r.target && (t.blocks || []).find((x) => x.id === r.target);
      if (b) { line = L(b.title) || say(b.id) || line; sayIds[2] = b.id; } // the section the words point to
    } else {
      const a = about(r.id); if (!a) return '';
      [pic, title, line] = a; sayIds = [a[3]];
    }
    sayIds = sayIds.filter((id) => id && S.book.narration[id]);
    const badge = r.danger ? `<span class="rbadge">${I.warn}${esc(r.badge || T('emergency'))}</span>` : '';
    const age = r.age && AGE_TEXT[r.age] ? `<span class="rage">${esc(T(AGE_TEXT[r.age]))}</span>` : '';
    return `<div class="rcard${r.danger ? ' danger' : ''}${adult ? ' adult' : ''}"><a href="${esc(r.route)}" class="rimg">${pic}</a>` +
      `<a href="${esc(r.route)}" class="rt">${badge}${age}<b>${esc(title)}</b>${line ? `<span>${esc(cut(line, 140))}</span>` : ''}</a>${spk(sayIds[0], null, sayIds.slice(1))}</div>`;
  }
  const AGE_TEXT = { child: 'forChild', adult: 'forAdult', pregnant: 'forPregnant' };
  const AGE_SAY = { child: 'ui.forChild', adult: 'ui.forAdult', pregnant: 'ui.who.pregnant' };
  const finder = () => S.book.finder || {};
  const dangerSigns = () => new Set(finder().danger || []);
  // the Home tab's pages (lists with "tab": "house"): no medical advice there (Mo's rule), so never a search result,
  // except the home health kit pages when the words are about a device
  const homeTab = () => {
    const out = new Set(), lists = (S.book.config && S.book.config.lists) || {};
    for (const n of Object.keys(lists)) if (lists[n].tab === 'house') for (const t of (S.book.sections || {})[n] || []) out.add(t);
    return out;
  };
  // "These pages can help", with its speaker (as the group headings in the lists)
  const head = () => (S.book.narration['ui.results'] ? `<div class="group-h sayh" data-block="ui.results"><h2 class="t">${esc(T('results'))}</h2>${spk('ui.results')}</div>` : `<h2 class="sub-h">${esc(T('results'))}</h2>`);
  // nothing matched: never a blank screen. The spoken "if you are worried, see a health worker" line, then Emergency,
  // the danger-sign pages (children, adults, pregnancy) in red, and the nearest clinic. The pictures are below.
  function none() {
    const id = S.book.narration['ui.askNone'] ? 'ui.askNone' : null;
    const note = `<div class="blk tip"${id ? ` data-block="${id}"` : ''}><div class="body">${esc(id ? say(id) : T('noResults'))}</div>${id ? spk(id) : ''}</div>`;
    const danger = [...dangerSigns()].filter((tid) => S.book.topics[tid])
      .map((tid) => card({ id: tid, route: '#/topic/' + tid, danger: true, badge: T('dangerSigns') }));
    return note + card({ id: 'emergency', route: '#/emergency', danger: false }) + danger.join('') + card({ id: 'near', route: '#/near', danger: false });
  }
  /** Result cards for what someone typed or said (top 5, danger pages first with the red badge). live = still typing:
   *  nothing until there are 2 letters, and the "nothing found" help only once a word or two is there. */
  function results(q, live, have) {
    const n = String(q || '').trim().length;
    if (!n || (live && n < 2)) return '';
    let res = [];
    try { res = engine().rank(q, S.lang, { limit: 10 }); } catch (e) { console.warn('search', e); }
    // the home health kit pages (Home tab) only when the words are about a device: the best calm match is a kit page,
    // the kit list, or a reading (the checker or a "what the number means" page); the other Home-tab pages never
    const lead = res.find((r) => !r.danger), home = homeTab();
    const kitOk = !!(lead && (KIT(lead.id) || /^(tool\/reading|reading-)/.test(lead.id)));
    res = res.filter((r) => (KIT(r.id) ? kitOk : !home.has(r.id)));
    const html = res.slice(0, 5).map(card).join('');
    // have: the pages of the pictures the words name are already shown above (js/app.js), so no "nothing found"
    return html ? head() + html : live && n < 5 ? '' : have ? '' : none();
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
  return { results, none, show, warm, rank: (q, o) => engine().rank(q, S.lang, o), engine };
}
