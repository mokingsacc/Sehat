// Photo marking of Qalam sheets (C2.2, P14): #/photo/<lesson>/<seed>, opened from Check my sheet's "This sheet?".
// 1. First time: one explainer (a flat sheet, four squares; the camera note). Then the camera, in the page: every
//    200 ms a 480 px grey copy of the frame is searched for the four squares (scan.js); the brackets turn green as
//    they are found and one line coaches her; when all four hold still for three checks it takes the photo itself
//    (a 30 ms buzz and a click). The shutter is always there. No camera, a refusal, or no frames within 5 s: the
//    phone's own camera through a file input, with the same pipeline.
// 2. The photo: the squares again at full size, the QR code where the browser can read it (another sheet: switch
//    to it and say so), each value cell cut out into a tile, each tile checked for blur, glare and dark; "Is this
//    clear?" only when one fails.
// 3. The strip of tiles goes to the hub (JPEG 0.7), which returns what it read and nothing else.
// 4. "What I read": her own tile beside each reading; "Fix" opens the keypad. "Yes, mark it" types them into the
//    sheet's check, which marks them on the phone like typed answers.
// The frame, the tiles and the strip live in this screen's variables only: never localStorage, IndexedDB, the
// Cache API, a file, a download or the console. Closing the screen drops them and stops the camera.

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import { cameraOff, handoff, loadKey, photoOffer } from '../screens/check.js';
import * as scan from '../scan.js';
import * as sheetcode from '../sheetcode.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { keypad } from '../keypad.js';
import { fill, h, icon, plain, said, speakerBtn, titleText, toast, topbar } from '../ui.js';

const LOOP_MS = 200;
const SLOW_MS = 500;                    // a phone whose search takes more than 150 ms looks less often
const NO_FRAMES_MS = 5000;
const FULL_W = 2000;
const SAY_AFTER = 1500; const SAY_EVERY = 6000;

const bold = () => document.documentElement.dataset.look === 'bold';
const perButtonVoice = () => bold();    // p2 and adult literacy hear the coaching; the clean look taps to hear

function greyOf(source, w, ht) {
  const c = document.createElement('canvas');
  c.width = w; c.height = ht;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, w, ht);
  return scan.toGrey(x.getImageData(0, 0, w, ht).data, w, ht);
}

function canvasOf(g, w, ht, cls) {
  const c = document.createElement('canvas');
  c.width = w; c.height = ht;
  c.getContext('2d').putImageData(new ImageData(scan.toRgba(g), w, ht), 0, 0);
  if (cls) c.className = cls;
  return c;
}

function click() {
  try {
    const a = new AudioContext();
    const o = a.createOscillator(); const g = a.createGain();
    o.frequency.value = 1800; g.gain.setValueAtTime(0.2, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.06);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.07);
    setTimeout(() => a.close(), 200);
  } catch { /* no sound: the buzz and "Got it" are enough */ }
}

// the explainer's picture: a sheet lying flat with its four squares (the top right a ring)
function sheetPicture() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 150');
  svg.setAttribute('class', 'photo-pic');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="12" y="6" width="96" height="136" rx="3" fill="#fff" stroke="currentColor" stroke-width="1.5"/>'
    + '<g fill="#000"><rect x="18" y="12" width="9" height="9"/><path d="M93 12h9v9h-9z M95.5 14.5v4h4v-4z" fill-rule="evenodd"/>'
    + '<rect x="18" y="127" width="9" height="9"/><rect x="93" y="127" width="9" height="9"/></g>'
    + '<g fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"><path d="M32 40h40M32 60h30M32 80h36M32 100h28"/>'
    + '<rect x="80" y="34" width="16" height="12" rx="2"/><rect x="80" y="54" width="16" height="12" rx="2"/>'
    + '<rect x="80" y="74" width="16" height="12" rx="2"/><rect x="80" y="94" width="16" height="12" rx="2"/></g>';
  return svg;
}

function ringEl() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'read-ring');
  svg.innerHTML = '<circle cx="50" cy="50" r="44" class="track"/><circle cx="50" cy="50" r="44" class="fill" pathLength="100"/>';
  return svg;
}

export default async function photoScreen([id, seedText]) {
  await library.load();
  const c = state.child();
  const lang = getLang();
  let L = library.get(id);
  let seed = +seedText || 0;
  let key = L ? await loadKey(L.id, seed, lang) : null;
  const typeHref = () => `#/check/${encodeURIComponent(L ? L.id : id)}/${seed}`;
  if (!L || !key || photoOffer(c) !== 'on') {
    location.replace(typeHref());
    return { el: h('div', { class: 'screen' }), tab: 'sheets' };
  }
  let cells = scan.cellsOf(key);
  const stage = h('div', { class: 'photo-stage' });
  const root = h('div', { class: 'screen photo' }, stage);
  let alive = true;
  let stream = null; let video = null; let timer = 0; let noFrames = 0; let ticker = [];
  // the photo and what is made from it: dropped by drop(), on every way out
  let shot = null;          // { g, w, h } the flattened source, grey
  let cut = null;           // scan.cut(): tiles, quality, strip
  let stripB64 = null;
  let fromFile = false;

  function stopCamera() {
    clearTimeout(timer); clearTimeout(noFrames);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) { video.srcObject = null; video = null; }
  }
  function drop() { shot = null; cut = null; stripB64 = null; }
  function clearTickers() { ticker.forEach(clearTimeout); ticker = []; }
  const cleanup = () => { alive = false; stopCamera(); clearTickers(); drop(); };

  const typeBtn = () => said(h('a', { class: 'btn outline', href: typeHref() }, icon('pencil', 22), s('type_answers')));
  const head = (title, sub, back = typeHref()) => topbar({ back, title, sub: sub || plain(L.title) });
  const show = (...kids) => { if (alive) fill(stage, ...kids); };

  // 1. the explainer, the first time
  function explainer() {
    show(head(s('take_photo')),
      h('div', { class: 'card pad-card stack center' }, sheetPicture(),
        h('p', { class: 'lead' }, s('photo_intro')), h('p', { class: 'muted small' }, s('camera_note')),
        said(h('button', { class: 'btn primary main', type: 'button', onClick: () => { state.cache('photo.seen', true); camera(); } },
          icon('camera'), s('start_camera'))),
        typeBtn()));
  }

  // the camera, in the page
  async function camera() {
    drop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { filePicker(); return; }
    try {
      // resizeMode none: the camera's own frames, never cropped to the asked shape (a crop can cut off a square)
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 },
        height: { ideal: 1080 }, resizeMode: 'none' }, audio: false });
    } catch {
      cameraOff(true);
      filePicker();
      return;
    }
    if (!alive) { stopCamera(); return; }
    video = h('video', { class: 'cam', autoplay: '', muted: '', playsinline: '' });
    video.muted = true;
    video.srcObject = stream;
    const corners = ['tl', 'tr', 'br', 'bl'].map((k) => h('i', { class: 'bracket ' + k }));
    const line = h('p', { class: 'coach', role: 'status', 'aria-live': 'polite' }, s('photo_intro'));
    const shutter = h('button', { class: 'shutter', type: 'button', 'aria-label': s('take_photo'), onClick: () => take() });
    const track = stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    let torch = false;
    const flash = caps.torch ? h('button', { class: 'round hidden', type: 'button', 'aria-label': s('flash'),
      onClick: () => { torch = !torch; track.applyConstraints({ advanced: [{ torch }] }).catch(() => {}); } }, icon('flash', 22)) : null;
    show(h('div', { class: 'cam-wrap', 'data-theme': 'dark' },
      topbar({ back: typeHref(), title: titleText(L.title), net: false }),
      h('div', { class: 'guide' }, video, ...corners),
      h('div', { class: 'row coach-row' }, line, speakerBtn(() => speak(line.textContent, lang), { size: 'sm' })),
      h('div', { class: 'row between cam-actions' }, typeBtn(), shutter, flash || h('span', { class: 'round-gap' }))));
    let got = false;
    video.addEventListener('playing', () => { got = true; }, { once: true });
    noFrames = setTimeout(() => { if (alive && !got) { stopCamera(); filePicker(); } }, NO_FRAMES_MS);
    const hist = [];
    let lastSaid = 0; let state0 = ''; let since = Date.now(); let every = LOOP_MS;
    const coach = (k) => {
      const now = Date.now();
      if (k !== state0) { state0 = k; since = now; line.textContent = s(k); }
      if (perButtonVoice() && now - since > SAY_AFTER && now - lastSaid > SAY_EVERY) { lastSaid = now; speak(s(k), lang); }
    };
    const loop = () => {
      if (!alive || !video) return;
      if (video.videoWidth) {
        const t0 = performance.now();
        const w = 480; const hh = Math.round((video.videoHeight / video.videoWidth) * w);
        const g = greyOf(video, w, hh);
        const f = scan.findMarkers(g, w, hh);
        f.quads.forEach((q, i) => corners[i].classList.toggle('on', !!q));
        let mean = 0;
        for (let i = 0; i < g.length; i += 16) mean += g[i];
        mean /= g.length / 16;
        if (flash) flash.classList.toggle('hidden', mean > 70 && !torch);
        const k = mean < 50 ? 'dark_light' : scan.coach(f, w, hist);
        if (k === 'take') { take(); return; }
        coach(k);
        if (performance.now() - t0 > 150) every = SLOW_MS;
      }
      timer = setTimeout(loop, every);
    };
    timer = setTimeout(loop, LOOP_MS);

    function take() {
      if (!video || !video.videoWidth) return;
      const w = Math.min(FULL_W, video.videoWidth); const hh = Math.round((video.videoHeight / video.videoWidth) * w);
      const g = greyOf(video, w, hh);
      try { navigator.vibrate && navigator.vibrate(30); } catch { /* no vibration */ }
      click();
      line.textContent = s('got_it');
      stopCamera();
      process({ g, w, h: hh });
    }
  }

  // the phone's own camera, where the page has none
  function filePicker(problem) {
    stopCamera();
    fromFile = true;
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        if (bmp.width > FULL_W) {
          const small = await createImageBitmap(bmp, { resizeWidth: FULL_W, resizeHeight: Math.round(bmp.height * FULL_W / bmp.width), resizeQuality: 'high' });
          bmp.close(); bmp = small;
        }
        const w = bmp.width; const hh = bmp.height;
        const g = greyOf(bmp, w, hh);
        bmp.close();
        process({ g, w, h: hh });
      } catch { filePicker('no_squares'); }
    });
    show(head(s('take_photo')),
      h('div', { class: 'card pad-card stack center' }, sheetPicture(),
        problem ? h('p', { class: 'status err' }, s(problem)) : null,
        h('p', { class: 'lead' }, s('file_note')),
        input,
        said(h('button', { class: 'btn primary main', type: 'button', onClick: () => input.click() }, icon('camera'), s('take_photo'))),
        typeBtn()));
  }

  // 2. the photo: another sheet? the cut, and its quality
  async function process(pic) {
    shot = pic;
    await otherSheet(pic);
    cut = scan.cut(pic.g, pic.w, pic.h, cells);
    if (!cut.strip) { cut = null; shot = null; problem('no_squares', [retakeBtn(true, 'try_again')]); return; }
    const bad = cut.quality.filter((q) => q.problem);
    if (bad.length) clear(bad); else send();
  }

  // the QR code names the sheet; read it where the browser can, and follow it when it names another
  async function otherSheet(pic) {
    if (!('BarcodeDetector' in window)) return;
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const c2 = canvasOf(pic.g, pic.w, pic.h);
      const codes = await det.detect(c2);
      const q = codes.map((x) => sheetcode.fromQr(x.rawValue)).find(Boolean);
      if (!q) return;
      const other = library.byCode(q.code);
      if (!other || (other.id === L.id && q.seed === seed)) return;
      const k2 = await loadKey(other.id, q.seed, lang);
      if (!k2) return;
      L = other; seed = q.seed; key = k2; cells = scan.cellsOf(k2);
      state.rememberPrint(L.id, seed);
      toast(s('this_is_sheet', { c: sheetcode.make(L.code, seed) }));
    } catch { /* the code she chose stands */ }
  }

  const retakeBtn = (primary = true, label = 'retake') => said(h('button', { class: primary ? 'btn primary main' : 'btn outline',
    type: 'button', onClick: () => (fromFile ? filePicker() : camera()) }, icon('camera'), s(label)));

  function problem(text, buttons) {
    show(head(s('take_photo')), h('div', { class: 'card pad-card stack center' },
      h('p', { class: 'lead', role: 'status' }, s(text)), ...buttons, typeBtn()));
  }

  // "Is this clear?": the flattened sheet, the cells outlined, the bad ones marked with their numbers
  function clear(bad) {
    const pxmm = 1.7;
    const pg = scan.page(shot.g, shot.w, shot.h, cut.H, pxmm);
    const cv = canvasOf(pg.g, pg.w, pg.h, 'flat');
    const x = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const badSet = new Set(bad.map((q) => q.n));
    for (const cell of cells) {
      const isBad = badSet.has(cell.n);
      x.strokeStyle = (isBad ? css.getPropertyValue('--bad') : css.getPropertyValue('--accent')).trim() || (isBad ? '#c00' : '#086');
      x.lineWidth = 2;
      const rx = (cell.x - scan.PAGE.x) * pxmm; const ry = (cell.y - scan.PAGE.y) * pxmm;
      x.strokeRect(rx, ry, cell.w * pxmm, cell.h * pxmm);
      if (isBad) { x.fillStyle = x.strokeStyle; x.font = 'bold 14px sans-serif'; x.fillText(fa(cell.n), rx + 2, ry - 3); }
    }
    const worst = bad.some((q) => q.problem === 'blurry') ? 'blurry' : bad.some((q) => q.problem === 'dark') ? 'too_dark' : 'too_shiny';
    show(head(s('is_clear')), h('div', { class: 'pad stack center' }, cv,
      h('p', { class: 'lead', role: 'status' }, s(worst)),
      retakeBtn(),
      said(h('button', { class: 'btn outline', type: 'button', onClick: send }, s('use_anyway')))));
  }

  // 3. the strip to the hub; the ring while it reads
  async function send() {
    if (!cut) return;
    clearTickers();
    const pg = scan.page(shot.g, shot.w, shot.h, cut.H, 1.7);
    const flat = canvasOf(pg.g, pg.w, pg.h, 'flat dim');
    const line = h('p', { class: 'lead', role: 'status', 'aria-live': 'polite' }, s('reading'));
    const extra = h('div', { class: 'stack' });
    show(head(s('reading_title')), h('div', { class: 'pad stack center reading' },
      h('div', { class: 'flat-wrap' }, flat, ringEl()), line, extra));
    ticker.push(setTimeout(() => { line.textContent = s('still_reading'); }, 10000));
    ticker.push(setTimeout(() => {
      line.textContent = s('taking_long');
      fill(extra, said(h('button', { class: 'btn outline', type: 'button', onClick: () => fill(extra) }, s('keep_waiting'))), typeBtn());
    }, 30000));
    try {
      if (!stripB64) {
        const c2 = canvasOf(cut.strip.g, cut.strip.w, cut.strip.h);
        const blob = await new Promise((ok) => c2.toBlob(ok, 'image/jpeg', 0.7));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        stripB64 = btoa(bin);
      }
      const r = await hub.photoMark({ code: sheetcode.make(L.code, seed), seed, lang, strip: stripB64 }, c.token);
      clearTickers();
      if (!alive) return;
      const read = r.readings || [];
      if (!read.some((x) => x.read && x.read !== '?')) { problem('cant_read_photo', [retakeBtn()]); return; }
      whatIRead(read);
    } catch (e) {
      clearTickers();
      if (!alive) return;
      if (e && e.message === 'budget') { problem('photo_resting', []); return; }
      problem('net_stopped', [said(h('button', { class: 'btn primary main', type: 'button', onClick: send }, icon('refresh'), s('try_again')))]);
    }
  }

  // 4. "What I read": her tile, the question, the reading, Fix
  function whatIRead(read) {
    const byN = Object.fromEntries(key.items.map((r) => [r.n, r]));
    const tiles = Object.fromEntries(cut.tiles.map((t) => [t.n, t.g]));
    const readings = read.map((x) => ({ ...x }));
    const rows = readings.map((x) => {
      const value = h('b', { class: 'reading-value', dir: 'ltr' });
      const drawValue = () => {
        value.className = 'reading-value' + (x.read === '?' ? ' unread' : x.read === '' ? ' blank' : '');
        value.textContent = x.read === '?' ? s('cant_read_it') : x.read === '' ? s('empty') : fa(x.read);
      };
      drawValue();
      const fix = h('button', { class: 'link', type: 'button', onClick: async () => {
        const v = await keypad(x.read);
        if (v !== null) { x.read = v; drawValue(); }
      } }, s('fix'));
      const q = byN[x.n] && byN[x.n].q;
      const words = () => s('i_read', { n: x.n, a: x.read === '?' ? s('cant_read_it') : x.read === '' ? s('empty') : x.read });
      return h('div', { class: 'read-row' },
        h('span', { class: 'n' }, fa(x.n)),
        tiles[x.n] ? canvasOf(tiles[x.n], scan.TILE_W, scan.TILE_H, 'tile') : null,
        h('div', { class: 'grow stack-tight' }, q ? h('small', { class: 'muted', dir: 'ltr' }, fa(q)) : null, value),
        fix, speakerBtn(() => speak(words(), lang), { size: 'sm' }));
    });
    const mark = () => {
      handoff(L.id, seed, readings);
      state.rememberPrint(L.id, seed);
      drop();
      location.hash = typeHref();
    };
    show(head(s('what_i_read'), s('is_it_right'), typeHref()),
      fromFile ? h('p', { class: 'pad muted small' }, s('gallery_note')) : null,
      h('div', { class: 'read-rows' }, rows),
      h('div', { class: 'actions' },
        said(h('button', { class: 'btn primary main', type: 'button', onClick: mark }, icon('check'), s(bold() ? 'check_it' : 'mark_it'))),
        retakeBtn(false)));
  }

  if (state.cache('photo.seen')) camera(); else explainer();
  return { el: root, tab: 'sheets', cleanup };
}
