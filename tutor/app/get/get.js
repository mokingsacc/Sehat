// /get (P23, C3.6, DESIGN-C2C3-SPECS item 15): the Android app's download page, plain, in the clean look and the
// reader's language (?lang=prs|ps|en, else the phone's), with a speaker on every line. Served by the hub and, online,
// as a Worker static asset. The APK sits beside this page as get/qalam-<version>.apk with get/apk.json
// {version, file, size, sha256, cert}, put there at release (docs/HOSTING.md); until then the page says the app is
// not ready and points to Qalam in the browser. Never linked from Home: Settings → About in an Android browser, and
// the printed class card. Nothing is kept or sent; the service worker leaves /get/ alone.

import { LANGS, dir, fa, getLang, htmlLang, s, setLang, setTone } from '../js/i18n.js';
import { speak } from '../js/speech.js';
import { h, icon, speakerBtn } from '../js/ui.js';

const root = document.getElementById('get');

function pickLang() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(asked)) return asked;
  const phone = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  if (phone.startsWith('ps')) return 'ps';
  if (phone.startsWith('fa') || phone.startsWith('prs')) return 'prs';
  return phone.startsWith('en') ? 'en' : 'prs';
}

// a line with its speaker at the end
const line = (el, text) => h('div', { class: 'row get-line' }, h('div', { class: 'grow' }, el),
  speakerBtn(() => speak(text, getLang()), { size: 'sm' }));

// the three steps, drawn: the downloaded file, the "unknown apps" switch, the Install button
const PICS = [
  '<rect x="18" y="6" width="44" height="76" rx="7"/><path d="M26 22h28v20H26z"/><path d="M40 26v10M35 32l5 5 5-5"/><path d="M26 52h28M26 60h18"/><circle cx="52" cy="70" r="5" fill="currentColor"/>',
  '<rect x="18" y="6" width="44" height="76" rx="7"/><path d="M26 24h16M26 32h22"/><rect x="40" y="46" width="16" height="9" rx="4.5" fill="currentColor"/><circle cx="51.5" cy="50.5" r="3" fill="#fff"/><path d="M26 50h10"/>',
  '<rect x="18" y="6" width="44" height="76" rx="7"/><path d="M26 22h28M26 30h20"/><rect x="34" y="58" width="22" height="10" rx="3" fill="currentColor"/><path d="M49 74l3 8 2-4 4 3"/>',
];
const pic = (i) => {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="get-pic" viewBox="0 0 80 88" width="80" height="88" fill="none" stroke="currentColor" stroke-width="2.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PICS[i]}</svg>`;
  return t.content.firstChild;
};

async function draw() {
  setLang(pickLang());
  setTone('adult');
  document.documentElement.lang = htmlLang();
  document.documentElement.dir = dir();
  document.title = s('get_title');
  let apk = null;
  try {
    const r = await fetch('apk.json', { cache: 'no-store' });
    if (r.ok) apk = await r.json();
  } catch { /* offline, or not released yet */ }
  const ready = apk && typeof apk.file === 'string' && /^qalam-[0-9.]+\.apk$/.test(apk.file) && apk.version;
  const head = h('header', { class: 'top' }, h('h1', { class: 'grow' }, s('get_title')),
    speakerBtn(() => speak([s('get_title'), s('get_lead')].join('. '), getLang()), { size: 'sm' }));
  if (!ready) {
    root.replaceChildren(head, h('div', { class: 'stack pad' },
      line(h('p', { class: 'lead' }, s('get_none')), s('get_none')),
      h('a', { class: 'btn primary big', href: '../' }, s('get_open'))));
    return;
  }
  const mb = fa((Number(apk.size || 0) / 1048576).toFixed(1));
  const steps = ['get_step1', 'get_step2', 'get_step3'].map((k, i) => h('li', { class: 'get-step' },
    h('span', { class: 'get-n' }, fa(i + 1)), pic(i), h('div', { class: 'grow' }, line(h('b', {}, s(k)), s(k)))));
  root.replaceChildren(head, h('div', { class: 'stack pad' },
    line(h('p', { class: 'lead' }, s('get_lead')), s('get_lead')),
    line(h('a', { class: 'btn primary big', href: apk.file, download: apk.file, type: 'application/vnd.android.package-archive' },
      icon('download', 24), s('get_download', { mb })), s('get_download', { mb })),
    h('p', { class: 'muted small' }, s('get_version', { v: fa(apk.version) })),
    h('ol', { class: 'get-steps' }, steps),
    line(h('p', { class: 'small' }, s('get_warning')), s('get_warning')),
    h('details', { class: 'card lined get-check' }, h('summary', {}, s('get_teachers')),
      h('p', { class: 'small' }, s('get_sha'), ' ', h('span', { class: 'm', dir: 'ltr' }, '(SHA-256)')),
      h('code', { class: 'm', dir: 'ltr' }, String(apk.sha256 || '')),
      apk.cert ? [h('p', { class: 'small' }, s('get_cert'), ' ', h('span', { class: 'm', dir: 'ltr' }, '(SHA-256)')),
        h('code', { class: 'm', dir: 'ltr' }, String(apk.cert))] : null)));
}

draw();
