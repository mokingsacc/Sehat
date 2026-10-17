// "I already use Qalam" (WEBSITE.md 3.10 and 3.12, W7), #/move, in the clean look like Welcome: her school bag on a
// new phone. She types the 16 digits (Persian or Latin, the check digit refuses a slip before anything is sent),
// scans her card inside Qalam (where the browser can read a QR code: BarcodeDetector and a camera on a secure page),
// or opens a bag file and types its code. The relay in reach is asked for the bag; "Found: [her picture] ۲۷, year 3,
// 14 lessons. Is this you?" Yes: she is a learner on this phone, locked, and asked her PIN once. Not found yet (or
// no relay in reach): she starts at once from Welcome, and her work joins when a relay has it.
// The Android app's "Use Qalam in this browser too" opens /m#<digits>, which keeps them for this tab only
// (sessionStorage `qalam.bag.handoff`) and opens #/move; the browser's "Open in the Qalam app" hands them to the app
// (android.takeBag). Either way the digits are read once and forgotten, and never reach an address a server sees.
// W8: "Just for today (a borrowed phone)" beside Yes: she is kept in memory only (state.js startToday), with Done on
// every screen (screens/today.js); with no relay in reach (a bag file) she is told first that today's work stays only
// until Qalam is closed.

import * as account from '../account.js';
import { aliasIcon, aliasName } from '../aliases.js';
import * as android from '../android.js';
import * as bagsync from '../bagsync.js';
import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn, toast, topbar } from '../ui.js';
import { codeInput } from './schoolbag.js';
import { yearLabel } from './who.js';

const HANDOFF = 'qalam.bag.handoff';
const say = (t) => () => speak(t, getLang());
const line = (text, cls = 'grow') => h('div', { class: 'row' }, h('p', { class: cls, dir: 'auto' }, text), speakerBtn(say(text), { size: 'sm' }));

// the digits handed over by /m or the Android app, once
function handed() {
  let d = '';
  try { d = sessionStorage.getItem(HANDOFF) || ''; sessionStorage.removeItem(HANDOFF); } catch { /* blocked */ }
  return /^\d{16}$/.test(d) ? d : android.takeBag();
}

// a bag that was not found yet: she starts from Welcome, and the learner she makes there keeps this code
let waiting = null;
export function pendingBag(take = false) { const w = waiting; if (take) waiting = null; return w; }

const canScan = () => typeof globalThis.BarcodeDetector === 'function' && globalThis.isSecureContext
  && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// the camera, until a card's text QR is read (or she closes it); nothing is kept
function scanner(onCode, onClose) {
  const video = h('video', { class: 'scan-video', playsinline: '', muted: '' });
  let stream = null;
  let stop = false;
  const close = () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (stop) { close(); return; }
      video.srcObject = stream;
      await video.play();
      const det = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
      const B = await bagsync.lib();
      while (!stop) {
        const found = await det.detect(video).catch(() => []);
        for (const f of found) {
          const code = B.fromQr(f.rawValue);
          if (code) { close(); onCode(code); return; }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch { close(); onClose(true); }
  })();
  return { el: h('div', { class: 'stack' }, video,
    said(h('button', { type: 'button', class: 'btn', onClick: () => { close(); onClose(false); } }, s('close')))), close };
}

export default function move() {
  const root = h('div', { class: 'screen welcome move' });
  let cam = null;
  const back = state.learners().length ? '#/who' : '#/welcome';

  function start() {
    const code = handed();
    const box = codeInput(find, { value: code ? code.replace(/(\d{4})(?=\d)/g, '$1 ') : '' });
    const pick = h('input', { type: 'file', class: 'hidden', accept: '.qbag,application/octet-stream', onChange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) fileCode(new Uint8Array(await f.arrayBuffer()));
    } });
    const scanRow = canScan() ? said(h('button', { type: 'button', class: 'btn', onClick: () => {
      cam = scanner((c) => { box.input.value = c; draw(); box.submit(); }, () => draw());
      fill(root, topbar({ back, title: s('move_title') }), h('div', { class: 'stack pad' }, cam.el));
    } }, icon('camera', 22), s('move_scan'))) : null;
    function draw() {
      fill(root, topbar({ back, title: s('move_title') }),
        h('div', { class: 'stack pad' }, line(s('move_lead'), 'grow lead'), box.form, scanRow,
          said(h('button', { type: 'button', class: 'btn', onClick: () => pick.click() }, icon('file', 22), s('bag_open_file'))), pick));
    }
    draw();
    if (code) setTimeout(() => box.submit(), 50);           // handed over: look it up at once
  }

  // a bag file: its code typed, then the same "Is this you?"
  function fileCode(bytes) {
    const box = codeInput(async (code, msg) => {
      const found = await bagsync.openFile(bytes, code);
      if (!found.bag) { msg.textContent = s('move_' + found.why); return; }
      confirm(found, code);
    });
    fill(root, topbar({ back, title: s('bag_open_file') }),
      h('div', { class: 'stack pad' }, line(s('move_file_lead'), 'grow lead'), box.form));
  }

  async function find(code, msg) {
    const mine = state.learners().find((l) => l.bag && l.bag.code === code);
    const found = await bagsync.lookUp(code);
    if (found.bag) { if (mine) { await bagsync.mergeInto(mine.id, found, code); state.setActive(mine.id); location.hash = '#/home'; return; } confirm(found, code); return; }
    if (found.why === 'none' || found.why === 'offline') { notYet(found, code); return; }
    msg.textContent = s('move_' + found.why);
    speak(msg.textContent, getLang());
  }

  // "Found: [picture] ۲۷, year 3, 14 lessons. Is this you?"
  function confirm(found, code) {
    const sum = bagsync.summary(found.bag);
    const who = `${aliasName(sum.picture, getLang())}${sum.number ? ' ' + fa(sum.number) : ''}`;
    const text = s('move_found', { who, year: yearLabel(sum.band === 'ad' ? { band: 'ad', track: sum.track } : { year: sum.year }), n: sum.lessons });
    const yes = h('button', { type: 'button', class: 'btn primary big', onClick: async () => {
      yes.disabled = true;
      const l = await bagsync.restore(found, code);
      if (!l) { yes.disabled = false; return; }
      account.sync();
      location.hash = '#/home';                              // locked: main.js asks her PIN once
    } }, icon('check', 24), s('move_yes'));
    fill(root, topbar({ back, title: s('move_title') }),
      h('div', { class: 'stack pad found' },
        h('span', { class: 'ini big' }, aliasIcon(sum.picture, 40, 2)),
        line(text, 'grow lead'),
        said(yes),
        said(h('button', { type: 'button', class: 'btn today-choice', onClick: () => justToday(found, code) }, icon('clock', 22),
          s('today_choice'))),
        said(h('button', { type: 'button', class: 'btn', onClick: () => { location.hash = '#/welcome'; } }, s('move_no')))));
    speak(text, getLang());
  }

  // "Just for today": her learner in memory only; nothing of hers reaches this phone's storage
  function justToday(found, code, warned = false) {
    if (!hub.relays() && !warned) {
      const text = s('today_offline');
      fill(root, topbar({ back, title: s('today_bar') }),
        h('div', { class: 'stack pad' }, line(text, 'grow lead'),
          said(h('button', { type: 'button', class: 'btn primary big', onClick: () => justToday(found, code, true) }, icon('next', 24), s('today_go'))),
          said(h('button', { type: 'button', class: 'btn', onClick: () => confirm(found, code) }, s('cancel')))));
      speak(text, getLang());
      return;
    }
    state.startToday();
    bagsync.restore(found, code).then((l) => {
      if (!l) return;
      toast(s('today_note'));
      account.sync();
      location.hash = '#/home';                              // locked: her PIN once
    });
  }

  // not on this relay yet, or none in reach: she starts now, and the bag joins her when it is found (3.13 cases 5, 6)
  function notYet(found, code) {
    const text = s(found.why === 'none' ? 'move_none' : 'move_offline');
    fill(root, topbar({ back, title: s('move_title') }),
      h('div', { class: 'stack pad' }, line(text, 'grow lead'),
        said(h('button', { type: 'button', class: 'btn primary big', onClick: () => {
          waiting = { code, k: found.k };
          location.hash = '#/welcome';
        } }, icon('next', 24), s('move_start'))),
        said(h('button', { type: 'button', class: 'btn', onClick: start }, s('try_again')))));
    speak(text, getLang());
    if (!hub.online()) hub.connect();
  }

  start();
  return { el: root, tab: null, cleanup: () => { if (cam) cam.close(); } };
}
