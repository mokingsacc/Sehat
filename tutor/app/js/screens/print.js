// Print: the worksheet for a lesson goes straight to the hub's printer. The preview is the real sheet.
// Sheets with made-up sums get a fresh set every time (the "seed"); the phone remembers it so the child can
// check their paper later, even away from the hub. Answer sheets, and more than a few copies, need the
// teacher's PIN; the hub also limits how much one phone can print in an hour.

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as state from '../state.js';
import { h, hubChip, icon, plain, topbar } from '../ui.js';

const FINAL = new Set(['done', 'saved', 'failed']);

export function rememberKey(lessonId, seed, lang) {
  return hub.sheetKey(lessonId, seed, lang).then((k) => state.cache(`key.${lessonId}.${seed}`, k)).catch(() => null);
}

export default async function print([id]) {
  await library.load();
  const c = state.child();
  const lang = getLang();
  const L = id ? library.get(id) : library.sheetLesson(c);
  if (!L || !L.sheet) {
    return { el: h('div', { class: 'screen' }, topbar({ back: '#/home', title: s('print'), extra: hubChip() }),
      h('div', { class: 'empty' }, library.all().length ? s('no_lessons') : s('no_hub_print'))), tab: 'print' };
  }
  let kind = 'worksheet';
  let copies = 1;
  let withName = !!c.name;
  const seed = L.seeded ? 1000 + Math.floor(Math.random() * 9000) : 0;
  let timer = null;
  const free = () => (hub.info() && hub.info().free_copies) || 3;
  const needPin = () => kind === 'answers' || copies > free();

  const frame = h('iframe', { title: s('worksheet'), tabindex: '-1', loading: 'lazy' });
  const preview = h('div', { class: 'preview', 'aria-hidden': 'true' }, frame);
  const n = h('span', { class: 'n' });
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const pinIn = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: s('teacher_pin'),
    'aria-label': s('teacher_pin'), maxlength: 12 });
  const pinRow = h('div', { class: 'pin hidden' }, icon('lock', 24), pinIn);
  const printerBox = h('div', { class: 'printer' });
  const go = h('button', { class: 'btn warm big', type: 'button', onClick: send }, icon('printer', 30, 2.4), s('print_it'));
  const pdf = h('a', { class: 'link', target: '_blank', rel: 'noopener' }, icon('file', 20), s('get_pdf'));
  const segBtns = [['worksheet', 'practice_sheet'], ['answers', 'answer_sheet']].map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => { kind = k; update(); } }, s(label)));

  function say(msg, cls = '') { status.className = 'status ' + cls; status.textContent = msg; }

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
    const name = withName && kind === 'worksheet' ? c.name : '';
    if (hub.online()) {
      const src = hub.sheetUrl(L.id, { seed, lang, kind, name });
      if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    }
    pdf.setAttribute('href', hub.sheetUrl(L.id, { seed, lang, kind, pdf: true }));
    pdf.classList.toggle('hidden', !hub.online());
    drawPrinter();
  }

  async function send() {
    const pin = needPin() ? pinIn.value.trim() : '';
    if (needPin() && !pin) { say(s('need_pin'), 'err'); pinIn.focus(); return; }
    go.disabled = true;
    say(s('printing'));
    try {
      const r = await hub.printSheet({ lesson: L.id, kind, copies, lang, seed,
        name: withName && kind === 'worksheet' ? c.name : null }, pin || undefined);
      if (pin) state.pin(pin);
      if (kind === 'worksheet') {
        state.rememberPrint(L.id, r.seed);
        rememberKey(L.id, r.seed, lang);
      }
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
  const nameToggle = c.name ? h('label', { class: 'toggle' }, s('name_on_sheet', { name: c.name }),
    h('input', { type: 'checkbox', checked: withName, onChange: (e) => { withName = e.target.checked; update(); } })) : null;

  const el = h('div', { class: 'screen' },
    topbar({ back: '#/home', sub: s('todays_sheet'), title: plain(L.title), extra: hubChip() }),
    h('div', { class: 'seg2', role: 'group' }, segBtns),
    preview,
    h('div', { class: 'card pad-card stack' }, stepper, nameToggle, pinRow, go, status, printerBox,
      h('div', { class: 'row between' }, pdf,
        h('a', { class: 'link', href: `#/check/${encodeURIComponent(L.id)}/${seed}` }, icon('check', 20), s('check_sheet')))));
  update();
  hub.refresh().then(drawPrinter);
  return { el, tab: 'print', cleanup: () => clearInterval(timer), onHub: update };
}
