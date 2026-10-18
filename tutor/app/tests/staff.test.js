// The staff pages' language layer (P33, C5.1): the three string files, the language kept in this browser, Persian
// digits, money, "، " between items, and the Solar Hijri day against the table cert.py's test reads too.
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

const L = await import('../js/staff/lang.js');
const en = (await import('../js/staff/strings/en.js')).default;
const prs = await import('../js/staff/strings/prs.js');
const ps = await import('../js/staff/strings/ps.js');
const TABLE = JSON.parse(readFileSync(new URL('../../hub/tests/hijri_dates.json', import.meta.url), 'utf8')).days;

test('every Dari and Pashto key is an English key, and the drafts say they are drafts', () => {
  for (const f of [prs, ps]) {
    for (const k of Object.keys(f.default)) assert.ok(k in en, k);
    assert.equal(f.meta.checked, false);
    assert.equal(f.meta.dir, 'rtl');
  }
});

test('the first language: kept in this browser, else the browser\'s, else English', () => {
  store.clear();
  assert.equal(L.firstLang({ languages: ['fa-AF', 'en'] }), 'prs');
  assert.equal(L.firstLang({ languages: ['prs'] }), 'prs');
  assert.equal(L.firstLang({ languages: ['ps-AF'] }), 'ps');
  assert.equal(L.firstLang({ languages: ['de', 'en-GB'] }), 'en');
  assert.equal(L.firstLang({ languages: ['de'] }), 'en');
  store.set('qalam.staff.lang', 'ps');
  assert.equal(L.firstLang({ languages: ['en'] }), 'ps');
  store.set('qalam.staff.lang', 'xx');
  assert.equal(L.firstLang({ languages: ['en'] }), 'en');
});

test('a language is loaded, kept, and falls back to English for a missing key, never to the key', async () => {
  store.clear();
  assert.equal(await L.useLang('ps'), 'ps');
  assert.equal(store.get('qalam.staff.lang'), 'ps');
  assert.equal(L.t('common.sign_out'), 'وتل');
  L.addTable('ps', { ...ps.default, 'common.sign_out': undefined }, ps.meta);
  delete L.table('ps')['common.sign_out'];
  assert.equal(L.t('common.sign_out'), 'Sign out');
  assert.equal(L.word('module', 'no-such-module'), 'no-such-module');
  assert.equal(L.t('admin.learners', { n: L.num(8) }), '۸ زده کوونکي');
  assert.ok(L.draft());
  await L.useLang('en', { keep: false });
  assert.equal(store.get('qalam.staff.lang'), 'ps');
  assert.ok(!L.draft());
  await L.useLang('nope', { keep: false });
  assert.equal(L.lang(), 'en');
});

test('numbers, money and lists follow the reader; codes are left alone', async () => {
  await L.useLang('prs', { keep: false });
  assert.equal(L.num(200000), '۲۰۰٬۰۰۰');
  assert.equal(L.num(0.5), '۰٫۵');
  assert.equal(L.pct(42), '۴۲٪');
  assert.equal(L.money(420000), '۰٫۴۲ دالر');
  assert.equal(L.join(['۸ شاگرد', 'دری']), '۸ شاگرد، دری');
  assert.equal(L.and(['دری', 'پښتو', 'انگلیسی']), 'دری، پښتو و انگلیسی');
  assert.equal(L.t('admin.publish_q', { p: 'Pack', v: '1.2.0', c: 'x' }), 'Pack 1.2.0 در x نشر شود؟');
  assert.equal(L.latin('۱۲۳٤٥6'), '123456');
  await L.useLang('ps', { keep: false });
  assert.equal(L.money(420000), '۰٫۴۲ ډالر');
  await L.useLang('en', { keep: false });
  assert.equal(L.num(200000), '200,000');
  assert.equal(L.money(420000), '$0.42');
  assert.equal(L.join(['8 learners', 'Dari']), '8 learners · Dari');
  assert.equal(L.and(['Dari', 'Pashto', 'English']), 'Dari, Pashto and English');
});

test('the Solar Hijri day: the 25 known days', () => {
  assert.equal(TABLE.length, 25);
  for (const row of TABLE) {
    const [y, m, d] = row.gregorian.split('-').map(Number);
    assert.deepEqual(L.hijri(y, m, d), row.hijri, row.gregorian);
  }
  assert.deepEqual(L.hijri(2026, 10, 17), [1405, 7, 25]);
  assert.deepEqual(L.hijri(2025, 3, 20), [1403, 12, 30]);
});

test('dates: Gregorian in English, Solar Hijri with the certificate\'s month names in Dari and Pashto', async () => {
  await L.useLang('en', { keep: false });
  assert.equal(L.date('2026-10-17'), '17 Oct 2026');
  await L.useLang('prs', { keep: false });
  assert.equal(L.date('2026-10-17'), '۲۵ میزان ۱۴۰۵');
  await L.useLang('ps', { keep: false });
  assert.equal(L.date('2026-10-17'), '۲۵ تله ۱۴۰۵');
  assert.equal(L.date('2027-03-21'), '۱ وری ۱۴۰۶');
  const now = new Date(2026, 9, 17, 18, 0);
  const at = new Date(2026, 9, 17, 14, 30).toISOString();
  assert.equal(L.when(at, 'ps', now), 'نن، ۱۴:۳۰');
  await L.useLang('en', { keep: false });
  assert.equal(L.when(new Date(2026, 9, 16, 9, 5).toISOString(), 'en', now), 'yesterday, 09:05');
  assert.equal(L.when(new Date(2026, 9, 1, 9, 5).toISOString(), 'en', now), '1 Oct 2026, 09:05');
});
