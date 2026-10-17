// Small building blocks shared by every screen. Text from lessons and answers is always added as text, never as
// HTML, so nothing a hub or a model sends can run in the page.

import { speakerPerButton } from './bands.js';
import { fa, getLang, pick, s } from './i18n.js';
import * as hub from './hub.js';
import * as modules from './modules.js';
import * as outbox from './outbox.js';
import * as state from './state.js';
import { sayKey, speak } from './speech.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  return add(el, kids);
}

function add(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replace what an element shows, skipping empty parts the same way h() does
export function fill(el, ...kids) {
  el.replaceChildren();
  return add(el, kids);
}

const ICONS = {
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>',
  ask: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4"/><path d="M12 17h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  next: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  chev: '<path d="m15 6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9V3"/><path d="M7.5 15h9"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M19 9h3M19 15h3M2 9h3M2 15h3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  erase: '<path d="M21 5H9l-6 7 6 7h12z"/><path d="m12 9 6 6M18 9l-6 6"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
};

export function icon(name, size = 24, sw = 2.2) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="i i-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}

export function playIcon(size = 48) {
  const t = document.createElement('template');
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4.5v15l12-7.5z"/></svg>`;
  return t.content.firstChild;
}

export function star(size = 18, on = true) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="star" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${on ? 'var(--star)' : 'none'}" stroke="var(--star-line)" ` +
    'stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
  return t.content.firstChild;
}

const LATIN_ONLY = /^[^؀-ۿ]*[A-Za-z][^؀-ۿ]*$/;

// Lesson or answer text: $sums$ left to right, digits in the reader's script, English kept left to right.
export function rich(t, lang = getLang()) {
  const text = pick(t, lang);
  const frag = document.createDocumentFragment();
  if (LATIN_ONLY.test(text)) {
    frag.append(h('span', { dir: 'ltr', lang: 'en', class: 'en' }, text.replace(/\$/g, '')));   // an English line's sums need no island
    return frag;
  }
  const digits = (x) => (lang === 'en' ? x : fa(x));
  text.split('$').forEach((part, i) => {
    if (!part) return;
    frag.append(i % 2 ? h('span', { class: 'm', dir: 'ltr' }, digits(part)) : digits(part));
  });
  return frag;
}

export function plain(t, lang = getLang()) { return pick(t, lang).replace(/\$/g, ''); }

const SPEAKER_ICON = { sm: 20, md: 26, lg: 32, xl: 36 };
// page: the header's speaker that reads the whole screen
export function speakerBtn(onClick, { size = 'md', label = s('hear'), solid = false, page = false } = {}) {
  return h('button', { class: `speaker ${size}${solid ? ' solid' : ''}`, type: 'button', 'aria-label': label, onClick,
    'data-page': page || null }, icon('speaker', SPEAKER_ICON[size] || 26));
}

// the band on screen wants a speaker beside every worded button (bands.speakerPerButton)
export function perButton(root = document.documentElement) {
  const d = (root && root.dataset) || {};
  return speakerPerButton(d.band, d.band === 'ad' && d.look === 'bold' ? 'literacy' : null);
}

// a worded button (or row link) with its own 44 px speaker after it, in the bands that want one; elsewhere the
// button alone. The speaker reads what the button says when it is tapped, so a label that changes stays right.
export function said(btn, text) {
  if (!btn || !perButton()) return btn;
  const read = () => speak(text || btn.textContent.replace(/\s+/g, ' ').trim(), getLang());
  return h('span', { class: 'said' }, btn, speakerBtn(read, { size: 'sm' }));
}

// what a page says, in reading order: its text, without the parts that are not for the learner (the draft band and
// the connection chip, marked data-silent), and without anything hidden (P9 look-over, ruling 8)
export function readText(root) {
  const out = [];
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.textContent.trim()) out.push(n.textContent.trim()); continue; }
      if (n.nodeType !== 1 || n.hasAttribute('data-silent') || n.getAttribute('aria-hidden') === 'true') continue;
      if (n.classList.contains('hidden') || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue;
      if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') continue;
      walk(n);
    }
  };
  walk(root);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function readPage(root) { speak(readText(root), getLang()); }

// the header's page speaker, which reads the screen in order
export function pageSpeaker(root) {
  return speakerBtn(() => readPage(root || document.getElementById('app') || document.body),
    { size: 'sm', label: s('hear_page'), page: true });
}

// Press and hold (the consent ring's component, DESIGN.md 7; the grown-up's corner, ruling 6): the button looks
// pressed from the first touch, a ring fills round it over `ms`, the phone vibrates briefly at the end, and lifting
// or leaving early cancels (a short tap calls onTap). Under reduced motion the ring is not drawn and the pressed
// state alone shows it is working. Enter or Space held on a keyboard works the same.
export function holdable(btn, { ms, onDone, onTap, buzz = 30 }) {
  btn.classList.add('hold');
  const ns = 'http://www.w3.org/2000/svg';
  const ring = document.createElementNS(ns, 'svg');
  ring.setAttribute('class', 'ring');
  ring.setAttribute('aria-hidden', 'true');
  const r = document.createElementNS(ns, 'rect');
  r.setAttribute('pathLength', '100');
  ring.append(r);
  btn.append(ring);
  let timer = null;
  const begin = (e) => {
    if (timer || (e.button !== undefined && e.button > 0)) return;
    if (e.cancelable) e.preventDefault();
    if (btn.setPointerCapture && e.pointerId !== undefined) { try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    btn.style.setProperty('--hold-ms', ms + 'ms');
    btn.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      btn.classList.remove('holding');
      try { navigator.vibrate && navigator.vibrate(buzz); } catch { /* no vibration here */ }
      onDone();
    }, ms);
  };
  const cancel = (tap) => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    btn.classList.remove('holding');
    if (tap && onTap) onTap();
  };
  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', () => cancel(true));
  btn.addEventListener('pointerleave', () => cancel(false));
  btn.addEventListener('pointercancel', () => cancel(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) begin(e); });
  btn.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') cancel(true); });
  btn.addEventListener('click', (e) => e.preventDefault());
  return btn;
}

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// The connection chip at the end of every header (C2.5; it replaced hubChip in P11). Online it hides while all is
// well, says "Offline" (and how many things she sent are waiting) when the network is gone, and "Sending…" while
// they go; on the hub it says "Hub" or "No hub". Tapping it opens a small sheet that says what that means and lists
// what waits. Events are never counted. It is never read aloud with the page (data-silent).
export function netChip() {
  const online = hub.home() === 'online';
  const on = hub.online();
  const waits = outbox.waiting();
  const sep = getLang() === 'en' ? ' · ' : '، ';
  let state;
  let label;
  if (online) {
    if (on && outbox.sending()) { state = 'sending'; label = s('net_sending'); }
    else if (on) return h('span', { class: 'netchip hidden', 'data-silent': '' });
    else { state = 'off'; label = s('net_offline') + (waits.length ? sep + s('net_waiting', { n: waits.length }) : ''); }
  } else {
    state = on ? 'on' : 'off';
    label = s(on ? 'net_hub' : 'net_nohub');
  }
  const text = online ? (on ? null : s('net_off_text')) : s(on ? 'net_hub_text' : 'net_nohub_text');
  return h('button', { type: 'button', class: `netchip ${state}`, 'data-silent': '', 'aria-haspopup': 'dialog',
    onClick: () => netSheet(text, waits) }, h('span', { class: 'dot' }), label);
}

function netSheet(text, waits) {
  document.querySelectorAll('.netsheet').forEach((el) => el.remove());
  if (!text && !waits.length) return;
  const close = () => sheet.remove();
  const said1 = [text, ...waits.map((k) => s(k))].filter(Boolean).join('. ');
  const sheet = h('div', { class: 'netsheet', role: 'dialog', 'aria-modal': 'false', onClick: (e) => { if (e.target === sheet) close(); } },
    h('div', { class: 'card stack' },
      h('div', { class: 'row top' }, h('p', { class: 'grow' }, text), speakerBtn(() => speak(said1, getLang()), { size: 'sm' })),
      waits.length ? h('ul', { class: 'waits' }, waits.map((k) => h('li', {}, icon('clock', 18), s(k)))) : null,
      h('button', { type: 'button', class: 'btn', onClick: close }, s('close'))));
  document.body.append(sheet);
}

// the tabs of the modules that are on; each keeps its column, so a tab switched off leaves the others in place.
// `active` is a tab's key or its module's id (the sheets screens say 'sheets', whose tab reads Print on the hub)
export function nav(active) {
  return h('nav', { class: 'tabs', 'aria-label': s('app') },
    modules.tabs().map(({ icon: ic, key, href, module }) => h('a', { href, class: key === active || module === active ? 'on' : '',
      'aria-current': key === active || module === active ? 'page' : null, onClick: () => { if (perButton()) tabSaid = key; } },
    icon(ic, 28, 2.3), h('span', {}, s(key)))));
}

// a tab says its label as it switches, in the bands with a speaker per button (P9 look-over, ruling 1); the router
// says it once the new screen is drawn, since drawing a screen stops whatever was playing
let tabSaid = null;
export function sayTab() {
  const key = tabSaid;
  tabSaid = null;
  if (key) sayKey(key, getLang());
}

// every header keeps the page speaker (P9 look-over, ruling 1), which reads the whole screen, and ends with the
// connection chip (C2.5; net: false where it must not show, as on an early-years child's own screens)
// `child`: a screen the learner herself uses; in early years the net chip stays off those (C2.5: the grown-up's
// screens only)
export function topbar({ back = '#/home', title, sub, extra, speaker = true, net = true, child = false } = {}) {
  const c = child ? state.child() : null;
  if (c && c.band === 'ey') net = false;
  return h('header', { class: 'top' },
    back ? h('a', { class: 'round', href: back, 'aria-label': s('back') }, icon('back', 24, 2.5)) : null,
    h('div', { class: 'grow' }, sub ? h('div', { class: 'kicker' }, sub) : null, title ? h('h1', {}, title) : null),
    speaker ? pageSpeaker() : null, extra || null, net ? netChip() : null);
}

export const SUBJECTS = ['maths', 'science', 'english', 'dari', 'pashto'];
export const SUBJECT_GLYPH = { maths: '÷', science: null, english: 'Ab', dari: 'د', pashto: 'ښ' };

export function subjectBadge(subject, size = 40) {
  const g = SUBJECT_GLYPH[subject];
  return h('span', { class: `sbadge s-${subject}`, style: { width: size + 'px', height: size + 'px' } },
    g ? h('span', { class: subject === 'dari' || subject === 'pashto' ? 'naskh' : '' }, g) : icon('flask', Math.round(size * 0.55), 2.2));
}

export function busy() { return h('div', { class: 'busy' }, s('loading')); }
