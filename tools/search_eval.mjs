#!/usr/bin/env node
// Test the offline symptom finder (js/search.js) on tools/search-tests.json and print top-1 / top-3 accuracy.
// Usage: node tools/search_eval.mjs [--verbose] [--no-auto]
// Uses content/book.json, with the phrases taken fresh from content/src/search-phrases.json (no build needed).
// Results are filtered as the #/ask screen filters them (no Home-tab pages, kit pages only for device words).
// Three sets: "core" (written with the phrase list), "hard" (written afterwards without looking at the phrases:
// longer sentences, other word orders, family words, typos; later used for tuning) and "fresh" (written last, after
// all tuning; first run: top-1 83.2%, top-3 96.0%), and "new" (the topics added in content merge 2). New phrases
// should be tested with a new untouched set.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch } from '../js/search.js';
import { askPlan } from '../js/search-ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const book = load('content/book.json');
book.search = load('content/src/search-phrases.json');
const verbose = process.argv.includes('--verbose');
const S = createSearch(book, { auto: !process.argv.includes('--no-auto') });
for (const lg of ['fa', 'ps', 'en']) S.warm(lg);

// what #/ask shows (js/search-ui.js): the Home tab's pages are never results (Mo's rule), except the home health kit
// pages when the words are about a device; so a test wants what the screen shows, not a hidden Home-tab page
const home = new Set(), lists = (book.config && book.config.lists) || {};
for (const n of Object.keys(lists)) if (lists[n].tab === 'house' && !lists[n].advice) for (const t of (book.sections || {})[n] || []) home.add(t);
const KIT = (id) => id === 'kit' || /^kit-/.test(id);
function shown(res) {
  const lead = res.find((r) => !r.danger);
  const kitOk = !!(lead && (KIT(lead.id) || /^(tool\/reading|reading-)/.test(lead.id)));
  return res.filter((r) => (KIT(r.id) ? kitOk : !home.has(r.id)));
}

const tests = load('tools/search-tests.json').tests;
const sets = {}, times = [];
for (const t of tests) {
  const k = t.set || 'core';
  const R = (sets[k] ||= { n: 0, top1: 0, top3: 0, dN: 0, dOk: 0, falseD: 0, none: 0, noneOk: 0, fails: [] });
  const t0 = performance.now();
  const r = shown(S.rank(t.q, t.lang, { limit: 10 })).slice(0, 5);
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
  else if (t.danger === false && ok1 && r[0].danger) { R.fails.push({ ...t, got: ['(right page, but a red badge)'] }); R.top1--; continue; }
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
// the whole #/ask list: the pictures (as js/app.js findSymptoms picks them) in order with the pages (js/search-ui.js askPlan)
book.symptoms = load('content/src/symptoms.json').symptoms;
const DIG = '۰۱۲۳۴۵۶۷۸۹';
const pnorm = (x) => String(x || '').toLowerCase().replace(/[ً-ٰٟ‌‍ـ]/g, '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ۀ/g, 'ه')
  .replace(/[۰-۹]/g, (d) => DIG.indexOf(d)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function pictures(q) { // the same scoring as js/app.js findSymptoms
  const nq = ' ' + pnorm(q) + ' ', out = [];
  for (const s of book.symptoms) {
    let score = 0;
    for (const lg of ['fa', 'ps', 'en']) for (const w of s.words[lg] || []) {
      const nw = pnorm(w); if (!nw) continue;
      if (nq.includes(' ' + nw + ' ')) score += 3 + nw.length / 4; else if (nw.length >= 3 && nq.includes(nw)) score += 2;
    }
    if (score) out.push({ s, score });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.s).slice(0, 2).filter((s) => s.page);
}
const askCases = load('tools/search-tests.json').ask || [];
let askOk = 0;
for (const t of askCases) {
  const p = askPlan(shown(S.rank(t.q, t.lang, { limit: 10 })), pictures(t.q), t.q);
  const cards = [...(p.lead ? [{ id: p.lead.id, red: !!p.lead.danger }] : []), ...p.pics.map((x) => ({ id: 'sym:' + x.s.id, red: !x.calm })), ...p.rest.map((r) => ({ id: r.id, red: !!r.danger }))];
  const why = [];
  if ('first' in t && (cards[0] ? cards[0].id : null) !== t.first) why.push(`first ${cards[0] ? cards[0].id : null}`);
  if ('red' in t && cards[0] && cards[0].red !== t.red) why.push(`first card red=${cards[0].red}`);
  for (const id of t.pics || []) { const c = cards.find((x) => x.id === 'sym:' + id); if (!c) why.push(`no picture ${id}`); else if (!c.red) why.push(`picture ${id} not red`); }
  for (const id of t.notPics || []) if (cards.some((x) => x.id === 'sym:' + id)) why.push(`picture ${id} shown`);
  if (why.length) console.log('ASK-ORDER MISS', JSON.stringify(t.q), why.join('; '), '→', cards.map((c) => c.id + (c.red ? '!' : '')).join('  '));
  else { askOk++; if (verbose) console.log('ok   ', t.q, '→', cards.map((c) => c.id + (c.red ? '!' : '')).join('  ')); }
}
if (askCases.length) console.log(`ask order (pictures and pages on #/ask): ${askOk}/${askCases.length} right`);
times.sort((a, b) => a - b);
console.log(`rank() per query in Node (no throttling): median ${times[times.length >> 1].toFixed(2)} ms, 95th ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`);
