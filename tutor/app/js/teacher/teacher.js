// The teacher dashboard (P20, C3.2, DESIGN-C2C3-SPECS.md item 11), at /teacher/: a staff page apart from the
// learner app. Online Cloudflare Access lets the teacher in and `staff` says which classes are hers; on the hub the
// teacher's PIN opens it (kept in this page's memory only). Nothing is kept in this browser: no storage, no service
// worker cache; offline it says "Connect to see your class". No names anywhere: learners are a picture and a number,
// questions carry no learner at all, and what the teacher types passes the hub's identifier filter.
// Tabs: To do (one card at a time: needs care, held answers and ladders, questions sent to her; S sends, E edits,
// D doesn't send, J and K move), Class (four counts, the class by picture and number, her page, the lock reset code,
// the class card), Lessons (did it, mastered, the hardest item, disputes, hint rungs; bars per item; the answer
// sheet) and Wishes (the screened wishlist, read only).

import { aliasIcon, aliasName as nameOf } from '../aliases.js';

const API = '../api/m/teacher';
const REASONS = ['wrong', 'gives_answer', 'unsafe', 'not_school'];
const BAND = { ey: 'band_ey', p1: 'band_p1', p2: 'band_p2', s1: 'band_s1', s2: 'band_s2', ad: 'band_ad' };

// English, and Dari drafts for a native speaker's check
const T = {
  en: {
    title: 'Teacher', loading: 'Loading…', connect: 'Connect to see your class.', off: 'The teacher pages are not open here.',
    access: 'Sign in through Cloudflare Access, then open this page again.', not_staff: 'Ask the admin to add you.',
    pin: "Teacher's PIN", open: 'Open', wrong_pin: 'That PIN is not right.', wait: 'Too many tries. Wait and try again.',
    sign_out: 'Sign out', class_of: 'Class', todo: 'To do', class: 'Class', lessons: 'Lessons', wishes: 'Wishes',
    n_of: '{a} of {b}', empty: 'Nothing waiting. Well done.', save_fail: "Couldn't save. Try again.",
    care: 'Needs care', held: 'Held answer', held_ladder: 'Held hints', question: 'Sent to you',
    year: 'year {n}', ago_min: '{n} minutes ago', ago_h: '{n} hours ago', ago_d: '{n} days ago', now: 'just now',
    told: 'Qalam told her:', qalam_said: 'Qalam answered:', no_answer: 'No answer yet.',
    for_you: 'For you only', answer_is: 'answer {a}', maths_ok: 'maths ok', maths_bad: 'maths not checked',
    leak_ok: 'leak check ok', leak_bad: 'a hint may give the answer away', unsure: 'the two solves disagreed',
    send: 'Send', edit: 'Edit', drop: "Don't send", save_send: 'Send', cancel: 'Cancel', reply: 'Reply', seen: 'Seen',
    dismiss: 'Dismiss', no_names: 'No names, please', reuse: 'Use it for others too', why_not: 'Why not?',
    r_wrong: 'Wrong', r_gives_answer: 'Gives the answer', r_unsafe: 'Unsafe', r_not_school: 'Not school work',
    prev: 'Previous', next: 'Next', keys: 'Keys: S send, E edit, D don\'t send, J and K move',
    active: 'Active this week', finished: 'Lessons finished', checked: 'Sheets checked', questions: 'Questions',
    seen_today: 'last seen today', seen_days: 'last seen {n} days ago',
    lessons_week: 'lessons this week: {n}', sheets_n: 'sheets: {n}', avg: '{n}% right', needs_help: 'needs help', none: 'No learners yet.',
    her_lessons: 'Lessons', pct: '{n}% right', not_marked: 'not marked', done_n: 'done {n}×', hints_used: 'Hints used',
    rung: 'hint {n}: {m}', reset: 'Lock reset code', make_code: 'Make a code', code_for: 'Valid for {n} minutes, once.',
    code_tell: 'Tell her the code. She taps "I forgot", then "I have a code from my teacher".',
    did: 'did it', mastered: 'mastered', hardest: 'hardest item: {n}', disputes: '{n} disputes', no_lessons: 'No lessons.',
    item: 'item {n}', right: 'right', wrong: 'wrong', answers: 'Open the answer sheet', hints_by_rung: 'Hints opened',
    no_wishes: 'No wishes yet.', wish_n: '{n} asked', class_card: 'Print class card', code: 'Class code',
    card_go: 'Make the card', print: 'Print', not_code: 'That is not your class code.', hub_card: 'Print the hub card',
    queued: 'Sent to the printer.', back: 'Back', lang: 'دری',
    band_ey: 'early years', band_p1: 'years 1-3', band_p2: 'years 4-6', band_s1: 'years 7-9', band_s2: 'years 10-12',
    band_ad: 'adult',
  },
  prs: {
    title: 'معلم', loading: 'صبر کن…', connect: 'برای دیدن صنفت به انترنت وصل شو.', off: 'صفحه‌های معلم این‌جا باز نیست.',
    access: 'از راه Cloudflare Access وارد شو و این صفحه را دوباره باز کن.', not_staff: 'از مدیر بخواه تو را اضافه کند.',
    pin: 'رمز معلم', open: 'باز کن', wrong_pin: 'این رمز درست نیست.', wait: 'کوشش زیاد شد. صبر کن و دوباره کوشش کن.',
    sign_out: 'خروج', class_of: 'صنف', todo: 'کارها', class: 'صنف', lessons: 'درس‌ها', wishes: 'آرزوها',
    n_of: '{a} از {b}', empty: 'چیزی در انتظار نیست. آفرین.', save_fail: 'ذخیره نشد. دوباره کوشش کن.',
    care: 'نیاز به توجه', held: 'جواب نگه‌داشته', held_ladder: 'راهنمایی‌های نگه‌داشته', question: 'برای تو فرستاده شده',
    year: 'صنف {n}', ago_min: '{n} دقیقه پیش', ago_h: '{n} ساعت پیش', ago_d: '{n} روز پیش', now: 'همین حالا',
    told: 'قلم به او گفت:', qalam_said: 'جواب قلم:', no_answer: 'هنوز جوابی نیست.',
    for_you: 'فقط برای تو', answer_is: 'جواب {a}', maths_ok: 'حساب درست', maths_bad: 'حساب بررسی نشده',
    leak_ok: 'جواب در راهنمایی نیست', leak_bad: 'شاید راهنمایی جواب را بگوید', unsure: 'دو حل با هم فرق داشتند',
    send: 'بفرست', edit: 'تغییر', drop: 'نفرست', save_send: 'بفرست', cancel: 'لغو', reply: 'جواب بده', seen: 'دیدم',
    dismiss: 'کنار بگذار', no_names: 'لطفاً بدون نام', reuse: 'برای دیگران هم استفاده شود', why_not: 'چرا نه؟',
    r_wrong: 'غلط', r_gives_answer: 'جواب را می‌گوید', r_unsafe: 'ناامن', r_not_school: 'کار مکتب نیست',
    prev: 'قبلی', next: 'بعدی', keys: 'کلیدها: S بفرست، E تغییر، D نفرست، J و K حرکت',
    active: 'فعال این هفته', finished: 'درس‌های تمام شده', checked: 'ورق‌های چک شده', questions: 'سوال‌ها',
    seen_today: 'امروز دیده شد', seen_days: '{n} روز پیش دیده شد',
    lessons_week: '{n} درس این هفته', sheets_n: '{n} ورق', avg: '{n}٪ درست', needs_help: 'کمک لازم دارد', none: 'هنوز شاگردی نیست.',
    her_lessons: 'درس‌ها', pct: '{n}٪ درست', not_marked: 'چک نشده', done_n: '{n} بار تمام شد', hints_used: 'راهنمایی‌های استفاده شده',
    rung: 'راهنمایی {n}: {m}', reset: 'کد باز کردن قفل', make_code: 'کد بساز', code_for: 'برای {n} دقیقه، یک بار.',
    code_tell: 'کد را به او بگو. او «یادم رفت» و بعد «معلمم یک کد به من داده» را می‌زند.',
    did: 'انجام داده', mastered: 'یاد گرفته', hardest: 'سخت‌ترین سوال: {n}', disputes: '{n} اعتراض', no_lessons: 'درسی نیست.',
    item: 'سوال {n}', right: 'درست', wrong: 'غلط', answers: 'ورق جواب‌ها را باز کن', hints_by_rung: 'راهنمایی‌های باز شده',
    no_wishes: 'هنوز آرزویی نیست.', wish_n: '{n} بار', class_card: 'کارت صنف را چاپ کن', code: 'کد صنف',
    card_go: 'کارت را بساز', print: 'چاپ', not_code: 'این کد صنف تو نیست.', hub_card: 'کارت مرکز را چاپ کن',
    queued: 'به چاپگر فرستاده شد.', back: 'برگشت', lang: 'English',
    band_ey: 'سال‌های اول', band_p1: 'صنف ۱ تا ۳', band_p2: 'صنف ۴ تا ۶', band_s1: 'صنف ۷ تا ۹', band_s2: 'صنف ۱۰ تا ۱۲',
    band_ad: 'بزرگسال',
  },
};

let ui = /^fa|^prs/i.test(navigator.language || '') ? 'prs' : 'en';
const fa = (x) => (ui === 'prs' ? String(x).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(x));
const t = (k, v = {}) => fa((T[ui][k] ?? T.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''));

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
  sheets: false };
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

function setUi(lang) {
  ui = lang === 'prs' ? 'prs' : 'en';
  document.documentElement.lang = ui === 'prs' ? 'fa-AF' : 'en';
  document.documentElement.dir = ui === 'prs' ? 'rtl' : 'ltr';
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (me.pin) headers['x-teacher-pin'] = me.pin;
  const q = new URLSearchParams({ lang: ui === 'prs' ? 'prs' : 'en' });
  if (me.cohort) q.set('cohort', me.cohort);
  const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${q}`, { method, headers, cache: 'no-store',
    credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const e = new Error((await r.json().catch(() => ({}))).error || String(r.status));
    e.status = r.status;
    throw e;
  }
  return raw ? r.text() : r.json();
}

function header() {
  const pick = me.cohorts.length > 1
    ? h('select', { 'aria-label': t('class_of'), onChange: (e) => { me.cohort = e.target.value; start(); } },
      me.cohorts.map((c) => h('option', { value: c.id, selected: c.id === me.cohort }, c.label)))
    : me.cohorts.length ? h('span', { class: 'chip' }, me.cohorts[0].label) : null;
  return h('header', { class: 'top' },
    h('div', { class: 'grow' }, h('h1', {}, t('title'))), pick,
    h('button', { type: 'button', class: 'chip', onClick: () => { setUi(ui === 'en' ? 'prs' : 'en'); draw(); } }, t('lang')),
    me.via ? h('button', { type: 'button', class: 'chip', onClick: signOut }, t('sign_out')) : null);
}

function tabs() {
  const one = (k, n) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k),
    class: 'chip' + (tab === k ? ' on' : ''), onClick: () => { tab = k; draw(); } }, t(k),
  n ? h('span', { class: 'count' }, fa(n)) : null);
  return h('nav', { class: 'chips ttabs', role: 'tablist' }, one('todo', todo.items.length), one('class'), one('lessons'),
    one('wishes'));
}

const page = (...kids) => put(root, h('div', { class: 'screen' }, header(), me.via ? tabs() : null, kids));
const say = (msg) => page(h('p', { class: 'empty' }, msg));

function failed(e) {
  if (!navigator.onLine || e instanceof TypeError) return say(t('connect'));
  if (e.status === 404) return say(t('off'));
  if (e.status === 429) return me.via === 'pin' || !me.via ? pinGate(t('wait')) : say(t('wait'));
  if (e.status === 401) return location.protocol === 'http:' || me.pin ? pinGate(me.pin ? t('wrong_pin') : '') : say(t('access'));
  if (e.status === 403) return say(/admin/i.test(e.message) ? t('not_staff') : t('access'));
  return toast(t('save_fail'));
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
    h('form', { class: 'card pad-card stack', onSubmit: (e) => { e.preventDefault(); me.pin = box.value.trim(); start(); } },
      h('label', {}, t('pin')), box, msg ? h('p', { class: 'muted' }, msg) : null,
      h('button', { class: 'btn primary', type: 'submit' }, t('open')))));
  setTimeout(() => box.focus(), 50);
}

async function start() {
  say(t('loading'));
  try {
    const m = await api('/me');
    Object.assign(me, { via: m.via, label: m.label, cohorts: m.cohorts, hold: !!m.hold, lock_codes: !!m.lock_codes,
      printer: !!m.printer, sheets: !!m.sheets });
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
  return drawWishes();
}

// --- To do: one card at a time ---

function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60e3));
  if (m < 2) return t('now');
  if (m < 60) return t('ago_min', { n: m });
  if (m < 48 * 60) return t('ago_h', { n: Math.round(m / 60) });
  return t('ago_d', { n: Math.round(m / 1440) });
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
      await api('/todo/' + q.id, { method: 'POST', body: payload });
    } catch (e) {
      if (e.status === 422) { toast(e.message); return; }
      return failed(e);
    }
    items.splice(i, 1);
    showCard(Math.min(i, items.length - 1));
  };
  const meta = [q.year != null ? t('year', { n: q.year }) : null, q.lesson, ago(q.created)].filter(Boolean).join(' · ');
  const kind = q.kind === 'held' ? (q.hints ? 'held_ladder' : 'held') : q.kind;
  const head = h('div', { class: 'row wrap' }, h('span', { class: 'tag' + (q.kind === 'care' ? ' warm' : '') }, t(kind)),
    h('span', { class: 'grow muted small' }, meta), h('b', { class: 'small' }, t('n_of', { a: i + 1, b: items.length })));
  const question = h('p', { class: 'q', dir: 'auto' }, q.question);
  let actions;
  if (q.kind === 'held') {
    const reasons = h('div', { class: 'chips wrap hidden' }, h('span', { class: 'muted small' }, t('why_not')),
      REASONS.map((r) => h('button', { type: 'button', class: 'chip', onClick: () => done({ action: 'drop', reason: r }) }, t('r_' + r))));
    const shown = q.hints
      ? h('ol', { class: 'hints' }, q.hints.map((x) => h('li', { dir: 'auto' }, x)))
      : h('div', { class: 'a', dir: 'auto' }, q.shown);
    const checks = [q.private ? t('answer_is', { a: q.private.answer }) : null,
      q.checks && q.checks.maths !== null ? t(q.checks.maths ? 'maths_ok' : 'maths_bad') : null,
      q.checks && q.checks.leak !== null ? t(q.checks.leak ? 'leak_ok' : 'leak_bad') : null,
      q.private && !q.private.sure ? t('unsure') : null].filter(Boolean);
    const secret = checks.length ? h('p', { class: 'private small' }, h('b', {}, t('for_you') + ': '),
      h('span', { dir: 'auto' }, checks.join(' · '))) : null;
    const edit = () => {
      const boxes = q.hints ? q.hints.map((x) => h('textarea', { class: 'field', rows: 2, maxlength: 400, dir: 'auto' }, x))
        : [h('textarea', { class: 'field', rows: 4, maxlength: 1500, dir: 'auto' }, q.shown || '')];
      put(body, head, question, boxes, h('div', { class: 'btns two' },
        h('button', { type: 'button', class: 'btn primary', onClick: () => done(q.hints
          ? { action: 'edit', hints: boxes.map((b) => b.value) } : { action: 'edit', text: boxes[0].value }) }, t('save_send')),
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
  page(h('section', { class: 'qcard' + (q.kind === 'care' ? ' urgent' : '') }, body),
    h('div', { class: 'row pad' },
      h('button', { type: 'button', class: 'btn', disabled: i === 0 || null, onClick: () => go(i - 1) }, t('prev')),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn', disabled: i >= items.length - 1 || null, onClick: () => go(i + 1) }, t('next'))),
    h('p', { class: 'muted small pad keys-hint' }, t('keys')));
}

// --- Class ---

const aliasName = (id) => nameOf(id, ui === 'prs' ? 'prs' : 'en');
const seen = (d) => (d === 0 ? t('seen_today') : t('seen_days', { n: d }));

async function drawClass() {
  let c;
  try { c = await api('/class'); } catch (e) { return failed(e); }
  const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, n), h('small', {}, label));
  const row = (r) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawLearner(r.alias); } },
    h('span', { class: 'pic' }, aliasIcon(r.picture, 40)),
    h('span', { class: 'grow' },
      h('b', {}, `${aliasName(r.picture)} ${fa(r.number)}`),
      h('small', { class: 'muted' }, [t(BAND[r.band] || r.band), seen(r.days),
        t('lessons_week', { n: r.lessons }),
        t('sheets_n', { n: r.sheets }) + (r.average != null ? ' · ' + t('avg', { n: r.average }) : '')].join(' · '))),
    r.needs_help ? h('span', { class: 'tag help' }, t('needs_help')) : null);
  page(h('div', { class: 'stats four' }, stat(t('n_of', { a: c.active, b: c.learners }), t('active')),
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
  const make = async () => {
    try {
      const r = await api(`/class/${encodeURIComponent(alias)}/reset-code`, { method: 'POST' });
      const latin = r.code.replace(/(\d{3})(\d{3})/, '$1 $2');
      put(codeBox, h('p', { class: 'code-big', dir: 'ltr' }, latin.replace(/[0-9]/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])),
        h('p', { class: 'code-big latin', dir: 'ltr' }, latin), h('p', { class: 'muted small' }, t('code_for', { n: r.minutes })),
        h('p', { class: 'small' }, t('code_tell')));
    } catch (e) { failed(e); }
  };
  const back = h('button', { type: 'button', class: 'btn', onClick: () => drawClass() }, t('back'));
  page(h('div', { class: 'row pad' }, back),
    h('section', { class: 'card pad-card stack' },
      h('div', { class: 'row' }, h('span', { class: 'pic' }, aliasIcon(d.picture, 40)),
        h('div', { class: 'grow' }, h('h2', {}, `${aliasName(d.picture)} ${fa(d.number)}`),
          h('small', { class: 'muted' }, `${t(BAND[d.band] || d.band)} · ${seen(d.days)}`)),
        d.needs_help ? h('span', { class: 'tag help' }, t('needs_help')) : null),
      h('h3', {}, t('her_lessons')),
      d.lessons.length ? h('ul', { class: 'plain' }, d.lessons.map((l) => h('li', { class: 'row' },
        h('span', { class: 'grow', dir: 'auto' }, l.title),
        h('small', { class: 'muted' }, [l.pct != null ? t('pct', { n: l.pct }) : t('not_marked'),
          l.done ? t('done_n', { n: l.done }) : null].filter(Boolean).join(' · '))))) : h('p', { class: 'muted' }, t('no_lessons')),
      h('h3', {}, t('hints_used')),
      h('p', { class: 'small' }, [1, 2, 3].map((n) => t('rung', { n, m: d.hints[n] || 0 })).join(' · ')),
      d.lock_codes ? [h('h3', {}, t('reset')), codeBox,
        h('button', { type: 'button', class: 'btn primary', onClick: make }, t('make_code'))] : null));
}

function classCard() {
  const box = h('input', { maxlength: 20, autocomplete: 'off', dir: 'ltr', 'aria-label': t('code') });
  const out = h('div', { class: 'stack' });
  const go = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/class-card', { method: 'POST', body: { code: box.value } });
      const svg = new DOMParser().parseFromString(r.svg, 'image/svg+xml').documentElement;
      put(out, h('div', { class: 'class-card' }, h('b', {}, r.label), document.importNode(svg, true),
        h('p', { class: 'code-big latin', dir: 'ltr' }, r.code), h('p', { class: 'small', dir: 'ltr' }, r.url)),
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
      h('small', { class: 'muted' }, [`${fa(l.did)} ${t('did')}`, `${fa(l.mastered)} ${t('mastered')}`,
        l.hardest ? t('hardest', { n: l.hardest }) : null, l.disputes ? t('disputes', { n: l.disputes }) : null,
        `${t('hints_by_rung')} ${fa(l.hints[1] || 0)}/${fa(l.hints[2] || 0)}/${fa(l.hints[3] || 0)}`].filter(Boolean).join(' · '))));
  page(h('nav', { class: 'subjects' }, d.lessons.length ? d.lessons.map(row) : h('p', { class: 'empty' }, t('no_lessons'))));
}

async function drawLesson(id) {
  let d;
  try { d = await api('/lessons/' + encodeURIComponent(id)); } catch (e) { return failed(e); }
  const bar = (it) => {
    const all = it.right + it.wrong;
    const share = all ? Math.round((100 * it.right) / all) : 0;
    return h('li', { class: 'stack-sm' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, t('item', { n: it.n })),
        h('small', { class: 'muted' }, `${fa(it.right)} ${t('right')} · ${fa(it.wrong)} ${t('wrong')}`
          + (it.disputes ? ' · ' + t('disputes', { n: it.disputes }) : ''))),
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
      h('p', { class: 'small muted' }, [`${fa(d.did)} ${t('did')}`, `${fa(d.mastered)} ${t('mastered')}`,
        d.hardest ? t('hardest', { n: d.hardest }) : null].filter(Boolean).join(' · ')),
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
      h('small', { class: 'muted' }, [t('wish_n', { n: w.count }), (w.bands || []).map((b) => t(BAND[b] || b)).join(', ')]
        .filter(Boolean).join(' · ')))))
    : h('p', { class: 'empty' }, t('no_wishes')));
}

window.addEventListener('online', () => draw());
window.addEventListener('offline', () => say(t('connect')));
setUi(ui);
start();
