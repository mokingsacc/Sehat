#!/usr/bin/env node
// Test the offline symptom finder (js/search.js) on tools/search-tests.json and print top-1 / top-3 accuracy.
// Usage: node tools/search_eval.mjs [--verbose] [--no-auto]
// Uses content/book.json, with the phrases taken fresh from content/src/search-phrases.json (no build needed).
// Three sets: "core" (written with the phrase list), "hard" (written afterwards without looking at the phrases:
// longer sentences, other word orders, family words, typos; later used for tuning) and "fresh" (written last, after
// all tuning; first run: top-1 83.2%, top-3 96.0%). New phrases should be tested with a new untouched set.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch } from '../js/search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const book = load('content/book.json');
book.search = load('content/src/search-phrases.json');
const verbose = process.argv.includes('--verbose');
const S = createSearch(book, { auto: !process.argv.includes('--no-auto') });
for (const lg of ['fa', 'ps', 'en']) S.warm(lg);

const tests = load('tools/search-tests.json').tests;
const sets = {}, times = [];
for (const t of tests) {
  const k = t.set || 'core';
  const R = (sets[k] ||= { n: 0, top1: 0, top3: 0, dN: 0, dOk: 0, falseD: 0, none: 0, noneOk: 0, fails: [] });
  const t0 = performance.now();
  const r = S.rank(t.q, t.lang);
  times.push(performance.now() - t0);
  const ids = r.map((x) => x.id), show = r.slice(0, 3).map((x) => `${x.id}${x.danger ? '!' : ''}:${x.score.toFixed(1)}`);
  R.n++;
  if (t.want === null) {
    R.none++;
    if (!ids.length) { R.top1++; R.top3++; R.noneOk++; } else R.fails.push({ ...t, got: show });
    continue;
  }
  const ok1 = ids[0] === t.want, ok3 = ids.slice(0, 3).includes(t.want);
  R.top1 += ok1; R.top3 += ok3;
  if (t.danger) { R.dN++; if (ok1 && r[0].danger) R.dOk++; else if (ok1) R.fails.push({ ...t, got: ['(right page, no red badge)'] }); }
  else if (r[0] && r[0].danger && !ok1) R.falseD++;
  if (!ok1) R.fails.push({ ...t, got: show });
  else if (verbose) console.log('ok  ', t.q, '→', show.join('  '));
}
const pct = (x, d) => (100 * x / d).toFixed(1) + '%';
for (const [k, R] of Object.entries(sets)) {
  for (const f of R.fails) console.log(`MISS[${k}]`, JSON.stringify(f.q), `(${f.lang}) want ${f.want} got`, f.got.join('  ') || '(nothing)');
}
console.log('');
for (const [k, R] of Object.entries(sets)) {
  console.log(`${k}: ${R.n} queries: top-1 ${pct(R.top1, R.n)} (${R.top1}), top-3 ${pct(R.top3, R.n)} (${R.top3}); ` +
    `danger page first with red badge ${R.dOk}/${R.dN}; a wrong page first with a red badge ${R.falseD}; "nothing found" right ${R.noneOk}/${R.none}`);
}
times.sort((a, b) => a - b);
console.log(`rank() per query in Node (no throttling): median ${times[times.length >> 1].toFixed(2)} ms, 95th ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`);
