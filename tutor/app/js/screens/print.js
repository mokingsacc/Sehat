// Print (on the hub) or Sheets (online): a lesson's worksheet, for a pencil and paper. The preview is the real sheet.
// Sheets with made-up sums get a fresh set every time (the "seed"); the phone remembers it, and keeps the sheet's
// key, so she can check her paper later, even away from the hub or the internet.
// - On the hub, where the `print` module's queue is on, the sheet goes to the hub's printer. Answer sheets, and more
//   than a few copies, need the teacher's PIN; the hub also limits how much one phone can print in an hour.
// - Elsewhere ("Get the sheet", C2.1): "Print or save as PDF" opens the sheet for the browser to print, its title the
//   code alone so a saved PDF is named after it; then, since there is no printer here, "Do it on screen" opens the
//   typed check with the sheet's intro and example.

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import * as sheetcode from '../sheetcode.js';
import * as state from '../state.js';
import { h, icon, plain, said, topbar } from '../ui.js';

const FINAL = new Set(['done', 'saved', 'failed']);

export function rememberKey(lessonId, seed, lang) {
  return hub.sheetKey(lessonId, seed, lang).then((k) => state.cache(`key.${lessonId}.${seed}`, k)).catch(() => null);
}

// the sheet is hers now: remembered for Check my sheet, its key kept on the phone
function remember(lessonId, seed, lang) {
  state.rememberPrint(lessonId, seed);
  return rememberKey(lessonId, seed, lang);
}

export default async function print([id]) {
  await library.load();
  const c = state.child();
  const lang = getLang();
  const L = id ? library.get(id) : library.sheetLesson(c);
  const printing = modules.printer();
  if (!L || !L.sheet) {
    return { el: h('div', { class: 'screen' }, topbar({ back: '#/home', title: s(printing ? 'print' : 'sheets') }),
      h('div', { class: 'empty' }, library.all().length ? s('no_lessons') : s(printing ? 'no_hub_print' : 'sheet_offline'))),
    tab: 'sheets' };
  }
  const seed = L.seeded ? 1000 + Math.floor(Math.random() * 9000) : 0;
  const frame = h('iframe', { title: s('worksheet'), tabindex: '-1', loading: 'lazy' });
  const preview = h('div', { class: 'preview', 'aria-hidden': 'true' }, frame);
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = (msg, cls = '') => { status.className = 'status ' + cls; status.textContent = msg; };
  const showPreview = () => {
    if (!hub.online()) return;
    const src = hub.sheetUrl(L.id, { seed, lang });
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  };
  const checkLink = said(h('a', { class: 'link', href: `#/check/${encodeURIComponent(L.id)}/${seed}` }, icon('check', 20), s('check_sheet')));
  const head = topbar({ back: '#/home', sub: s('todays_sheet'), title: plain(L.title) });
  const panel = printing ? hubPanel(L, seed, lang, say, status, checkLink) : getPanel(L, seed, lang, say, status, checkLink);
  showPreview();
  const el = h('div', { class: 'screen' }, head, panel.top || null, preview, panel.el);
  return { el, tab: 'sheets', cleanup: panel.cleanup, onHub: () => { showPreview(); panel.update(); } };
}

// online, or anywhere without the hub's printer: the browser prints the sheet or saves it as a PDF
function getPanel(L, seed, lang, say, status, checkLink) {
  const go = h('button', { class: 'btn warm big', type: 'button', onClick: printIt }, icon('printer', 30, 2.4), s('print_pdf'));
  const onScreen = h('a', { class: 'btn outline', href: `#/check/${encodeURIComponent(L.id)}/${seed}/screen`,
    onClick: () => remember(L.id, seed, lang) }, icon('pencil', 24), s('on_screen'));
  function printIt() {
    remember(L.id, seed, lang);
    const url = hub.sheetUrl(L.id, { seed, lang, print: true });
    // a new tab, so this screen stays where it was; a phone that refuses opens it here
    const w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;
  }
  function update() {
    const on = hub.online();
    go.disabled = !on;
    if (!on) say(s('sheet_offline'), 'err'); else say('');
  }
  update();
  const el = h('div', { class: 'card pad-card stack' }, said(go), said(onScreen), status,
    h('div', { class: 'row between' }, h('span', { class: 'tag', dir: 'ltr' }, sheetcode.make(L.code, seed)), checkLink));
  return { el, update, cleanup: null };
}

// the hub's printer (the `print` module): copies, the teacher's PIN for answer sheets and many copies, the queue
function hubPanel(L, seed, lang, say, status, checkLink) {
  let kind = 'worksheet';
  let copies = 1;
  let timer = null;
  const free = () => (hub.info() && hub.info().free_copies) || 3;
  const needPin = () => kind === 'answers' || copies > free();
  const n = h('span', { class: 'n' });
  const pinIn = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: s('teacher_pin'),
    'aria-label': s('teacher_pin'), maxlength: 12 });
  const pinRow = h('div', { class: 'pin hidden' }, icon('lock', 24), pinIn);
  const printerBox = h('div', { class: 'printer' });
  const go = h('button', { class: 'btn warm big', type: 'button', onClick: send }, icon('printer', 30, 2.4), s('print_it'));
  // the answer page is the teacher's, behind the PIN (C2.3): its PDF is not a link a learner can open
  const pdf = h('a', { class: 'link', target: '_blank', rel: 'noopener' }, icon('file', 20), s('get_pdf'));
  const pdfBox = said(pdf);
  const segBtns = [['worksheet', 'practice_sheet'], ['answers', 'answer_sheet']].map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => { kind = k; update(); } }, s(label)));

  function drawPrinter() {
    const p = hub.info() && hub.info().printer;
    const ps = !hub.online() ? 'off' : (p && p.state) || 'off';
    const text = !hub.online() ? s('no_hub_print') : s('printer_' + (['ready', 'busy', 'outbox'].includes(ps) ? ps : 'off'));
    printerBox.className = 'printer' + (ps === 'off' ? ' off' : '');
    printerBox.replaceChildren(h('span', { class: 'dot' }),
      h('span', { class: 'grow' }, h('b', {}, s('printer_hub')), h('small', {}, text)), icon('printer', 26));
    go.disabled = !hub.online();
  }

  function update() {
    segBtns.forEach((b, k) => {
      const on = (k === 0) === (kind === 'worksheet');
      b.className = on ? 'on' : '';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    n.textContent = fa(copies);
    pinRow.classList.toggle('hidden', !needPin());
    if (needPin() && !pinIn.value) pinIn.value = state.pin();
    pdf.setAttribute('href', hub.sheetUrl(L.id, { seed, lang, pdf: true }));
    pdfBox.classList.toggle('hidden', !hub.online() || kind === 'answers');
    pdf.classList.toggle('hidden', !hub.online() || kind === 'answers');
    drawPrinter();
  }

  async function send() {
    const pin = needPin() ? pinIn.value.trim() : '';
    if (needPin() && !pin) { say(s('need_pin'), 'err'); pinIn.focus(); return; }
    go.disabled = true;
    say(s('printing'));
    try {
      const r = await hub.printSheet({ lesson: L.id, kind, copies, lang, seed }, pin || undefined);
      if (pin) state.pin(pin);
      if (kind === 'worksheet') remember(L.id, r.seed, lang);
      watch(r.id);
    } catch (e) {
      go.disabled = false;
      if (e.status === 401) { state.pin(''); pinIn.value = ''; say(s('wrong_pin'), 'err'); }
      else if (e.status === 429) say(needPin() ? s('wait_minute') : s('too_many_prints'), 'err');
      else say(hub.online() ? s('print_failed') : s('no_hub_print'), 'err');
    }
  }

  function watch(jid) {
    const started = Date.now();
    clearInterval(timer);
    timer = setInterval(async () => {
      let j = null;
      try { j = await hub.printStatus(jid); } catch { /* try again */ }
      if (j && FINAL.has(j.status)) {
        clearInterval(timer);
        go.disabled = false;
        if (j.status === 'done') say(s('printed'), 'ok');
        else if (j.status === 'saved') say(s('saved'), 'ok');
        else say(s('print_failed'), 'err');
      } else if (Date.now() - started > 180000) {
        clearInterval(timer);
        go.disabled = false;
        say(s('print_failed'), 'err');
      }
    }, 1500);
  }

  const stepper = h('div', { class: 'stepper' }, h('b', {}, s('how_many')),
    h('div', { class: 'ctl' },
      h('button', { type: 'button', 'aria-label': s('fewer'), onClick: () => { copies = Math.max(1, copies - 1); update(); } }, icon('minus')),
      n,
      h('button', { type: 'button', 'aria-label': s('more'), onClick: () => { copies = Math.min(60, copies + 1); update(); } }, icon('plus'))));
  const top = h('div', { class: 'seg2', role: 'group' }, segBtns.map((b) => said(b)));
  const el = h('div', { class: 'card pad-card stack' }, stepper, pinRow, said(go), status, printerBox,
    h('div', { class: 'row between wrap' }, pdfBox, checkLink));
  update();
  hub.refresh().then(drawPrinter);
  return { el, top, update, cleanup: () => clearInterval(timer) };
}
