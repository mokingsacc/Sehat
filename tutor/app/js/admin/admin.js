// The admin panel (P21, C3.3, DESIGN-C2C3-SPECS.md item 12), at /admin/: a staff page apart from the learner app,
// laptop first (1366 x 768, a menu on the start side; on a phone the menu is a select at the top). Online Cloudflare
// Access lets the admin in and her `staff` row must say admin; on the hub the admin PIN opens it (not the teacher's;
// kept in this page's memory only). Nothing is kept in this browser; offline it says "Connect to manage Qalam".
// No names anywhere: cohorts have neutral labels, learners are only counted, staff are labels, and an email is typed
// only to add someone (the hub hashes it and forgets it).
// Pages: Cohorts (a page per cohort: the two kill switches at the top, the class code, the module table with the
// core's risk sentence, settings saved through a diff), Content (packs, sign-offs, releases, review notes, the
// wishlist across cohorts), AI spend, Safety, Staff and Log. English by default; the Dari strings are drafts for a
// native speaker's check.

const API = '../api/m/admin';
const BANDS = ['ey', 'p1', 'p2', 's1', 's2', 'ad'];
const LANGS = ['prs', 'ps', 'en'];
const PAGES = ['cohorts', 'content', 'spend', 'safety', 'staff', 'log'];

const T = {
  en: {
    title: 'Qalam admin', loading: 'Loading…', connect: 'Connect to manage Qalam.', off: 'The admin panel is not open here.',
    access: 'Sign in through Cloudflare Access, then open this page again.', not_admin: 'This page is for admins only.',
    pin: 'Admin PIN', open: 'Open', wrong_pin: 'That PIN is not right.', wait: 'Too many tries. Wait and try again.',
    sign_out: 'Sign out', lang: 'دری', save_fail: "Couldn't save. Nothing changed.", saved: 'Saved.',
    cohorts: 'Cohorts', content: 'Content', spend: 'AI spend', safety: 'Safety', staff: 'Staff', log: 'Log',
    learners: '{n} learners', bands: 'bands {b}', ai_on: 'AI on', ai_off_now: 'AI is off', day_on: 'school day on',
    day_off_now: 'school day off', own: 'this hub', new_cohort: 'New cohort', label: 'Label', langs: 'Languages',
    make: 'Make it', label_hint: 'Neutral words only, like "Mazar class". Never who is in it.',
    code_once: 'Class code (shown once, write it on the class cards now):', back: 'Back',
    kill_ai: 'AI off', kill_day: 'School day off', unkill_ai: 'AI on again', unkill_day: 'School day on again',
    kill_q_ai: 'Turn AI off for {c}? Phones follow within a minute.',
    kill_q_day: 'Turn the school day and bells off for {c}? Phones follow within a minute.',
    unkill_q_ai: 'Turn AI on again for {c}?', unkill_q_day: 'Turn the school day and bells on again for {c}?',
    all_cohorts: 'All cohorts', confirm: 'Confirm', cancel: 'Cancel',
    join_code: 'join code', new_code: 'New code', class_cards: 'Class cards', code: 'Class code', print: 'Print',
    new_code_q: 'Make a new class code? The old one stops working at once.',
    modules: 'Modules', module: 'Module', risk: 'Risk', maturity: 'Maturity', on: 'On', settings: 'Settings',
    needs: 'needs {x}', locked_moderation: 'locked: needs paid human moderation', locked_maturity: 'only where drafts are taken',
    host: 'not on this host ({x})', depends: 'depends on {x}', turn_on: 'Turn on', turn_on_both: 'Turn on both',
    turn_on_q: 'Turn on {m} for {c}?', also: 'This also turns on: {x}.', edit: 'Edit', save: 'Save',
    diff_q: 'Save these changes?', no_change: 'Nothing changed.',
    r_none: 'none', r_medium: 'medium', r_high: 'high', r_blocked: 'blocked',
    cohort_settings: 'Settings', budget: 'AI tokens a day', budget_hub: 'the hub’s ({n})', moderation: 'Moderation',
    m_none: 'none', m_teacher: 'a teacher', 'm_paid-human': 'paid human moderation', maturities: 'Takes modules',
    ai_today: 'AI today', calls: '{n} calls', est: 'about {c}', no_cap: 'no cap',
    packs: 'Packs', version: 'version {v}', signed_of: '{a}/{b}', lessons: 'Lessons', problems: 'What blocks a release',
    release: 'Release', none_yet: 'not released', current: 'current', older: 'not the current files', publish: 'Publish',
    rollback: 'Roll back', publish_q: 'Publish {p} {v} to {c}?', rollback_q: 'Go back to the previous release of {p} for {c}?',
    published: 'Published.', rolled: 'Rolled back to {v}.', notes: 'Review notes', no_notes: 'No changes asked for.',
    step: 'step {n}', step0: 'the sheet, cards and sources', wishlist: 'Wishlist across cohorts', no_wishes: 'No wishes yet.',
    asked: '{n} asked', first_seen: 'first {d}', planned: 'Planned', not_for_qalam: 'Not for Qalam', new: 'New',
    cap: 'cap {n}', of_cap: '{p}% of the cap', held: '{n} held', by_purpose: 'calls: {x}', no_spend: 'No AI used.',
    days14: 'last 14 days', distress: 'distress', health: 'health', off_limits: 'off limits', leak: 'hints held back',
    maths: 'sums held back', oldest: 'oldest held answer: {n} hours', no_held: 'nothing held', disputes: 'disputes',
    item: 'item {n}', counts_only: 'Counts only: the words stay with the teacher.',
    staff_hub: 'On the hub the teacher’s and admin’s PINs open the staff pages: there is no staff list.',
    add_staff: 'Add someone', email: 'Email (as Cloudflare Access knows it)', role: 'Role', initials: 'Initials',
    email_note: 'The email is hashed and forgotten. Cloudflare Access keeps the list of who may sign in.',
    remove: 'Remove', remove_q: 'Remove {l}?', added: 'added {d}', last_admin: 'The last admin cannot be removed.',
    every: 'every cohort', when: 'When', what: 'What', who: 'By',
    band_ey: 'early years', band_p1: 'years 1-3', band_p2: 'years 4-6', band_s1: 'years 7-9', band_s2: 'years 10-12',
    band_ad: 'adult', lang_prs: 'Dari', lang_ps: 'Pashto', lang_en: 'English',
    pick_some: 'Tick at least one language and one band.', all_bands: 'every band', school_day: 'School day', tt_default: 'the default timetable', tt_own: 'this cohort’s own timetable',
    tt_edit: 'Edit the timetable', tt_use_default: 'Use the default', tt_days: 'School days',
    tt_holidays: 'Holidays: one date a line, like 2027-03-21', tt_ramadan: 'Ramadan’s shorter day', tt_from: 'From',
    tt_to: 'To', tt_start: 'Starts at', tt_period_min: 'Minutes a period', tt_has_day: 'has a school day',
    tt_add: 'Add a block', tt_up: 'Move up', tt_drop: 'Remove', tt_min: 'min', tt_ends: 'ends {x}',
    tt_bad: 'The hub did not take this timetable:', k_opening: 'opening', k_period: 'period', k_break: 'break',
    k_sheet: 'sheet time', k_close: 'close', s_auto: 'her next lesson', s_maths: 'maths', s_science: 'science',
    s_english: 'English', s_dari: 'Dari', s_pashto: 'Pashto',
    d_sat: 'Sat', d_sun: 'Sun', d_mon: 'Mon', d_tue: 'Tue', d_wed: 'Wed', d_thu: 'Thu', d_fri: 'Fri',
  },
  prs: {
    title: 'مدیریت قلم', loading: 'صبر کن…', connect: 'برای مدیریت قلم به انترنت وصل شو.', off: 'صفحهٔ مدیریت این‌جا باز نیست.',
    access: 'از راه Cloudflare Access وارد شو و این صفحه را دوباره باز کن.', not_admin: 'این صفحه فقط برای مدیران است.',
    pin: 'رمز مدیر', open: 'باز کن', wrong_pin: 'این رمز درست نیست.', wait: 'کوشش زیاد شد. صبر کن و دوباره کوشش کن.',
    sign_out: 'خروج', lang: 'English', save_fail: 'ذخیره نشد. چیزی تغییر نکرد.', saved: 'ذخیره شد.',
    cohorts: 'گروه‌ها', content: 'محتوا', spend: 'مصرف هوش مصنوعی', safety: 'ایمنی', staff: 'کارمندان', log: 'یادداشت تغییرات',
    learners: '{n} شاگرد', bands: 'سطح‌ها {b}', ai_on: 'هوش مصنوعی روشن', ai_off_now: 'هوش مصنوعی خاموش', day_on: 'روز مکتب روشن',
    day_off_now: 'روز مکتب خاموش', own: 'همین مرکز', new_cohort: 'گروه تازه', label: 'نام گروه', langs: 'زبان‌ها',
    make: 'بساز', label_hint: 'فقط کلمه‌های بی‌طرف، مثل «صنف مزار». هرگز نگو چه کسانی در آن هستند.',
    code_once: 'کد صنف (فقط یک بار دیده می‌شود؛ همین حالا روی کارت‌ها بنویس):', back: 'برگشت',
    kill_ai: 'هوش مصنوعی خاموش', kill_day: 'روز مکتب خاموش', unkill_ai: 'هوش مصنوعی دوباره روشن', unkill_day: 'روز مکتب دوباره روشن',
    all_cohorts: 'همهٔ گروه‌ها', confirm: 'تأیید', cancel: 'لغو', new_code: 'کد تازه', class_cards: 'کارت‌های صنف',
    code: 'کد صنف', print: 'چاپ', modules: 'بخش‌ها', module: 'بخش', risk: 'خطر', maturity: 'آمادگی', on: 'روشن',
    settings: 'تنظیمات', turn_on: 'روشن کن', turn_on_both: 'هر دو را روشن کن', edit: 'تغییر', save: 'ذخیره',
    diff_q: 'این تغییرها ذخیره شود؟', no_change: 'چیزی تغییر نکرد.', cohort_settings: 'تنظیمات',
    publish: 'نشر کن', rollback: 'برگردان', notes: 'یادداشت‌های بازبین', planned: 'در برنامه', not_for_qalam: 'برای قلم نیست',
    new: 'تازه', remove: 'حذف', add_staff: 'کسی را اضافه کن', when: 'وقت', what: 'چه', who: 'توسط',
    counts_only: 'فقط شمار: کلمه‌ها نزد معلم می‌مانند.',
    band_ey: 'سال‌های اول', band_p1: 'صنف ۱ تا ۳', band_p2: 'صنف ۴ تا ۶', band_s1: 'صنف ۷ تا ۹', band_s2: 'صنف ۱۰ تا ۱۲',
    band_ad: 'بزرگسال', lang_prs: 'دری', lang_ps: 'پښتو', lang_en: 'انگلیسی',
    pick_some: 'دست کم یک زبان و یک سطح را نشانی کن.', all_bands: 'همهٔ سطح‌ها', every: 'همهٔ گروه‌ها',
    packs: 'بسته‌ها', lessons: 'درس‌ها', wishlist: 'خواهش‌های همهٔ گروه‌ها', school_day: 'روز مکتب', tt_default: 'تقسیم اوقات معمول', tt_own: 'تقسیم اوقات خود این گروه',
    tt_edit: 'تقسیم اوقات را تغییر بده', tt_use_default: 'همان معمول', tt_days: 'روزهای مکتب', tt_from: 'از', tt_to: 'تا',
    tt_start: 'شروع', tt_has_day: 'روز مکتب دارد', tt_add: 'یک بخش اضافه کن', tt_drop: 'حذف',
    k_opening: 'آغاز', k_period: 'ساعت درسی', k_break: 'تفریح', k_sheet: 'وقت ورقه', k_close: 'ختم',
    d_sat: 'شنبه', d_sun: 'یکشنبه', d_mon: 'دوشنبه', d_tue: 'سه‌شنبه', d_wed: 'چهارشنبه', d_thu: 'پنجشنبه', d_fri: 'جمعه',
  },
};

let ui = 'en';
const fa = (x) => (ui === 'prs' ? String(x).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(x));
const t = (k, v = {}) => fa((T[ui][k] ?? T.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''));
const num = (n) => fa(Number(n || 0).toLocaleString('en-US'));
const money = (micro) => '$' + (Number(micro || 0) / 1e6).toFixed(2);
const m = (x) => h('span', { class: 'm', dir: 'ltr' }, String(x));
const title = (x, fallback) => (x && typeof x === 'object' ? x[ui] || x.en || x.prs || x.ps : x) || fallback;   // {prs, ps, en}          // codes, hashes and ids stay left to right

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

const root = document.getElementById('admin');
const me = { pin: '', via: null, label: '', staff: false };
let page = 'cohorts';

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

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (me.pin) headers['x-admin-pin'] = me.pin;
  const r = await fetch(API + path, { method, headers, cache: 'no-store', credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const why = typeof data.error === 'string' ? data.error : typeof data.detail === 'string' ? data.detail
      : Array.isArray(data.detail) ? data.detail.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join('; ') : String(r.status);
    const e = new Error(why);
    e.status = r.status;
    e.data = data;
    throw e;
  }
  return data;
}

// --- the frame: header, menu, gate ---

function header() {
  return h('header', { class: 'top' },
    h('div', { class: 'grow' }, h('h1', {}, t('title'))),
    me.label ? h('span', { class: 'chip' }, me.label) : null,
    h('button', { type: 'button', class: 'chip', onClick: () => { setUi(ui === 'en' ? 'prs' : 'en'); draw(); } }, t('lang')),
    me.via ? h('button', { type: 'button', class: 'chip', onClick: signOut }, t('sign_out')) : null);
}

function menu() {
  const go = (p) => { page = p; draw(); };
  return [
    h('nav', { class: 'amenu', 'aria-label': t('title') }, PAGES.map((p) => h('button', { type: 'button',
      class: 'chip' + (page === p ? ' on' : ''), 'aria-current': page === p ? 'page' : null, onClick: () => go(p) }, t(p)))),
    h('select', { class: 'amenu-select', 'aria-label': t('title'), onChange: (e) => go(e.target.value) },
      PAGES.map((p) => h('option', { value: p, selected: page === p }, t(p)))),
  ];
}

const frame = (...kids) => put(root, header(), me.via ? h('div', { class: 'alayout' }, menu(), h('div', { class: 'amain' }, kids))
  : h('div', { class: 'amain' }, kids));
const say = (msg) => frame(h('p', { class: 'empty' }, msg));

function failed(e) {
  if (!navigator.onLine || e instanceof TypeError) return say(t('connect'));
  if (e.status === 404 && !me.via) return say(t('off'));
  if (e.status === 429) return me.via === 'pin' || !me.via ? pinGate(t('wait')) : say(t('wait'));
  if (e.status === 401) return location.protocol === 'http:' || me.pin ? pinGate(me.pin ? t('wrong_pin') : '') : say(t('access'));
  if (e.status === 403 && !me.via) return say(/admins/i.test(e.message) ? t('not_admin') : t('access'));
  toast(e.message && e.message.length < 140 ? e.message : t('save_fail'));
  return null;
}

function signOut() {
  if (me.via === 'access') { location.href = '/cdn-cgi/access/logout'; return; }
  Object.assign(me, { pin: '', via: null, label: '' });
  pinGate('');
}

function pinGate(msg) {
  me.via = null;
  const box = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('pin'), dir: 'ltr' });
  put(root, header(), h('div', { class: 'amain' },
    h('form', { class: 'card stack agate', onSubmit: (e) => { e.preventDefault(); me.pin = box.value.trim(); start(); } },
      h('label', {}, t('pin')), box, msg ? h('p', { class: 'muted' }, msg) : null,
      h('button', { class: 'btn primary', type: 'submit' }, t('open')))));
  setTimeout(() => box.focus(), 50);
}

// a dialog for every confirm: the question, any detail lines, and its buttons (the first is the confirming one)
function ask(question, lines = [], buttons = [[t('confirm'), true]], extra = null) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); resolve(v); };
    const box = h('div', { class: 'amodal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'card stack' }, h('b', {}, question), lines.map((l) => h('p', { class: 'small' }, l)), extra,
        h('div', { class: 'row wrap' }, buttons.map(([label, v], i) => h('button', { type: 'button',
          class: 'btn' + (i === 0 ? ' primary' : ''), onClick: () => close(v) }, label)),
        h('button', { type: 'button', class: 'btn', onClick: () => close(null) }, t('cancel')))));
    document.body.append(box);
    box.querySelector('button').focus();
  });
}

async function start() {
  say(t('loading'));
  try {
    const d = await api('/me');
    Object.assign(me, { via: d.via, label: d.label === 'hub' ? '' : d.label, staff: d.staff });
  } catch (e) { return failed(e); }
  return draw();
}

function draw() {
  if (!me.via) return start();
  if (page === 'content') return drawContent();
  if (page === 'spend') return drawSpend();
  if (page === 'safety') return drawSafety();
  if (page === 'staff') return drawStaff();
  if (page === 'log') return drawLog();
  return drawCohorts();
}

// --- cohorts ---

const bandList = (bs) => (bs.length === BANDS.length ? t('all_bands') : bs.map((b) => t('band_' + b)).join(', '));
const langList = (ls) => ls.map((l) => t('lang_' + l)).join(', ');

function ticks(name, values, chosen, label) {
  return h('fieldset', { class: 'ticks' }, h('legend', {}, name), values.map((v) => h('label', { class: 'row' },
    h('input', { type: 'checkbox', value: v, checked: chosen.includes(v) || null }), label(v))));
}
const ticked = (fs) => [...fs.querySelectorAll('input:checked')].map((x) => x.value);

async function drawCohorts() {
  let d;
  try { d = await api('/cohorts'); } catch (e) { return failed(e); }
  const row = (c) => h('tr', {},
    h('td', {}, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohort(c.id); } }, h('b', { dir: 'auto' }, c.label)),
      c.own ? h('small', { class: 'muted' }, ' · ' + t('own')) : null),
    h('td', {}, num(c.learners)), h('td', {}, bandList(c.bands)), h('td', {}, langList(c.langs)),
    h('td', {}, h('span', { class: 'tag' + (c.ai ? '' : ' bad') }, t(c.ai ? 'ai_on' : 'ai_off_now'))),
    h('td', {}, h('span', { class: 'tag' + (c.day ? '' : ' bad') }, t(c.day ? 'day_on' : 'day_off_now'))));
  const label = h('input', { class: 'ainput', maxlength: 40, 'aria-label': t('label'), autocomplete: 'off' });
  const langs = ticks(t('langs'), LANGS, ['prs', 'ps'], (l) => t('lang_' + l));
  const bands = ticks(t('bands', { b: '' }).trim(), BANDS, [], (b) => t('band_' + b));
  const out = h('div');
  const make = async (e) => {
    e.preventDefault();
    if (!ticked(langs).length || !ticked(bands).length) { toast(t('pick_some')); return; }
    try {
      const r = await api('/cohorts', { method: 'POST', body: { label: label.value.trim(), langs: ticked(langs), bands: ticked(bands) } });
      put(out, h('div', { class: 'card stack soft' }, h('p', {}, t('code_once')), h('p', { class: 'code-big' }, m(r.code)),
        h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn', onClick: () => classCards(r.id, r.code) }, t('class_cards')),
          h('button', { type: 'button', class: 'btn', onClick: () => drawCohort(r.id) }, r.label))));
    } catch (err) { failed(err); }
  };
  frame(h('h2', {}, t('cohorts')),
    h('div', { class: 'atable' }, h('table', {}, h('thead', {}, h('tr', {}, [t('label'), t('learners', { n: '' }).trim(), t('bands', { b: '' }).trim(),
      t('langs'), 'AI', t('day_on')].map((x) => h('th', {}, x)))), h('tbody', {}, d.cohorts.map(row)))),
    h('form', { class: 'card stack', onSubmit: make }, h('h3', {}, t('new_cohort')), h('label', {}, t('label')), label,
      h('small', { class: 'muted' }, t('label_hint')), langs, bands, h('button', { type: 'submit', class: 'btn primary' }, t('make'))),
    out);
}

function riskTag(r) {
  return h('span', { class: 'tag risk-' + r }, t('r_' + r));
}

async function drawCohort(cid) {
  let c;
  try { c = await api('/cohorts/' + encodeURIComponent(cid)); } catch (e) { return failed(e); }
  const again = () => drawCohort(cid);
  const kill = async (sw) => {
    const on = sw === 'ai' ? !c.ai : !c.day;
    const all = h('label', { class: 'row' }, h('input', { type: 'checkbox' }), t('all_cohorts'));
    const q = t((on ? 'unkill_q_' : 'kill_q_') + sw, { c: c.label });
    if (!(await ask(q, [], [[t('confirm'), true]], all))) return;
    try {
      await api(`/cohorts/${cid}/kill`, { method: 'POST', body: { switch: sw, on, all: all.querySelector('input').checked } });
      toast(t('saved'));
    } catch (e) { failed(e); }
    again();
  };
  const newCode = async () => {
    if (!(await ask(t('new_code_q')))) return;
    try {
      const r = await api(`/cohorts/${cid}/code`, { method: 'POST' });
      await ask(t('code_once'), [], [[t('class_cards'), true]], h('p', { class: 'code-big' }, m(r.code))) && classCards(cid, r.code);
    } catch (e) { failed(e); }
  };
  const cardsFromCode = async () => {
    const box = h('input', { class: 'ainput', 'aria-label': t('code'), autocomplete: 'off', dir: 'ltr' });
    if (await ask(t('code'), [], [[t('class_cards'), true]], box)) classCards(cid, box.value.trim());
  };
  const s = c.spend;
  const purposes = Object.entries(s.by_purpose || {}).map(([k, n]) => `${k} ${num(n)}`).join(', ');
  frame(
    h('div', { class: 'row wrap acrumb' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohorts(); } }, t('cohorts')),
      h('span', {}, '›'), h('h2', { class: 'grow', dir: 'auto' }, c.label),
      h('button', { type: 'button', class: 'btn kill', onClick: () => kill('ai') }, t(c.ai ? 'kill_ai' : 'unkill_ai')),
      h('button', { type: 'button', class: 'btn kill', onClick: () => kill('day') }, t(c.day ? 'kill_day' : 'unkill_day'))),
    h('p', { class: 'row wrap' }, t('learners', { n: num(c.learners) }), ' · ', t('bands', { b: bandList(c.bands) }), ' · ',
      langList(c.langs), ' · ', t('join_code'), ' ', m('****'),
      h('button', { type: 'button', class: 'chip', onClick: newCode }, t('new_code')),
      h('button', { type: 'button', class: 'chip', onClick: cardsFromCode }, t('class_cards'))),
    h('h3', {}, t('modules')), moduleTable(c, again),
    cohortSettings(c, again),
    schoolDay(c),
    h('section', { class: 'card stack' }, h('b', {}, t('ai_today')),
      h('div', { class: 'bar spendbar' + (s.pct >= 80 ? ' warn' : '') }, h('span', { style: `width:${Math.min(100, s.pct || 0)}%` })),
      h('small', {}, [s.pct === null ? t('no_cap') : `${fa(s.pct)}%`, t('est', { c: money(s.cost_micro) }), t('calls', { n: num(s.calls) })
        + (purposes ? ` (${purposes})` : '')].join(' · '))));
}

function moduleTable(c, again) {
  const toggle = async (row) => {
    const body = { enabled: !row.enabled };
    for (;;) {
      try {
        const r = await api(`/cohorts/${c.id}/flags/${row.id}`, { method: 'POST', body });
        if (r.turned_on && r.turned_on.length > 1) toast(t('also', { x: r.turned_on.join(', ') }));
        return again();
      } catch (e) {
        if (e.status !== 409 || !e.data.need) { failed(e); return again(); }
        const lines = e.data.risks.map((x) => `${x.id} (${t('r_' + x.risk)}): ${x.sentence}`);
        if (e.data.missing.length) lines.push(t('also', { x: e.data.missing.join(', ') }));
        const ok = await ask(t('turn_on_q', { m: row.id, c: c.label }), lines,
          [[e.data.missing.length ? t('turn_on_both') : t('turn_on'), true]]);
        if (!ok) return again();
        Object.assign(body, { confirm: true, both: true });
      }
    }
  };
  const note = (row) => [row.lock === 'moderation' ? t('locked_moderation') : row.lock === 'maturity' ? t('locked_maturity') : null,
    row.host.length ? t('host', { x: row.host.join(', ') }) : null,
    row.depends.length ? t('depends', { x: row.depends.join(', ') }) : null].filter(Boolean).join(' · ');
  const tr = (row) => h('tr', { class: row.lock && !row.enabled ? 'locked' : null },
    h('td', {}, h('b', {}, row.id), h('small', { class: 'muted' }, ' ' + row.version)),
    h('td', {}, riskTag(row.risk)), h('td', {}, row.maturity), h('td', {}, row.bands.join(' ')),
    h('td', {}, h('button', { type: 'button', class: 'switch' + (row.enabled ? ' on' : ''), role: 'switch',
      'aria-checked': String(row.enabled), 'aria-label': `${t('on')}: ${row.id}`, disabled: row.lock && !row.enabled ? true : null,
      title: row.sentence || null, onClick: () => toggle(row) }, h('span', { class: 'knob' }))),
    h('td', {}, Object.keys(row.schema).length ? h('button', { type: 'button', class: 'chip', onClick: () => moduleSettings(c, row, again) },
      t('settings')) : null),
    h('td', {}, h('small', { class: 'muted' }, note(row))));
  return h('div', { class: 'atable' }, h('table', {}, h('thead', {}, h('tr', {},
    [t('module'), t('risk'), t('maturity'), t('bands', { b: '' }).trim(), t('on'), t('settings'), ''].map((x) => h('th', {}, x)))),
  h('tbody', {}, c.modules.map(tr))));
}

const show = (v) => (v === true ? 'on' : v === false ? 'off' : v === undefined || v === null || v === '' ? '—' : String(v));
const diffLines = (old, now) => Object.keys(now).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(now[k]))
  .map((k) => `${k}: ${show(old[k])} → ${show(now[k])}`);

// a module's settings: a form from its schema; Save shows the diff for a confirm first
async function moduleSettings(c, row, again) {
  const inputs = Object.entries(row.schema).map(([k, spec]) => {
    const v = row.settings[k];
    const el = spec.type === 'bool' ? h('input', { type: 'checkbox', checked: v || null })
      : h('input', { class: 'ainput', type: spec.type === 'int' ? 'number' : 'text', value: v, min: spec.min, max: spec.max });
    return [k, spec, el];
  });
  const form = h('div', { class: 'stack' }, inputs.map(([k, , el]) => h('label', { class: 'row' }, el, h('span', {}, k))));
  if (!(await ask(`${row.id}: ${t('settings')}`, [], [[t('save'), true]], form))) return;
  const now = Object.fromEntries(inputs.map(([k, spec, el]) => [k, spec.type === 'bool' ? el.checked
    : spec.type === 'int' ? Number(el.value) : el.value]));
  const lines = diffLines(row.settings, now);
  if (!lines.length) { toast(t('no_change')); return; }
  if (!(await ask(t('diff_q'), lines, [[t('save'), true]]))) return;
  try {
    await api(`/cohorts/${c.id}/flags/${row.id}`, { method: 'POST', body: { enabled: row.enabled, settings: now, confirm: true } });
    toast(t('saved'));
  } catch (e) { failed(e); }
  again();
}

function cohortSettings(c, again) {
  const s = c.settings;
  const line = [t(c.ai ? 'ai_on' : 'ai_off_now'), `${t('budget')}: ${s.ai_budget !== undefined ? num(s.ai_budget)
    : t('budget_hub', { n: c.budget === null ? t('no_cap') : num(c.budget) })}`,
  `${t('moderation')}: ${t('m_' + (s.moderation || 'none'))}`, `${t('maturities')}: ${(s.maturity || ['stable']).join(', ')}`].join(' · ');
  const edit = async () => {
    const budget = h('input', { class: 'ainput', type: 'number', min: 0, value: s.ai_budget ?? '', placeholder: c.budget ?? '' });
    const mod = h('select', {}, c.moderation.map((x) => h('option', { value: x, selected: (s.moderation || 'none') === x }, t('m_' + x))));
    const mat = ticks(t('maturities'), c.maturities, s.maturity || ['stable'], (x) => x);
    const form = h('div', { class: 'stack' }, h('label', {}, t('budget')), budget, h('label', {}, t('moderation')), mod, mat);
    if (!(await ask(t('cohort_settings'), [], [[t('save'), true]], form))) return;
    const now = { ai_budget: budget.value === '' ? null : Number(budget.value), moderation: mod.value, maturity: ticked(mat) };
    const old = { ai_budget: s.ai_budget ?? null, moderation: s.moderation || 'none', maturity: s.maturity || ['stable'] };
    const lines = diffLines(old, now);
    if (!lines.length) { toast(t('no_change')); return; }
    if (!(await ask(t('diff_q'), lines, [[t('save'), true]]))) return;
    try { await api(`/cohorts/${c.id}/settings`, { method: 'POST', body: { settings: now } }); toast(t('saved')); } catch (e) { failed(e); }
    again();
  };
  return h('section', { class: 'card row wrap' }, h('b', {}, t('cohort_settings') + ':'), h('span', { class: 'grow' }, line),
    h('button', { type: 'button', class: 'chip', onClick: edit }, t('edit')));
}

// --- the school day's timetable (P19's setting; edited here since P21): the default, or the cohort's own template ---

const hhmm = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const mins = (x) => { const [a, b] = String(x || '00:00').split(':').map(Number); return a * 60 + b; };

function schoolDay(c) {
  const own = c.settings.timetable && c.settings.timetable !== 'default';
  return h('section', { class: 'card row wrap' }, h('b', {}, t('school_day') + ':'),
    h('span', { class: 'grow' }, [t(own ? 'tt_own' : 'tt_default'), t(c.day ? 'day_on' : 'day_off_now')].join(' · ')),
    h('button', { type: 'button', class: 'chip', onClick: () => timetablePage(c) }, t('tt_edit')));
}

// the editor works on a copy of the template; Save sends it whole and the hub checks it (timetable.check)
function timetablePage(c, draft) {
  const tt = c.timetable;
  const cur = c.settings.timetable && c.settings.timetable !== 'default' ? c.settings.timetable : tt.default;
  const d = draft || JSON.parse(JSON.stringify(cur));
  const again = () => timetablePage(c, d);
  const days = h('fieldset', { class: 'ticks' }, h('legend', {}, t('tt_days')), tt.days.map((x) => h('label', { class: 'row' },
    h('input', { type: 'checkbox', checked: d.days.includes(x) || null,
      onChange: (e) => { d.days = tt.days.filter((y) => (y === x ? e.target.checked : d.days.includes(y))); } }), t('d_' + x))));
  const hol = h('textarea', { class: 'field ainput', rows: 3, dir: 'ltr', 'aria-label': t('tt_holidays'),
    onInput: (e) => { d.holidays = e.target.value.split(/[\s,]+/).filter(Boolean); } }, (d.holidays || []).join('\n'));
  const r = d.ramadan;
  const rIn = (k, type, attrs = {}) => h('input', { class: 'ainput', type, value: r ? r[k] : '', dir: 'ltr', ...attrs,
    onInput: (e) => { if (d.ramadan) d.ramadan[k] = type === 'number' ? Number(e.target.value) : e.target.value; } });
  const ramadan = h('fieldset', { class: 'ticks' }, h('legend', {}, h('label', { class: 'row' },
    h('input', { type: 'checkbox', checked: r ? true : null, onChange: (e) => {
      d.ramadan = e.target.checked ? JSON.parse(JSON.stringify(tt.default.ramadan)) : undefined;
      if (!d.ramadan) delete d.ramadan;
      again();
    } }), t('tt_ramadan'))),
  r ? h('div', { class: 'row wrap' }, h('label', {}, t('tt_from'), ' ', rIn('from', 'date')), h('label', {}, t('tt_to'), ' ', rIn('to', 'date')),
    h('label', {}, t('tt_start'), ' ', rIn('start', 'time')), h('label', {}, t('tt_period_min'), ' ', rIn('period_min', 'number', { min: 10, max: 60 })))
    : null);
  const band = (b) => {
    const x = d.bands[b];
    const has = h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: x ? true : null, onChange: (e) => {
      if (e.target.checked) d.bands[b] = JSON.parse(JSON.stringify(tt.default.bands[b])); else delete d.bands[b];
      again();
    } }), h('b', {}, t('band_' + b)), ' ', t('tt_has_day'));
    if (!x) return h('section', { class: 'card stack' }, has);
    let at = mins(x.start);
    const rows = x.blocks.map((blk, i) => {
      const from = at;
      at += Number(blk.min) || 0;
      return h('tr', {},
        h('td', {}, m(hhmm(from))),
        h('td', {}, h('select', { 'aria-label': t('k_' + blk.kind), onChange: (e) => {
          x.blocks[i] = e.target.value === 'period' ? { kind: 'period', subject: 'auto', min: blk.min } : { kind: e.target.value, min: blk.min };
          again();
        } }, tt.kinds.map((k) => h('option', { value: k, selected: k === blk.kind }, t('k_' + k))))),
        h('td', {}, blk.kind === 'period' ? h('select', { onChange: (e) => { blk.subject = e.target.value; } },
          tt.subjects.map((sj) => h('option', { value: sj, selected: sj === (blk.subject || 'auto') }, t('s_' + sj)))) : null),
        h('td', {}, h('input', { class: 'ainput short', type: 'number', min: 5, max: 120, value: blk.min, 'aria-label': t('tt_min'),
          onChange: (e) => { blk.min = Number(e.target.value); again(); } }), ' ', t('tt_min')),
        h('td', {}, i ? h('button', { type: 'button', class: 'chip', 'aria-label': t('tt_up'), onClick: () => {
          [x.blocks[i - 1], x.blocks[i]] = [x.blocks[i], x.blocks[i - 1]]; again();
        } }, '↑') : null,
        h('button', { type: 'button', class: 'chip', onClick: () => { x.blocks.splice(i, 1); again(); } }, t('tt_drop'))));
    });
    return h('section', { class: 'card stack' }, has,
      h('label', { class: 'row' }, t('tt_start'), ' ', h('input', { class: 'ainput time', type: 'time', value: x.start, dir: 'ltr',
        onChange: (e) => { x.start = e.target.value; again(); } }), h('small', { class: 'muted' }, t('tt_ends', { x: hhmm(at) }))),
      h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, rows))),
      h('button', { type: 'button', class: 'chip', onClick: () => { x.blocks.push({ kind: 'period', subject: 'auto', min: 30 }); again(); } },
        t('tt_add')));
  };
  const save = async (value) => {
    const old = c.settings.timetable || 'default';
    const lines = value === 'default' ? [`timetable → ${t('tt_default')}`] : summary(old === 'default' ? tt.default : old, value);
    if (!lines.length && JSON.stringify(old) === JSON.stringify(value)) { toast(t('no_change')); return; }
    if (!(await ask(t('diff_q'), lines.length ? lines : [t('tt_own')], [[t('save'), true]]))) return;
    try {
      await api(`/cohorts/${c.id}/settings`, { method: 'POST', body: { settings: { timetable: value } } });
      toast(t('saved'));
      drawCohort(c.id);
    } catch (e) {
      if (e.status === 422) await ask(t('tt_bad'), e.message.split('; ').slice(0, 12), [[t('confirm'), true]]);
      else failed(e);
    }
  };
  frame(
    h('div', { class: 'row wrap acrumb' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohort(c.id); } }, c.label),
      h('span', {}, '›'), h('h2', { class: 'grow' }, t('school_day'))),
    h('section', { class: 'card stack' }, days, h('label', {}, t('tt_holidays')), hol, ramadan),
    tt.bands.map(band),
    h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn primary', onClick: () => save(d) }, t('save')),
      h('button', { type: 'button', class: 'btn', onClick: () => save('default') }, t('tt_use_default')),
      h('button', { type: 'button', class: 'btn', onClick: () => drawCohort(c.id) }, t('cancel'))));
}

// the confirm's lines: what the save changes, in words
function summary(a, b) {
  const out = [];
  if (a.days.join() !== b.days.join()) out.push(`${t('tt_days')}: ${a.days.map((x) => t('d_' + x)).join(' ')} → ${b.days.map((x) => t('d_' + x)).join(' ')}`);
  if ((a.holidays || []).join() !== (b.holidays || []).join()) out.push(`${t('tt_holidays').split(':')[0]}: ${(b.holidays || []).join(', ') || '—'}`);
  if (JSON.stringify(a.ramadan) !== JSON.stringify(b.ramadan)) {
    out.push(`${t('tt_ramadan')}: ${b.ramadan ? `${b.ramadan.from} – ${b.ramadan.to}, ${b.ramadan.start}, ${b.ramadan.period_min} ${t('tt_min')}` : '—'}`);
  }
  for (const k of bandKeys(a, b)) {
    const x = a.bands[k];
    const y = b.bands[k];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const line = (z) => (z ? `${z.start}, ${z.blocks.map((q) => `${t('k_' + q.kind)} ${q.min}`).join(', ')}` : '—');
    out.push(`${t('band_' + k)}: ${line(x)} → ${line(y)}`);
  }
  return out;
}
const bandKeys = (a, b) => [...new Set([...Object.keys(a.bands), ...Object.keys(b.bands)])];

// eight class cards on one A4 page: the QR for ?join=CODE and the code, nothing else (C3.3)
async function classCards(cid, code) {
  let r;
  try { r = await api(`/cohorts/${cid}/cards`, { method: 'POST', body: { code } }); } catch (e) { return failed(e); }
  const card = () => h('div', { class: 'class-card' }, h('span'), h('b', { class: 'm', dir: 'ltr' }, r.code));
  const sheet = h('div', { class: 'cards-sheet' }, Array.from({ length: 8 }, card));
  sheet.querySelectorAll('.class-card > span').forEach((x) => { x.innerHTML = r.svg; });   // our own QR, made by the hub
  frame(h('div', { class: 'row wrap noprint' }, h('button', { type: 'button', class: 'btn', onClick: () => drawCohort(cid) }, t('back')),
    h('button', { type: 'button', class: 'btn primary', onClick: () => window.print() }, t('print'))), sheet);
}

// --- content: packs, releases, review notes, the wishlist ---

async function drawContent() {
  let d;
  let w;
  try { [d, w] = await Promise.all([api('/content'), api('/wishes')]); } catch (e) { return failed(e); }
  const act = async (kind, p, c) => {
    const q = t(kind === 'publish' ? 'publish_q' : 'rollback_q', { p: title(p.title, p.id), v: p.version, c: c.label });
    if (!(await ask(q))) return;
    try {
      const r = await api(`/content/${encodeURIComponent(p.id)}/${kind}`, { method: 'POST', body: { cohort: c.id } });
      toast(kind === 'publish' ? t('published') : t('rolled', { v: r.version }));
    } catch (e) {
      if (e.data && e.data.problems) await ask(e.message, e.data.problems.slice(0, 10), [[t('confirm'), true]]);
      else failed(e);
    }
    drawContent();
  };
  const pack = (p) => h('section', { class: 'card stack' },
    h('div', { class: 'row wrap' }, h('h3', { class: 'grow', dir: 'auto' }, title(p.title, p.id)), h('span', {}, t('version', { v: p.version })),
      m(p.hash.slice(7, 15))),
    h('p', { class: 'small' }, Object.entries(p.roles).map(([role, x]) => `${role} ${t('signed_of', { a: x.signed, b: x.of })}`).join(' · ')),
    h('details', {}, h('summary', {}, `${t('lessons')} (${fa(p.lessons.length)})`),
      h('ul', { class: 'plain' }, p.lessons.map((l) => h('li', { class: 'row' }, h('span', { class: 'grow', dir: 'auto' }, title(l.title, l.id)),
        h('span', { class: 'tag' + (l.state === 'signed' ? ' good' : '') }, l.state))))),
    p.problems.length ? h('details', {}, h('summary', {}, `${t('problems')} (${fa(p.problems.length)})`),
      h('ul', { class: 'plain small' }, p.problems.slice(0, 20).map((x) => h('li', {}, x)))) : null,
    h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, d.cohorts.map((c) => {
      const rel = p.releases[c.id];
      return h('tr', {}, h('td', { dir: 'auto' }, c.label),
        h('td', {}, rel ? [t('version', { v: rel.version }), ' ', m(rel.short), ' ', h('span', { class: 'tag' + (rel.current ? ' good' : '') },
          t(rel.current ? 'current' : 'older'))] : h('span', { class: 'muted' }, t('none_yet'))),
        h('td', {}, h('button', { type: 'button', class: 'btn', disabled: p.publishable ? null : true, onClick: () => act('publish', p, c) }, t('publish')),
          rel && rel.earlier ? h('button', { type: 'button', class: 'btn', onClick: () => act('rollback', p, c) }, t('rollback')) : null));
    })))));
  const note = (n) => h('li', { class: 'stack-sm' }, h('b', { dir: 'auto' }, title(n.title, n.lesson)),
    h('small', {}, [n.step ? t('step', { n: n.step }) : t('step0'), n.role, n.chips.join(', '), n.at.slice(0, 10)].filter(Boolean).join(' · ')),
    n.text ? h('span', { dir: 'auto' }, n.text) : null);
  const mark = async (x, status) => {
    try { await api('/wishes', { method: 'POST', body: { wkey: x.wkey, status } }); } catch (e) { failed(e); }
    drawContent();
  };
  const wish = (x) => h('li', { class: 'row wrap wish' }, h('span', { class: 'grow', dir: 'auto' }, x.text),
    h('small', { class: 'muted' }, [t('asked', { n: x.count }), bandList(x.bands), x.cohorts.join(', '), t('first_seen', { d: fa(x.first_day) })].join(' · ')),
    h('div', { class: 'chips', role: 'group' }, ['planned', 'not_for_qalam', 'new'].map((st) => h('button', { type: 'button',
      class: 'chip' + (x.status === st ? ' on' : ''), 'aria-pressed': String(x.status === st), onClick: () => mark(x, st) }, t(st)))));
  frame(h('h2', {}, t('packs')), d.packs.map(pack),
    h('h2', {}, t('notes')), d.notes.length ? h('ul', { class: 'plain card' }, d.notes.map(note)) : h('p', { class: 'empty' }, t('no_notes')),
    h('h2', {}, t('wishlist')), w.wishes.length ? h('ul', { class: 'plain card' }, w.wishes.map(wish)) : h('p', { class: 'empty' }, t('no_wishes')));
}

// --- AI spend: fourteen days of bars a cohort, warm at 80% of the cap ---

async function drawSpend() {
  let d;
  try { d = await api('/spend'); } catch (e) { return failed(e); }
  const one = (c) => {
    const top = Math.max(1, c.cap || 0, ...c.days.map((x) => x.tokens));
    const purposes = Object.entries(c.by_purpose).map(([k, n]) => `${k} ${num(n)}`).join(', ');
    return h('section', { class: 'card stack' },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow', dir: 'auto' }, c.label),
        c.today.warn ? h('span', { class: 'tag warm' }, t('of_cap', { p: c.today.pct })) : null,
        c.ai ? null : h('span', { class: 'tag bad' }, t('ai_off_now'))),
      h('div', { class: 'days14', role: 'img', 'aria-label': t('days14') }, c.days.map((x) => h('span', {
        title: `${x.day}: ${x.tokens}`, style: `height:${Math.max(2, Math.round((100 * x.tokens) / top))}%` }))),
      h('small', {}, [`${num(c.today.tokens)} / ${c.cap === null ? t('no_cap') : num(c.cap)}`, t('est', { c: money(c.cost_micro) }) + ' · ' + t('days14'),
        t('held', { n: num(c.days.reduce((a, x) => a + x.held, 0)) }), purposes ? t('by_purpose', { x: purposes }) : t('no_spend')].join(' · ')));
  };
  frame(h('h2', {}, t('spend')), d.cohorts.map(one));
}

// --- Safety: counts only ---

async function drawSafety() {
  let d;
  try { d = await api('/safety'); } catch (e) { return failed(e); }
  const sum = (c, k) => c.days.reduce((a, x) => a + x[k], 0);
  const one = (c) => h('section', { class: 'card stack' }, h('h3', { dir: 'auto' }, c.label),
    h('div', { class: 'stats four' }, d.kinds.map((k) => h('div', { class: 'stat' }, h('b', {}, num(sum(c, k))), h('small', {}, t(k)))),
      h('div', { class: 'stat' }, h('b', {}, num(c.drops.leak + c.drops.maths)), h('small', {}, `${t('leak')} / ${t('maths')}`))),
    h('small', {}, [t('days14'), c.oldest_held_hours === null ? t('no_held') : t('oldest', { n: c.oldest_held_hours })].join(' · ')),
    c.disputes.length ? h('p', { class: 'small' }, `${t('disputes')}: `, c.disputes.map((x) => [m(x.item), ` ${fa(x.n)}  `])) : null);
  frame(h('h2', {}, t('safety')), h('p', { class: 'muted' }, t('counts_only')), d.cohorts.map(one));
}

// --- Staff: labels, roles and cohorts; an email only to add someone ---

async function drawStaff() {
  if (!me.staff) return frame(h('h2', {}, t('staff')), h('p', { class: 'empty' }, t('staff_hub')));
  let d;
  let cs;
  try { [d, cs] = await Promise.all([api('/staff'), api('/cohorts')]); } catch (e) { return failed(e); }
  const remove = async (s) => {
    if (!(await ask(t('remove_q', { l: s.label })))) return;
    try { await api('/staff/' + s.id, { method: 'DELETE' }); toast(t('saved')); } catch (e) { failed(e); }
    drawStaff();
  };
  const email = h('input', { class: 'ainput', type: 'email', autocomplete: 'off', 'aria-label': t('email'), dir: 'ltr' });
  const label = h('input', { class: 'ainput', maxlength: 40, autocomplete: 'off', 'aria-label': t('label') });
  const role = h('select', { 'aria-label': t('role') }, d.roles.map((r) => h('option', { value: r }, r)));
  const initials = h('input', { class: 'ainput', maxlength: 4, autocomplete: 'off', 'aria-label': t('initials'), dir: 'ltr' });
  const cohorts = ticks(t('cohorts'), cs.cohorts.map((c) => c.id), [], (id) => cs.cohorts.find((c) => c.id === id).label);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api('/staff', { method: 'POST', body: { email: email.value.trim(), label: label.value.trim(), role: role.value,
        cohorts: ticked(cohorts), initials: initials.value.trim() } });
      email.value = '';
      toast(t('saved'));
      drawStaff();
    } catch (err) { email.value = ''; failed(err); }
  };
  frame(h('h2', {}, t('staff')),
    h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, d.staff.map((s) => h('tr', {},
      h('td', {}, h('b', { dir: 'auto' }, s.label)), h('td', {}, s.role), h('td', {}, s.cohorts.map((c) => c.label).join(', ') || t('every')),
      h('td', {}, s.initials ? m(s.initials) : ''), h('td', {}, h('small', { class: 'muted' }, t('added', { d: fa(s.added) }))),
      h('td', {}, h('button', { type: 'button', class: 'chip', onClick: () => remove(s) }, t('remove')))))))),
    h('form', { class: 'card stack', onSubmit: add }, h('h3', {}, t('add_staff')), h('label', {}, t('email')), email,
      h('small', { class: 'muted' }, t('email_note')), h('label', {}, t('label')), label, h('label', {}, t('role')), role,
      h('label', {}, t('initials')), initials, cohorts, h('button', { type: 'submit', class: 'btn primary' }, t('add_staff'))));
}

// --- Log: every change, newest first ---

async function drawLog(cohort = '') {
  let d;
  let cs;
  try { [d, cs] = await Promise.all([api('/log' + (cohort ? '?cohort=' + encodeURIComponent(cohort) : '')), api('/cohorts')]); } catch (e) { return failed(e); }
  const pick = h('select', { 'aria-label': t('cohorts'), onChange: (e) => drawLog(e.target.value) },
    h('option', { value: '' }, t('every')), cs.cohorts.map((c) => h('option', { value: c.id, selected: c.id === cohort }, c.label)));
  frame(h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, t('log')), pick),
    h('div', { class: 'atable' }, h('table', {}, h('thead', {}, h('tr', {}, [t('when'), t('cohorts'), t('what'), '', t('who')].map((x) => h('th', {}, x)))),
      h('tbody', {}, d.log.map((x) => h('tr', {}, h('td', {}, m(x.at.slice(0, 16).replace('T', ' '))), h('td', { dir: 'auto' }, x.cohort),
        h('td', {}, x.what), h('td', { dir: 'auto' }, x.detail), h('td', { dir: 'auto' }, x.by)))))));
}

window.addEventListener('online', () => draw());
window.addEventListener('offline', () => say(t('connect')));
setUi(ui);
start();
