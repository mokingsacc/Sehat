// The Quran reader (P29, C4.7), the `quran` module, for s1, s2 and adult readers: #/quran is the surah list with the
// search and her last place, #/quran/<n> a surah and #/quran/<n>/<a> a surah at a verse. The text is Tanzil's, the
// translation of the meanings QuranEnc's, the recitation one reciter's per verse, each as published (quran.js); the
// credit lines and Tanzil's notice end every surah. Retrieval only: the search finds verses by code, and no AI is
// anywhere near. The page speaker reads the screen's own words and never a verse or its translation; the verse's
// play button is its recitation, and "Play from the top" plays the surah verse by verse, the playing one on --soft.
// Her last place is kept on the phone (state `quran`); the reader sends no events.

import { fa, s } from '../i18n.js';
import * as Q from '../quran.js';
import { stop } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, playIcon, topbar } from '../ui.js';

const back = (n) => (n ? '#/quran' : '#/home');

function notHere(n) {
  return h('div', { class: 'screen', 'data-speaks': '' }, topbar({ back: back(n), title: s('quran'), child: true }),
    h('div', { class: 'empty' }, s('quran_not_here')));
}

function searchBox(onFind) {
  const inp = h('input', { type: 'search', dir: 'auto', autocomplete: 'off', placeholder: s('quran_find'),
    'aria-label': s('quran_find') });
  return h('form', { class: 'answer-in quran-find', role: 'search', onSubmit: (e) => { e.preventDefault(); onFind(inp.value); } },
    inp, h('button', { class: 'btn primary', type: 'submit' }, s('quran_go')));
}

async function list(idx, c) {
  const el = h('div', { class: 'screen quran', 'data-speaks': '' });
  const out = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
  const lang = Q.trLang(idx);
  async function find(text) {
    const q = Q.parseQuery(text, idx);
    if (!q) { fill(out, h('p', { class: 'muted' }, s('quran_none'))); return; }
    if (q.kind === 'surah') { location.hash = '#/quran/' + q.n; return; }
    if (q.kind === 'verse') { location.hash = `#/quran/${q.s}/${q.a}`; return; }
    const draw = (docs) => {
      const hits = Q.findWord(q.w, docs, lang);
      fill(out, h('p', { class: 'muted small' }, s('quran_searched', { n: fa(docs.length) }), ' · ', s('quran_found', { n: fa(hits.length) })),
        hits.length ? h('nav', { class: 'subjects' }, hits.slice(0, 50).map((x) => h('a', { href: `#/quran/${x.s}/${x.a}` },
          h('span', { class: 'grow' }, h('b', { lang: 'ar', dir: 'rtl' }, x.ar), h('small', { class: 'muted', dir: 'ltr' }, `${x.s}:${x.a}`)),
          icon('chev', 20)))) : null,
        docs.length < idx.surahs.length ? h('button', { type: 'button', class: 'btn outline', onClick: async () => {
          fill(out, h('p', { class: 'muted' }, s('loading')));
          const all = [];
          for (const x of idx.surahs) { const d = await Q.surah(x.n); if (d) all.push(d); }
          draw(all);
        } }, s('quran_search_all')) : null);
    };
    draw((await Promise.all(Q.cached().map((n) => Q.surah(n)))).filter(Boolean));
  }
  const last = c.quran ? idx.surahs[c.quran[0] - 1] : null;
  fill(el,
    topbar({ back: '#/home', title: s('quran'), child: true }),
    idx.draft ? h('div', { class: 'draft', 'data-silent': '' }, s('quran_draft')) : null,
    h('div', { class: 'stack pad' }, searchBox(find), out,
      last ? h('a', { class: 'card soft continue', href: `#/quran/${c.quran[0]}/${c.quran[1]}` },
        h('span', { class: 'grow' }, s('quran_last', { s: last.tname, a: fa(c.quran[1]) })), icon('chev', 20)) : null),
    h('nav', { class: 'subjects quran-list', 'aria-label': s('quran') }, idx.surahs.map((x) => h('a', { href: '#/quran/' + x.n },
      h('span', { class: 'sbadge s-quran', style: { width: '36px', height: '36px', fontSize: '15px' } }, fa(x.n)),
      h('span', { class: 'grow' }, h('b', { lang: 'ar', dir: 'rtl', class: 'sname' }, x.ar),
        h('small', { class: 'muted' }, h('bdi', { dir: 'ltr' }, x.tname), ' · ', s('quran_verses', { n: fa(x.ayas) }))),
      icon('chev', 20)))),
    Q.creditBlock(idx.credits));
  return el;
}

async function surahView(idx, c, n, at) {
  const d = await Q.surah(n);
  if (!d) return notHere(n);
  const lang = Q.trLang(idx);
  const el = h('div', { class: 'screen quran', 'data-speaks': '' });
  let playing = 0;
  let stopAll = null;
  const views = d.verses.map((v) => Q.verseView(v, { lang, credits: null }));
  const mark = (a) => views.forEach((x, k) => x.classList.toggle('playing', k + 1 === a));
  const playBtn = h('button', { type: 'button', class: 'btn outline' });
  const setBtn = () => fill(playBtn, playing ? [icon('stop', 22), s('quran_stop')] : [playIcon(20), s('quran_play_all')]);
  function from(a) {
    const v = d.verses[a - 1];
    if (!v) { playing = 0; mark(0); setBtn(); return; }
    if (!v.audio) { from(a + 1); return; }            // a verse not fetched here: on to the next
    playing = a; mark(a); setBtn();
    state.updateChild(c.id, { quran: [n, a] });
    views[a - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    Q.recite(v, { onend: () => { if (playing === a) from(a + 1); } });
  }
  playBtn.addEventListener('click', () => {
    if (playing) { playing = 0; stop(); mark(0); setBtn(); } else from(1);
  });
  stopAll = () => { playing = 0; stop(); };
  setBtn();
  const anyAudio = d.verses.some((v) => v.audio);
  fill(el,
    topbar({ back: '#/quran', sub: s('quran'), title: h('span', { lang: 'ar', dir: 'rtl' }, d.ar), child: true }),
    idx.draft ? h('div', { class: 'draft', 'data-silent': '' }, s('quran_draft')) : null,
    h('div', { class: 'stack pad' },
      h('p', { class: 'muted small' }, h('bdi', { dir: 'ltr' }, d.tname), ' · ', s('quran_verses', { n: fa(d.ayas) }),
        lang ? [' · ', s('quran_meaning')] : null),
      anyAudio ? playBtn : null),
    h('div', { class: 'ayahs' }, views),
    Q.creditBlock(d.credits));
  // her place: the verse she opened, else the top
  state.updateChild(c.id, { quran: [n, at && at <= d.ayas ? at : 1] });
  if (at) setTimeout(() => { const t = views[at - 1]; if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('found'); } }, 50);
  return { el, cleanup: () => stopAll && stopAll() };
}

export default async function quran(args) {
  const [ns, as] = args;
  const c = state.child();
  const idx = await Q.load();
  const n = /^[0-9]{1,3}$/.test(ns || '') ? +ns : 0;
  if (!idx) return { el: notHere(n), tab: 'lessons' };
  if (!n) return { el: await list(idx, c), tab: 'lessons' };
  if (n > idx.surahs.length) { location.replace('#/quran'); return { el: h('div'), tab: 'lessons' }; }
  const v = await surahView(idx, c, n, /^[0-9]{1,3}$/.test(as || '') ? +as : 0);
  return v.el ? { el: v.el, tab: 'lessons', cleanup: v.cleanup } : { el: v, tab: 'lessons' };
}

