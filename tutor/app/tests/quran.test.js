// The Quran reader's search (P29, C4.7): code only, never a model. A surah's number or "surah:verse" in either digit
// set, its name as Tanzil writes it (Arabic or transliterated), or an exact word of the translation among the surahs on
// the phone; and the reader's last place kept on the phone. No verse is typed here: the names come from Tanzil's
// metadata file, and the word search runs on made-up text.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const Q = await import('../js/quran.js');
const state = await import('../js/state.js');

const xml = readFileSync(new URL('../../content/quran/tanzil-data.xml', import.meta.url), 'utf8');
const surahs = [...xml.matchAll(/<sura index="(\d+)" ayas="(\d+)" start="\d+" name="([^"]+)" tname="([^"]+)"/g)]
  .map((m) => ({ n: +m[1], ayas: +m[2], ar: m[3], tname: m[4] }));
const idx = { surahs, langs: ['prs', 'ps'] };

test("a number, or surah:verse in either digit set, finds it; one out of range finds nothing", () => {
  assert.equal(surahs.length, 114);
  assert.deepEqual(Q.parseQuery('112', idx), { kind: 'surah', n: 112 });
  assert.deepEqual(Q.parseQuery('۱۱۲', idx), { kind: 'surah', n: 112 });
  assert.deepEqual(Q.parseQuery('2:255', idx), { kind: 'verse', s: 2, a: 255 });
  assert.deepEqual(Q.parseQuery('۲:۲۵۵', idx), { kind: 'verse', s: 2, a: 255 });
  assert.deepEqual(Q.parseQuery('٢ : ٢٥٥', idx), { kind: 'verse', s: 2, a: 255 });
  assert.equal(Q.parseQuery('1:8', idx), null);
  assert.equal(Q.parseQuery('115', idx), null);
  assert.equal(Q.parseQuery('0', idx), null);
});

test("a surah's name finds it, in Tanzil's Arabic, without its article, or transliterated", () => {
  const n = (t) => (Q.parseQuery(t, idx) || {}).n;
  assert.equal(n(surahs[0].ar), 1);
  assert.equal(n(surahs[66].ar.replace(/^ال/, '')), 67);
  assert.equal(n(surahs[0].ar.replace('ة', 'ه')), 1);            // as Dari writes its ending
  assert.equal(n('Al-Faatiha'), 1);
  assert.equal(n('fatiha'), 1);
  assert.equal(n('yasin'), undefined);                           // not Tanzil's spelling ("Yaseen"): a word search
  assert.equal(n('yaseen'), 36);
});

test('a single word searches the translations on the phone, an exact word only', () => {
  const docs = [{ n: 5, ar: 'x', verses: [{ a: 1, tr: { prs: { t: 'کتابها را بخوانید' } } }, { a: 2, tr: { prs: { t: 'کتابی دیگر' } } }] }];
  assert.deepEqual(Q.parseQuery('بخوانید', idx), { kind: 'word', w: Q.fold('بخوانید') });
  assert.deepEqual(Q.findWord(Q.fold('بخوانید'), docs, 'prs').map((x) => x.a), [1]);
  assert.deepEqual(Q.findWord(Q.fold('کتاب'), docs, 'prs'), []);   // "کتابی" is not "کتاب"
  assert.equal(Q.parseQuery('two words', idx), null);
});

test("the translation shown is hers where the set has it, else Dari", () => {
  assert.equal(Q.trLang(idx, 'ps'), 'ps');
  assert.equal(Q.trLang(idx, 'en'), 'prs');
  assert.equal(Q.trLang({ langs: [] }, 'en'), null);
});

test('her last place is kept on the phone, only as [surah, verse]', () => {
  const c = state.addChild({ band: 's2', year: 10, lang: 'prs' });
  assert.deepEqual(state.updateChild(c.id, { quran: [67, 5] }).quran, [67, 5]);
  assert.equal(state.updateChild(c.id, { quran: [115, 1] }).quran, undefined);
  assert.equal(state.updateChild(c.id, { quran: 'x' }).quran, undefined);
});
