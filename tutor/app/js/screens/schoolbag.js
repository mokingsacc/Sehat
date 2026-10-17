// The school bag's screens (WEBSITE.md 3.6, 3.10 and 3.12, W7), in the learner's look, every row with a speaker:
// - #/bag: Settings → School bag. Where her bag is ("On this phone: saved. At the centre: saved. Online: waiting"),
//   "Sync now", "Show the code" and the card (behind her PIN), "Card: not printed yet", "Save as a file" and "Open a
//   bag file" (the route with no relay and no consent), "Make a new code" (behind her PIN), "This is also me" (behind
//   both PINs), and between the browser and the Android app on one phone, "Open in the Qalam app" or "Use Qalam in
//   this browser too". Stopped on another phone: "This phone needs your new bag code" and "Type the new code".
// - #/bag/ready/<then>: "Her school bag is ready", right after her grown-up agreed: the digits, the QR and "Print
//   the card or write it down", never forced.
// - #/bag/code, #/bag/newcode, #/bag/also: after #/lock/check/bag-<what> (her PIN; straight away without a lock).
// - #/bag/retype: the new code, typed after "stopped".
// The card (A6) holds her alias picture, the 16 digits, the text QR `Q1 BAG <digits>` and "keep it like a house key":
// no name, no app name, no address (C2's rule for paper). It is drawn and printed on the phone, so the code never
// reaches a server (not even the hub's printer, whose queue is a file on the hub).

import * as account from '../account.js';
import { aliasIcon } from '../aliases.js';
import * as android from '../android.js';
import * as bagsync from '../bagsync.js';
import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as lock from '../lock.js';
import { hasVoice, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn, toast, topbar } from '../ui.js';
import { checked, pinPad } from './lock.js';
import * as signup from './signup.js';
import { aliasLabel, yearLabel } from './who.js';

const say = (t) => () => speak(t, getLang());
const line = (text, cls = 'grow') => h('div', { class: 'row' }, h('p', { class: cls, dir: 'auto' }, text), speakerBtn(say(text), { size: 'sm' }));
const blank = () => ({ el: h('div'), tab: null });
let justMade = null;           // the learner whose new code was just made behind her PIN: shown once, then gone


// the card: her picture, the digits, the QR and one line; printed on the phone (the browser's or the app's print)
export async function card(l) {
  const B = await bagsync.lib();
  const qr = await import('../qr.js');
  const box = h('div', { class: 'qr-box' });
  box.innerHTML = qr.svg(B.qrText(l.bag.code), '34mm');
  return h('section', { class: 'bag-card print-card', 'aria-label': s('bag_card_title') },
    h('span', { class: 'pic' }, aliasIcon(state.pictureOf(l), 44, 2)),
    h('b', {}, s('bag_card_title')),
    box,
    h('p', { class: 'bag-code', dir: 'ltr', 'aria-label': fa(B.groups(l.bag.code).join(' ')) }, B.showCode(l.bag.code, getLang())),
    h('p', { class: 'small' }, s('bag_card_keep')));
}

function printCard(l) {
  state.cache('bag.card.' + l.id, true);
  if (android.canPrint()) android.print(s('bag_card_title'));
  else globalThis.print();
}

// #/bag/ready/<then>, and #/bag/again: the card offered the second time, after her fifth finished lesson
async function ready(l, then, again = false) {
  const go = () => { location.hash = again ? '#/home' : signup.next('consent', then); };
  const lead = s(again ? 'bag_card_again' : 'bag_ready_lead');
  const el = h('div', { class: 'screen bag' },
    topbar({ back: null, title: s(again ? 'bag_card_title' : 'bag_ready') }),
    h('div', { class: 'stack pad' },
      line(lead, 'grow lead'),
      await card(l),
      h('div', { class: 'row wrap noprint' },
        said(h('button', { type: 'button', class: 'btn primary', onClick: () => printCard(l) }, icon('printer', 22), s('bag_card_print'))),
        said(h('button', { type: 'button', class: 'btn', onClick: () => { state.cache('bag.card.' + l.id, true); go(); } },
          icon('pencil', 22), s('bag_card_written')))),
      said(h('button', { type: 'button', class: 'btn outline noprint', onClick: go }, s('continue')))));
  if (hasVoice(getLang())) setTimeout(() => speak([s(again ? 'bag_card_title' : 'bag_ready'), lead].join('. '), getLang()), 400);
  return { el, tab: null };
}

// #/bag/code: the code and the card again, behind her PIN
async function showCode(l) {
  const el = h('div', { class: 'screen bag' },
    topbar({ back: '#/bag', title: s('bag_code_title') }),
    h('div', { class: 'stack pad' },
      await card(l),
      said(h('button', { type: 'button', class: 'btn primary noprint', onClick: () => printCard(l) }, icon('printer', 22), s('bag_card_print'))),
      said(h('button', { type: 'button', class: 'btn noprint', onClick: () => { state.cache('bag.card.' + l.id, true); location.hash = '#/bag'; } },
        icon('pencil', 22), s('bag_card_written')))));
  return { el, tab: null };
}

// #/bag/newcode
function newCode(l) {
  const msg = h('p', { class: 'muted', role: 'status' });
  const yes = h('button', { type: 'button', class: 'btn danger big', onClick: async () => {
    yes.disabled = true;
    msg.textContent = s('bag_wait');
    await bagsync.newCode(l.id);
    await bagsync.syncLearner(l.id, { force: true });        // the old bag here becomes a tombstone now
    account.sync();                                          // and each seat in reach gets its new token
    toast(s('bag_new_done'));
    justMade = l.id;
    location.hash = '#/bag/code-new';
  } }, icon('key', 24), s('bag_new_yes'));
  if (hasVoice(getLang())) setTimeout(() => speak(s('bag_new_sure'), getLang()), 300);
  return { el: h('div', { class: 'screen' },
    topbar({ back: '#/bag', title: s('bag_new_code') }),
    h('div', { class: 'stack pad' }, line(s('bag_new_sure'), 'grow lead'), said(yes), msg,
      said(h('a', { class: 'btn', href: '#/bag' }, s('cancel'))))), tab: null };
}

// #/bag/also: "This is also me": another learner on this phone, her PIN too, then one learner
function also(l) {
  const others = state.learners().filter((x) => x.id !== l.id);
  const root = h('div', { class: 'screen' });
  const pickOne = (o) => {
    if (!(o.lock && lock.allowed(o.band))) { confirmFold(o); return; }
    const msg = h('p', { class: 'msg', role: 'status' });
    const pad = pinPad((pin) => {
      const r = lock.attempt(o.lock, pin);
      state.updateChild(o.id, { lock: r.lock });
      if (r.ok) { pad.stop(); confirmFold(o); return; }
      msg.textContent = r.wait ? s('lock_wait', { n: Math.ceil(r.wait / 60e3) }) : s('lock_wrong');
      pad.shake();
    });
    root.className = 'screen lock bag';
    fill(root, topbar({ back: '#/bag', title: s('bag_also') }),
      h('div', { class: 'lock-body' }, h('span', { class: 'ini big' }, aliasIcon(state.pictureOf(o), 30, 2)),
        h('p', { class: 'lead' }, s('bag_also_pin')), pad.dots, msg, pad.pad));
    cleanup = pad.stop;
  };
  const confirmFold = (o) => {
    const go = h('button', { type: 'button', class: 'btn primary big', onClick: async () => {
      go.disabled = true;
      await bagsync.fold(l.id, o.id);
      state.unlock(l.id);
      account.sync();
      toast(s('bag_also_done'));
      location.hash = '#/home';
    } }, icon('users', 24), s('bag_also_yes'));
    root.className = 'screen bag';
    fill(root, topbar({ back: '#/bag', title: s('bag_also') }),
      h('div', { class: 'stack pad' }, line(s('bag_also_sure', { a: aliasLabel(o), b: aliasLabel(l) }), 'grow lead'), said(go),
        said(h('a', { class: 'btn', href: '#/bag' }, s('cancel')))));
  };
  let cleanup = null;
  fill(root, topbar({ back: '#/bag', title: s('bag_also') }),
    h('div', { class: 'stack pad' }, line(s('bag_also_lead'), 'grow lead'),
      others.map((o) => said(h('button', { type: 'button', class: 'who wide', onClick: () => pickOne(o) },
        h('span', { class: 'ini big' }, aliasIcon(state.pictureOf(o), 30, 2)),
        h('span', { class: 'grow' }, h('b', {}, o.nickname || aliasLabel(o)), h('small', {}, yearLabel(o))))))));
  return { el: root, tab: null, cleanup: () => cleanup && cleanup() };
}

// a code typed (Persian or Latin digits) and checked by its check digit before anything is sent
export function codeInput(onCode, { label = s('move_title'), button = s('move_go'), value = '' } = {}) {
  const msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { class: 'code-in bag-in', dir: 'ltr', inputmode: 'numeric', autocomplete: 'off',
    spellcheck: 'false', maxlength: 24, placeholder: '0000 0000 0000 0000', 'aria-label': label, value });
  const btn = h('button', { type: 'submit', class: 'btn primary big' }, icon('bag', 24), button);
  const form = h('form', { class: 'stack', onSubmit: async (e) => {
    e.preventDefault();
    const B = await bagsync.lib();
    const code = B.readCode(input.value);
    if (!code) { msg.textContent = s('move_bad'); speak(s('move_bad'), getLang()); input.focus(); return; }
    btn.disabled = true;
    msg.textContent = s('move_finding');
    try { await onCode(code, msg); } finally { btn.disabled = false; }
  } }, input, said(btn), msg);
  return { form, input, msg, submit: () => form.requestSubmit() };
}

// #/bag/retype: the new code, after her bag was stopped on another phone
function retype(l) {
  const box = codeInput(async (code, msg) => {
    const found = await bagsync.lookUp(code);
    if (!found.bag) { msg.textContent = s('move_' + found.why); return; }
    await bagsync.mergeInto(l.id, found, code);
    await account.sync();
    await bagsync.syncLearner(l.id, { force: true });
    toast(s('bag_synced'));
    location.hash = '#/bag';
  }, { label: s('bag_type_new'), button: s('bag_type_new') });
  return { el: h('div', { class: 'screen' }, topbar({ back: '#/bag', title: s('bag_type_new') }),
    h('div', { class: 'stack pad' }, line(s('bag_stopped'), 'grow lead'), box.form)), tab: null };
}

// her bag as a file: shared from the Android app, downloaded in a browser
async function saveFile(l, status) {
  const blob = await bagsync.file(l.id);
  if (!blob) return;
  if (android.isApp() && android.shareFile(bagsync.FILE_NAME, bagsync.b64(blob))) { status.textContent = s('bag_file_saved'); return; }
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: bagsync.FILE_NAME, class: 'hidden' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  status.textContent = s('bag_file_saved');
}

// a bag file opened for this learner: her own code opens it, and it merges into her
function openFileRow(l, status) {
  const pick = h('input', { type: 'file', class: 'hidden', accept: '.qbag,application/octet-stream', onChange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const found = await bagsync.openFile(bytes, l.bag.code);
    if (!found.bag) { status.textContent = s('move_' + found.why); return; }
    await bagsync.mergeInto(l.id, found, l.bag.code);
    status.textContent = s('bag_file_opened');
  } });
  return [said(h('button', { type: 'button', class: 'btn', onClick: () => pick.click() }, icon('file', 22), s('bag_open_file'))), pick];
}

// the browser and the Android app on one phone (3.10, case 18): the code goes to the other side on the phone only
// (the address is made at the tap, never left in the page; a fragment and an intent's extra reach no server)
function handoff(l) {
  const code = () => state.byId(l.id).bag.code;
  if (android.isApp()) {
    const home = android.onlineHome();
    if (!home) return null;
    return said(h('button', { type: 'button', class: 'btn handoff', onClick: () => { location.href = `${home}/m#${code()}`; } },
      icon('next', 22), s('bag_open_browser')));
  }
  if (!android.androidBrowser()) return null;
  return said(h('button', { type: 'button', class: 'btn handoff', onClick: () => {
    const back = encodeURIComponent(new URL(hub.url('/get/?lang=' + getLang()), location.href).href);
    location.href = `intent://bag#Intent;scheme=qalam;package=org.qalam.app;S.code=${code()};S.browser_fallback_url=${back};end`;
  } }, icon('next', 22), s('bag_open_app')));
}

// #/bag
function main(l) {
  const root = h('div', { class: 'screen settings bag' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  async function draw() {
    l = state.byId(l.id);
    if (!l.bag) {
      const make = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
        make.disabled = true;
        status.textContent = s('bag_wait');
        await bagsync.make(l.id);
        bagsync.syncLearner(l.id, { force: true });
        location.hash = '#/bag/ready/settings';
      } }, icon('bag', 22), s('bag_make'));
      fill(root, topbar({ back: '#/settings', title: s('bag_title') }),
        h('div', { class: 'stack pad' }, line(s('bag_note_none'), 'grow lead'), said(make), status));
      return;
    }
    const st = bagsync.status(l.id);
    const word = (v) => s(v === 'saved' ? 'bag_s_saved' : v === 'waiting' ? 'bag_s_waiting' : 'bag_s_none');
    const where = [s('bag_here_phone'), s('bag_at_hub', { s: word(st.hub) }), s('bag_at_online', { s: word(st.online) })].join(' · ');
    const printed = state.cache('bag.card.' + l.id) === true;
    const sync = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
      sync.disabled = true;
      status.textContent = s('bag_syncing');
      await account.sync();
      const got = await bagsync.syncLearner(l.id, { force: true });
      status.textContent = !hub.relays() ? s('bag_need_server') : got === 'saved' ? s('bag_synced')
        : got === 'newer' ? s('bag_newer') : got === 'inflate' ? s('bag_inflate') : got === 'consent' ? s('bag_consent_needed')
          : got === 'stopped' ? s('bag_stopped') : s('bag_sync_later');
      sync.disabled = false;
      draw();
    } }, icon('refresh', 22), s('bag_sync'));
    const others = state.learners().length > 1;
    fill(root, topbar({ back: '#/settings', title: s('bag_title') }),
      h('div', { class: 'stack pad' },
        st.gone ? h('div', { class: 'card lined stack' }, line(s('bag_stopped'), 'grow lead'),
          said(h('a', { class: 'btn primary', href: '#/bag/retype' }, icon('key', 22), s('bag_type_new')))) : null,
        st.newer ? line(s('bag_newer')) : null,
        st.inflate ? line(s('bag_inflate')) : null,
        st.consent ? h('div', { class: 'stack' }, line(s('bag_consent_needed')),
          said(h('a', { class: 'btn', href: '#/consent/settings' }, icon('file', 22), s('bag_read_new')))) : null,
        line(s('bag_note_on')),
        line(where, 'grow small'),
        st.gone ? null : said(sync),
        status,
        line(s(printed ? 'bag_card_done' : 'bag_card_not'), 'grow small'),
        said(h('a', { class: 'btn', href: '#/lock/check/bag-code' }, icon('card', 22), s('bag_show_code'))),
        h('div', { class: 'row wrap' },
          said(h('button', { type: 'button', class: 'btn', onClick: () => saveFile(l, status) }, icon('download', 22), s('bag_save_file'))),
          openFileRow(l, status)),
        handoff(l),
        others ? said(h('a', { class: 'btn', href: '#/lock/check/bag-also' }, icon('users', 22), s('bag_also'))) : null,
        said(h('a', { class: 'btn danger-outline', href: '#/lock/check/bag-newcode' }, icon('key', 22), s('bag_new_code')))));
  }
  draw();
  return { el: root, tab: null, onHub: (ok) => { if (ok) draw(); } };
}

export default async function bagScreen([what, arg]) {
  const l = state.child();
  if (!l) { location.replace('#/welcome'); return blank(); }
  if (what === 'ready') return l.bag ? ready(l, arg || 'home') : (location.replace(signup.next('consent', arg || 'home')), blank());
  if (what === 'retype') return retype(l);
  if (what === 'again') return l.bag ? ready(l, 'home', true) : (location.replace('#/home'), blank());
  if (!what) return main(l);
  if (!l.bag && what !== 'also') { location.replace('#/bag'); return blank(); }
  // behind her PIN: #/lock/check/bag-<what> sends her here once it is right (or at once without a lock)
  const gated = { code: 'bag-code', newcode: 'bag-newcode', also: 'bag-also' };
  if (what === 'code-new') {                                // the new code, just made behind her PIN, once
    if (justMade !== l.id) { location.replace('#/bag'); return blank(); }
    justMade = null;
    return showCode(l);
  }
  if (!gated[what]) { location.replace('#/bag'); return blank(); }
  if (l.lock && lock.allowed(l.band) && !checked(gated[what])) { location.replace('#/lock/check/' + gated[what]); return blank(); }
  if (what === 'code') return showCode(l);
  if (what === 'newcode') return newCode(l);
  return also(l);
}
