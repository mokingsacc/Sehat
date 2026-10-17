// The sign-up order (DESIGN.md 6). Mo's rule: tap a year and learn; everything else is asked when first needed.
// STEPS is the order after Welcome; a step can be added or dropped without touching the others. Each step says when
// it is wanted for a learner and where it lives; next() walks on from a step to the first one still wanted, and
// then to where she was going (Home, or Ask when consent was asked for a question).
// - consent (section 7): straight after Welcome only when she came with a class code; otherwise the first time she
//   sends a question (Ask) or opens a module with any risk;
// - lock (section 8): offered once, after consent or a class join, never for early years.
// Also the "I have a class code" screen (#/signup/code): the code is checked for its shape here and kept until a
// year or door is tapped; the server checks it when she joins.

import * as account from '../account.js';
import { getLang, s } from '../i18n.js';
import * as lock from '../lock.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { h, icon, said, speakerBtn, topbar } from '../ui.js';

// in this visit, the learners whose grown-up said "Not now" (asked again on a later visit)
const notNow = new Set();
export const saidNotNow = (id) => notNow.has(id);
export function markNotNow(id) { notNow.add(id); }

export const STEPS = [
  { name: 'consent', route: (then) => `#/consent/${then}`,
    wanted: (l) => !!l.code && !l.consent && !l.asked && !notNow.has(l.id) },
  { name: 'lock', route: (then) => `#/lock/offer/${then}`,
    wanted: (l) => lock.allowed(l.band) && !l.lock && !l.lockOffered && !!(l.code || l.consent) },
];

const THEN = { home: '#/home', ask: '#/ask', settings: '#/settings', plan: '#/plan' };
// a certificate's screen comes back after consent as `cert.<pathway>` (P25b)
export const thenHash = (then) => THEN[then]
  || (/^cert\.[a-z0-9][a-z0-9-]{0,47}$/.test(then) ? '#/cert/' + then.slice(5) : '#/home');

// the route after `from` ('' for Welcome) for the learner using the phone
export function next(from = '', then = 'home') {
  const l = state.child();
  const i = STEPS.findIndex((st) => st.name === from);
  for (const st of STEPS.slice(i + 1)) if (l && st.wanted(l)) return st.route(then);
  return thenHash(then);
}

// the class code found in ?join=CODE or typed, until a year or door is tapped
const KEY = 'qalam.joincode';
export function pendingCode(code) {
  try {
    if (code === undefined) return account.normalCode(sessionStorage.getItem(KEY) || '');
    if (code) sessionStorage.setItem(KEY, code); else sessionStorage.removeItem(KEY);
  } catch { /* blocked: the code lives only on this screen */ }
  return code || null;
}

// #/signup/code: "I have a class code"
export default function signup([what]) {
  if (what !== 'code') { location.replace('#/welcome'); return { el: h('div'), tab: null }; }
  const msg = h('p', { class: 'pad muted', role: 'status' });
  const input = h('input', { class: 'code-in', dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', maxlength: 12, placeholder: 'K7QM-4PRT', 'aria-label': s('code_title'),
    value: account.showCode(pendingCode() || '') });
  const go = () => {
    const c = account.normalCode(input.value);
    if (!c) { msg.textContent = s('code_bad'); speak(s('code_bad'), getLang()); input.focus(); return; }
    pendingCode(c);
    location.hash = '#/welcome';
  };
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/welcome', title: s('code_title') }),
    h('div', { class: 'stack pad' },
      h('div', { class: 'row' }, h('span', { class: 'grow lead' }, s('code_hint')),
        speakerBtn(() => speak(s('code_hint'), getLang()), { size: 'sm' })),
      h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); go(); } },
        input,
        said(h('button', { type: 'submit', class: 'btn primary big' }, icon('card', 24), s('continue'))))),
    msg);
  return { el, tab: null };
}
