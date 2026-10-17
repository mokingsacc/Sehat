// The staff pages' language layer (P33, C5.1): one string file per language in ./strings/, shared by /admin/,
// /teacher/ and /review/. English is imported here and is the fallback for every key; Dari and Pashto load when
// picked (a failed load keeps English and says nothing). The choice is this browser's, never a staff row:
// localStorage `qalam.staff.lang`, else the browser's languages (fa or prs: Dari; ps: Pashto; else English).
// Numbers, money and dates follow the reader: Persian digits and Solar Hijri dates in Dari and Pashto, Latin digits
// and Gregorian dates in English. Codes, PINs, versions and hashes never convert: the pages put them in m().
// Adding a language later is one file in ./strings/ and one entry in LANGS.

import en from './strings/en.js';

export const LANGS = ['en', 'prs', 'ps'];
export const NAMES = { en: 'English', prs: 'دری', ps: 'پښتو' };
const KEY = 'qalam.staff.lang';
const FA = '۰۱۲۳۴۵۶۷۸۹';
const tables = { en };
const metas = { en: { checked: true } };
let cur = 'en';

export const lang = () => cur;
export const rtl = (l = cur) => l !== 'en';
export const htmlLang = (l = cur) => (l === 'en' ? 'en' : l === 'ps' ? 'ps-AF' : 'fa-AF');
// a draft translation until a native speaker signs the file (meta.checked, with their initials)
export const draft = (l = cur) => !(metas[l] && metas[l].checked);

// the language this browser keeps, else the first the browser names that we have
export function firstLang(nav = globalThis.navigator) {
  try {
    const kept = globalThis.localStorage && globalThis.localStorage.getItem(KEY);
    if (LANGS.includes(kept)) return kept;
  } catch { /* storage blocked */ }
  for (const x of (nav && (nav.languages || [nav.language])) || []) {
    const l = String(x || '').toLowerCase();
    if (/^(fa|prs)\b/.test(l)) return 'prs';
    if (/^ps\b/.test(l)) return 'ps';
    if (/^en\b/.test(l)) return 'en';
  }
  return 'en';
}

// load and use a language; `keep` writes it to this browser. Resolves to the language in use.
export async function useLang(l, { keep = true } = {}) {
  if (!LANGS.includes(l)) l = 'en';
  if (!tables[l]) {
    try {
      const mod = await import(`./strings/${l}.js`);
      tables[l] = mod.default;
      metas[l] = mod.meta || { checked: false };
    } catch { l = 'en'; }
  }
  cur = l;
  if (keep) {
    try { globalThis.localStorage && globalThis.localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  }
  if (globalThis.document) {
    globalThis.document.documentElement.lang = htmlLang(l);
    globalThis.document.documentElement.dir = rtl(l) ? 'rtl' : 'ltr';
  }
  return l;
}

// the tables themselves, for the tests and the CI check
export function table(l) { return tables[l]; }
export function addTable(l, t, meta) { tables[l] = t; metas[l] = meta || { checked: false }; }

// Persian digit shapes in Dari and Pashto; English keeps its own
export const digits = (x, l = cur) => (l === 'en' ? String(x) : String(x).replace(/[0-9]/g, (d) => FA[d]));
// what someone typed, in either digit set, as Latin digits (PINs, class codes, numbers in a form)
export const latin = (x) => String(x ?? '').replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g,
  (d) => String(d.charCodeAt(0) - 0x660));

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, x) => (v[x] ?? ''));

// the string for a key in the page's language, else English; `fallback` (or the key's English) when neither has it.
// Values are put in as given: numbers should come through num() so their digits follow the reader.
export function t(key, v = {}, fallback) {
  const s = tables[cur] && tables[cur][key];
  if (typeof s === 'string') return fill(digits(s), v);
  const e = en[key];
  if (typeof e === 'string') return fill(e, v);
  return fallback !== undefined ? String(fallback) : key;
}
// whether a key has a string (in English, which every key must have)
export const has = (key) => typeof en[key] === 'string';
// a word by id with the id as its fallback: a new module or code never breaks the page
export const word = (prefix, id) => t(`${prefix}.${id}`, {}, id);
// a class's label as staff see it: the seed classes' English labels ("Open", "Village hub", "Staging") in the
// reader's language (cohort.<label>); a label an admin typed shows as she typed it
export const cohort = (label) => (label ? t(`cohort.${label}`, {}, label) : '');

// 200000 -> "200,000" or "۲۰۰٬۰۰۰"; 0.5 -> "0.5" or "۰٫۵"
export function num(n, l = cur) {
  const x = Number(n || 0);
  const s = x.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return l === 'en' ? s : digits(s.replace(/,/g, '٬').replace(/\./g, '٫'), l);
}
export const pct = (n, l = cur) => (l === 'en' ? `${num(n, l)}%` : `${num(n, l)}٪`);
// micro-dollars -> "$0.42", "۰٫۴۲ دالر", "۰٫۴۲ ډالر"
export function money(micro, l = cur) {
  const x = (Number(micro || 0) / 1e6).toFixed(2);
  if (l === 'en') return `$${x}`;
  return t('common.money', { n: digits(x.replace('.', '٫'), l) });
}
// "a, b · c" in English, "a، b، c" in Dari and Pashto: no middle dot after a Persian digit (P10)
export const join = (xs, l = cur) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(l === 'en' ? ' · ' : '، ');
// "Dari, Pashto and English"
export function and(xs, l = cur) {
  const a = xs.filter(Boolean);
  if (a.length < 2) return a.join('');
  const comma = l === 'en' ? ', ' : '، ';
  return `${a.slice(0, -1).join(comma)}${t('common.and')}${a[a.length - 1]}`;
}

// --- dates: the server keeps ISO; the page shows the viewer's day in her calendar ---

const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;
// The Solar Hijri calendar as Afghanistan keeps it (Hamal first: six months of 31 days, five of 30, Hut 29 or 30),
// with the year's first day found by the known 33-year leap rules and their break years (the arithmetic that matches
// the astronomical calendar for these centuries). The Python copy is cert.py's hijri_date(); one table of known days
// (hub/tests/hijri_dates.json) tests both.
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
// the day of March on which Solar Hijri year jy begins
export function nowruz(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  const n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  return 20 + leapJ - leapG;
}
const dayNo = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
// a Gregorian day (year, month 1-12, day) -> [Solar Hijri year, month 1-12, day]
export function hijri(gy, gm, gd) {
  let jy = gy - 621;
  let start = dayNo(gy, 3, nowruz(jy));
  const at = dayNo(gy, gm, gd);
  if (at < start) { jy -= 1; start = dayNo(gy - 1, 3, nowruz(jy)); }
  const k = at - start;
  const m = k < 186 ? div(k, 31) : 6 + div(k - 186, 30);
  const d = k < 186 ? mod(k, 31) + 1 : mod(k - 186, 30) + 1;
  return [jy, m + 1, d];
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// an ISO string from the server (a day, or a moment; a moment with no zone is UTC) -> a Date, or null
function parse(iso) {
  if (!iso) return null;
  const s = String(iso);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(day ? `${s}T12:00:00Z` : /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
const pad = (n) => String(n).padStart(2, '0');
// "17 Oct 2026", "۲۵ میزان ۱۴۰۵", "۲۵ تله ۱۴۰۵"; `utc` for a day string, which has no time of its own
export function date(iso, l = cur) {
  const d = parse(iso);
  if (!d) return String(iso ?? '');
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(iso));
  const [y, m, dd] = dayOnly ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
    : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  if (l === 'en') return `${dd} ${EN_MONTHS[m - 1]} ${y}`;
  const [hy, hm, hd] = hijri(y, m, dd);
  return digits(`${hd} ${t('month.' + hm)} ${hy}`, l);
}
// "14:30" in the viewer's zone
export function time(iso, l = cur) {
  const d = parse(iso);
  return d ? digits(`${pad(d.getHours())}:${pad(d.getMinutes())}`, l) : '';
}
// "17 Oct 2026, 14:30"; the last two days as "today, 14:30" and "yesterday, 14:30"
export function when(iso, l = cur, now = new Date()) {
  const d = parse(iso);
  if (!d) return String(iso ?? '');
  const day = (x) => Math.floor((x.getTime() - x.getTimezoneOffset() * 6e4) / 864e5);
  const ago = day(now) - day(d);
  const head = ago === 0 ? t('common.today') : ago === 1 ? t('common.yesterday') : date(iso, l);
  return `${head}${l === 'en' ? ', ' : '، '}${time(iso, l)}`;
}

// the three-way language picker, as on Welcome (segmented, each name in its own script); `h` is the page's maker
export function picker(h, onPick) {
  return h('div', { class: 'langs staff-langs', role: 'group', 'aria-label': t('common.language') },
    LANGS.map((l) => h('button', { type: 'button', class: l === cur ? 'on' : '', lang: htmlLang(l), dir: rtl(l) ? 'rtl' : 'ltr',
      'aria-pressed': l === cur ? 'true' : 'false', onClick: async () => { if (l !== cur) { await useLang(l); onPick(l); } } },
    NAMES[l])));
}

// the footer line while the language's file is a draft
export function draftNote(h) {
  return draft() ? h('p', { class: 'staff-draft muted small' }, t('common.draft')) : null;
}
