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

import * as L from '../staff/lang.js';

const API = '../api/m/admin';
const BANDS = ['ey', 'p1', 'p2', 's1', 's2', 'ad'];
const LANGS = ['prs', 'ps', 'en'];
const PAGES = ['cohorts', 'content', 'spend', 'safety', 'staff', 'log'];

// Strings: the staff pages' string files (app/js/staff/strings/, P33, C5.1); the page's own keys are admin.*, shared
// ones common.*; English, Dari and Pashto, picked in the header and remembered in this browser.
const t = (k, v) => L.t(k.includes('.') ? k : L.has('admin.' + k) ? 'admin.' + k : 'common.' + k, v);
const fa = (x) => L.digits(x);
const num = (n) => L.num(n);
const money = (micro) => L.money(micro);
const m = (x) => h('span', { class: 'm', dir: 'ltr' }, String(x));          // codes, hashes and ids stay left to right
const title = (x, fallback) => (x && typeof x === 'object' ? x[L.lang()] || x.en || x.prs || x.ps : x) || fallback;   // {prs, ps, en}

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

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (me.pin) headers['x-admin-pin'] = me.pin;
  if (method !== 'GET') headers['x-qalam'] = '1';      // a staff write (C5 M1): a form from another site cannot send it
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

// the photo gate's problems in the reader's language (gate.<code>), the server's English only for a code this page
// does not know yet
const gateWhy = (g) => (Array.isArray(g.why) ? g.why.map((w, i) => (L.has('gate.' + w.code)
  ? t('gate.' + w.code, { ...w, lang: w.lang ? L.word('lang', w.lang) : '', n: num(w.n), min: num(w.min), a: num(w.a), b: num(w.b) })
  : g.problems[i])) : g.problems);

// --- the frame: header, menu, gate ---

function header() {
  return h('header', { class: 'top staff-top' },
    h('div', { class: 'grow' }, h('h1', {}, (document.title = t('title')))),
    h('span', { class: 'brk', 'aria-hidden': 'true' }),
    me.label ? h('span', { class: 'chip who', dir: 'auto' }, me.label) : null,
    L.picker(h, () => draw()),
    me.via ? h('button', { type: 'button', class: 'chip signout', onClick: signOut }, t('sign_out')) : null);
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
  : h('div', { class: 'amain' }, kids), L.draftNote(h));
const say = (msg) => frame(h('p', { class: 'empty' }, msg));

function failed(e) {
  if (!navigator.onLine || e instanceof TypeError) return say(t('connect'));
  if (e.status === 404 && !me.via) return say(t('off'));
  if (e.status === 429) return me.via === 'pin' || !me.via ? pinGate(t('wait')) : say(t('wait'));
  if (e.status === 401) return location.protocol === 'http:' || me.pin ? pinGate(me.pin ? t('wrong_pin') : '') : say(t('access'));
  if (e.status === 403 && !me.via) return say(/admins/i.test(e.message) ? t('not_admin') : t('access'));
  const code = e.data && e.data.code;
  toast(code && L.has('error.' + code) ? t('error.' + code) : e.message && e.message.length < 140 ? e.message : t('save_fail'));
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
    h('form', { class: 'card stack agate', onSubmit: (e) => { e.preventDefault(); me.pin = L.latin(box.value).trim(); start(); } },
      h('label', {}, t('pin')), box, msg ? h('p', { class: 'muted' }, msg) : null,
      h('button', { class: 'btn primary', type: 'submit' }, t('open')))), L.draftNote(h));
  setTimeout(() => box.focus(), 50);
}

// a dialog for every confirm: the question, any detail lines, and its buttons (the first is the confirming one)
// Escape cancels every dialog; with `safe` (a change that cannot be taken back: a new code, removing someone, a
// rollback) the focus lands on Cancel, while the button order stays the same in every dialog (C5.B3 item 10)
function ask(question, lines = [], buttons = [[t('confirm'), true]], extra = null, { safe = false } = {}) {
  return new Promise((resolve) => {
    const back = document.activeElement;
    const close = (v) => { box.remove(); document.removeEventListener('keydown', esc, true); if (back && back.focus) back.focus(); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
    const box = h('div', { class: 'amodal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'card stack' }, h('b', {}, question), lines.map((l) => h('p', { class: 'small' }, l)), extra,
        h('div', { class: 'row wrap' }, buttons.map(([label, v], i) => h('button', { type: 'button',
          class: 'btn' + (i === 0 ? ' primary' : ''), onClick: () => close(v) }, label)),
        h('button', { type: 'button', class: 'btn', onClick: () => close(null) }, t('cancel')))));
    document.body.append(box);
    document.addEventListener('keydown', esc, true);
    (safe ? [...box.querySelectorAll('button')].pop() : box.querySelector('button')).focus();
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
  if (!me.via) return me.pin || location.protocol === 'http:' ? pinGate('') : start();
  if (page === 'content') return drawContent();
  if (page === 'spend') return drawSpend();
  if (page === 'safety') return drawSafety();
  if (page === 'staff') return drawStaff();
  if (page === 'log') return drawLog();
  return drawCohorts();
}

// --- cohorts ---

const comma = () => (L.lang() === 'en' ? ', ' : '، ');
const bandList = (bs) => (bs.length === BANDS.length ? t('band.all') : bs.map((b) => t('band.' + b)).join(comma()));
const langList = (ls) => L.and(ls.map((l) => t('lang.' + l)));
// who made a change, in words: "the hub's admin", "the seed", "Teacher A (teacher)", or the admin's label
const byWord = (by) => {
  const x = String(by || '');
  if (x === 'admin:hub') return t('log.by_hub');
  if (x === 'seed') return t('log.by_seed');
  if (x.startsWith('teacher:')) return t('log.by_teacher', { l: x.slice(8) });
  return x.startsWith('admin:') ? x.slice(6) : x;
};
// the code, once, large, with "Write it down now" (C5.2)
const codeOnce = (code) => [h('p', { class: 'code-big' }, m(code)), h('p', { class: 'small' }, h('b', {}, t('write_down')))];

function ticks(name, values, chosen, label) {
  return h('fieldset', { class: 'ticks' }, h('legend', {}, name), values.map((v) => h('label', { class: 'row' },
    h('input', { type: 'checkbox', value: v, checked: chosen.includes(v) || null }), label(v))));
}
const ticked = (fs) => [...fs.querySelectorAll('input:checked')].map((x) => x.value);

async function drawCohorts() {
  let d;
  try { d = await api('/cohorts'); } catch (e) { return failed(e); }
  const row = (c) => h('tr', {},
    h('td', {}, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohort(c.id); } }, h('b', { dir: 'auto' }, L.cohort(c.label))),
      c.own ? h('small', { class: 'muted' }, comma() + t('own')) : null),
    h('td', {}, num(c.learners)), h('td', {}, bandList(c.bands)), h('td', {}, langList(c.langs)),
    h('td', {}, h('span', { class: 'tag' + (c.ai ? '' : ' bad') }, t(c.ai ? 'ai_on' : 'ai_off'))),
    h('td', {}, h('span', { class: 'tag' + (c.day ? '' : ' bad') }, t(c.day ? 'day_on' : 'day_off'))));
  const label = h('input', { class: 'ainput', maxlength: 40, 'aria-label': t('label'), autocomplete: 'off' });
  const langs = ticks(t('langs'), LANGS, ['prs', 'ps'], (l) => t('lang.' + l));
  const bands = ticks(t('years'), BANDS, [], (b) => t('band.' + b));
  const out = h('div');
  const make = async (e) => {
    e.preventDefault();
    if (!ticked(langs).length || !ticked(bands).length) { toast(t('pick_some')); return; }
    try {
      const r = await api('/cohorts', { method: 'POST', body: { label: label.value.trim(), langs: ticked(langs), bands: ticked(bands) } });
      put(out, h('div', { class: 'card stack soft' }, h('b', {}, t('code_once')), codeOnce(r.code),
        h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn', onClick: () => classCards(r.id, r.code) }, t('print_cards')),
          h('button', { type: 'button', class: 'btn', onClick: () => drawCohort(r.id) }, r.label))));
    } catch (err) { failed(err); }
  };
  frame(h('h2', {}, t('cohorts')),
    d.cohorts.length ? h('div', { class: 'atable' }, h('table', {}, h('thead', {}, h('tr', {}, ['h_label', 'h_learners', 'h_years',
      'h_langs', 'h_ai', 'h_day'].map((x) => h('th', {}, t(x))))), h('tbody', {}, d.cohorts.map(row))))
      : h('p', { class: 'empty' }, t('no_cohorts')),
    h('form', { class: 'card stack', onSubmit: make }, h('h3', {}, t('new_cohort')), h('label', {}, t('label')), label,
      h('small', { class: 'muted' }, t('label_hint')), langs, bands, h('button', { type: 'submit', class: 'btn primary' }, t('make'))),
    out);
}

const modName = (id) => L.word('module', id);
function riskTag(r) {
  return h('span', { class: 'tag risk-' + r }, t('risk.' + r));
}

async function drawCohort(cid) {
  let c;
  try { c = await api('/cohorts/' + encodeURIComponent(cid)); } catch (e) { return failed(e); }
  const again = () => drawCohort(cid);
  const kill = async (sw) => {
    const on = sw === 'ai' ? !c.ai : !c.day;
    const all = h('label', { class: 'row' }, h('input', { type: 'checkbox' }), t('all_cohorts'));
    const q = t((on ? 'unkill_q_' : 'kill_q_') + sw, { c: L.cohort(c.label) });
    if (!(await ask(q, [], [[t('confirm'), true]], all))) return;
    try {
      await api(`/cohorts/${cid}/kill`, { method: 'POST', body: { switch: sw, on, all: all.querySelector('input').checked } });
      toast(t('saved'));
    } catch (e) { failed(e); }
    again();
  };
  const newCode = async () => {
    if (!(await ask(t('new_code_q'), [], [[t('new_code'), true]], null, { safe: true }))) return;
    try {
      const r = await api(`/cohorts/${cid}/code`, { method: 'POST' });
      await ask(t('code_once'), [], [[t('print_cards'), true]], h('div', {}, codeOnce(r.code))) && classCards(cid, r.code);
    } catch (e) { failed(e); }
  };
  const cardsFromCode = async () => {
    const box = h('input', { class: 'ainput', 'aria-label': t('type_code'), autocomplete: 'off', dir: 'ltr' });
    if (await ask(t('type_code'), [], [[t('print_cards'), true]], box)) classCards(cid, L.latin(box.value).trim());
  };
  // a kill switch as a state line with its action beside it; a band only while the thing is off (C5.2)
  const since = c.since || {};
  const state = (sw, on) => {
    const off = since[sw];
    const line = on ? t(sw + '_is_on') : off ? t(sw + '_off_since', { w: L.when(off.at), by: byWord(off.by) }) : t(sw + '_is_off');
    return h('div', { class: 'astate row' + (on ? '' : ' off') }, h('span', { class: 'grow' }, line),
      h('button', { type: 'button', class: 'btn kill', onClick: () => kill(sw) }, t(on ? sw + '_off_do' : sw + '_on_do')));
  };
  const s = c.spend;
  const purposes = Object.entries(s.by_purpose || {}).map(([k, n]) => `${L.word('admin.purpose', k)} ${num(n)}`).join(comma());
  frame(
    h('div', { class: 'stack-sm acrumb' },
      h('div', { class: 'row wrap' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohorts(); } }, t('cohorts')),
        h('span', { 'aria-hidden': 'true' }, L.rtl() ? '‹' : '›'), h('h2', { class: 'grow', dir: 'auto' }, L.cohort(c.label))),
      state('ai', c.ai), state('day', c.day)),
    h('p', { class: 'aclass' }, [t('learners', { n: num(c.learners) }), bandList(c.bands), langList(c.langs)].join(comma())),
    h('section', { class: 'card stack acode' }, h('b', {}, t('code_row')), h('p', { class: 'small' }, t('code_why')),
      h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn', onClick: cardsFromCode }, t('print_cards')),
        h('button', { type: 'button', class: 'btn', onClick: newCode }, t('new_code')))),
    h('h3', {}, t('modules')), moduleTable(c, again),
    cohortSettings(c, again),
    aiProvider(c, again),
    schoolDay(c),
    h('section', { class: 'card stack' }, h('b', {}, t('ai_today')),
      h('div', { class: 'bar spendbar' + (s.pct >= 80 ? ' warn' : '') }, h('span', { style: `width:${Math.min(100, s.pct || 0)}%` })),
      h('small', {}, L.join([s.pct === null ? t('no_cap') : L.pct(s.pct), t('est', { c: money(s.cost_micro) }), t('calls', { n: num(s.calls) })
        + (purposes ? ` (${purposes})` : '')]))));
}

function moduleTable(c, again) {
  const toggle = async (row) => {
    const body = { enabled: !row.enabled };
    for (;;) {
      try {
        const r = await api(`/cohorts/${c.id}/flags/${row.id}`, { method: 'POST', body });
        if (r.turned_on && r.turned_on.length > 1) toast(t('also', { x: L.and(r.turned_on.map(modName)) }));
        return again();
      } catch (e) {
        if (e.status !== 409 || !e.data.need) { failed(e); return again(); }
        // what each risky module can do, in the reader's words (cap.<capability>), the module's own line otherwise
        const lines = e.data.risks.map((x) => `${modName(x.id)} (${t('risk.' + x.risk)}): ${(x.capabilities || []).length
          ? x.capabilities.map((k) => t('cap.' + k, {}, x.sentence)).join(' ') : x.sentence}`);
        if (e.data.missing.length) lines.push(t('also', { x: L.and(e.data.missing.map(modName)) }));
        const ok = await ask(t('turn_on_q', { m: modName(row.id), c: L.cohort(c.label) }), lines,
          [[e.data.missing.length ? t('turn_on_both') : t('turn_on'), true]]);
        if (!ok) return again();
        Object.assign(body, { confirm: true, both: true });
      }
    }
  };
  // a gate other than photo's has its own words: what that module waits for (C6.A8)
  const lockWord = (row) => (row.lock === 'gate' && row.id !== 'photo' ? t('locked_gate_' + row.id) : t('locked_' + row.lock));
  const note = (row) => L.join([row.lock ? lockWord(row) : null,
    row.host.length ? t('host', { x: row.host.join(', ') }) : null,
    row.depends.length ? t('depends', { x: L.and(row.depends.map(modName)) }) : null]);
  const years = (row) => (row.bands.length === BANDS.length ? t('band.all') : row.bands.map((b) => t('band.' + b)).join(comma()));
  // words, not ids (C5.1 item 5): the module's name and its line; the id and version only under Details. Under 760 px
  // the row is a card: the name and its line, the switch on the same row, the risk and years under it, Settings last
  const tr = (row) => h('tr', { class: row.lock && !row.enabled ? 'locked' : null },
    h('td', { class: 'mname' }, h('b', {}, modName(row.id)), h('small', { class: 'muted mwhat' }, t(`module.${row.id}.what`, {}, '')),
      h('small', { class: 'mmeta' }, riskTag(row.risk), ' ', years(row)),
      h('details', { class: 'mid' }, h('summary', {}, t('detail_id')), h('small', {}, m(`${row.id} ${row.version}`), ' ',
        L.word('maturity', row.maturity)))),
    h('td', { class: 'mrisk' }, riskTag(row.risk)), h('td', { class: 'mmat' }, L.word('maturity', row.maturity)),
    h('td', { class: 'myears' }, years(row)),
    h('td', { class: 'mon' }, h('button', { type: 'button', class: 'switch' + (row.enabled ? ' on' : ''), role: 'switch',
      'aria-checked': String(row.enabled), 'aria-label': `${t('on')}: ${modName(row.id)}`, disabled: row.lock && !row.enabled ? true : null,
      title: row.sentence || null, onClick: () => toggle(row) }, h('span', { class: 'knob' }))),
    h('td', { class: 'mset' }, Object.keys(row.schema).length ? h('button', { type: 'button', class: 'chip', onClick: () => moduleSettings(c, row, again) },
      t('settings')) : null),
    h('td', { class: 'mnote' }, h('small', { class: 'muted' }, note(row))));
  // open's recipe (C4.9): what the photo gate still waits for, or the budget rule once it is passed
  const gate = c.gate ? h('p', { class: 'muted' }, c.gate.open ? t('gate_open', { n: num(c.gate.tokens_per_mark) })
    : [t('gate_wait'), ...gateWhy(c.gate)].join(' ')) : null;
  return h('div', { class: 'atable amods' }, h('table', {}, h('thead', {}, h('tr', {},
    [t('module'), t('risk'), t('maturity'), t('years'), t('on'), t('settings'), ''].map((x) => h('th', {}, x)))),
  h('tbody', {}, c.modules.map(tr))), gate, liveMonth(c));
}

// under the live classes' row while they are on (C6.1): this month's classes, hours listened and the data estimate
// against the cap; the cap is the server's configuration, shown read-only
function liveMonth(c) {
  const row = c.modules.find((x) => x.id === 'live');
  const u = c.live;
  if (!row || !row.enabled || !u) return null;
  return h('section', { class: 'card stack-sm alive' }, h('b', {}, modName('live')),
    h('div', { class: 'bar spendbar' + (u.pct >= 80 ? ' warn' : '') }, h('span', { style: `width:${Math.min(100, u.pct || 0)}%` })),
    h('small', {}, L.join([t('live_month', { n: num(u.classes), m: num(u.hours), g: num(u.gb), cap: num(u.cap) }),
      u.classes ? t('live_peak', { n: num(u.peak) }) : null])),
    h('small', { class: 'muted' }, t(u.full ? 'live_full' : 'live_cap')));
}

const show = (v) => (v === true ? t('common.on') : v === false ? t('common.off') : v === undefined || v === null || v === '' ? t('common.unset')
  : typeof v === 'number' ? num(v) : Array.isArray(v) ? v.map((x) => L.word('maturity', x)).join(comma()) : L.digits(String(v)));
const diffLines = (old, now) => Object.keys(now).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(now[k]))
  .map((k) => `${L.word('setting', k)}: ${show(old[k])} → ${show(now[k])}`);

// a module's settings: a form from its schema; Save shows the diff for a confirm first
async function moduleSettings(c, row, again) {
  const inputs = Object.entries(row.schema).map(([k, spec]) => {
    const v = row.settings[k];
    const el = spec.type === 'bool' ? h('input', { type: 'checkbox', checked: v || null })
      : h('input', { class: 'ainput', type: spec.type === 'int' ? 'number' : 'text', value: v, min: spec.min, max: spec.max });
    return [k, spec, el];
  });
  const form = h('div', { class: 'stack' }, inputs.map(([k, , el]) => h('label', { class: 'row' }, el, h('span', {}, L.word('setting', k)))));
  if (!(await ask(`${modName(row.id)}: ${t('settings')}`, [], [[t('save'), true]], form))) return;
  const now = Object.fromEntries(inputs.map(([k, spec, el]) => [k, spec.type === 'bool' ? el.checked
    : spec.type === 'int' ? Number(L.latin(el.value)) : el.value]));
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
  const line = L.join([t(c.ai ? 'ai_on' : 'ai_off'), `${t('budget')}: ${s.ai_budget !== undefined ? num(s.ai_budget)
    : t('budget_hub', { n: c.budget === null ? t('no_cap') : num(c.budget) })}`,
  `${t('moderation')}: ${t('m_' + (s.moderation || 'none'))}`,
  `${t('maturities')}: ${(s.maturity || ['stable']).map((x) => L.word('maturity', x)).join(comma())}`]);
  const edit = async () => {
    const budget = h('input', { class: 'ainput', type: 'number', min: 0, value: s.ai_budget ?? '', placeholder: c.budget ?? '' });
    const mod = h('select', {}, c.moderation.map((x) => h('option', { value: x, selected: (s.moderation || 'none') === x }, t('m_' + x))));
    const mat = ticks(t('maturities'), c.maturities, s.maturity || ['stable'], (x) => L.word('maturity', x));
    const form = h('div', { class: 'stack' }, h('label', {}, t('budget')), budget, h('label', {}, t('moderation')), mod, mat);
    if (!(await ask(t('cohort_settings'), [], [[t('save'), true]], form))) return;
    const now = { ai_budget: budget.value === '' ? null : Number(L.latin(budget.value)), moderation: mod.value, maturity: ticked(mat) };
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

// --- the AI provider switch: a cohort's own provider and model, from the next request; keys only as set or not set ---

function aiProvider(c, again) {
  const s = c.settings;
  const a = c.ai_choice;
  const pName = (x) => t('p_' + x);
  const now = s.ai_provider || a.default;
  const keyLine = ['openai', 'anthropic', 'gemini', 'openai_compat']
    .map((x) => `${pName(x)} ${t(a.keys[x] ? 'key_set' : 'key_unset')}`).join(comma());
  const line = L.join([`${s.ai_provider ? pName(s.ai_provider) : t('p_hub', { p: pName(a.default) })}`,
    `${t('model')}: ${s.ai_model || a.models[now] || '-'}`]);
  const edit = async () => {
    const prov = h('select', { 'aria-label': t('provider') }, h('option', { value: '', selected: !s.ai_provider }, t('p_hub', { p: pName(a.default) })),
      a.providers.map((x) => h('option', { value: x, selected: s.ai_provider === x }, pName(x))));
    const model = h('input', { class: 'ainput', dir: 'ltr', value: s.ai_model || '', placeholder: a.models[now] || '', 'aria-label': t('model') });
    prov.addEventListener('change', () => { model.placeholder = a.models[prov.value || a.default] || ''; });
    const form = h('div', { class: 'stack' }, h('label', {}, t('provider')), prov, h('label', {}, t('model')), model,
      h('small', {}, t('model_hint')), h('small', {}, keyLine),
      a.compat_host ? h('small', {}, `${pName('openai_compat')}: `, m(a.compat_host)) : null);
    if (!(await ask(t('ai_provider'), [], [[t('save'), true]], form))) return;
    const want = { ai_provider: prov.value || null, ai_model: model.value.trim() || null };
    const lines = diffLines({ ai_provider: s.ai_provider ?? null, ai_model: s.ai_model ?? null }, want);
    if (!lines.length) { toast(t('no_change')); return; }
    if (!(await ask(t('diff_q'), lines, [[t('save'), true]]))) return;
    try { await api(`/cohorts/${c.id}/settings`, { method: 'POST', body: { settings: want } }); toast(t('saved')); } catch (e) { failed(e); }
    again();
  };
  return h('section', { class: 'card stack' },
    h('div', { class: 'row wrap' }, h('b', {}, t('ai_provider') + ':'), h('span', { class: 'grow', dir: 'auto' }, line),
      h('button', { type: 'button', class: 'chip', onClick: edit }, t('edit'))),
    h('small', {}, keyLine));
}

// --- the school day's timetable (P19's setting; edited here since P21): the default, or the cohort's own template ---

const hhmm = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const mins = (x) => { const [a, b] = String(x || '00:00').split(':').map(Number); return a * 60 + b; };

function schoolDay(c) {
  const own = c.settings.timetable && c.settings.timetable !== 'default';
  return h('section', { class: 'card row wrap' }, h('b', {}, t('school_day') + ':'),
    h('span', { class: 'grow' }, L.join([t(own ? 'tt_own' : 'tt_default'), t(c.day ? 'day_on' : 'day_off')])),
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
      onChange: (e) => { d.days = tt.days.filter((y) => (y === x ? e.target.checked : d.days.includes(y))); } }), t('day.' + x))));
  const hol = h('textarea', { class: 'field ainput', rows: 3, dir: 'ltr', 'aria-label': t('tt_holidays'),
    onInput: (e) => { d.holidays = L.latin(e.target.value).split(/[\s,]+/).filter(Boolean); } }, (d.holidays || []).join('\n'));
  const r = d.ramadan;
  const rIn = (k, type, attrs = {}) => h('input', { class: 'ainput', type, value: r ? r[k] : '', dir: 'ltr', ...attrs,
    onInput: (e) => { if (d.ramadan) d.ramadan[k] = type === 'number' ? Number(L.latin(e.target.value)) : L.latin(e.target.value); } });
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
    } }), h('b', {}, t('band.' + b)), ' ', t('tt_has_day'));
    if (!x) return h('section', { class: 'card stack' }, has);
    let at = mins(x.start);
    const rows = x.blocks.map((blk, i) => {
      const from = at;
      at += Number(blk.min) || 0;
      return h('tr', {},
        h('td', {}, m(hhmm(from))),
        h('td', {}, h('select', { 'aria-label': t('k_' + blk.kind), onChange: (e) => {
          const k = e.target.value;
          x.blocks[i] = k === 'period' ? { kind: 'period', subject: 'auto', min: blk.min }
            : k === 'live' ? { kind: 'live', subject: 'class', min: blk.min } : { kind: k, min: blk.min };
          again();
        } }, tt.kinds.map((k) => h('option', { value: k, selected: k === blk.kind }, t('k_' + k))))),
        h('td', {}, blk.kind === 'period' ? h('select', { onChange: (e) => { blk.subject = e.target.value; } },
          tt.subjects.map((sj) => h('option', { value: sj, selected: sj === (blk.subject || 'auto') }, t('s_' + sj))))
          : blk.kind === 'live' ? h('select', { 'aria-label': t('k_live'), onChange: (e) => { blk.subject = e.target.value; } },
            (tt.live_subjects || []).map((sj) => h('option', { value: sj, selected: sj === blk.subject }, t('s_' + sj)))) : null),
        h('td', {}, h('input', { class: 'ainput short', type: 'number', min: 5, max: 120, value: blk.min, 'aria-label': t('tt_min'),
          onChange: (e) => { blk.min = Number(L.latin(e.target.value)); again(); } }), ' ', t('tt_min')),
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
    h('div', { class: 'row wrap acrumb' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); drawCohort(c.id); } }, L.cohort(c.label)),
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
  if (a.days.join() !== b.days.join()) out.push(`${t('tt_days')}: ${a.days.map((x) => t('day.' + x)).join(' ')} → ${b.days.map((x) => t('day.' + x)).join(' ')}`);
  if ((a.holidays || []).join() !== (b.holidays || []).join()) out.push(`${t('tt_holidays_short')}: ${(b.holidays || []).map((x) => L.date(x)).join(comma()) || '—'}`);
  if (JSON.stringify(a.ramadan) !== JSON.stringify(b.ramadan)) {
    out.push(`${t('tt_ramadan')}: ${b.ramadan ? `${b.ramadan.from} – ${b.ramadan.to}, ${b.ramadan.start}, ${b.ramadan.period_min} ${t('tt_min')}` : '—'}`);
  }
  for (const k of bandKeys(a, b)) {
    const x = a.bands[k];
    const y = b.bands[k];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const line = (z) => (z ? `${z.start}, ${z.blocks.map((q) => `${t('k_' + q.kind)} ${num(q.min)}`).join(comma())}` : '—');
    out.push(`${t('band.' + k)}: ${line(x)} → ${line(y)}`);
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
    const q = t(kind === 'publish' ? 'publish_q' : 'rollback_q', { p: title(p.title, p.id), v: p.version, c: L.cohort(c.label) });
    if (!(await ask(q, [], [[t(kind === 'publish' ? 'publish' : 'rollback'), true]], null, { safe: kind !== 'publish' }))) return;
    try {
      const r = await api(`/content/${encodeURIComponent(p.id)}/${kind}`, { method: 'POST', body: { cohort: c.id } });
      toast(kind === 'publish' ? t('published') : t('rolled', { v: r.version }));
    } catch (e) {
      if (e.data && e.data.problems) await ask(e.message, e.data.problems.slice(0, 10), [[t('confirm'), true]]);
      else failed(e);
    }
    drawContent();
  };
  // a pack says whether it can be published and, if not, how much is missing (C5.B3 item 5): the Publish rows only for a
  // pack that can be published, and a published pack says where and when; a class with a release keeps its row
  const where = (p, c) => {
    const rel = p.releases[c.id];
    if (!rel) return h('span', { class: 'muted' }, t('not_published', { c: L.cohort(c.label) }));
    return [h('span', {}, t(rel.current ? 'published_to' : 'older', { c: L.cohort(c.label), d: L.date(rel.at) })), ' ',
      h('small', { class: 'muted' }, t('version', { v: '' }).trim(), ' ', m(rel.version)), ' ', m(rel.short)];
  };
  const pack = (p) => {
    const rows = d.cohorts.filter((c) => p.publishable || p.releases[c.id]);
    return h('section', { class: 'card stack' },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow', dir: 'auto' }, title(p.title, p.id)),
        h('small', { class: 'muted' }, t('version', { v: '' }).trim(), ' ', m(p.version)), m(p.hash.slice(7, 15))),
      p.publishable ? h('span', { class: 'tag good' }, t('ready'))
        : h('details', { class: 'notready' }, h('summary', {}, t('not_ready', { n: num(p.problems.length) })),
          h('ul', { class: 'plain small' }, p.problems.slice(0, 20).map((x) => h('li', { dir: 'auto' }, x)))),
      h('p', { class: 'small' }, L.join(Object.entries(p.roles).map(([role, x]) => `${L.word('role', role)} ${t('signed_of', { a: num(x.signed), b: num(x.of) })}`))),
      h('details', {}, h('summary', {}, `${t('lessons')} (${fa(p.lessons.length)})`),
        h('ul', { class: 'plain' }, p.lessons.map((l) => h('li', { class: 'row' }, h('span', { class: 'grow', dir: 'auto' }, title(l.title, l.id)),
          h('span', { class: 'tag' + (l.state === 'signed' ? ' good' : '') }, L.t('admin.state_' + l.state, {}, l.state)))))),
      rows.length ? h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, rows.map((c) => {
        const rel = p.releases[c.id];
        return h('tr', {}, h('td', { dir: 'auto' }, where(p, c)),
          h('td', {}, p.publishable && !(rel && rel.current) ? h('button', { type: 'button', class: 'btn', onClick: () => act('publish', p, c) }, t('publish')) : null,
            rel && rel.earlier ? h('button', { type: 'button', class: 'btn', onClick: () => act('rollback', p, c) }, t('rollback')) : null));
      })))) : null);
  };
  // contests (P31, C6.5): open to a class (or all classes) once its reviewers signed it; counts only, nobody's score
  const contestAct = async (kind, x, c) => {
    const q = t(kind === 'open' ? 'contest_open_q' : kind === 'close' ? 'contest_close_q' : 'contest_all_q',
      { p: title(x.title, x.id), c: c ? L.cohort(c.label) : '' });
    if (!(await ask(q, [], [[t(kind === 'open' ? 'open_to_class' : kind === 'close' ? 'close_class' : 'all_classes'), true]], null,
      { safe: kind === 'close' }))) return;
    try {
      await api(`/content/contests/${encodeURIComponent(x.id)}/${kind === 'all' ? 'open-all' : kind}`,
        { method: 'POST', body: kind === 'all' ? undefined : { cohort: c.id } });
      toast(t(kind === 'close' ? 'contest_closed_now' : 'contest_opened'));
    } catch (e) { failed(e); }
    drawContent();
  };
  const contest = (x) => h('section', { class: 'card stack' },
    h('div', { class: 'row wrap' }, h('h3', { class: 'grow', dir: 'auto' }, title(x.title, x.id)),
      h('small', { class: 'muted' }, L.join([L.t('admin.s_' + x.subject, {}, x.subject), t('contest_shape', { n: num(x.n), m: num(x.minutes) })])),
      m(x.short)),
    h('p', { class: 'small' }, t('contest_window', { a: L.when(x.opens_at), b: L.when(x.closes_at) })),
    x.signed ? h('span', { class: 'tag good' }, t('ready'))
      : h('p', { class: 'small' }, t('contest_unsigned'), ' ',
        L.join(Object.entries(x.roles).map(([role, ok]) => `${L.word('role', role)} ${ok ? '✓' : '·'}`))),
    h('p', { class: 'lead-line' }, t('contest_took', { n: num(x.took_part) })),
    h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, d.cohorts.map((c) => {
      const rel = x.releases[c.id];
      const state = !rel ? t('contest_not_open', { c: L.cohort(c.label) })
        : rel.open ? t('contest_is_open', { c: L.cohort(c.label), d: L.date(rel.at) })
          : rel.earlier ? t('contest_earlier', { c: L.cohort(c.label) }) : t('contest_is_closed', { c: L.cohort(c.label) });
      return h('tr', {}, h('td', { dir: 'auto' }, state, rel ? h('small', { class: 'muted' }, ' · ', t('contest_took', { n: num(rel.took_part) })) : null),
        h('td', {}, x.signed && !(rel && rel.open) ? h('button', { type: 'button', class: 'btn', onClick: () => contestAct('open', x, c) }, t('open_to_class')) : null,
          rel && rel.open ? h('button', { type: 'button', class: 'btn', onClick: () => contestAct('close', x, c) }, t('close_class')) : null));
    })))),
    x.signed ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: () => contestAct('all', x, null) }, t('all_classes'))) : null);
  const note = (n) => h('li', { class: 'stack-sm' }, h('b', { dir: 'auto' }, title(n.title, n.lesson)),
    h('small', {}, L.join([n.step ? t('step', { n: num(n.step) }) : t('step0'), n.role ? L.word('role', n.role) : null, n.chips.join(comma()), L.date(n.at)])),
    n.text ? h('span', { dir: 'auto' }, n.text) : null);
  const mark = async (x, status) => {
    try { await api('/wishes', { method: 'POST', body: { wkey: x.wkey, status } }); } catch (e) { failed(e); }
    drawContent();
  };
  const wish = (x) => h('li', { class: 'row wrap wish' }, h('span', { class: 'grow', dir: 'auto' }, x.text),
    h('small', { class: 'muted' }, L.join([t('asked', { n: num(x.count) }), bandList(x.bands), x.cohorts.join(comma()), t('first_seen', { d: L.date(x.first_day) })])),
    h('div', { class: 'chips', role: 'group' }, ['planned', 'not_for_qalam', 'new'].map((st) => h('button', { type: 'button',
      class: 'chip' + (x.status === st ? ' on' : ''), 'aria-pressed': String(x.status === st), onClick: () => mark(x, st) }, t(st)))));
  frame(h('h2', {}, t('packs')),
    h('p', { class: 'lead-line' }, h('b', {}, t('packs_ready', { a: num(d.packs.filter((p) => p.publishable).length), b: num(d.packs.length) }))),
    d.packs.map(pack),
    (d.contests || []).length ? [h('h2', {}, t('contests')), d.contests.map(contest)] : null,
    h('h2', {}, t('notes')), d.notes.length ? h('ul', { class: 'plain card' }, d.notes.map(note)) : h('p', { class: 'empty' }, t('no_notes')),
    h('h2', {}, t('wishlist')), w.wishes.length ? h('ul', { class: 'plain card' }, w.wishes.map(wish)) : h('p', { class: 'empty' }, t('no_wishes')));
}

// --- AI spend: fourteen days of bars a cohort, warm at 80% of the cap ---

async function drawSpend() {
  let d;
  try { d = await api('/spend'); } catch (e) { return failed(e); }
  const one = (c) => {
    const top = Math.max(1, c.cap || 0, ...c.days.map((x) => x.tokens));
    const purposes = Object.entries(c.by_purpose).map(([k, n]) => `${L.word('admin.purpose', k)} ${num(n)}`).join(comma());
    return h('section', { class: 'card stack' },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow', dir: 'auto' }, L.cohort(c.label)),
        c.today.warn ? h('span', { class: 'tag warm' }, t('of_cap', { p: L.pct(c.today.pct) })) : null,
        c.ai ? null : h('span', { class: 'tag bad' }, t('ai_off'))),
      h('div', { class: 'days14', role: 'img', 'aria-label': t('days14') }, c.days.map((x) => h('span', {
        title: `${L.date(x.day)}: ${num(x.tokens)}`, style: `height:${Math.max(2, Math.round((100 * x.tokens) / top))}%` }))),
      h('small', {}, L.join([`${num(c.today.tokens)} / ${c.cap === null ? t('no_cap') : num(c.cap)}`, t('est', { c: money(c.cost_micro) }), t('days14'),
        t('held', { n: num(c.days.reduce((a, x) => a + x.held, 0)) }), purposes ? t('by_purpose', { x: purposes }) : t('no_spend')])));
  };
  frame(h('h2', {}, t('spend')), d.cohorts.length ? d.cohorts.map(one) : h('p', { class: 'empty' }, t('no_spend')), prices(d));
}

// the AI price table (empty by default, so the estimate is $0 until a price is typed): dollars per million tokens
function prices(d) {
  const sel = h('select', { 'aria-label': t('provider') }, (d.providers || []).map((p) => h('option', { value: p }, p)));
  const model = h('input', { maxlength: 80, autocomplete: 'off', dir: 'ltr', placeholder: t('any_model'), 'aria-label': t('model') });
  const pin = h('input', { type: 'number', min: 0, step: 'any', dir: 'ltr', 'aria-label': t('usd_in') });
  const pout = h('input', { type: 'number', min: 0, step: 'any', dir: 'ltr', 'aria-label': t('usd_out') });
  const save = async (body) => {
    try { await api('/prices', { method: 'POST', body }); toast(t('saved')); drawSpend(); } catch (e) { failed(e); }
  };
  const row = (x) => h('li', { class: 'row wrap' }, h('span', { class: 'grow' }, m(`${x.provider} ${x.model || '*'}`),
    ' ', `$${x.usd_in} / $${x.usd_out}`),
  h('button', { type: 'button', class: 'btn', onClick: () => save({ provider: x.provider, model: x.model, usd_in: null, usd_out: null }) }, t('remove')));
  const add = (e) => {
    e.preventDefault();
    if (pin.value === '' || pout.value === '') return;
    save({ provider: sel.value, model: model.value.trim(), usd_in: Number(L.latin(pin.value)), usd_out: Number(L.latin(pout.value)) });
  };
  return h('section', { class: 'card stack' }, h('h3', {}, t('prices')), h('small', { class: 'muted' }, t('prices_what')),
    d.prices && d.prices.length ? h('ul', { class: 'plain' }, d.prices.map(row)) : h('p', { class: 'empty' }, t('no_prices')),
    h('form', { class: 'stack', onSubmit: add }, h('label', {}, t('provider')), sel, h('label', {}, t('model')), model,
      h('label', {}, t('usd_in')), pin, h('label', {}, t('usd_out')), pout, h('button', { class: 'btn primary', type: 'submit' }, t('save'))));
}

// the Log's fixed word in the page's words; an unknown one as it is
const whatWord = (w) => L.word('log', w);
// a setting's value as the hub logs it ("unset", "on", "300000", "template 1a2b3c4d") in the reader's words
const logValue = (v) => (v === 'unset' ? t('common.unset') : v === 'on' || v === 'True' ? t('common.on') : v === 'off' || v === 'False' ? t('common.off')
  : /^template [0-9a-f]{8}$/.test(v) ? t('log.template') : /^-?\d+(\.\d+)?$/.test(v) ? num(Number(v))
    : L.has('admin.m_' + v) ? t('admin.m_' + v) : L.has('admin.p_' + v) ? t('admin.p_' + v) : L.has('maturity.' + v) ? t('maturity.' + v) : L.digits(v));
// the Log's detail line through t() and num() (the chair's look, C5.B3): the hub writes it in English, in a few fixed
// shapes, and the page reads those shapes; anything else shows as the hub wrote it
function detailLine(what, detail) {
  const d = String(detail || '');
  let x;
  if (what === 'cohort.kill') {
    const k = { 'AI on': 'ai_on', 'AI off': 'ai_off', 'school day and bells on': 'day_on', 'school day and bells off': 'day_off' }[d];
    return k ? t('log.' + k) : d;
  }
  if (what === 'cohort.new' && (x = /^(.+) \(([a-z0-9, ]+); ([a-z, ]+)\)$/.exec(d))) {
    return `${x[1]} (${L.join([bandList(x[2].split(', ')), langList(x[3].split(', '))])})`;
  }
  if (what === 'cohort.code') return t(d.includes('(') ? 'log.code_again' : 'log.code');
  if (what === 'cohort.settings') {
    return L.join(d.split('; ').map((part) => ((x = /^(\S+) (.+?) -> (.+)$/.exec(part))
      ? `${L.word('setting', x[1])}: ${logValue(x[2])} → ${logValue(x[3])}` : part)));
  }
  if (what === 'module' && (x = /^(\S+) (on|off)(?: \((.*)\))?$/.exec(d))) {
    const extra = x[3] ? x[3].split(', ').map((kv) => { const i = kv.indexOf(' '); return i < 0 ? kv : `${L.word('setting', kv.slice(0, i))} ${logValue(kv.slice(i + 1))}`; }) : [];
    return `${modName(x[1])}: ${t('common.' + x[2])}` + (extra.length ? ` (${extra.join(comma())})` : '');
  }
  if (what === 'teacher.lock_code' && (x = /^a lock reset code for (.+)$/.exec(d))) return t('log.lock_code', { a: x[1] });
  if (what === 'teacher.return_code' && (x = /^a return code for (.+)$/.exec(d))) return t('log.return_code', { a: x[1] });
  if (what === 'wish' && (x = /^a wish marked (.+)$/.exec(d))) return t('log.wish_marked', { s: L.t('admin.' + x[1].replace(/ /g, '_'), {}, x[1]).toLowerCase() });
  if (what === 'rollback' && (x = /^(\S+) back to (\S+) \((\w+)\)$/.exec(d))) return t('log.back_to', { p: x[1], v: x[2] });
  if (what === 'release' && (x = /^contest:(\S+) (open|closed) \((\w+)\)$/.exec(d))) return t('log.contest_' + x[2], { p: x[1] });
  if (what === 'prices' && (x = /^(.+): removed$/.exec(d))) return t('log.removed', { x: x[1] });
  if ((what === 'staff.add' || what === 'staff.remove') && (x = /^(.+) \((.+)\)$/.exec(d))) return `${x[1]} (${L.word('role', x[2])})`;
  return d;
}

// --- Safety: counts only ---

async function drawSafety() {
  let d;
  try { d = await api('/safety'); } catch (e) { return failed(e); }
  const sum = (c, k) => c.days.reduce((a, x) => a + x[k], 0);
  const one = (c) => h('section', { class: 'card stack' }, h('h3', { dir: 'auto' }, L.cohort(c.label)),
    // totals over 14 days with today's number beside each (C4 look question 31)
    h('div', { class: 'stats four' }, d.kinds.map((k) => h('div', { class: 'stat' }, h('b', {}, num(sum(c, k))),
      h('small', {}, L.join([t(k), t('today_n', { n: num((c.days[c.days.length - 1] || {})[k] || 0) })])))),
      h('div', { class: 'stat' }, h('b', {}, num(c.drops.leak + c.drops.maths)), h('small', {}, `${t('leak')} / ${t('maths')}`))),
    h('small', {}, L.join([t('days14'), c.oldest_held_hours === null ? t('no_held') : t('oldest', { n: num(c.oldest_held_hours) })])),
    c.disputes.length ? h('p', { class: 'small' }, `${t('disputes')}: `, c.disputes.map((x) => [m(x.item), ` ${fa(x.n)}  `])) : null);
  frame(h('h2', {}, t('safety')), h('p', { class: 'muted' }, t('counts_only')),
    d.cohorts.length ? d.cohorts.map(one) : h('p', { class: 'empty' }, t('no_safety')));
}

// --- Staff: labels, roles and cohorts; an email only to add someone ---

async function drawStaff() {
  if (!me.staff) return frame(h('h2', {}, t('staff')), h('p', { class: 'empty' }, t('staff_hub')));
  let d;
  let cs;
  try { [d, cs] = await Promise.all([api('/staff'), api('/cohorts')]); } catch (e) { return failed(e); }
  const remove = async (s) => {
    if (!(await ask(t('remove_q', { l: s.label }), [], [[t('remove'), true]], null, { safe: true }))) return;
    try { await api('/staff/' + s.id, { method: 'DELETE' }); toast(t('saved')); } catch (e) { failed(e); }
    drawStaff();
  };
  const email = h('input', { class: 'ainput', type: 'email', autocomplete: 'off', 'aria-label': t('email'), dir: 'ltr' });
  const label = h('input', { class: 'ainput', maxlength: 40, autocomplete: 'off', 'aria-label': t('label') });
  const role = h('select', { 'aria-label': t('role') }, d.roles.map((r) => h('option', { value: r }, L.word('role', r))));
  const initials = h('input', { class: 'ainput', maxlength: 4, autocomplete: 'off', 'aria-label': t('initials'), dir: 'ltr' });
  const cohorts = ticks(t('cohorts'), cs.cohorts.map((c) => c.id), [], (id) => L.cohort(cs.cohorts.find((c) => c.id === id).label));
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
  // "No class yet" for a teacher without one, nothing for other roles; roles in words (C5.B3 item 6)
  const classes = (s) => (s.cohorts.length ? s.cohorts.map((c) => L.cohort(c.label)).join(comma())
    : s.role === 'teacher' ? h('span', { class: 'tag warm' }, t('no_class')) : '');
  frame(h('h2', {}, t('staff')),
    h('div', { class: 'atable' }, h('table', {}, h('tbody', {}, d.staff.map((s) => h('tr', {},
      h('td', {}, h('b', { dir: 'auto' }, s.label)), h('td', {}, L.word('role', s.role)), h('td', { dir: 'auto' }, classes(s)),
      h('td', {}, s.initials ? m(s.initials) : ''), h('td', {}, h('small', { class: 'muted' }, t('added', { d: L.date(s.added) }))),
      h('td', {}, h('button', { type: 'button', class: 'chip', onClick: () => remove(s) }, t('remove')))))))),
    d.staff.length < 2 ? h('p', { class: 'empty' }, t('no_staff')) : null,
    h('form', { class: 'card stack', onSubmit: add }, h('h3', {}, t('add_staff')), h('p', { class: 'small' }, t('also_access')),
      h('label', {}, t('email')), email,
      h('small', { class: 'muted' }, t('email_note')), h('label', {}, t('label')), label, h('label', {}, t('role')), role,
      h('label', {}, t('initials')), initials, cohorts, h('button', { type: 'submit', class: 'btn primary' }, t('add_staff'))));
}

// --- Log: every change, newest first ---

async function drawLog(cohort = '') {
  let d;
  let cs;
  try { [d, cs] = await Promise.all([api('/log' + (cohort ? '?cohort=' + encodeURIComponent(cohort) : '')), api('/cohorts')]); } catch (e) { return failed(e); }
  const pick = h('select', { 'aria-label': t('cohorts'), onChange: (e) => drawLog(e.target.value) },
    h('option', { value: '' }, t('every')), cs.cohorts.map((c) => h('option', { value: c.id, selected: c.id === cohort }, L.cohort(c.label))));
  frame(h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, t('log')), pick),
    d.log.length ? h('div', { class: 'atable' }, h('table', {}, h('thead', {}, h('tr', {}, [t('when'), t('h_label'), t('what'), t('detail'), t('who')]
      .map((x) => h('th', {}, x)))),
    h('tbody', {}, d.log.map((x) => h('tr', {}, h('td', { class: 'nowrap' }, L.when(x.at)), h('td', { dir: 'auto' }, x.cohort),
      h('td', {}, whatWord(x.what)), h('td', { dir: 'auto' }, detailLine(x.what, x.detail)), h('td', { dir: 'auto' }, byWord(x.by)))))))
      : h('p', { class: 'empty' }, t('no_log')));
}

window.addEventListener('online', () => draw());
window.addEventListener('offline', () => say(t('connect')));
L.useLang(L.firstLang(), { keep: false }).then(start);
