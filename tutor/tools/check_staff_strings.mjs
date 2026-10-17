// The staff pages' string files (P33, C5.1): app/js/staff/strings/en.js, prs.js, ps.js. Run from tutor/:
//   node tools/check_staff_strings.mjs
// Fails (exit code 1) on:
//   - a key in Dari or Pashto that English does not have (English is every key's fallback);
//   - a module id in modules/*/module.json without `module.<id>` and `module.<id>.what` in English;
//   - a refusal code the server emits (refuse(status, "code", ...) in hub/tutor_hub/) without `error.<code>`;
//   - a key a staff page asks for by name (t('...') in admin.js, teacher.js, review.js) that English does not have;
//   - a file that is not a module with a default object and a `meta`.
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

for (const n of note) console.log('note:', n);
for (const f of fail) console.log('FAIL:', f);
console.log(`${Object.keys(en).length} keys; Dari ${Object.keys(files.prs).length}, Pashto ${Object.keys(files.ps).length}; ` +
  `${codes.size} refusal code(s); ${fail.length} failure(s), ${note.length} note(s)`);
process.exit(fail.length ? 1 : 0);
