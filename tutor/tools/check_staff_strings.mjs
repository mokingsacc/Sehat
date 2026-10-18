// The staff pages' string files (P33, C5.1): app/js/staff/strings/en.js, prs.js, ps.js. Run from tutor/:
//   node tools/check_staff_strings.mjs
// Fails (exit code 1) on:
//   - a key in Dari or Pashto that English does not have (English is every key's fallback);
//   - a module id in modules/*/module.json without `module.<id>` and `module.<id>.what` in English;
//   - a refusal code the server emits (refuse(status, "code", ...) in hub/tutor_hub/) without `error.<code>`;
//   - a key a staff page asks for by name (t('...') in admin.js, teacher.js, review.js) that English does not have;
//   - a file that is not a module with a default object and a `meta`;
//   - hard-coded English on a staff page: a string in admin.js, teacher.js, review.js or lang.js (comments left
//     out) that the page shows (a child of h(), a textContent, a title, placeholder, alt or aria-label) with Latin
//     words in it instead of asking t() for them, so a Dari or Pashto reader would see English. A string of Latin
//     words that starts with a capital, or holds two Latin words, counts; codes and the few names in NAMES_OK do not.
// Reports, without failing: the keys each language still lacks, a middle dot right after a digit or a {placeholder}
// in Dari or Pashto (P10: it reads as a zero there; join() writes "، "), and Latin digits inside Dari or Pashto
// strings (t() shows them in Persian shapes, but a native reader should see the string as it shows).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const STR = join(ROOT, 'app/js/staff/strings');
const fail = [];
const note = [];

const files = {};
for (const l of ['en', 'prs', 'ps']) {
  const mod = await import(pathToFileURL(join(STR, `${l}.js`)).href);
  if (!mod.default || typeof mod.default !== 'object' || !mod.meta) fail.push(`${l}.js: needs export default {...} and export const meta`);
  files[l] = mod.default || {};
  for (const [k, v] of Object.entries(files[l])) if (typeof v !== 'string') fail.push(`${l}.js: ${k} is not a string`);
}
const en = files.en;

for (const l of ['prs', 'ps']) {
  const t = files[l];
  for (const k of Object.keys(t)) if (!(k in en)) fail.push(`${l}.js has ${k}, which English does not`);
  const lacks = Object.keys(en).filter((k) => !(k in t));
  if (lacks.length) note.push(`${l}.js lacks ${lacks.length} key(s) (English shows): ${lacks.slice(0, 12).join(', ')}${lacks.length > 12 ? ', …' : ''}`);
  for (const [k, v] of Object.entries(t)) {
    if (/([0-9۰-۹]|\{\w+\})\s*·/.test(v)) note.push(`${l}.js ${k}: a middle dot after a number reads as a zero ("${v}")`);
    if (/[0-9]/.test(v.replace(/\{\w+\}/g, ''))) note.push(`${l}.js ${k}: Latin digits ("${v}")`);
  }
}

// every module has its name and its line
const mods = join(ROOT, 'modules');
for (const d of readdirSync(mods)) {
  const f = join(mods, d, 'module.json');
  if (!existsSync(f)) continue;
  const id = JSON.parse(readFileSync(f, 'utf8')).id;
  for (const k of [`module.${id}`, `module.${id}.what`]) if (!(k in en)) fail.push(`en.js lacks ${k} (modules/${d}/module.json)`);
}

// every refusal code the server emits has its sentence
const hub = join(ROOT, 'hub/tutor_hub');
const pyFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pyFiles(join(dir, e.name))
  : e.name.endsWith('.py') ? [join(dir, e.name)] : []));
const codes = new Set();
for (const f of pyFiles(hub)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/refuse\(\s*\d{3}\s*,\s*"([a-z_]+)"/g)) codes.add(m[1]);
  for (const m of readFileSync(f, 'utf8').matchAll(/"code"\s*:\s*"([a-z_]+)"/g)) codes.add(m[1]);
}
for (const c of codes) if (!(`error.${c}` in en)) fail.push(`en.js lacks error.${c} (a code the server emits)`);

// every key a page names literally
const PAGES = { admin: 'app/js/admin/admin.js', teacher: 'app/js/teacher/teacher.js', review: 'app/js/review/review.js' };
for (const [scope, f] of Object.entries(PAGES)) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\bt\('([A-Za-z0-9_.\- ]+)'/g)) {
    const k = m[1];
    if (k.endsWith('.') || k.endsWith('_')) continue;            // a prefix the page completes ('band.' + id)
    const ok = k.includes('.') ? k in en : `${scope}.${k}` in en || `common.${k}` in en;
    if (!ok) fail.push(`${f} asks for ${k}, which en.js does not have`);
  }
}

// hard-coded English (C5.6 brief): what a page shows must come from the string files
const NAMES_OK = new Set(['Tanzil', 'Qalam', 'QuranEnc', 'PDF', 'QR', 'PIN', 'AI', 'OK', 'English', 'Gemini']);
const KEYS_OK = /^(Enter|Escape|Tab|Backspace|Arrow(Up|Down|Left|Right)|Home|End|True|False)$/;
function code(src) {          // the source with comments blanked, strings kept
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += d ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}
function english(text) {
  const words = (text.replace(/\$\{[^}]*\}/g, ' ').match(/[A-Za-z][A-Za-z’']+/g) || []).filter((w) => !NAMES_OK.has(w));
  if (!words.length || /[{};]/.test(text)) return false;                                // none, or CSS
  if (/^[A-Z][a-z]+(-[A-Z][a-z]+)+$/.test(text) || KEYS_OK.test(text)) return false;     // a header or key name
  if (/^[a-z0-9_.\-/: ]*$/.test(text) && !/ [a-z]+ /.test(text)) return false;          // ids, classes, paths, codes
  return /^[A-Z][a-z]/.test(words[0]) || words.length >= 2;
}
for (const f of [...Object.values(PAGES), 'app/js/staff/lang.js']) {
  const src = code(readFileSync(join(ROOT, f), 'utf8'));
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const before = src.slice(Math.max(0, m.index - 24), m.index);
    // only where a page shows it: a child of h() (after the attributes or another child), a text or a label
    const shown = /(\}|\bnull|\))\s*,\s*$|(textContent|innerText)\s*=\s*$|\b(title|placeholder|alt|'aria-label')\s*:\s*$/;
    if (!shown.test(before)) continue;
    if (english(m[2])) fail.push(`${f}: hard-coded English ${m[1]}${m[2].slice(0, 60)}${m[1]}: put it in the string files and ask t() for it`);
  }
}

for (const n of note) console.log('note:', n);
for (const f of fail) console.log('FAIL:', f);
console.log(`${Object.keys(en).length} keys; Dari ${Object.keys(files.prs).length}, Pashto ${Object.keys(files.ps).length}; ` +
  `${codes.size} refusal code(s); ${fail.length} failure(s), ${note.length} note(s)`);
process.exit(fail.length ? 1 : 0);
