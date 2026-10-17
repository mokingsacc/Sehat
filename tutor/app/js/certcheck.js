// /v/<id> (P25b, C4.2): the page a certificate's QR code opens. Plain, in the clean look, with a language switch
// (Dari, Pashto, English) and a speaker on every line. It asks GET /api/cert/<id> (no token; the server answers the
// course in three languages and the month, or 404) and says whether the certificate is real. Qalam keeps no names,
// so the page says to compare the name on the paper with the person's ID. Nothing is kept or sent; the page is served
// by the hub and, online, by the Worker (wrangler: run_worker_first "/v/*"), never by the service worker.

import { LANGS, dir, getLang, htmlLang, s, setLang, setTone } from './i18n.js';
import { speak } from './speech.js';
import { h, speakerBtn } from './ui.js';

const root = globalThis.document ? document.getElementById('v') : null;
const ID = /^QC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
const NAMES = { prs: 'دری', ps: 'پښتو', en: 'English' };
let answer;                 // what the server said, kept while the page is open, for the language switch

function pickLang() {
  const phone = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  if (phone.startsWith('ps')) return 'ps';
  return phone.startsWith('en') ? 'en' : 'prs';
}

const line = (el, text) => h('div', { class: 'row get-line' }, h('div', { class: 'grow' }, el),
  speakerBtn(() => speak(text, getLang()), { size: 'sm' }));

export const idOf = (path) => String(decodeURIComponent((path.split('/v/')[1] || '').split(/[/?#]/)[0])).toUpperCase();

async function ask(id) {
  if (!ID.test(id)) return { found: false };
  try {
    const r = await fetch('/api/cert/' + encodeURIComponent(id), { cache: 'no-store' });
    if (r.status === 404) return { found: false };
    if (!r.ok) return { offline: true };
    return { found: true, ...(await r.json()) };
  } catch {
    return { offline: true };
  }
}

function draw(id) {
  const lang = getLang();
  document.documentElement.lang = htmlLang();
  document.documentElement.dir = dir();
  document.title = s('v_title');
  const langs = h('div', { class: 'chips', role: 'group', 'aria-label': s('v_title') }, LANGS.map((l) =>
    h('button', { type: 'button', class: 'chip' + (l === lang ? ' on' : ''), 'aria-pressed': String(l === lang), lang: l,
      onClick: () => { setLang(l); draw(id); } }, NAMES[l])));
  const head = h('header', { class: 'top' }, h('h1', { class: 'grow' }, s('v_title')),
    speakerBtn(() => speak(s('v_title'), lang), { size: 'sm' }));
  const number = h('p', { class: 'muted small' }, s('cert_number'), ' ', h('span', { class: 'm', dir: 'ltr' }, id || '—'));
  let body;
  if (!answer) body = [h('p', { class: 'empty' }, '…')];
  else if (answer.offline) body = [line(h('p', { class: 'lead' }, s('v_offline')), s('v_offline'))];
  else if (!answer.found) body = [line(h('p', { class: 'lead' }, s('v_missing')), s('v_missing'))];
  else {
    const found = s('v_found', { course: answer.course[lang] || answer.course.en, month: answer.months[lang] || answer.month });
    body = [line(h('p', { class: 'lead v-found' }, found), found), line(h('p', {}, s('v_names')), s('v_names'))];
  }
  root.replaceChildren(head, h('div', { class: 'stack pad' }, langs, number, ...body));
}

async function start() {
  setLang(pickLang());
  setTone('adult');
  const id = idOf(location.pathname);
  draw(id);
  answer = await ask(id);
  draw(id);
}

if (root) start();
