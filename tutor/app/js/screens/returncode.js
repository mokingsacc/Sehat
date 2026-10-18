// "A code from my teacher" (WEBSITE.md 3.12 and 3.13 case 10, W9), #/return, in the clean look like Welcome: a lost
// phone and no card, for a learner in a class. Her teacher made a return code (six digits, 15 minutes, once, five
// tries; the teacher page's "Return code"). She types her class code (none at the school's own centre) and the
// digits; the server gives her learner a new token, so the lost phone's dies (POST /api/me/return), and this phone
// keeps her as she was there: the same picture and number, her class and her consent. Her finished lessons and her
// marks come back from her class's events (GET /api/me/progress), kept on this phone and never sent again as events.
// Then the lock is offered, as after a class join. Loaded only when opened (main.js), outside the service worker's
// first open (sw.js LAZY): a phone needs the server for it anyway.

import * as account from '../account.js';
import { aliasIcon, aliasName } from '../aliases.js';
import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { latin } from '../numbers.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn, topbar } from '../ui.js';
import * as signup from './signup.js';

const LESSON = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const line = (text, cls = 'grow') => h('div', { class: 'row' }, h('p', { class: cls, dir: 'auto' }, text),
  speakerBtn(() => speak(text, getLang()), { size: 'sm' }));

// the server's {done: {lesson: {stars, at}}, marks: {lesson: pct}} over what this phone has (the most stars, the
// later time; her own mark here stays)
export function rebuilt(l, p) {
  const done = { ...(l.done || {}) };
  for (const [id, d] of Object.entries((p && p.done) || {})) {
    if (!LESSON.test(id) || !d || !Number.isInteger(d.stars) || d.stars < 0 || d.stars > 3) continue;
    const at = typeof d.at === 'string' && MINUTE.test(d.at) ? Date.parse(d.at + ':00Z') : 0;
    const old = done[id];
    done[id] = { stars: Math.max(d.stars, old ? old.stars : 0), at: Math.max(at || 0, old ? old.at || 0 : 0) };
  }
  const marks = { ...((p && p.marks) || {}) };
  for (const id of Object.keys(marks)) if (!LESSON.test(id) || !Number.isInteger(marks[id])) delete marks[id];
  return { done, marks: { ...marks, ...(l.marks || {}) } };
}

// her learner on this phone from the server's answer: one already here with this seat (the same class and number)
// takes the new token; else a new learner with the server's picture and year band
export function comeBack(j) {
  const sid = hub.id();
  const seat = { token: j.token, number: j.number, cohort: j.cohort, sentBand: j.band, asked: true,
    consent: j.consent ? { ...j.consent, sent: true } : null };
  const here = state.learners().find((l) => {
    const x = state.seatOf(l, sid);
    return x && x.number === j.number && x.cohort && j.cohort && x.cohort.id === j.cohort.id;
  });
  if (here) {
    state.setSeat(here.id, sid, seat);
    state.setActive(here.id);
    return here.id;
  }
  const c = state.addChild(j.band === 'ad' ? { band: 'ad', track: 'literacy', lang: getLang() } : { band: j.band, lang: getLang() });
  state.updateChild(c.id, { picture: j.picture });
  state.standIn(c.id);
  state.setSeat(c.id, sid, seat);
  return c.id;
}

export default function returnCode() {
  const root = h('div', { class: 'screen welcome return' });
  const back = '#/move';
  const msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  const cls = h('input', { class: 'code-in', dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: 12, placeholder: 'K7QM-4PRT', 'aria-label': s('return_class'),
    value: account.showCode(signup.pendingCode() || '') });
  const digits = h('input', { class: 'code-in return-digits', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 12,
    dir: 'ltr', placeholder: '000 000', 'aria-label': s('return_digits') });
  const btn = h('button', { type: 'submit', class: 'btn primary big' }, icon('key', 24), s('return_go'));
  const say = (key) => { msg.textContent = s(key); speak(msg.textContent, getLang()); };

  async function send(e) {
    e.preventDefault();
    const typed = latin(cls.value).trim();
    const cc = typed ? account.normalCode(typed) : null;
    if (typed && !cc) { say('code_bad'); cls.focus(); return; }
    const code = latin(digits.value).replace(/\s+/g, '');
    if (!/^[0-9]{6}$/.test(code)) { say('lock_code_six'); digits.focus(); return; }
    btn.disabled = true;
    msg.textContent = s('loading');
    try {
      if (!hub.online()) await hub.connect();
      if (!hub.online() || !hub.id()) { say('offline'); return; }
      const j = await hub.returnCode(cc ? { code, cohort_code: cc } : { code });
      const id = comeBack(j);
      let p = null;
      try { p = await hub.progress(j.token); } catch { /* she is back without them; her events stay on the server */ }
      const l = state.byId(id);
      if (p && l) state.updateChild(id, rebuilt(l, p));
      signup.pendingCode(null);
      account.sync();
      welcome(id, p ? Object.keys(p.done || {}).length : 0);
    } catch (err) {
      digits.value = '';
      say(err.status === 403 ? 'lock_code_wrong' : err.status === 410 ? 'return_none' : err.status === 404 ? 'return_class_bad'
        : err.status === 422 ? 'lock_code_six' : err.status === 429 ? 'wait_minute' : hub.online() ? 'error' : 'offline');
    } finally { btn.disabled = false; }
  }

  // "Welcome back, [her picture] ۲۷. 14 lessons came back."
  function welcome(id, n) {
    const l = state.byId(id);
    const who = `${aliasName(state.pictureOf(l), getLang())} ${fa(l.number || '')}`.trim();
    const text = s('return_welcome', { who, n: fa(n) });
    fill(root, topbar({ back: null, title: s('return_title') }),
      h('div', { class: 'stack pad found' },
        h('span', { class: 'ini big' }, aliasIcon(state.pictureOf(l), 40, 2)),
        line(text, 'grow lead'),
        said(h('a', { class: 'btn primary big return-on', href: signup.next('', 'home') }, icon('next', 24), s('continue')))));
    speak(text, getLang());
  }

  fill(root, topbar({ back, title: s('return_title') }),
    h('form', { class: 'stack pad', onSubmit: send },
      line(s('return_lead'), 'grow lead'),
      h('label', { class: 'stack' }, h('span', { class: 'muted' }, s('return_class')), cls),
      h('label', { class: 'stack' }, h('span', { class: 'muted' }, s('return_digits')), digits),
      said(btn), msg));
  setTimeout(() => (cls.value ? digits : cls).focus(), 50);
  return { el: root, tab: null };
}
