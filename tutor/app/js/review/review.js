// The review screens (P17, C3.4), at /review/: reviewers read each lesson step in the learner's own look, mark it OK
// or ask for a change, and sign the lesson's content hash. A staff page, apart from the learner app: it keeps
// nothing in this browser (no storage, no service worker cache), and offline it says "Connect to review".
// Online, Cloudflare Access lets the reviewer in and the hub knows her role and initials from `staff`; on the hub,
// the teacher's PIN opens it, and she picks her role and types her initials (kept in this page's memory only).
// Each step is drawn by the learner app itself, in a frame: /?preview=<band>&lang=<lang>#/lesson/<id>/<n>
// (state.js keeps that learner in memory only). On a step with a recording, OK waits until the clip has played once;
// a step that needs a recording and has none blocks signing. The last page is the worksheet with its key and hints,
// the link cards and the sources. Signing is a 3-second hold, like the consent screen's.
// Since P25a (C4.1) a skills graph is one more page: every node with what it needs and its lessons, each OK or
// Change (saved at once), the pathways as one more item, then "Hold to sign" once every one is OK.
// Since P29 (C4.7) the Quran set is one more, for the Hanafi scholar: what the set is (the text's edition, each
// translation's version and credit, the reciter, Tanzil's notice) as item 0, then each surah, opened from the hub's
// /quran/surah/<n>.json as the reader shows it; OK on a surah waits until it is open and every recitation it has
// here has played to its end. Nothing in the set can be edited: Change says why it may not be used.
// Since P28 (C4.6) a pack's card set is one more: its checklist and each link card, OK on a card only once its page
// has been opened from here, then "Hold to sign".

const API = '../api/m/review';
const BAND_OF_YEAR = (y) => (y === 0 ? 'ey' : y <= 3 ? 'p1' : y <= 6 ? 'p2' : y <= 9 ? 's1' : 's2');
const LANG_OF_ROLE = { 'Dari reader': 'prs', 'Pashto reader': 'ps' };
const CHIPS = ['spelling', 'word', 'maths', 'picture', 'audio', 'too_hard', 'unsafe'];
const HOLD_MS = 3000;

// English, and Dari drafts for a native speaker's check
const T = {
  en: {
    title: 'Review', loading: 'Loading…', connect: 'Connect to review.', off: 'Review is not open here.',
    access: 'Sign in through Cloudflare Access, then open this page again.', not_staff: 'Ask the admin to add you.',
    pin: "Teacher's PIN", open: 'Open', wrong_pin: 'That PIN is not right.', role: 'I review as', initials: 'My initials',
    for_you: 'Lessons for you', none: 'No lesson needs your role.', not_started: 'Not started', step_of: 'Step {a} of {b}',
    changes: 'Changes asked', signed: 'Signed', changed: 'Changed since you signed', back: 'Back',
    play: 'Play the recording', no_rec: 'No recording yet', ok: 'OK', change: 'Change', next: 'Next',
    next_changed: 'Next changed step', ok_last: 'OK last time', changed_tag: 'changed', comment: 'Comment (no names)',
    whole: 'Worksheet, cards and sources', sheet: 'The worksheet', open_sheet: 'Open the sheet', key: 'The key and its hints',
    cards: 'Link cards', sources: 'Sources', nothing: 'None', sign: 'Sign this lesson', hold: 'Hold to sign',
    send: 'Send my changes', sent: 'Your changes are sent.', done_sign: 'Signed. Thank you.', save_fail: "Couldn't save. Try again.",
    play_first: 'Play the recording first.', blocked: 'Steps without a recording cannot be signed yet.',
    todo: 'Every step needs OK before signing.', short: 'Hash', date: 'Date', lang: 'Language',
    chip_spelling: 'Spelling', chip_word: 'Afghan word', chip_maths: 'Maths', chip_picture: 'Picture',
    chip_audio: 'Audio', chip_too_hard: 'Too hard', chip_unsafe: 'Unsafe',
    graphs: 'Skills graphs', graph_of: 'Skills graph: {s}', node_needs: 'Needs', node_lessons: 'Lessons', nodes_n: '{n} skills',
    pathways: 'Pathways', certificate: 'with a certificate', final: 'Last lesson', no_lessons: 'No lesson yet',
    sign_graph: 'Sign this graph', todo_graph: 'Every skill and the pathways need OK before signing.', save_note: 'Save',
    quran: 'The Quran set', quran_of: 'The Quran set {h}', surahs_n: '{n} surahs', set_what: 'What the set is',
    open_surah: 'Open the surah', play_all: 'Play every verse', heard: '{a} of {b} recitations played',
    sign_set: 'Sign the Quran set', todo_set: 'Every surah and the set itself need OK before signing.',
    no_tr: 'No translation', notes_n: 'Notes ({n})',
    card_sets: 'Card sets', cards_of: 'Cards: {p}', items_n: '{n} items', checklist: 'The checklist',
    open_page: 'Open the page', open_first: 'Open the page first, and check it says what the card says.',
    kind: 'Kind', cost: 'Cost', who: 'Who may apply', checked: 'Checked', review_by: 'Hidden after',
    expired: 'Past its date: hidden on phones', step_opens: 'opens {s}',
    sign_cards: 'Sign this card set', todo_cards: 'Every card and the checklist need OK before signing.',
  },
  prs: {
    title: 'بررسی', loading: 'صبر کن…', connect: 'برای بررسی به انترنت وصل شو.', off: 'بررسی این‌جا باز نیست.',
    access: 'از راه Cloudflare Access وارد شو و این صفحه را دوباره باز کن.', not_staff: 'از مدیر بخواه تو را اضافه کند.',
    pin: 'رمز معلم', open: 'باز کن', wrong_pin: 'این رمز درست نیست.', role: 'نقش من', initials: 'حروف اول نام من',
    for_you: 'درس‌ها برای تو', none: 'هیچ درسی به نقش تو نیاز ندارد.', not_started: 'شروع نشده', step_of: 'قدم {a} از {b}',
    changes: 'تغییر خواسته شده', signed: 'امضا شده', changed: 'بعد از امضای تو تغییر کرده', back: 'برگشت',
    play: 'صدا را بشنو', no_rec: 'هنوز صدا ثبت نشده', ok: 'درست است', change: 'تغییر', next: 'بعدی',
    next_changed: 'قدم تغییرکردهٔ بعدی', ok_last: 'دفعهٔ قبل درست بود', changed_tag: 'تغییر کرده', comment: 'نظر (بدون نام)',
    whole: 'ورق کار، کارت‌ها و منبع‌ها', sheet: 'ورق کار', open_sheet: 'ورق را باز کن', key: 'جواب‌ها و راهنمایی‌ها',
    cards: 'کارت‌های پیوند', sources: 'منبع‌ها', nothing: 'هیچ', sign: 'این درس را امضا کن', hold: 'نگه دار تا امضا شود',
    send: 'تغییرهایم را بفرست', sent: 'تغییرهای تو فرستاده شد.', done_sign: 'امضا شد. تشکر.', save_fail: 'ذخیره نشد. دوباره کوشش کن.',
    play_first: 'اول صدا را بشنو.', blocked: 'قدم‌های بی‌صدا هنوز امضا نمی‌شوند.',
    todo: 'پیش از امضا هر قدم باید درست باشد.', short: 'هش', date: 'تاریخ', lang: 'زبان',
    chip_spelling: 'املا', chip_word: 'کلمهٔ افغانی', chip_maths: 'ریاضی', chip_picture: 'تصویر',
    chip_audio: 'صدا', chip_too_hard: 'خیلی سخت', chip_unsafe: 'ناامن',
    graphs: 'نقشه‌های مهارت', graph_of: 'نقشهٔ مهارت: {s}', node_needs: 'پیش از آن', node_lessons: 'درس‌ها', nodes_n: '{n} مهارت',
    pathways: 'راه‌ها', certificate: 'با تصدیق‌نامه', final: 'درس آخر', no_lessons: 'هنوز درسی نیست',
    sign_graph: 'این نقشه را امضا کن', todo_graph: 'پیش از امضا هر مهارت و راه‌ها باید درست باشند.', save_note: 'ذخیره',
    quran: 'مجموعهٔ قرآن', quran_of: 'مجموعهٔ قرآن {h}', surahs_n: '{n} سوره', set_what: 'این مجموعه چیست',
    open_surah: 'سوره را باز کن', play_all: 'همهٔ آیه‌ها را بشنو', heard: '{a} از {b} تلاوت شنیده شد',
    sign_set: 'مجموعهٔ قرآن را امضا کن', todo_set: 'پیش از امضا هر سوره و خود مجموعه باید درست باشند.',
    no_tr: 'ترجمه نیست', notes_n: 'یادداشت‌ها ({n})',
    card_sets: 'مجموعه‌های کارت', cards_of: 'کارت‌ها: {p}', items_n: '{n} مورد', checklist: 'فهرست قدم‌ها',
    open_page: 'صفحه را باز کن', open_first: 'اول صفحه را باز کن و ببین که همان چیزی را می‌گوید که کارت می‌گوید.',
    kind: 'نوع', cost: 'هزینه', who: 'چه کسی', checked: 'بررسی شده', review_by: 'پنهان بعد از',
    expired: 'تاریخش گذشته: روی تلفن‌ها پنهان است', step_opens: '{s} را باز می‌کند',
    sign_cards: 'این مجموعهٔ کارت را امضا کن', todo_cards: 'پیش از امضا هر کارت و فهرست قدم‌ها باید درست باشند.',
  },
};

let ui = 'en';
const t = (k, v = {}) => (T[ui][k] ?? T.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const pick = (x, lang) => (x && typeof x === 'object' ? x[lang] || x.prs || x.en || '' : x || '');

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

const root = document.getElementById('review');
const me = { pin: '', role: '', initials: '', via: null, roles: [] };      // this page's memory only
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
const show = (...kids) => put(root, ...kids);
const say = (msg) => show(h('div', { class: 'screen' }, top(), h('p', { class: 'empty' }, msg)));

function setUi(lang) {
  ui = lang === 'prs' ? 'prs' : 'en';
  document.documentElement.lang = ui === 'prs' ? 'fa-AF' : 'en';
  document.documentElement.dir = ui === 'prs' ? 'rtl' : 'ltr';
}

function top(back, title) {
  return h('header', { class: 'top' },
    back ? h('button', { type: 'button', class: 'round', 'aria-label': t('back'), onClick: back }, ui === 'prs' ? '→' : '←') : null,
    h('div', { class: 'grow' }, h('h1', {}, title || t('title'))),
    h('button', { type: 'button', class: 'chip', onClick: () => { setUi(ui === 'en' ? 'prs' : 'en'); start(); } },
      ui === 'en' ? 'دری' : 'English'));
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (me.pin) headers['x-teacher-pin'] = me.pin;
  const sep = path.includes('?') ? '&' : '?';
  const url = API + path + (me.via === 'pin' && me.role && method === 'GET' && path !== '/me' ? `${sep}role=${encodeURIComponent(me.role)}` : '');
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    credentials: 'same-origin' });
  if (!r.ok) {
    const e = new Error(r.status === 403 ? (await r.json().catch(() => ({}))).error || '' : String(r.status));
    e.status = r.status;
    throw e;
  }
  return r.json();
}

function failed(e) {
  if (!navigator.onLine || e instanceof TypeError) return say(t('connect'));
  if (e.status === 404) return say(t('off'));
  if (e.status === 401) return me.via === 'pin' || location.protocol === 'http:' ? pinGate(true) : say(t('access'));
  if (e.status === 403) return say(/admin/i.test(e.message) ? t('not_staff') : t('access'));
  return say(t('save_fail'));
}

function pinGate(wrong = false) {
  const box = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('pin') });
  show(h('div', { class: 'screen' }, top(),
    h('form', { class: 'card pad-card stack', onSubmit: (e) => { e.preventDefault(); me.pin = box.value.trim(); start(); } },
      h('label', {}, t('pin')), box, wrong && me.pin ? h('p', { class: 'muted' }, t('wrong_pin')) : null,
      h('button', { class: 'btn primary', type: 'submit' }, t('open')))));
}

async function start() {
  say(t('loading'));
  try {
    const m = await api('/me');
    Object.assign(me, { via: m.via, roles: m.roles });
    if (m.role) me.role = m.role;
    if (m.initials) me.initials = m.initials;
  } catch (e) { return failed(e); }
  if (me.via === 'pin' && (!me.role || !me.initials)) return pickRole();
  return queue();
}

// on the hub: which role she signs for, and her initials (kept in memory only)
function pickRole() {
  const role = h('select', { 'aria-label': t('role') }, me.roles.map((r) => h('option', { value: r, selected: r === me.role }, r)));
  const ini = h('input', { maxlength: 4, autocomplete: 'off', value: me.initials, 'aria-label': t('initials'), dir: 'ltr' });
  show(h('div', { class: 'screen' }, top(),
    h('form', { class: 'card pad-card stack', onSubmit: (e) => {
      e.preventDefault();
      const v = ini.value.trim().toUpperCase();
      if (!/^[A-Z]{1,4}$/.test(v)) { ini.focus(); return; }
      me.role = role.value; me.initials = v; queue();
    } }, h('label', {}, t('role')), role, h('label', {}, t('initials')), ini, h('button', { class: 'btn primary', type: 'submit' }, t('open')))));
}

const TAG = { not_started: '', step: '', changes: 'tag warm', signed: 'tag good', changed: 'tag warm' };

async function queue() {
  let q;
  try { q = await api('/queue'); } catch (e) { return failed(e); }
  const lang = LANG_OF_ROLE[q.role] || ui;
  const row = (l) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); lesson(l.id); } },
    h('span', { class: 'grow' }, h('b', { dir: 'auto' }, pick(l.title, lang)), h('small', { class: 'muted', dir: 'ltr' }, l.code || l.id)),
    h('span', { class: TAG[l.status] || 'tag' }, l.status === 'step' ? t('step_of', { a: l.step, b: l.of }) : t(l.status)));
  const rows = q.packs.flatMap((p) => [
    h('div', { class: 'section-head' }, h('h2', {}, pick(p.title, lang) || p.pack)),
    h('nav', { class: 'subjects' }, p.lessons.map(row))]);
  const graphs = (q.graphs || []).length ? [h('div', { class: 'section-head' }, h('h2', {}, t('graphs'))),
    h('nav', { class: 'subjects' }, q.graphs.map((g) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); graphPage(g.subject); } },
      h('span', { class: 'grow' }, h('b', { dir: 'ltr' }, g.subject), h('small', { class: 'muted' }, t('nodes_n', { n: g.nodes }), ' · ', h('span', { dir: 'ltr' }, g.version))),
      h('span', { class: TAG[g.status] || 'tag' }, g.status === 'step' ? t('step_of', { a: g.step, b: g.of }) : t(g.status)))))] : [];
  const qs = q.quran ? [h('div', { class: 'section-head' }, h('h2', {}, t('quran'))),
    h('nav', { class: 'subjects' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); quranPage(); } },
      h('span', { class: 'grow' }, h('b', {}, t('quran')), h('small', { class: 'muted' }, t('surahs_n', { n: q.quran.surahs }), ' · ',
        h('span', { dir: 'ltr' }, q.quran.short))),
      h('span', { class: TAG[q.quran.status] || 'tag' }, q.quran.status === 'step' ? t('step_of', { a: q.quran.step, b: q.quran.of }) : t(q.quran.status))))] : [];
  const cs = (q.cards || []).length ? [h('div', { class: 'section-head' }, h('h2', {}, t('card_sets'))),
    h('nav', { class: 'subjects' }, q.cards.map((x) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); cardsPage(x.pack); } },
      h('span', { class: 'grow' }, h('b', { dir: 'auto' }, pick(x.title, lang) || x.pack), h('small', { class: 'muted' }, t('items_n', { n: x.items }))),
      h('span', { class: TAG[x.status] || 'tag' }, x.status === 'step' ? t('step_of', { a: x.step, b: x.of }) : t(x.status)))))] : [];
  show(h('div', { class: 'screen' }, top(null, t('for_you')),
    h('p', { class: 'pad muted small' }, `${t('role')}: ${q.role}`),
    rows.length || graphs.length || qs.length || cs.length ? [rows, graphs, qs, cs] : h('p', { class: 'empty' }, t('none'))));
}

// a hold-to-sign button: `run` after HOLD_MS held down
function holdButton(disabled, run) {
  const btn = h('button', { type: 'button', class: 'btn primary hold', disabled: disabled ? true : null }, h('span', { class: 'ring' }), t('hold'));
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', () => { btn.classList.add('holding'); timer = setTimeout(() => { cancel(); run(); }, HOLD_MS); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, cancel);
  return btn;
}

// one skills graph (P25a): its nodes as items 1 to N, its pathways as item 0; each verdict is saved when given
async function graphPage(sub) {
  let d;
  try { d = await api('/graphs/' + encodeURIComponent(sub)); } catch (e) { return failed(e); }
  const G = d.graph;
  const lang = LANG_OF_ROLE[d.role] || ui;
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const verdict = {};
  for (const s of d.steps) if (s.last && !s.changed) verdict[s.n] = s.last;
  const title = (id) => { const n = G.nodes.find((x) => x.id === id); return n ? pick(n.title, lang) : id; };
  const lessonLine = (lid) => { const l = d.lessons[lid]; return l ? `${pick(l.title, lang)} (${l.audience === 'adult' ? 'ad' : BAND_OF_YEAR(l.year)})` : lid; };
  const signBox = h('div', { class: 'stack' });

  function item(k, head, body) {
    const st = d.steps[k];
    const okBtn = h('button', { type: 'button', class: 'btn ok-btn' + (verdict[k] === 'ok' ? ' on' : '') }, t('ok'));
    const chBtn = h('button', { type: 'button', class: 'btn' + (verdict[k] === 'change' ? ' warm' : '') }, t('change'));
    const note = h('textarea', { class: 'field' + (verdict[k] === 'change' ? '' : ' hidden'), rows: 2, maxlength: 500,
      'aria-label': t('comment'), placeholder: t('comment'), dir: 'auto' });
    note.value = st.text || '';
    const saveBtn = h('button', { type: 'button', class: 'btn outline small' + (verdict[k] === 'change' ? '' : ' hidden') }, t('save_note'));
    async function save(v) {
      try {
        await api(`/graphs/${encodeURIComponent(sub)}/steps/${k}`, { method: 'POST', body: { verdict: v, chips: [],
          text: v === 'change' ? note.value : '', step_hash: st.hash, role: me.via === 'pin' ? me.role : null } });
        verdict[k] = v; st.last = v; st.changed = false;
        okBtn.classList.toggle('on', v === 'ok'); chBtn.classList.toggle('warm', v === 'change');
        status.textContent = '';
        drawSign();
      } catch (e) { if (e.status === 409) graphPage(sub); else status.textContent = t('save_fail'); }
    }
    okBtn.addEventListener('click', () => { note.classList.add('hidden'); saveBtn.classList.add('hidden'); save('ok'); });
    chBtn.addEventListener('click', () => { note.classList.remove('hidden'); saveBtn.classList.remove('hidden'); chBtn.classList.add('warm'); okBtn.classList.remove('on'); });
    saveBtn.addEventListener('click', () => save('change'));
    return h('div', { class: 'card pad-card stack graph-node' },
      h('div', { class: 'row wrap' }, h('b', { class: 'grow', dir: 'auto' }, head),
        st.changed ? h('span', { class: 'tag warm' }, t('changed_tag')) : null,
        st.last === 'ok' && !st.changed ? h('span', { class: 'tag good' }, t('ok_last')) : null),
      body, h('div', { class: 'row' }, okBtn, chBtn), note, saveBtn);
  }

  function drawSign() {
    const notOk = d.steps.some((s) => verdict[s.n] !== 'ok');
    const facts = h('dl', { class: 'facts' },
      h('dt', {}, t('short')), h('dd', { dir: 'ltr' }, d.short), h('dt', {}, t('role')), h('dd', {}, d.role),
      h('dt', {}, t('initials')), h('dd', { dir: 'ltr' }, me.initials));
    put(signBox, h('h2', {}, t('sign_graph')), facts, notOk ? h('p', { class: 'muted' }, t('todo_graph')) : null,
      holdButton(notOk, async () => {
        try {
          await api(`/graphs/${encodeURIComponent(sub)}/sign`, { method: 'POST',
            body: { hash: d.hash, role: me.via === 'pin' ? me.role : null, initials: me.via === 'pin' ? me.initials : null } });
          put(signBox, h('p', { class: 'done-big' }, t('done_sign')), h('button', { type: 'button', class: 'btn', onClick: queue }, t('back')));
        } catch (e) { if (e.status === 409) graphPage(sub); else status.textContent = t('save_fail'); }
      }));
  }

  const nodes = G.nodes.map((n, i) => item(i + 1, `${pick(n.title, lang)}  ·  ${n.id}`, h('dl', { class: 'facts' },
    h('dt', {}, t('node_needs')), h('dd', { dir: 'auto' }, (n.needs || []).length ? n.needs.map(title).join('، ') : t('nothing')),
    h('dt', {}, t('node_lessons')), h('dd', { dir: 'auto' }, (n.lessons || []).length ? n.lessons.map(lessonLine).join('، ') : t('no_lessons')))));
  const paths = item(0, t('pathways'), (G.pathways || []).length ? h('ul', {}, G.pathways.map((p) => h('li', { dir: 'auto' },
    h('b', {}, pick(p.title, lang)), ` (${(p.bands || []).join(', ')}): `, (p.goal || []).map(title).join('، '),
    p.final ? ` · ${t('final')}: ${lessonLine(p.final)}` : '', p.certificate ? ` · ${t('certificate')}` : ''))) : h('p', { class: 'muted' }, t('nothing')));
  show(h('div', { class: 'screen' }, top(queue, t('graph_of', { s: sub })),
    h('div', { class: 'stack pad' }, nodes, paths, signBox, status)));
  drawSign();
}

// a pack's card set (P28): its checklist, then each link card, items 1 to N; OK on a card waits until its page has
// been opened from here, so the reviewer checks the page says what the card says (an adviser: who may apply, the cost,
// and that it is the official site)
async function cardsPage(pid) {
  let d;
  try { d = await api('/cards/' + encodeURIComponent(pid)); } catch (e) { return failed(e); }
  const lang = LANG_OF_ROLE[d.role] || ui;
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const verdict = {};
  for (const x of d.steps) if (x.last && !x.changed) verdict[x.n] = x.last;
  const signBox = h('div', { class: 'stack' });

  function item(st) {
    const it = st.item;
    const isCard = it.type === 'card';
    let opened = !isCard;
    const okBtn = h('button', { type: 'button', class: 'btn ok-btn' + (verdict[st.n] === 'ok' ? ' on' : ''),
      disabled: opened || verdict[st.n] === 'ok' ? null : true }, t('ok'));
    const chBtn = h('button', { type: 'button', class: 'btn' + (verdict[st.n] === 'change' ? ' warm' : '') }, t('change'));
    const note = h('textarea', { class: 'field' + (verdict[st.n] === 'change' ? '' : ' hidden'), rows: 2, maxlength: 500,
      'aria-label': t('comment'), placeholder: t('comment'), dir: 'auto' });
    note.value = st.text || '';
    const saveBtn = h('button', { type: 'button', class: 'btn outline small' + (verdict[st.n] === 'change' ? '' : ' hidden') }, t('save_note'));
    async function save(v) {
      try {
        await api(`/cards/${encodeURIComponent(pid)}/steps/${st.n}`, { method: 'POST', body: { verdict: v, chips: [],
          text: v === 'change' ? note.value : '', step_hash: st.hash, role: me.via === 'pin' ? me.role : null } });
        verdict[st.n] = v; st.last = v; st.changed = false;
        okBtn.classList.toggle('on', v === 'ok'); chBtn.classList.toggle('warm', v === 'change');
        status.textContent = '';
        drawSign();
      } catch (e) { if (e.status === 409) cardsPage(pid); else status.textContent = t('save_fail'); }
    }
    okBtn.addEventListener('click', () => { if (!opened) { status.textContent = t('open_first'); return; }
      note.classList.add('hidden'); saveBtn.classList.add('hidden'); save('ok'); });
    chBtn.addEventListener('click', () => { note.classList.remove('hidden'); saveBtn.classList.remove('hidden'); chBtn.classList.add('warm'); okBtn.classList.remove('on'); });
    saveBtn.addEventListener('click', () => save('change'));
    const body = isCard ? [
      h('p', { dir: 'auto' }, pick(it.about, lang)),
      h('dl', { class: 'facts' },
        h('dt', {}, t('who')), h('dd', { dir: 'auto' }, pick(it.who, lang) || t('nothing')),
        h('dt', {}, t('kind')), h('dd', { dir: 'ltr' }, it.kind || t('nothing')),
        h('dt', {}, t('cost')), h('dd', { dir: 'ltr' }, it.cost || t('nothing')),
        h('dt', {}, t('checked')), h('dd', { dir: 'ltr' }, it.checked || t('nothing')),
        h('dt', {}, t('review_by')), h('dd', { dir: 'ltr' }, it.review_by || t('nothing'))),
      it.review_by && it.review_by < d.today ? h('p', { class: 'tag warm' }, t('expired')) : null,
      h('p', { dir: 'ltr', class: 'small' }, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer',
        onClick: () => { opened = true; okBtn.disabled = false; } }, t('open_page')), ' · ', it.url),
    ] : h('ol', {}, (it.steps || []).map((x) => h('li', { dir: 'auto' }, pick(x.text, lang),
      x.open ? h('small', { class: 'muted' }, ' (', t('step_opens', { s: x.open.replace(/^subject:/, '') }), ')') : null)));
    return h('div', { class: 'card pad-card stack graph-node' },
      h('div', { class: 'row wrap' }, h('b', { class: 'grow', dir: 'auto' }, isCard ? `${pick(it.title, lang)}${it.owner ? '  ·  ' + it.owner : ''}` : t('checklist')),
        st.changed ? h('span', { class: 'tag warm' }, t('changed_tag')) : null,
        st.last === 'ok' && !st.changed ? h('span', { class: 'tag good' }, t('ok_last')) : null),
      body, h('div', { class: 'row' }, okBtn, chBtn), note, saveBtn);
  }

  function drawSign() {
    const notOk = d.steps.some((x) => verdict[x.n] !== 'ok');
    const facts = h('dl', { class: 'facts' },
      h('dt', {}, t('short')), h('dd', { dir: 'ltr' }, d.short), h('dt', {}, t('role')), h('dd', {}, d.role),
      h('dt', {}, t('initials')), h('dd', { dir: 'ltr' }, me.initials));
    put(signBox, h('h2', {}, t('sign_cards')), facts, notOk ? h('p', { class: 'muted' }, t('todo_cards')) : null,
      holdButton(notOk, async () => {
        try {
          await api(`/cards/${encodeURIComponent(pid)}/sign`, { method: 'POST',
            body: { hash: d.hash, role: me.via === 'pin' ? me.role : null, initials: me.via === 'pin' ? me.initials : null } });
          put(signBox, h('p', { class: 'done-big' }, t('done_sign')), h('button', { type: 'button', class: 'btn', onClick: queue }, t('back')));
        } catch (e) { if (e.status === 409) cardsPage(pid); else status.textContent = t('save_fail'); }
      }));
  }

  show(h('div', { class: 'screen' }, top(queue, t('cards_of', { p: pick(d.title, lang) || pid })),
    h('div', { class: 'stack pad' }, d.steps.map(item), signBox, status)));
  drawSign();
}

// the Quran set (P29): item 0 what it is, items 1 to 114 the surahs; OK waits until the surah is open and every
// recitation it has here has played
async function quranPage() {
  let d;
  try { d = await api('/quran'); } catch (e) { return failed(e); }
  const S = d.set;
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const verdict = {};
  for (const x of d.steps) if (x.last && !x.changed) verdict[x.n] = x.last;
  const signBox = h('div', { class: 'stack' });
  const save = async (k, v, text) => {
    const st = d.steps[k];
    try {
      await api(`/quran/steps/${k}`, { method: 'POST', body: { verdict: v, chips: [], text: v === 'change' ? text : '',
        step_hash: st.hash, role: me.via === 'pin' ? me.role : null } });
      verdict[k] = v; st.last = v; st.changed = false; status.textContent = ''; drawSign();
      return true;
    } catch (e) { if (e.status === 409) quranPage(); else status.textContent = t('save_fail'); return false; }
  };
  function item(k, head, body, ready = () => true) {
    const st = d.steps[k];
    const okBtn = h('button', { type: 'button', class: 'btn ok-btn' + (verdict[k] === 'ok' ? ' on' : ''), disabled: ready() || verdict[k] === 'ok' ? null : true }, t('ok'));
    const chBtn = h('button', { type: 'button', class: 'btn' + (verdict[k] === 'change' ? ' warm' : '') }, t('change'));
    const note = h('textarea', { class: 'field hidden', rows: 2, maxlength: 500, 'aria-label': t('comment'), placeholder: t('comment'), dir: 'auto' });
    note.value = st.text || '';
    const saveBtn = h('button', { type: 'button', class: 'btn outline small hidden' }, t('save_note'));
    okBtn.addEventListener('click', async () => { if (await save(k, 'ok')) { okBtn.classList.add('on'); chBtn.classList.remove('warm'); } });
    chBtn.addEventListener('click', () => { note.classList.remove('hidden'); saveBtn.classList.remove('hidden'); });
    saveBtn.addEventListener('click', async () => { if (await save(k, 'change', note.value)) { chBtn.classList.add('warm'); okBtn.classList.remove('on'); } });
    const card = h('div', { class: 'card pad-card stack graph-node' },
      h('div', { class: 'row wrap' }, h('b', { class: 'grow', dir: 'auto' }, head),
        st.changed ? h('span', { class: 'tag warm' }, t('changed_tag')) : null,
        st.last === 'ok' && !st.changed ? h('span', { class: 'tag good' }, t('ok_last')) : null),
      body, h('div', { class: 'row' }, okBtn, chBtn), note, saveBtn);
    card.unlock = () => { if (ready()) okBtn.disabled = false; };
    return card;
  }
  function drawSign() {
    const notOk = d.steps.some((x) => verdict[x.n] !== 'ok');
    put(signBox, h('h2', {}, t('sign_set')), h('dl', { class: 'facts' },
      h('dt', {}, t('short')), h('dd', { dir: 'ltr' }, d.short), h('dt', {}, t('role')), h('dd', {}, d.role),
      h('dt', {}, t('initials')), h('dd', { dir: 'ltr' }, me.initials)), notOk ? h('p', { class: 'muted' }, t('todo_set')) : null,
    holdButton(notOk, async () => {
      try {
        await api('/quran/sign', { method: 'POST', body: { hash: d.hash, role: me.via === 'pin' ? me.role : null,
          initials: me.via === 'pin' ? me.initials : null } });
        put(signBox, h('p', { class: 'done-big' }, t('done_sign')), h('button', { type: 'button', class: 'btn', onClick: queue }, t('back')));
      } catch (e) { if (e.status === 409) quranPage(); else status.textContent = t('save_fail'); }
    }));
  }
  const facts = h('dl', { class: 'facts', dir: 'ltr' },
    h('dt', {}, 'Text'), h('dd', {}, `${S.credits.text} (${S.credits.edition})`),
    (S.translations || []).flatMap((m) => [h('dt', {}, m.lang), h('dd', {}, `${S.credits.tr[m.lang].line} ${m.issued}; ${m.url}`)]),
    (S.audio || []).flatMap((m) => [h('dt', {}, 'Recitation'), h('dd', {}, `${S.credits.audio.line} (${m.edition}, ${m.riwaya}, ${m.bitrate} kbps)`)]));
  const what = item(0, t('set_what'), [facts, h('details', {}, h('summary', {}, 'Tanzil'), h('pre', { class: 'small', dir: 'ltr' }, S.credits.notice))]);
  const surahItem = (x) => {
    const box = h('div', { class: 'stack' });
    let open = false;
    const heard = new Set();
    let want = 0;
    const count = h('small', { class: 'muted' });
    const card = item(x.n, `${x.n}. ${x.ar} · ${x.tname} (${x.ayas})`, [box],
      () => open && heard.size >= want);
    const openBtn = h('button', { type: 'button', class: 'btn outline small', onClick: async () => {
      let s;
      try { const r = await fetch(`../quran/surah/${x.n}.json`, { cache: 'no-store', headers: me.pin ? { 'x-teacher-pin': me.pin } : {} }); s = r.ok ? await r.json() : null; } catch { s = null; }
      if (!s) { status.textContent = t('save_fail'); return; }
      open = true;
      want = s.verses.filter((v) => v.audio).length;
      const mark = () => { count.textContent = want ? t('heard', { a: heard.size, b: want }) : ''; card.unlock(); };
      put(box, count, s.verses.map((v) => h('div', { class: 'stack' },
        h('p', { lang: 'ar', dir: 'rtl', class: 'verse-review' }, `${v.a}. ${v.ar}`),
        v.audio ? h('audio', { controls: true, preload: 'none', src: '..' + v.audio.url, onEnded: () => { heard.add(v.a); mark(); } }) : null,
        Object.entries(v.tr || {}).map(([l, tr]) => h('div', { dir: 'rtl', lang: l === 'ps' ? 'ps' : 'fa-AF' },
          h('p', {}, `${l}: ${tr.t}`), tr.f ? h('details', {}, h('summary', {}, t('notes_n', { n: tr.f.split(/\n+/).filter(Boolean).length })),
            h('p', { class: 'small' }, tr.f)) : null)))));
      mark();
    } }, t('open_surah'));
    box.append(openBtn);
    return card;
  };
  show(h('div', { class: 'screen' }, top(queue, t('quran_of', { h: d.short })),
    h('div', { class: 'stack pad' }, what, S.surahs.map((x) => surahItem({ ...x, ar: x.ar })), signBox, status)));
  drawSign();
}

async function lesson(id, at = 1) {
  let d;
  try { d = await api('/lessons/' + encodeURIComponent(id)); } catch (e) { return failed(e); }
  const L = d.lesson;
  const n = L.steps.length;
  let lang = LANG_OF_ROLE[d.role] || 'prs';
  const band = BAND_OF_YEAR(Number.isInteger(L.year) ? L.year : 12);
  const verdict = {};                       // step -> 'ok' | 'change', this visit
  for (const s of d.steps) if (s.last && !s.changed) verdict[s.n] = s.last;
  const body = h('div', { class: 'review-step' });
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const note_ = (msg) => { status.textContent = msg; };

  function stepPage(k) {
    shown = k;
    const st = d.steps[k];
    const step = k ? L.steps[k - 1] : null;
    // the step's recordings: hers in the reviewer's language, and (P27a) the English or Chinese word it teaches
    const clips = [...new Set([lang, 'en', 'zh'].map((l) => step && step.audio && step.audio[l] && step.audio[l].url).filter(Boolean))];
    const noRec = k && d.no_recording.includes(k);
    const heard = new Set();
    let played = !clips.length;
    const okBtn = h('button', { type: 'button', class: 'btn ok-btn' + (verdict[k] === 'ok' ? ' on' : ''), disabled: !played || null }, t('ok'));
    const chBtn = h('button', { type: 'button', class: 'btn' + (verdict[k] === 'change' ? ' warm' : '') }, t('change'));
    const chosen = new Set(st.chips || []);
    const chips = h('div', { class: 'chips wrap' + (verdict[k] === 'change' ? '' : ' hidden') }, CHIPS.map((c) =>
      h('button', { type: 'button', class: 'chip' + (chosen.has(c) ? ' on' : ''), onClick: (e) => {
        if (chosen.has(c)) chosen.delete(c); else chosen.add(c);
        e.currentTarget.classList.toggle('on', chosen.has(c));
      } }, t('chip_' + c))));
    const note = h('textarea', { class: 'field' + (verdict[k] === 'change' ? '' : ' hidden'), rows: 3, maxlength: 500,
      'aria-label': t('comment'), placeholder: t('comment'), dir: 'auto' });
    note.value = st.text || '';
    okBtn.addEventListener('click', () => {
      if (!played) { note_(t('play_first')); return; }
      verdict[k] = 'ok'; okBtn.classList.add('on'); chBtn.classList.remove('warm');
      chips.classList.add('hidden'); note.classList.add('hidden');
    });
    chBtn.addEventListener('click', () => {
      verdict[k] = 'change'; chBtn.classList.add('warm'); okBtn.classList.remove('on');
      chips.classList.remove('hidden'); note.classList.remove('hidden');
    });
    const audios = clips.map((u) => {
      const a = h('audio', { src: u, preload: 'none' });
      a.addEventListener('ended', () => { heard.add(u); played = heard.size === clips.length; okBtn.disabled = !played; });
      return a;
    });
    const tags = h('div', { class: 'row wrap' },
      h('b', { class: 'grow' }, k ? t('step_of', { a: k, b: n }) : t('whole')),
      st.changed ? h('span', { class: 'tag warm' }, t('changed_tag')) : null,
      st.last === 'ok' && !st.changed ? h('span', { class: 'tag good' }, t('ok_last')) : null,
      noRec ? h('span', { class: 'tag warm' }, t('no_rec')) : null);
    const view = k
      ? h('div', { class: 'frame' }, h('iframe', { title: t('step_of', { a: k, b: n }), loading: 'eager',
        src: `../?preview=${band}&lang=${lang}#/lesson/${encodeURIComponent(id)}/${k}` }))
      : whole(d, L, lang);
    const save = async (go) => {
      if (!verdict[k]) { go(); return; }
      try {
        await api(`/lessons/${encodeURIComponent(id)}/steps/${k}`, { method: 'POST', body: { verdict: verdict[k],
          chips: verdict[k] === 'change' ? [...chosen] : [], text: verdict[k] === 'change' ? note.value : '', step_hash: st.hash,
          role: me.via === 'pin' ? me.role : null } });
        st.last = verdict[k]; st.changed = false;
        go();
      } catch (e) { if (e.status === 409) lesson(id, k); else note_(t('save_fail')); }
    };
    const nextChanged = d.steps.find((s) => s.n > k && s.changed);
    const order = [...Array(n).keys()].map((x) => x + 1).concat([0]);
    const after = order[order.indexOf(k) + 1];
    put(body, tags,
      langSwitch(),
      view,
      audios.map((a) => h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn outline', onClick: () => a.play() }, '▶ ', t('play')), a)),
      h('div', { class: 'row' }, okBtn, chBtn), chips, note,
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn primary', onClick: () => save(() => (after === undefined ? signPage() : stepPage(after))) }, t('next')),
        nextChanged ? h('button', { type: 'button', class: 'link', onClick: () => save(() => stepPage(nextChanged.n)) }, t('next_changed')) : null));
  }

  function langSwitch() {
    if (LANG_OF_ROLE[d.role]) return null;              // a Dari or Pashto reader reviews her own language
    return h('div', { class: 'chips' }, ['prs', 'ps'].map((x) => h('button', { type: 'button', class: 'chip' + (x === lang ? ' on' : ''),
      onClick: () => { lang = x; stepPage(current()); } }, x === 'prs' ? 'دری' : 'پښتو')));
  }
  let shown = at;
  const current = () => shown;

  function signPage() {
    const notOk = d.steps.filter((s) => verdict[s.n] !== 'ok').map((s) => s.n);
    const asked = d.steps.some((s) => verdict[s.n] === 'change');
    if (asked) {
      put(body, h('p', {}, t('sent')), h('button', { type: 'button', class: 'btn primary', onClick: queue }, t('send')));
      return;
    }
    const facts = h('dl', { class: 'facts' },
      h('dt', {}, t('short')), h('dd', { dir: 'ltr' }, d.short), h('dt', {}, t('role')), h('dd', {}, d.role),
      h('dt', {}, t('initials')), h('dd', { dir: 'ltr' }, me.initials), h('dt', {}, t('date')),
      h('dd', { dir: 'ltr' }, new Date().toISOString().slice(0, 10)));
    const why = notOk.length ? t('todo') : d.no_recording.length ? t('blocked') : null;
    const btn = h('button', { type: 'button', class: 'btn primary hold', disabled: why ? true : null }, h('span', { class: 'ring' }), t('hold'));
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', () => {
      btn.classList.add('holding');
      timer = setTimeout(async () => {
        cancel();
        try {
          await api(`/lessons/${encodeURIComponent(id)}/sign`, { method: 'POST',
            body: { hash: d.hash, role: me.via === 'pin' ? me.role : null, initials: me.via === 'pin' ? me.initials : null } });
          put(body, h('p', { class: 'done-big' }, t('done_sign')), h('button', { type: 'button', class: 'btn', onClick: queue }, t('back')));
        } catch (e) { if (e.status === 409) lesson(id); else note_(t('save_fail')); }
      }, HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, cancel);
    put(body, h('h2', {}, t('sign')), facts, why ? h('p', { class: 'muted' }, why) : null, btn);
  }

  show(h('div', { class: 'screen' }, top(queue, `${L.code || ''} ${pick(L.title, lang)}`.trim()), body, status));
  const first = d.steps.find((s) => s.n >= 1 && (s.changed || !s.last));
  stepPage(at !== 1 ? at : first ? first.n : 1);
}

// the last page: the worksheet (its A4 preview and its key with the hints), the link cards and the sources
function whole(d, L, lang) {
  const sheet = d.key ? [h('h3', {}, t('sheet')),
    h('a', { class: 'btn outline', href: `../api/sheets/${encodeURIComponent(L.id)}.html?lang=${lang}`, target: '_blank', rel: 'noopener' }, t('open_sheet')),
    h('h3', {}, t('key')),
    h('ol', { class: 'key-list' }, d.key.items.map((r) => h('li', {},
      h('span', { dir: 'ltr', class: 'm' }, r.q ? `${r.q} = ${r.a ?? ''}` : (typeof r.a === 'string' ? r.a : '')),
      r.prompt ? h('small', { class: 'muted', dir: 'auto' }, ' ', r.prompt) : null,
      (r.hints || []).length ? h('ol', { class: 'hint-list' }, r.hints.map((x) => h('li', { dir: 'auto' }, String(x.text).replace(/\$/g, '')))) : null)))] : [];
  const cards = [h('h3', {}, t('cards')), d.cards.length
    ? h('ul', {}, d.cards.map((c) => h('li', { dir: 'auto' }, pick(c.title, lang), ' — ', h('span', { dir: 'ltr' }, c.url || '')))) : h('p', { class: 'muted' }, t('nothing'))];
  const srcs = [h('h3', {}, t('sources')), d.sources.length
    ? h('ul', {}, d.sources.map((s) => h('li', { dir: 'auto' }, [s.id, s.what || s.note || ''].filter(Boolean).join(': ')))) : h('p', { class: 'muted' }, t('nothing'))];
  return h('div', { class: 'card pad-card stack whole' }, sheet, cards, srcs);
}

setUi((navigator.language || '').startsWith('fa') ? 'prs' : 'en');
window.addEventListener('online', start);
start();
