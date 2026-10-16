// The PIN lock's screens (DESIGN.md 8; the rules are app/js/lock.js). A privacy curtain on a shared phone:
// - #/lock: the lock itself, shown on app start, on switching to a locked learner, and when the app comes back after
//   5 minutes away (main.js). Her alias picture, four dots, a 3×4 keypad with 64 px keys in her digits (a keyboard's
//   digits work too), "I forgot" and "Someone else". The keys make no sound (spoken digits would give the PIN away);
//   the title is spoken. Five wrong tries: a wait of 1, then 15, then 60 minutes. "I forgot" starts the visible
//   24-hour reset; her right PIN cancels it; once it is due the next opener chooses a new PIN. Nothing is deleted.
// - #/lock/offer/<then>: "Lock with a number?", offered once after consent or a class join, with "Not now";
// - #/lock/set/<then>: set or change it (Settings);
// - #/lock/check/<action>: her PIN again before Settings removes her or stops sharing.

import * as lock from '../lock.js';
import { fa, getLang, s } from '../i18n.js';
import { hasVoice, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, toast, topbar } from '../ui.js';
import { aliasPic } from './who.js';
import * as signup from './signup.js';

let returnTo = '#/home';
// where the lock goes once she has opened it (main.js sets it before showing #/lock)
export function afterUnlock(hash) { returnTo = hash && !hash.startsWith('#/lock') ? hash : '#/home'; }

// the action #/lock/check passed, for Settings to finish (cleared when read)
let passed = null;
export function checked(action) { const ok = passed === action; passed = null; return ok; }

// four dots and a keypad; onDone(pin) with the four digits
function pinPad(onDone) {
  let entry = '';
  let busy = false;
  const dots = h('div', { class: 'dots', role: 'img' });
  const draw = () => {
    fill(dots, [0, 1, 2, 3].map((i) => h('span', { class: i < entry.length ? 'on' : '' })));
    dots.setAttribute('aria-label', fa(entry.length) + ' / ' + fa(4));
  };
  const press = (d) => {
    if (busy || pad.classList.contains('off')) return;
    if (d === 'x') entry = entry.slice(0, -1);
    else if (entry.length < 4) entry += d;
    draw();
    if (entry.length === 4) {
      busy = true;
      const pin = entry;
      setTimeout(() => {          // let the fourth dot show before the 10,000 rounds
        entry = '';
        busy = false;
        draw();
        onDone(pin);
      }, 60);
    }
  };
  const key = (d) => h('button', { type: 'button', class: 'key', 'aria-label': fa(d), onClick: () => press(d) }, fa(d));
  const pad = h('div', { class: 'keypad', dir: 'ltr' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key),
    h('button', { type: 'button', class: 'key fn', 'aria-label': s('erase'), onClick: () => press('x') }, icon('erase', 28, 2.2)),
    key('0'),
    h('span', {}));
  const onKey = (e) => {
    const d = lock.digits('000' + e.key) ? lock.digits('000' + e.key).slice(3) : null;    // ۵ or 5
    if (d) { e.preventDefault(); press(d); } else if (e.key === 'Backspace') { e.preventDefault(); press('x'); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return { dots, pad, off: (yes) => pad.classList.toggle('off', !!yes), stop: () => document.removeEventListener('keydown', onKey),
    shake: () => { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); } };
}

// choosing a PIN: four digits, then the same four again
function setter(c, { title, why, then, offer }) {
  let first = null;
  const msg = h('p', { class: 'msg', role: 'status' });
  const heading = h('h2', { class: 'lock-title' }, s('lock_choose'));
  const pad = pinPad((pin) => {
    if (!first) { first = pin; heading.textContent = s('lock_again'); msg.textContent = ''; return; }
    if (first !== pin) { first = null; heading.textContent = s('lock_choose'); msg.textContent = s('lock_mismatch'); pad.shake(); return; }
    state.updateChild(c.id, { lock: lock.make(pin), lockOffered: true });
    state.unlock(c.id);
    toast(s('locked'));
    location.hash = offer ? signup.next('lock', then) : signup.thenHash(then);
  });
  const el = h('div', { class: 'screen lock' },
    topbar({ back: offer ? null : signup.thenHash(then), title }),
    h('div', { class: 'lock-body' },
      aliasPic(c, 30),
      why ? h('p', { class: 'lead why' }, why) : null,
      heading, pad.dots, msg, pad.pad,
      offer ? h('div', { class: 'row center' }, said(h('button', { type: 'button', class: 'btn outline',
        onClick: () => { location.hash = signup.next('lock', then); } }, s('not_now')))) : null));
  if (hasVoice(getLang())) setTimeout(() => speak([title, why].filter(Boolean).join('. '), getLang()), 300);
  return { el, tab: null, cleanup: pad.stop };
}

// the lock itself, or #/lock/check/<action>
function opener(c, action) {
  let l = c.lock;
  const msg = h('p', { class: 'msg', role: 'status' });
  const reset = h('p', { class: 'reset' });
  let timer = null;
  const showState = () => {
    l = state.byId(c.id).lock;
    const wait = lock.waitLeft(l);
    pad.off(wait > 0);
    if (wait) msg.textContent = s('lock_wait', { n: Math.ceil(wait / 60e3) });
    fill(reset, l.resetAt ? [icon('refresh', 18), s('reset_waiting', { n: lock.hoursLeft(l) })] : null);
  };
  const pad = pinPad((pin) => {
    const r = lock.attempt(l, pin);
    state.updateChild(c.id, { lock: r.lock });
    if (r.ok) {
      state.unlock(c.id);
      if (action) { passed = action; location.hash = '#/settings/' + action; } else location.hash = returnTo;
      return;
    }
    msg.textContent = r.wait ? s('lock_wait', { n: Math.ceil(r.wait / 60e3) }) : s('lock_wrong');
    pad.shake();
    showState();
  });
  const forgot = () => {
    state.updateChild(c.id, { lock: lock.startReset(l) });
    msg.textContent = s('reset_started');
    showState();
  };
  const el = h('div', { class: 'screen lock' },
    topbar({ back: action ? '#/settings' : null, title: s('lock_title') }),
    h('div', { class: 'lock-body' },
      aliasPic(c, 30), reset, pad.dots, msg, pad.pad,
      h('div', { class: 'row center wrap' },
        h('button', { type: 'button', class: 'link', onClick: forgot }, s('forgot')),
        action ? null : h('a', { class: 'link', href: '#/who' }, icon('users', 20), s('someone_else')))));
  showState();
  timer = setInterval(showState, 15000);
  if (hasVoice(getLang())) setTimeout(() => speak(s('lock_title'), getLang()), 300);
  return { el, tab: null, cleanup: () => { pad.stop(); clearInterval(timer); } };
}

export default function lockScreen([mode, arg]) {
  const c = state.child();
  if (!c) { location.replace('#/welcome'); return { el: h('div'), tab: null }; }
  const then = arg || 'home';
  if (mode === 'offer') {
    if (!lock.allowed(c.band) || c.lock) { location.replace(signup.next('lock', then)); return { el: h('div'), tab: null }; }
    state.updateChild(c.id, { lockOffered: true });
    return setter(c, { title: s('lock_offer'), why: s('lock_why'), then, offer: true });
  }
  if (mode === 'set') return setter(c, { title: c.lock ? s('lock_change') : s('lock_set'), then });
  if (!c.lock || !lock.allowed(c.band)) {
    if (mode === 'check') { passed = arg; location.replace('#/settings/' + arg); } else location.replace(returnTo);
    return { el: h('div'), tab: null };
  }
  // the reset came due: whoever opens it now chooses a new PIN, and nothing is deleted
  if (mode !== 'check' && lock.resetDue(c.lock)) {
    return setter(c, { title: s('reset_new'), then: (returnTo.replace(/^#\//, '').split('/')[0]) || 'home' });
  }
  return opener(c, mode === 'check' ? arg : null);
}
