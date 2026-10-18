// The teacher dashboard (P20, C3.2, DESIGN-C2C3-SPECS.md item 11), at /teacher/: a staff page apart from the
// learner app. Online Cloudflare Access lets the teacher in and `staff` says which classes are hers; on the hub the
// teacher's PIN opens it (kept in this page's memory only). Nothing is kept in this browser: no storage, no service
// worker cache; offline it says "Connect to see your class". No names anywhere: learners are a picture and a number,
// questions carry no learner at all, and what the teacher types passes the hub's identifier filter.
// Tabs: To do (one card at a time: needs care, held answers and ladders, questions sent to her; S sends, E edits,
// D doesn't send, J and K move), Class (four counts, the class by picture and number, her page, the lock reset code,
// the class card), Lessons (did it, mastered, the hardest item, disputes, hint rungs; bars per item; the answer
// sheet), Wishes (the screened wishlist, read only), Live (a live audio class, P30a, C6.3: shown while the class
// has live classes on) and Contests (P31, C6.5: who took part, by picture and number, never sorted by score).

import { aliasIcon, aliasName as nameOf } from '../aliases.js';
import * as L from '../staff/lang.js';

const API = '../api/m/teacher';
const REASONS = ['wrong', 'gives_answer', 'unsafe', 'not_school'];
const MADE_CHIPS = ['spelling', 'answer_wrong', 'unclear', 'unsafe', 'not_school'];   // P32, as stores/base.py MADE_CHIPS
const BAND = { ey: 'band.ey', p1: 'band.p1', p2: 'band.p2', s1: 'band.s1', s2: 'band.s2', ad: 'band.ad' };

// Strings: the staff pages' string files (app/js/staff/strings/, P33, C5.1): teacher.* and the shared common.*;
// English, Dari and Pashto, picked in the header and remembered in this browser
const t = (k, v) => L.t(k.includes('.') ? k : L.has('teacher.' + k) ? 'teacher.' + k : 'common.' + k, v);
const fa = (x) => L.digits(x);
const num = (n) => L.num(n);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));

const root = document.getElementById('teacher');
const me = { pin: '', via: null, cohorts: [], cohort: null, label: '', hold: false, lock_codes: false, printer: false,
  sheets: false, live: false, contest: false };
let tab = 'todo';
let todo = { items: [], at: 0 };
let keys = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 4000);
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (me.pin) headers['x-teacher-pin'] = me.pin;
  if (method !== 'GET') headers['x-qalam'] = '1';      // a staff write (C5 M1): a form from another site cannot send it
  const q = new URLSearchParams({ lang: L.lang() });
  if (me.cohort) q.set('cohort', me.cohort);
  const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${q}`, { method, headers, cache: 'no-store',
    credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    const e = new Error(data.error || String(r.status));
    e.status = r.status;
    e.code = data.code;
    throw e;
  }
  return raw ? r.text() : r.json();
}

// the header: the title and Sign out, the class and the language picker, then the tabs (on a phone, three rows)
function header() {
  const pick = me.cohorts.length > 1
    ? h('select', { class: 'who', 'aria-label': t('class_of'), onChange: (e) => { me.cohort = e.target.value; start(); } },
      me.cohorts.map((c) => h('option', { value: c.id, selected: c.id === me.cohort }, L.cohort(c.label))))
    : me.cohorts.length ? h('span', { class: 'chip who', dir: 'auto' }, L.cohort(me.cohorts[0].label)) : null;
  return h('header', { class: 'top staff-top' },
    h('div', { class: 'grow' }, h('h1', {}, (document.title = t('title')))),
    me.via ? h('button', { type: 'button', class: 'chip signout', onClick: signOut }, t('sign_out')) : null,
    h('span', { class: 'brk', 'aria-hidden': 'true' }), pick,
    L.picker(h, () => (me.via ? draw() : pinGate(''))));
}

function tabs() {
  const one = (k, n) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k),
    class: 'chip' + (tab === k ? ' on' : ''), onClick: () => { tab = k; draw(); } }, t(k),
  n ? h('span', { class: 'count' }, fa(n)) : null);
  return h('nav', { class: 'chips ttabs', role: 'tablist' }, one('todo', todo.items.length), one('class'), one('lessons'),
    one('wishes'), me.live || live.sid ? one('live') : null, me.contest ? one('contests') : null);
}

const page = (...kids) => put(root, h('div', { class: 'screen' }, header(), me.via ? tabs() : null, kids, L.draftNote(h)));
const say = (msg) => page(h('p', { class: 'empty' }, msg));

function failed(e) {
  if (!navigator.onLine || e instanceof TypeError) return say(t('connect'));
  if (e.status === 404) return say(t('off'));
  if (e.status === 429) return me.via === 'pin' || !me.via ? pinGate(t('wait')) : say(t('wait'));
  if (e.status === 401) return location.protocol === 'http:' || me.pin ? pinGate(me.pin ? t('wrong_pin') : '') : say(t('access'));
  if (e.status === 403) return say(e.code === 'not_your_class' ? t('error.not_your_class') : /admin/i.test(e.message) ? t('not_staff') : t('access'));
  return toast(e.code && L.has('error.' + e.code) ? t('error.' + e.code) : t('save_fail'));
}

function signOut() {
  if (me.via === 'access') { location.href = '/cdn-cgi/access/logout'; return; }
  Object.assign(me, { pin: '', via: null, cohorts: [], cohort: null });
  pinGate('');
}

function pinGate(msg) {
  me.via = null;
  const box = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('pin'), dir: 'ltr' });
  put(root, h('div', { class: 'screen' }, header(),
    h('form', { class: 'card pad-card stack', onSubmit: (e) => { e.preventDefault(); me.pin = L.latin(box.value).trim(); start(); } },
      h('label', {}, t('pin')), box, msg ? h('p', { class: 'muted' }, msg) : null,
      h('button', { class: 'btn primary', type: 'submit' }, t('open'))), L.draftNote(h)));
  setTimeout(() => box.focus(), 50);
}

async function start() {
  say(t('loading'));
  try {
    const m = await api('/me');
    Object.assign(me, { via: m.via, label: m.label, cohorts: m.cohorts, hold: !!m.hold, lock_codes: !!m.lock_codes,
      printer: !!m.printer, sheets: !!m.sheets, live: !!m.live, contest: !!m.contest });
    if (!me.cohort || !m.cohorts.some((c) => c.id === me.cohort)) me.cohort = m.cohorts.length ? m.cohorts[0].id : null;
  } catch (e) { return failed(e); }
  if (!me.cohort) return say(t('not_staff'));
  return draw();
}

async function draw() {
  if (keys) { document.removeEventListener('keydown', keys); keys = null; }
  if (!me.via) return start();
  if (tab === 'todo') return drawTodo();
  if (tab === 'class') return drawClass();
  if (tab === 'lessons') return drawLessons();
  if (tab === 'live') return me.live || live.sid ? drawLive() : page(h('p', { class: 'empty' }, t('live_off')));
  if (tab === 'contests') return me.contest ? drawContests() : page(h('p', { class: 'empty' }, t('contests_off')));
  return drawWishes();
}

// --- To do: one card at a time ---

function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60e3));
  if (m < 2) return t('now');
  if (m < 60) return t('ago_min', { n: num(m) });
  if (m < 48 * 60) return t('ago_h', { n: num(Math.round(m / 60)) });
  return t('ago_d', { n: num(Math.round(m / 1440)) });
}

async function drawTodo(at = 0) {
  try { todo = await api('/todo'); } catch (e) { return failed(e); }
  showCard(Math.min(at, Math.max(0, todo.items.length - 1)));
}

function showCard(i) {
  const items = todo.items;
  if (!items.length) return page(h('p', { class: 'empty' }, t('empty')));
  const q = items[i];
  const body = h('div', { class: 'stack' });
  const go = (k) => { if (k >= 0 && k < items.length) showCard(k); };
  const done = async (payload) => {
    try {
      await api(q.kind === 'made' ? '/made/' + q.mid : '/todo/' + q.id, { method: 'POST', body: payload });
    } catch (e) {
      if (e.status === 422) { toast(e.message); return; }
      return failed(e);
    }
    items.splice(i, 1);
    showCard(Math.min(i, items.length - 1));
  };
  const meta = L.join([q.year != null ? t('year', { n: num(q.year) }) : null, q.lesson, ago(q.created)]);
  const kind = q.kind === 'held' ? (q.hints ? 'held_ladder' : 'held') : q.kind;
  const head = h('div', { class: 'row wrap' }, h('span', { class: 'tag' + (q.kind === 'care' ? ' warm' : '') }, t(kind)),
    h('span', { class: 'grow muted small' }, meta), h('b', { class: 'small' }, t('n_of', { a: num(i + 1), b: num(items.length) })));
  const question = h('p', { class: 'q', dir: 'auto' }, q.question);
  let actions;
  if (q.kind === 'held') {
    const reasons = h('div', { class: 'chips wrap hidden' }, h('span', { class: 'muted small' }, t('why_not')),
      REASONS.map((r) => h('button', { type: 'button', class: 'chip', onClick: () => done({ action: 'drop', reason: r }) }, t('r_' + r))));
    const shown = q.hints
      ? h('ol', { class: 'hints' }, q.hints.map((x) => h('li', { dir: 'auto' }, x)))
      : h('div', { class: 'a', dir: 'auto' }, q.shown);
    const checks = [q.private ? t('answer_is', { a: fa(q.private.answer) }) : null,
      q.checks && q.checks.maths !== null ? t(q.checks.maths ? 'maths_ok' : 'maths_bad') : null,
      q.checks && q.checks.leak !== null ? t(q.checks.leak ? 'leak_ok' : 'leak_bad') : null,
      q.private && !q.private.sure ? t('unsure') : null].filter(Boolean);
    const secret = checks.length ? h('p', { class: 'private small' }, h('b', {}, t('for_you') + ': '),
      h('span', { dir: 'auto' }, L.join(checks))) : null;
    const edit = () => {
      const boxes = q.hints ? q.hints.map((x) => h('textarea', { class: 'field', rows: 2, maxlength: 400, dir: 'auto' }, x))
        : [h('textarea', { class: 'field', rows: 4, maxlength: 1500, dir: 'auto' }, q.shown || '')];
      put(body, head, question, boxes, h('div', { class: 'btns two' },
        h('button', { type: 'button', class: 'btn primary', onClick: () => done(q.hints
          ? { action: 'edit', hints: boxes.map((b) => b.value) } : { action: 'edit', text: boxes[0].value }) }, t('send')),
        h('button', { type: 'button', class: 'btn', onClick: () => showCard(i) }, t('cancel'))));
      boxes[0].focus();
    };
    actions = h('div', { class: 'btns' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => done({ action: 'send' }) }, t('send')),
      h('button', { type: 'button', class: 'btn', onClick: edit }, t('edit')),
      h('button', { type: 'button', class: 'btn', onClick: () => reasons.classList.toggle('hidden') }, t('drop') + ' ▾'));
    put(body, head, question, shown, secret, actions, reasons);
    keys = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 's') done({ action: 'send' });
      else if (k === 'e') edit();
      else if (k === 'd') reasons.classList.toggle('hidden');
      else if (k === 'j') go(i + 1);
      else if (k === 'k') go(i - 1);
    };
  } else if (q.kind === 'made') {
    // P32: what she made, checked as it stands; the note goes through the hub's name filter and must not give the answer
    const m = q.made || {};
    const part = (k, v) => (v ? h('div', { class: 'a' }, h('small', { class: 'muted' }, t(k)), h('p', { dir: 'auto' }, v)) : null);
    const change = () => {
      const picked = new Set();
      const chips = h('div', { class: 'chips wrap' }, MADE_CHIPS.map((c) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onClick: () => {
          if (picked.has(c)) picked.delete(c); else picked.add(c);
          b.setAttribute('aria-pressed', String(picked.has(c)));
          b.classList.toggle('on', picked.has(c));
        } }, t('c_' + c));
        return b;
      }));
      const box = h('textarea', { class: 'field', rows: 3, maxlength: 300, dir: 'auto', placeholder: t('made_no_answer'),
        'aria-label': t('made_reply') });
      put(body, head, part('made_q', m.q), part('made_a', m.a), part('made_why', m.why),
        h('p', { class: 'muted small' }, t('made_what')), chips, h('small', { class: 'muted' }, t('made_reply')), box,
        h('div', { class: 'btns two' },
          h('button', { type: 'button', class: 'btn primary', onClick: () => done({ verdict: 'change', chips: [...picked],
            reply: box.value }) }, t('send')),
          h('button', { type: 'button', class: 'btn', onClick: () => showCard(i) }, t('cancel'))));
    };
    actions = h('div', { class: 'btns two' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => done({ verdict: 'ok', chips: [], reply: '' }) }, t('made_ok')),
      h('button', { type: 'button', class: 'btn', onClick: change }, t('made_change')));
    put(body, head, part('made_q', m.q), part('made_a', m.a), part('made_why', m.why), actions);
    keys = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'j') go(i + 1);
      else if (k === 'k') go(i - 1);
    };
  } else {
    const told = q.kind === 'care'
      ? h('div', { class: 'a' }, h('small', { class: 'muted' }, t('told')), h('p', { dir: 'auto' }, q.shown || ''))
      : q.shown ? h('div', { class: 'a' }, h('small', { class: 'muted' }, t('qalam_said')), h('p', { dir: 'auto' }, q.shown))
        : h('p', { class: 'muted small' }, t('no_answer'));
    const reply = () => {
      const box = h('textarea', { class: 'field', rows: 4, maxlength: 1500, dir: 'auto', placeholder: t('no_names'),
        'aria-label': t('reply') });
      const reuse = h('input', { type: 'checkbox', checked: q.kind !== 'care' });
      put(body, head, question, told, box,
        q.kind === 'care' ? null : h('label', { class: 'row' }, reuse, t('reuse')),
        h('div', { class: 'btns two' },
          h('button', { type: 'button', class: 'btn primary', onClick: () => done({ action: 'reply', text: box.value,
            reuse: q.kind !== 'care' && reuse.checked }) }, t('send')),
          h('button', { type: 'button', class: 'btn', onClick: () => showCard(i) }, t('cancel'))));
      box.focus();
    };
    actions = h('div', { class: 'btns two' },
      h('button', { type: 'button', class: 'btn primary', onClick: reply }, t('reply')),
      h('button', { type: 'button', class: 'btn', onClick: () => done({ action: q.kind === 'care' ? 'seen' : 'dismiss' }) },
        t(q.kind === 'care' ? 'seen' : 'dismiss')));
    put(body, head, question, told, actions);
    keys = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'j') go(i + 1);
      else if (k === 'k') go(i - 1);
    };
  }
  document.addEventListener('keydown', keys);
  const g = todo.groups;
  page(g ? h('p', { class: 'muted small pad' }, L.join([t('g_care', { n: num(g.care) }), t('g_held', { n: num(g.held) }),
    t('g_question', { n: num(g.question) }), g.made !== undefined ? t('g_made', { n: num(g.made) }) : null])) : null,
    h('section', { class: 'qcard' + (q.kind === 'care' ? ' urgent' : '') }, body),
    h('div', { class: 'row pad' },
      h('button', { type: 'button', class: 'btn', disabled: i === 0 || null, onClick: () => go(i - 1) }, t('prev')),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn', disabled: i >= items.length - 1 || null, onClick: () => go(i + 1) }, t('next'))),
    h('p', { class: 'muted small pad keys-hint' }, t('keys')));
}

// --- Class ---

const aliasName = (id) => nameOf(id, L.lang());
const seen = (d) => (d === 0 ? t('seen_today') : t('seen_days', { n: num(d) }));

async function drawClass() {
  let c;
  try { c = await api('/class'); } catch (e) { return failed(e); }
  const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, n), h('small', {}, label));
  const row = (r) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawLearner(r.alias); } },
    h('span', { class: 'pic' }, aliasIcon(r.picture, 40)),
    h('span', { class: 'grow' },
      h('b', {}, `${aliasName(r.picture)} ${fa(r.number)}`),
      h('small', { class: 'muted' }, L.join([t(BAND[r.band] || r.band), seen(r.days),
        t('lessons_week', { n: num(r.lessons) }), t('sheets_n', { n: num(r.sheets) }),
        r.average != null ? t('avg', { n: L.pct(r.average) }) : null]))),
    r.needs_help ? h('span', { class: 'tag help' }, t('stuck', { n: fa(r.stuck) })) : null);
  page(h('div', { class: 'stats four' }, stat(t('n_of', { a: num(c.active), b: num(c.learners) }), t('active')),
    stat(fa(c.lessons), t('finished')), stat(fa(c.sheets), t('checked')), stat(fa(c.questions), t('questions'))),
  h('nav', { class: 'subjects class-list' }, c.rows.length ? c.rows.map(row) : h('p', { class: 'empty' }, t('none'))),
  h('div', { class: 'row pad wrap' },
    h('button', { type: 'button', class: 'btn', onClick: classCard }, t('class_card')),
    me.printer ? h('button', { type: 'button', class: 'btn', onClick: hubCard }, t('hub_card')) : null));
}

async function drawLearner(alias) {
  let d;
  try { d = await api('/class/' + encodeURIComponent(alias)); } catch (e) { return failed(e); }
  const codeBox = h('div', { class: 'stack' });
  const returnBox = h('div', { class: 'stack' });
  // six digits for her, 15 minutes, once: a lock reset code, or (W9) a return code for her lost phone. One code
  // at a time: a new one of either kind replaces the last.
  const code = (what, box, tell) => async () => {
    try {
      const r = await api(`/class/${encodeURIComponent(alias)}/${what}`, { method: 'POST' });
      const latin = r.code.replace(/(\d{3})(\d{3})/, '$1 $2');
      put(codeBox); put(returnBox);
      put(box, h('p', { class: 'code-big', dir: 'ltr' }, latin.replace(/[0-9]/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])),
        h('p', { class: 'code-big latin', dir: 'ltr' }, latin), h('p', { class: 'muted small' }, t('code_for', { n: num(r.minutes) })),
        h('p', { class: 'small' }, t(tell)));
    } catch (e) { failed(e); }
  };
  const make = code('reset-code', codeBox, 'code_tell');
  const back = h('button', { type: 'button', class: 'btn', onClick: () => drawClass() }, t('back'));
  page(h('div', { class: 'row pad' }, back),
    h('section', { class: 'card pad-card stack' },
      h('div', { class: 'row' }, h('span', { class: 'pic' }, aliasIcon(d.picture, 40)),
        h('div', { class: 'grow' }, h('h2', {}, `${aliasName(d.picture)} ${fa(d.number)}`),
          h('small', { class: 'muted' }, L.join([t(BAND[d.band] || d.band), seen(d.days)]))),
        d.needs_help ? h('span', { class: 'tag help' }, t('stuck', { n: fa(d.stuck) })) : null),
      d.needs_help ? h('p', { class: 'small' }, t('stuck_line', { n: fa(d.stuck) })) : null,
      h('h3', {}, t('her_lessons')),
      d.lessons.length ? h('ul', { class: 'plain' }, d.lessons.map((l) => h('li', { class: 'row' },
        h('span', { class: 'grow', dir: 'auto' }, l.title),
        h('small', { class: 'muted' }, L.join([l.pct != null ? t('pct', { n: L.pct(l.pct) }) : t('not_marked'),
          l.done ? t('done_n', { n: num(l.done) }) : null]))))) : h('p', { class: 'muted' }, t('no_lessons')),
      h('h3', {}, t('hints_used')),
      h('p', { class: 'small' }, L.join([1, 2, 3].map((n) => t('rung', { n: num(n), m: num(d.hints[n] || 0) })))),
      d.lock_codes ? [h('h3', {}, t('reset')), codeBox,
        h('button', { type: 'button', class: 'btn primary', onClick: make }, t('make_code'))] : null,
      h('h3', {}, t('return')), h('p', { class: 'small muted' }, t('return_why')), returnBox,
      h('button', { type: 'button', class: 'btn return-code', onClick: code('return-code', returnBox, 'return_tell') },
        t('return_make'))));
}

function classCard() {
  const box = h('input', { maxlength: 20, autocomplete: 'off', dir: 'ltr', 'aria-label': t('code') });
  const out = h('div', { class: 'stack' });
  const go = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/class-card', { method: 'POST', body: { code: box.value } });
      const svg = new DOMParser().parseFromString(r.svg, 'image/svg+xml').documentElement;
      // A6, the QR and the code only: no class label, no address (C3.3; C4 look questions 21 and 33)
      put(out, h('style', {}, '@page { size: A6; margin: 8mm; }'),
        h('div', { class: 'class-card a6' }, document.importNode(svg, true), h('p', { class: 'code-big latin', dir: 'ltr' }, r.code)),
      h('button', { type: 'button', class: 'btn primary noprint', onClick: () => window.print() }, t('print')));
    } catch (err) { if (err.status === 404) toast(t('not_code')); else failed(err); }
  };
  page(h('div', { class: 'row pad noprint' }, h('button', { type: 'button', class: 'btn', onClick: () => drawClass() }, t('back'))),
    h('form', { class: 'card pad-card stack noprint', onSubmit: go }, h('label', {}, t('code')), box,
      h('button', { class: 'btn primary', type: 'submit' }, t('card_go'))), out);
  box.focus();
}

async function hubCard() {
  try { await api('/hub-card', { method: 'POST' }); toast(t('queued')); } catch (e) { failed(e); }
}

// --- Lessons ---

async function drawLessons() {
  let d;
  try { d = await api('/lessons'); } catch (e) { return failed(e); }
  const row = (l) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawLesson(l.id); } },
    h('span', { class: 'grow' }, h('b', { dir: 'auto' }, l.title || l.id),
      h('small', { class: 'muted' }, L.join([`${fa(l.did)} ${t('did')}`, `${fa(l.mastered)} ${t('mastered')}`,
        l.hardest ? t('hardest', { n: num(l.hardest) }) : null, l.disputes ? t('disputes', { n: num(l.disputes) }) : null,
        `${t('hints_by_rung')} ${fa(l.hints[1] || 0)}/${fa(l.hints[2] || 0)}/${fa(l.hints[3] || 0)}`]))));
  page(h('nav', { class: 'subjects' }, d.lessons.length ? d.lessons.map(row) : h('p', { class: 'empty' }, t('no_lessons'))));
}

async function drawLesson(id) {
  let d;
  try { d = await api('/lessons/' + encodeURIComponent(id)); } catch (e) { return failed(e); }
  const bar = (it) => {
    const all = it.right + it.wrong;
    const share = all ? Math.round((100 * it.right) / all) : 0;
    return h('li', { class: 'stack-sm' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, t('item', { n: num(it.n) })),
        h('small', { class: 'muted' }, L.join([`${fa(it.right)} ${t('right')}`, `${fa(it.wrong)} ${t('wrong')}`,
          it.disputes ? t('disputes', { n: num(it.disputes) }) : null]))),
      h('div', { class: 'bar good-bar', role: 'img', 'aria-label': `${share}%` }, h('span', { style: `width:${share}%` })));
  };
  const openAnswers = async () => {
    try {
      const html = await api(`/answers/${encodeURIComponent(id)}.html`, { raw: true });
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60e3);
    } catch (e) { failed(e); }
  };
  page(h('div', { class: 'row pad' }, h('button', { type: 'button', class: 'btn', onClick: () => drawLessons() }, t('back'))),
    h('section', { class: 'card pad-card stack' }, h('h2', { dir: 'auto' }, d.title || d.id),
      h('p', { class: 'small muted' }, L.join([`${fa(d.did)} ${t('did')}`, `${fa(d.mastered)} ${t('mastered')}`,
        d.hardest ? t('hardest', { n: num(d.hardest) }) : null])),
      d.items.length ? h('ol', { class: 'plain bars' }, d.items.map(bar)) : null,
      d.answers ? h('button', { type: 'button', class: 'btn', onClick: openAnswers }, t('answers')) : null));
}

// --- Wishes ---

async function drawWishes() {
  let d;
  try { d = await api('/wishes'); } catch (e) { return failed(e); }
  page(d.wishes.length
    ? h('ul', { class: 'subjects plain' }, d.wishes.map((w) => h('li', { class: 'row wish' },
      h('span', { class: 'grow', dir: 'auto' }, w.text),
      h('small', { class: 'muted' }, L.join([t('wish_n', { n: num(w.count) }), (w.bands || []).map((b) => t(BAND[b] || b)).join(L.lang() === 'en' ? ', ' : '، ')])))))
    : h('p', { class: 'empty' }, t('no_wishes')));
}

// --- Contests (P31, C6.5): each contest open to the class, how many took part, and each learner who did with her
// percent right, in the class list's order (picture, then number): never sorted by the percent, never a place ---

async function drawContests() {
  let d;
  try { d = await api('/contests'); } catch (e) { return failed(e); }
  const title = (x) => x.title[L.lang()] || x.title.en || x.id;
  const card = (x) => h('section', { class: 'card pad-card stack contest-card' },
    h('div', { class: 'row wrap' }, h('h2', { class: 'grow', dir: 'auto' }, title(x)),
      h('span', { class: 'tag' + (x.phase === 'open' ? ' on' : '') }, t('contest_' + x.phase))),
    h('p', { class: 'muted small' }, L.join([subjName(x.subject), t('contest_shape', { n: num(x.n), m: num(x.minutes) }),
      t('contest_window', { a: L.when(x.opens_at), b: L.when(x.closes_at) })])),
    h('p', { class: 'lead' }, t('took_part', { a: num(x.took_part), b: num(x.of) })),
    x.learners.length ? h('ul', { class: 'subjects plain contest-takers' }, x.learners.map((r) => h('li', { class: 'row' },
      h('span', { class: 'pic' }, aliasIcon(r.picture, 32)),
      h('span', { class: 'grow' }, h('b', {}, `${aliasName(r.picture)} ${fa(r.number)}`),
        h('small', { class: 'muted' }, ' ', t(BAND[r.band] || r.band))),
      h('span', {}, L.pct(r.percent))))) : null);
  page(h('p', { class: 'muted small pad' }, t('contest_note')),
    d.contests.length ? d.contests.map(card) : h('p', { class: 'empty' }, t('no_contests')));
}

// --- Live (P30a, C6.3): a live audio class ---
// One row to start (the subject, the day's classes, the month's minutes), then the room: the state line and its
// action, Mute, the hands in the order raised, the board. The microphone is asked for only when she taps Start, on
// this staff page; her track goes to Cloudflare's relay (the hub only passes the description of the connection) and
// is sent only while two learners or more are here (the roster's `audio`). Nothing is recorded, here or anywhere.
// The floor (P30b, C6.4): in a class whose every band is adults, with the admin's `floor` setting on (the server's
// `floor`), each raised hand has "Give the floor"; the one who has it shows with her time left and "Take back the
// floor", and her voice plays here through a relay session of this page's own while she speaks.

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const LIVE_POLL_MS = 2000;
const live = { sid: null, cohort: null, pc: null, sender: null, track: null, muted: false, max: 45, subject: null,
  roster: null, timer: null, els: null, handsKey: '', boardKey: null, picking: false, broken: false, summary: null,
  titles: new Map(), floorOk: false, ear: null, earKey: '', audio: null };

const subjName = (sj) => t('subj_' + (sj || 'class'));

function liveStop() {
  clearInterval(live.timer);
  earClose();
  if (live.track) live.track.stop();
  if (live.pc) { try { live.pc.close(); } catch { /* closed already */ } }
  Object.assign(live, { sid: null, cohort: null, pc: null, sender: null, track: null, muted: false, roster: null,
    timer: null, els: null, handsKey: '', boardKey: null, picking: false, broken: false });
}

// a confirm for something that cannot be undone: Escape cancels and the focus starts on Cancel (as the admin's)
function ask(question, yes) {
  return new Promise((resolve) => {
    const back = document.activeElement;
    const close = (v) => { box.remove(); document.removeEventListener('keydown', esc, true); if (back && back.focus) back.focus(); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
    const cancel = h('button', { type: 'button', class: 'btn', onClick: () => close(false) }, t('cancel'));
    const box = h('div', { class: 'amodal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'card stack' }, h('b', {}, question),
        h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn primary', onClick: () => close(true) }, yes), cancel)));
    document.body.append(box);
    document.addEventListener('keydown', esc, true);
    cancel.focus();
  });
}

async function drawLive() {
  if (live.sid) return liveRoom();
  if (live.summary) {
    const x = live.summary;
    return page(h('section', { class: 'card pad-card stack' },
      h('b', {}, t('live_summary', { s: subjName(x.subject), m: num(x.minutes || 0), n: num(x.peak || 0) })),
      x.timedOut ? h('p', { class: 'small' }, t('live_timed_out')) : null,
      h('button', { type: 'button', class: 'btn', onClick: () => { live.summary = null; drawLive(); } }, t('live_new'))));
  }
  let d;
  try { d = await api('/live'); } catch (e) { return failed(e); }
  if (!d.on) return page(h('p', { class: 'empty' }, t('live_off')));
  live.floorOk = !!d.floor;
  const counts = h('p', { class: 'small muted' }, L.join([t('live_today', { a: num(d.today), b: num(d.per_day) }),
    t('live_month', { n: num((d.month && d.month.minutes) || 0) })]));
  if (d.open) {                    // open from before this page was loaded: speak to it again, or end it
    return page(h('section', { class: 'card pad-card stack' }, h('h2', {}, subjName(d.open.subject)),
      h('p', {}, t('live_open_now')), h('p', { class: 'small' }, t('live_explain')),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn primary', onClick: () => liveGo(d.open.id, d.open.subject, STUN, d.max_minutes) },
          t('live_resume')),
        h('button', { type: 'button', class: 'btn kill', onClick: () => liveEnd(d.open.id, d.open.subject) }, t('end_class')))));
  }
  let subject = d.subjects.includes(live.subject) ? live.subject : 'class';
  const used = d.today >= d.per_day;
  const chips = h('div', { class: 'chips wrap', role: 'group', 'aria-label': t('live_subject') });
  const drawChips = () => put(chips, d.subjects.map((sj) => h('button', { type: 'button', class: 'chip' + (sj === subject ? ' on' : ''),
    'aria-pressed': String(sj === subject), onClick: () => { subject = sj; drawChips(); } }, subjName(sj))));
  drawChips();
  const go = async (btn) => {
    btn.disabled = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true,
        autoGainControl: true, channelCount: 1 }, video: false });
    } catch { btn.disabled = false; return toast(t('mic_no')); }
    let r;
    try {
      r = await api('/live/start', { method: 'POST', body: { cohort: me.cohort, subject } });
    } catch (e) {
      stream.getTracks().forEach((x) => x.stop());
      btn.disabled = false;
      if (e.code === 'budget') return toast(t('live_used', { n: num(d.per_day) }));
      return failed(e);
    }
    live.subject = subject;
    return livePublish(r.id, subject, r.ice, r.max_minutes, stream);
  };
  const start = h('button', { type: 'button', class: 'btn primary', disabled: used || null, onClick: (e) => go(e.currentTarget) },
    t('start'));
  page(h('section', { class: 'card pad-card stack' }, h('h2', {}, t('start_class')), chips, counts,
    used ? h('p', { class: 'small' }, t('live_used', { n: num(d.per_day) })) : h('p', { class: 'small' }, t('live_explain')), start));
}

// speak to a class that is open already (after a reload): the microphone again, then publish
async function liveGo(sid, subject, ice, max) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true,
      autoGainControl: true, channelCount: 1 }, video: false });
  } catch { return toast(t('mic_no')); }
  return livePublish(sid, subject, ice, max, stream);
}

// her microphone as the one send-only audio track; the relay's answer comes back through the hub
async function livePublish(sid, subject, ice, max, stream) {
  if (live.sid && live.sid !== sid) liveStop();
  if (live.track && live.track !== stream.getAudioTracks()[0]) live.track.stop();
  if (live.pc) { try { live.pc.close(); } catch { /* closed already */ } }
  const track = stream.getAudioTracks()[0];
  const pc = new RTCPeerConnection({ iceServers: Array.isArray(ice) && ice.length ? ice : STUN });
  const tr = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
  Object.assign(live, { sid, cohort: me.cohort, subject, pc, sender: tr.sender, track, max: max || live.max, broken: false });
  track.enabled = !live.muted;
  try {
    await pc.setLocalDescription(await pc.createOffer());
    const r = await api(`/live/${sid}/sdp`, { method: 'POST', body: { sdp: pc.localDescription.sdp, mid: tr.mid } });
    await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
  } catch (e) {
    if (e.status === 410) return liveDone({ subject, minutes: 0, peak: 0 }, true);
    live.broken = true;
    toast(t('relay_no'));
  }
  await tr.sender.replaceTrack(null).catch(() => {});     // nothing is sent until two learners are here
  clearInterval(live.timer);
  live.timer = setInterval(livePoll, LIVE_POLL_MS);
  livePoll();
  if (tab === 'live') liveRoom();
}

async function livePoll() {
  const sid = live.sid;
  if (!sid) return;
  let r;
  try { r = await api(`/live/${sid}/roster`); } catch (e) {
    if (e.status === 404) liveDone({ subject: live.subject, minutes: 0, peak: 0 }, true);
    return;                                                  // offline for a moment: the next round asks again
  }
  if (sid !== live.sid) return;
  if (r.over) { liveDone(r, true); return; }
  live.roster = r;
  const want = r.audio === 'on' ? live.track : null;
  if (live.sender && live.sender.track !== want) live.sender.replaceTrack(want).catch(() => {});
  const ek = r.floor && r.floor.on ? `${r.floor.alias}|${r.floor.until}` : '';
  if (ek !== live.earKey) { live.earKey = ek; if (ek) earOpen(sid); else earClose(); }
  if (live.els && live.els.state.isConnected) drawRoom();
}

function liveDone(r, timedOut) {
  const subject = r.subject || live.subject;
  liveStop();
  live.summary = { subject, minutes: r.minutes, peak: r.peak, timedOut };
  if (tab === 'live') drawLive();
}

async function liveEnd(sid = live.sid, subject = live.subject) {
  if (!(await ask(t('end_q'), t('end_class')))) return;
  try {
    const r = await api(`/live/${sid}/end`, { method: 'POST' });
    liveDone({ ...r, subject: r.subject || subject }, false);
  } catch (e) { failed(e); }
}

function liveRoom() {
  live.els = { state: h('div', { class: 'astate row wrap live-state' }), hands: h('section', { class: 'card pad-card stack live-hands' }),
    board: h('section', { class: 'card pad-card stack live-board' }) };
  live.handsKey = '';
  live.boardKey = null;
  page(h('div', { class: 'stack live-room' }, h('h2', { class: 'live-title' }, subjName(live.subject)), live.els.state, live.els.hands,
    live.els.board));
  drawRoom();
  if (!live.titles.size) {                  // the board's line names the lesson: the class's lessons, once
    api('/lessons').then((d) => {
      for (const l of d.lessons) live.titles.set(l.id, l.title || l.id);
      live.boardKey = null;
      if (live.els && live.els.state.isConnected) drawRoom();
    }).catch(() => {});
  }
}

function drawRoom() {
  const els = live.els;
  const r = live.roster || { here: 0, minutes: 0, hands: [], audio: 'off', board: null, max_minutes: live.max };
  const left = (r.max_minutes || live.max) - r.minutes;
  const line = r.audio === 'on' ? t('live_here', { n: num(r.here), m: num(r.minutes) }) : t('waiting', { n: num(r.here) });
  const mute = h('button', { type: 'button', class: 'btn' + (live.muted ? ' on' : ''), 'aria-pressed': String(live.muted),
    onClick: () => { live.muted = !live.muted; if (live.track) live.track.enabled = !live.muted; drawRoom(); } },
  t(live.muted ? 'muted' : 'mute'));
  put(els.state, h('div', { class: 'grow stack-sm' }, h('b', { role: 'status' }, line),
    left <= 5 ? h('small', { class: 'live-left' }, t('live_left', { n: num(Math.max(0, left)) }))
      : r.audio !== 'on' ? h('small', {}, t('live_two')) : null),
  live.broken ? h('button', { type: 'button', class: 'btn primary', onClick: () => liveGo(live.sid, live.subject, STUN, live.max) },
    t('live_resume')) : null,
  mute, h('button', { type: 'button', class: 'btn kill', onClick: () => liveEnd() }, t('end_class')));
  const f = r.floor || null;
  const hk = JSON.stringify([r.hands, f && f.alias, f && f.on, live.floorOk && r.audio === 'on']);
  if (hk !== live.handsKey) {
    live.handsKey = hk;
    const canGive = live.floorOk && r.audio === 'on' && !f;
    const who = f ? r.hands.find((x) => x.alias === f.alias) : null;
    const [pic, n] = f ? [f.alias.replace(/-\d+$/, ''), f.alias.replace(/^.*-/, '')] : [];
    put(els.hands, h('div', { class: 'row wrap' }, h('h3', { class: 'grow' }, t('hands')),
      r.hands.length >= 2 ? h('button', { type: 'button', class: 'btn', onClick: () => lower({ all: true }) }, t('lower_all')) : null),
    f ? h('div', { class: 'row wrap live-floor-now' }, h('span', { class: 'pic' }, aliasIcon((who && who.picture) || pic, 40)),
      h('span', { class: 'grow stack-sm' }, h('b', {}, t('floor_has', { a: `${aliasName((who && who.picture) || pic)} ${fa(n)}` })),
        h('small', { class: 'muted', role: 'timer' }, f.on ? t('floor_speaking') : t('floor_waiting'))),
      h('button', { type: 'button', class: 'btn kill', onClick: () => giveFloor(null) }, t('take_floor'))) : null,
    r.hands.length ? h('ol', { class: 'plain live-hand-list' }, r.hands.map((x) => h('li', { class: 'row wrap' },
      h('span', { class: 'pic' }, aliasIcon(x.picture, 40)),
      h('span', { class: 'grow stack-sm' }, h('b', {}, `${aliasName(x.picture)} ${fa(x.number)}`),
        h('small', { class: 'muted' }, L.join([x.reason ? t('hand_' + x.reason) : null, x.since ? ago(x.since) : null]))),
      canGive ? h('button', { type: 'button', class: 'btn primary', onClick: () => giveFloor(x.alias) }, t('give_floor')) : null,
      h('button', { type: 'button', class: 'btn', onClick: () => lower({ alias: x.alias }) }, t('lower')))))
      : h('p', { class: 'muted small' }, t('no_hands')));
  }
  const bk = JSON.stringify(r.board || null);
  if (bk !== live.boardKey && !live.picking) { live.boardKey = bk; drawBoard(r.board); }
}

// the floor (P30b): give it to one raised hand (an adult in an adult-only class) or take it back (null)
async function giveFloor(alias) {
  try {
    await api(`/live/${live.sid}/floor`, { method: 'POST', body: alias ? { alias } : {} });
  } catch (e) {
    if (e.status === 404) toast(t('floor_gone'));              // she left the room meanwhile
    else failed(e);
  }
  return livePoll();
}

// her voice while she speaks: a receive-only connection of this page's own, through the relay, as a phone pulls
async function earOpen(sid) {
  earClose();
  const pc = new RTCPeerConnection({ iceServers: STUN });
  live.ear = pc;
  if (!live.audio) { live.audio = h('audio', { autoplay: '', class: 'hidden' }); document.body.append(live.audio); }
  pc.ontrack = (e) => {
    live.audio.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
    const p = live.audio.play();
    if (p && p.catch) p.catch(() => {});
  };
  try {
    const r = await api(`/live/${sid}/listen`, { method: 'POST', body: {} });
    if (live.ear !== pc) return;
    if (r.answer) await pc.setRemoteDescription({ type: 'answer', sdp: r.answer });
    if (r.renegotiate && r.sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: r.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await api(`/live/${sid}/answer`, { method: 'POST', body: { sdp: pc.localDescription.sdp } });
    }
  } catch { if (live.ear === pc) live.earKey = ''; }           // the next roster tries again
}

function earClose() {
  if (live.ear) { try { live.ear.close(); } catch { /* closed already */ } }
  live.ear = null;
  if (live.audio) live.audio.srcObject = null;
}

async function lower(body) {
  try { await api(`/live/${live.sid}/lower`, { method: 'POST', body }); } catch (e) { return failed(e); }
  return livePoll();
}

// the board: the step on it, "Show a lesson step" (the class's lessons, then the lesson's steps) and Clear
function drawBoard(b) {
  const title = b ? live.titles.get(b.lesson) || b.lesson : null;
  put(live.els.board, h('h3', {}, t('board')),
    b ? h('p', { dir: 'auto' }, t('board_now', { l: title, n: num(b.step + 1) })) : h('p', { class: 'muted small' }, t('board_empty')),
    h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn', onClick: pickLesson }, t('show_step')),
      b ? h('button', { type: 'button', class: 'btn', onClick: () => setBoard({}) }, t('clear_board')) : null));
}

const textOf = (x) => (x == null ? '' : typeof x === 'string' ? x : x[L.lang()] || x.prs || x.ps || x.en || '');
const stepLine = (st) => {
  const s = [st.letter, textOf(st.prompt || st.text)].filter(Boolean).join(' ').replace(/[$*_]/g, '').trim();
  return s.length > 70 ? s.slice(0, 69) + '…' : s;
};

async function pickLesson() {
  live.picking = true;
  const close = () => { live.picking = false; live.boardKey = null; drawRoom(); };
  let d;
  try { d = await api('/lessons'); } catch (e) { live.picking = false; return failed(e); }
  for (const l of d.lessons) live.titles.set(l.id, l.title || l.id);
  put(live.els.board, h('div', { class: 'row' }, h('h3', { class: 'grow' }, t('pick_lesson')),
    h('button', { type: 'button', class: 'btn', onClick: close }, t('cancel'))),
  h('nav', { class: 'subjects' }, d.lessons.map((l) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); pickStep(l, close); } },
    h('span', { class: 'grow' }, h('b', { dir: 'auto' }, l.title || l.id))))));
}

async function pickStep(l, close) {
  let lesson;
  try {
    const r = await fetch(`../api/lessons/${encodeURIComponent(l.id)}?cohort=${encodeURIComponent(me.cohort)}`,
      { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status });
    lesson = await r.json();
  } catch (e) { close(); return failed(e); }
  put(live.els.board, h('div', { class: 'row' }, h('h3', { class: 'grow', dir: 'auto' }, l.title || l.id),
    h('button', { type: 'button', class: 'btn', onClick: close }, t('cancel'))),
  h('p', { class: 'small muted' }, t('pick_step')),
  h('nav', { class: 'subjects' }, (lesson.steps || []).map((st, i) => h('a', { href: '#',
    onClick: (e) => { e.preventDefault(); setBoard({ lesson: l.id, step: i }); } },
  h('span', { class: 'grow' }, h('b', {}, t('step_n', { n: num(i + 1) })), ' ', h('span', { dir: 'auto' }, stepLine(st)))))));
}

async function setBoard(body) {
  try {
    const r = await api(`/live/${live.sid}/board`, { method: 'POST', body });
    if (live.roster) live.roster.board = r.board;
  } catch (e) { failed(e); }
  live.picking = false;
  live.boardKey = null;
  if (live.els) drawRoom();
}

// leaving the page in a class: the browser asks first (the class would go on without her sound)
window.addEventListener('beforeunload', (e) => { if (live.sid) { e.preventDefault(); e.returnValue = ''; } });

window.addEventListener('online', () => draw());
window.addEventListener('offline', () => say(t('connect')));
L.useLang(L.firstLang(), { keep: false }).then(start);
