// The school bag's core (W5, WEBSITE.md 3.5, 3.6 and 3.8; app/js/bag.js, app/js/stamps.js): the vendored crypto is
// the pinned release's; known answers for XChaCha20-Poly1305, PBKDF2, HKDF and the bag's own keys and seal (worked
// out independently with Python's OpenSSL); the code's check digit; the merge is commutative, associative and
// idempotent over random records, with clocks in 2010 and 2030; a newer app's fields are kept; a full record seals
// under 64 KB; every write on the phone is stamped, and two phones converge. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { createHash, hkdfSync, pbkdf2Sync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const stores = { a: new Map(), b: new Map(), c: new Map() };
let store = stores.a;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const bag = await import('../js/bag.js');
const stamps = await import('../js/stamps.js');
const state = await import('../js/state.js');
const { xchacha20poly1305 } = await import('../js/vendor/noble-ciphers/chacha.js');
const { pbkdf2 } = await import('../js/vendor/noble-hashes/pbkdf2.js');
const { hkdf } = await import('../js/vendor/noble-hashes/hkdf.js');
const { sha256 } = await import('../js/vendor/noble-hashes/sha2.js');

const APP = new URL('../', import.meta.url);
const hex = (b) => Buffer.from(b).toString('hex');
const bytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
const enc = new TextEncoder();

// the vendored crypto

test("the vendored crypto is the pinned releases' files (tools/vendor_noble.py; CI fetches and compares them)", () => {
  const m = JSON.parse(readFileSync(new URL('js/vendor/noble.json', APP), 'utf8'));
  assert.deepEqual(Object.keys(m.packages).sort(), ['@noble/ciphers', '@noble/hashes']);
  assert.equal(m.packages['@noble/ciphers'].version, '1.3.0');
  assert.equal(m.packages['@noble/hashes'].version, '1.8.0');
  for (const p of Object.values(m.packages)) {
    const dir = new URL(`js/vendor/${p.dir}/`, APP);
    assert.deepEqual(readdirSync(dir).sort(), Object.keys(p.files).sort());
    for (const [f, want] of Object.entries(p.files)) {
      assert.equal(createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex'), want, `${p.dir}/${f}`);
    }
  }
  // the one patched line: a bare import a browser cannot load
  const utils = readFileSync(new URL('js/vendor/noble-hashes/utils.js', APP), 'utf8');
  assert.match(utils, /from '\.\/crypto\.js';/);
  assert.doesNotMatch(utils, /@noble\/hashes\/crypto/);
});

test('the credits name the vendored code and its licence', () => {
  const credits = JSON.parse(readFileSync(new URL('credits.json', APP), 'utf8'));
  const names = credits.code.map((c) => `${c.name} ${c.licence}`);
  assert.ok(names.includes('@noble/ciphers 1.3.0 MIT License') && names.includes('@noble/hashes 1.8.0 MIT License'), names.join());
  for (const d of ['noble-ciphers', 'noble-hashes']) {
    assert.match(readFileSync(new URL(`js/vendor/${d}/LICENSE`, APP), 'utf8'), /MIT License/);
  }
});

// known answers

test('XChaCha20-Poly1305: the vector of draft-irtf-cfrg-xchacha-03, A.3.1', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => 0x80 + i);
  const iv = Uint8Array.from({ length: 24 }, (_, i) => 0x40 + i);
  const aad = bytes('50515253c0c1c2c3c4c5c6c7');
  const pt = enc.encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const ct = xchacha20poly1305(key, iv, aad).encrypt(pt);
  assert.equal(hex(ct), 'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb'
    + '731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452'
    + '2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9'
    + '21f9664c97637da9768812f615c68b13b52e' + 'c0875924c1c7987947deafd8780acf49');
  assert.deepEqual(xchacha20poly1305(key, iv, aad).decrypt(ct), pt);
});

test("PBKDF2 and HKDF over SHA-256 agree with OpenSSL's (RFC 7914 section 11, RFC 5869 case 1, and more)", () => {
  assert.equal(hex(pbkdf2(sha256, 'passwd', 'salt', { c: 1, dkLen: 64 })), '55ac046e56e3089fec1691c22544b605'
    + 'f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783');
  for (const [p, s, c] of [['3141592653589795', 'qalam-bag/1', 1000], ['', 'x', 3], ['۱۲', 'qalam-bag/1', 2]]) {
    assert.equal(hex(pbkdf2(sha256, p, s, { c, dkLen: 32 })), hex(pbkdf2Sync(p, s, c, 32, 'sha256')));
  }
  const ikm = bytes('0b'.repeat(22));
  const okm = hkdf(sha256, ikm, bytes('000102030405060708090a0b0c'), bytes('f0f1f2f3f4f5f6f7f8f9'), 42);
  assert.equal(hex(okm), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  assert.equal(hex(hkdf(sha256, ikm, undefined, enc.encode('seal'), 32)),
    hex(new Uint8Array(hkdfSync('sha256', ikm, new Uint8Array(32), enc.encode('seal'), 32))));
});

const CODE = '3141592653589795';
const KEYS = { k: 'f04d4023d24592f372ef56a671731c931d3bff07ab64ca7ed771042f42de903d',
  f: 'f9cab48c7e2d6f89c0f1d712f96e567cdca0bc2e7784a72ce4c19befb03b52b2',
  w: 'c8153151e7c6fd3877de92af242f4664ea88b80ac9cce7a0038499b3d3bc7bdb' };

test("the bag's keys for a code: the browser's PBKDF2 and the vendored one give the same, and each relay its own", async () => {
  assert.deepEqual(await bag.keys(CODE), KEYS);                         // crypto.subtle (a secure page)
  const slow = await bag.keys(CODE, { native: false });                 // the hub's plain http
  assert.deepEqual(slow, KEYS);
  assert.deepEqual(bag.forRelay(KEYS, '5e458b863963caa06450'), {
    f: '6f36a6d523dc079a47882825d2c8a5e3813522fcffb08da69771c25dad0562a4',
    w: 'cdd7c7d9d9265042e279594156b91df562a1b7194c2ac0fa3c60f485b94e1972' });
  assert.notEqual(bag.forRelay(KEYS, 'a1a1a1a1a1a1a1a1a1a1').f, bag.forRelay(KEYS, '5e458b863963caa06450').f);
  assert.equal(bag.ROUNDS, 100000);
});

test('the seal: a known blob, opened again; deflated where it can be; a wrong code, a changed byte or a swap refused', async () => {
  const rec = { v: 1, s: { lang: ['prs', '00000000a.000.0123abcd'] }, done: { 'maths-7-fractions-add': [3, 1760000000000] } };
  const nonce = Uint8Array.from({ length: 24 }, (_, i) => i);
  const blob = await bag.seal(rec, KEYS, { nonce, deflate: false });
  assert.equal(blob.length, 24 + 1024 + 16);
  assert.equal(createHash('sha256').update(blob).digest('hex'), 'dbc60ce7aaa67ab63fc9dfbf6426591b6f357a08e922a099638ab24a09d1ff8a');
  assert.deepEqual(await bag.open(blob, KEYS), rec);
  const z = await bag.seal(rec, KEYS);                                  // deflated, a fresh nonce
  assert.notDeepEqual(z.slice(0, 24), nonce);
  assert.deepEqual(await bag.open(z, KEYS), rec);
  const other = await bag.keys('2718281828459045'.slice(0, 15) + '0', { rounds: 10 }).catch(() => null);
  const refused = async (b, k) => assert.equal((await bag.open(b, k).then(() => null, (e) => e)).code, 'seal');
  await refused(blob, { ...KEYS, k: KEYS.w });                          // another key
  await refused(blob, { ...KEYS, f: KEYS.w });                          // sealed for another bag's F
  if (other) await refused(blob, other);
  for (const at of [0, 23, 24, 500, blob.length - 1]) {
    const bad = blob.slice();
    bad[at] ^= 1;
    await refused(bad, KEYS);
  }
  await refused(blob.slice(0, -1), KEYS);
  await refused(new Uint8Array(70000), KEYS);
});

// the code

test('the bag code: 16 digits whose last is the Damm check; one wrong digit or two swapped are refused', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = bag.newCode();
    assert.match(c, /^\d{16}$/);
    assert.equal(bag.readCode(c), c);
    seen.add(c);
  }
  assert.equal(seen.size, 200);
  // every digit is as likely: no bias from the bytes (250 of 256 kept)
  const counts = Array(10).fill(0);
  for (let i = 0; i < 400; i++) for (const d of bag.newCode().slice(0, 15)) counts[d]++;
  assert.ok(Math.max(...counts) / Math.min(...counts) < 1.3, counts.join());
  let calls = 0;
  const high = (a) => { calls++; return a.fill(calls < 3 ? 255 : 7); };           // 250 to 255 are never used
  assert.equal(bag.newCode(high).slice(0, 15), '7'.repeat(15));
  for (let i = 0; i < 16; i++) {
    for (let d = 0; d <= 9; d++) {
      const typo = CODE.slice(0, i) + d + CODE.slice(i + 1);
      if (typo !== CODE) assert.equal(bag.readCode(typo), null, typo);
    }
    if (i < 15 && CODE[i] !== CODE[i + 1]) {
      assert.equal(bag.readCode(CODE.slice(0, i) + CODE[i + 1] + CODE[i] + CODE.slice(i + 2)), null);
    }
  }
  assert.equal(bag.readCode('۳۱۴۱ ۵۹۲۶ ۵۳۵۸ ۹۷۹۵'), CODE);              // Persian digits, as shown
  assert.equal(bag.readCode('⁦٣١٤١-٥٩٢٦-٥٣٥٨-٩٧٩٥⁩'), CODE);     // Arabic-Indic, dashes, the isolate
  assert.equal(bag.readCode('3141 5926 5358 979'), null);
  assert.equal(bag.readCode('3141 5926 5358 97955'), null);
  assert.equal(bag.showCode(CODE, 'prs'), '⁦۳۱۴۱ ۵۹۲۶ ۵۳۵۸ ۹۷۹۵⁩');
  assert.equal(bag.showCode(CODE, 'en'), '⁦3141 5926 5358 9795⁩');
  assert.deepEqual(bag.groups(CODE), ['3141', '5926', '5358', '9795']);
  assert.equal(bag.qrText(CODE), 'Q1 BAG 3141592653589795');
  assert.equal(bag.fromQr('Q1 BAG 3141592653589795'), CODE);
  assert.equal(bag.fromQr('Q1 BAG 3141592653589794'), null);
  assert.equal(bag.fromQr('https://example.org/Q1 BAG 3141592653589795'), null);
});

// the merge, over random records

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const Y2010 = Date.UTC(2010, 0, 1);
const Y2026 = Date.UTC(2026, 9, 17);
const Y2030 = Date.UTC(2030, 5, 1);

function record(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const some = (xs, p = 0.5) => xs.filter(() => r() < p);
  const st = () => (r() < 0.1 ? '' : stamps.make(pick([Y2010, Y2026, Y2030]) + Math.floor(r() * 4), Math.floor(r() * 2),
    pick(['0123abcd', '89efcdab', 'ffff0000'])));
  const at = () => pick([Y2010, Y2026, Y2030]) + Math.floor(r() * 4);
  const map = (keys, value) => Object.fromEntries(some(keys).map((k) => [k, [value(), st()]]));
  const lessons = ['l1', 'l2', 'l3'];
  const tokens = ['tok-a', 'tok-b', 'tok-c', 'tok-d'];
  const rec = {
    v: r() < 0.1 ? 2 : 1,
    s: map(['lang', 'band', 'plan', 'shift'], () => pick(['prs', 'ps', null, { b: 1, a: [2] }, { a: [2], b: 1 }, 30])),
    done: Object.fromEntries(some(lessons).map((l) => [l, [Math.floor(r() * 4), at()]])),
    step: map(lessons, () => Math.floor(r() * 5)),
    tries: Object.fromEntries(some(lessons).map((l) => [l, Object.fromEntries(some(['0', '1', '2']).map((n) => [n,
      some([[st(), true], [st(), false], [st(), true]])]).filter(([, v]) => v.length))])),
    marks: map(['l1', 'l2', 'l3', 'l4'], () => Math.floor(r() * 101)),
    recall: map(['l1:1', 'l1:2', 'l2:1', 'l3:4'], () => [Math.floor(r() * 6), Math.floor(r() * 30)]),
    prints: map(lessons, () => Math.floor(r() * 9999)),
    uni: map(['1', '2', '3'], () => r() < 0.5),
    asks: map(['k1', 'k2', 'k3', 'k4', 'k5'], () => (r() < 0.3 ? null : { q: pick(['why?', 'how?']), at: Math.floor(r() * 9) })),
    made: map(['m1', 'm2', 'm3'], () => (r() < 0.3 ? null : { q: '2+2', a: pick(['4', 'four']) })),
    contests: map(['c1'], () => ({ answers: [pick([1, 2])] })),
    certs: some(['QC-AAAAA-AAAAA', 'QC-BBBBB-BBBBB', 'QC-CCCCC-CCCCC']).map((id) => ({ id, path: 'p', month: `2026-0${id.charCodeAt(3) - 64}`,
      ...(r() < 0.5 ? { server: pick(['a1a1a1a1a1a1a1a1a1a1', 'b2b2b2b2b2b2b2b2b2b2']) } : {}) })),
    seats: Object.fromEntries(some(['a1a1a1a1a1a1a1a1a1a1', 'b2b2b2b2b2b2b2b2b2b2']).map((sid) => [sid, {
      t: some(tokens, 0.4).map((token) => (r() < 0.3 ? { token } : { token, number: Math.floor(r() * 3) + 1, joined: pick([5, 6, null]) })),
      code: r() < 0.3 ? pick(['K7QM4PRT', 'ABCDEFGH']) : null, asked: r() < 0.5,
      consent: [r() < 0.5 ? { kind: 'self', version: pick(['hub-2026-10b', 'online-2026-10b']) } : null, st()] }])),
    dead: some(tokens, 0.2),
  };
  if (r() < 0.3) rec.zz = pick([{ newer: 1 }, [1, 2], 'x']);            // a part from a newer app
  return rec;
}

test('the merge is commutative, associative and idempotent over random records (caps, tombstones and clocks)', () => {
  const caps = { ...bag.CAPS };
  Object.assign(bag.CAPS, { marks: 3, recall: 3, prints: 2, asks: 3, made: 2, contests: 1, certs: 2 });   // small, so the caps bite
  try {
    const r = random(20261017);
    for (let i = 0; i < 400; i++) {
      const [a, b, c] = [record(r), record(r), record(r)];
      const ab = bag.merge(a, b);
      assert.deepEqual(ab, bag.merge(b, a), `commutative, run ${i}`);
      assert.deepEqual(bag.merge(ab, c), bag.merge(a, bag.merge(b, c)), `associative, run ${i}`);
      assert.deepEqual(bag.merge(bag.merge(a, c), b), bag.merge(ab, c), `any order, run ${i}`);
      assert.deepEqual(bag.merge(ab, ab), ab, `idempotent, run ${i}`);
      assert.deepEqual(bag.merge(ab, a), ab, `a copy already in it changes nothing, run ${i}`);
      assert.deepEqual(bag.merge(a, a), bag.merge(a, {}), `idempotent, run ${i}`);
    }
  } finally { Object.assign(bag.CAPS, caps); }
});

test('what each rule keeps (3.8)', () => {
  const s = (t, n = 0, d = '0123abcd') => stamps.make(t, n, d);
  const a = { done: { l1: [2, Y2026] }, step: { l1: [4, s(Y2026 - 5)], l2: [1, s(Y2026)] },
    tries: { l2: { 0: [[s(Y2026 + 9), false]] } }, s: { lang: ['ps', s(Y2026)] },
    asks: { k1: [{ q: 'why?' }, s(Y2026)] }, uni: { 3: [true, s(Y2026)] },
    seats: { a1a1a1a1a1a1a1a1a1a1: { t: [{ token: 'tok-new', number: 9, joined: 20 }], consent: [{ kind: 'self' }, s(Y2026)] } } };
  const b = { done: { l1: [3, Y2026 - 9] }, step: { l1: [6, s(Y2026 + 1)], l2: [3, s(Y2026 - 1)] },
    tries: { l2: { 0: [[s(Y2026 + 2), true]] } }, s: { lang: ['en', s(Y2026, 1)] },
    asks: { k1: [null, s(Y2026 + 3)] }, uni: { 3: [false, s(Y2026 + 1)] },
    seats: { a1a1a1a1a1a1a1a1a1a1: { t: [{ token: 'tok-old', number: 4, joined: 10 }], consent: [null, s(Y2025())] } },
    dead: ['tok-gone'] };
  const m = bag.merge(a, b);
  assert.deepEqual(m.done.l1, [3, Y2026]);                               // the higher stars, the later finish
  assert.deepEqual(m.step.l1, [6, s(Y2026 + 1)]);                        // started again after the finish: kept
  assert.deepEqual(m.step.l2, [1, s(Y2026)]);                            // the newest
  assert.deepEqual(m.tries.l2[0].map((e) => e[1]), [true, false]);      // the earliest first: she reads `true`
  assert.equal(m.s.lang[0], 'en');                                       // same ms, the higher counter
  assert.equal(m.asks.k1[0], null);                                      // removed after it was asked: never comes back
  assert.equal(m.uni[3][0], false);                                      // the untick travels
  assert.deepEqual(m.seats.a1a1a1a1a1a1a1a1a1a1.t.map((e) => e.token), ['tok-new', 'tok-old']);
  assert.ok(m.seats.a1a1a1a1a1a1a1a1a1a1.consent[0]);                    // the newer stamp: still agreed
  const later = bag.merge(m, { done: { l1: [1, Y2026 + 5] }, dead: ['tok-old'] });
  assert.equal(later.step.l1, undefined);                                // finished after it: the step goes
  assert.deepEqual(later.seats.a1a1a1a1a1a1a1a1a1a1.t.map((e) => e.token), ['tok-new']);   // a dead token never returns
  const l = bag.unpack(m, { id: 'x', seats: {} });
  assert.equal(l.seats.a1a1a1a1a1a1a1a1a1a1.token, 'tok-old');           // her oldest token here is the one used
  assert.deepEqual(l.seats.a1a1a1a1a1a1a1a1a1a1.also, ['tok-new']);      // the other waits for /api/me/merge
  assert.equal(l.tries.l2[0], true);
});
function Y2025() { return Date.UTC(2025, 0, 1); }

test("a newer app's parts are kept, and its bag is read but never written", () => {
  const newer = { v: 2, s: { lang: ['ps', stamps.make(Y2026, 0, 'aaaaaaaa')], hue: ['blue', stamps.make(Y2026, 0, 'aaaaaaaa')] },
    pets: { cat: 1 } };
  assert.equal(bag.writable(newer), false);
  assert.equal(bag.writable({ v: 1 }), true);
  const m = bag.merge(bag.pack({ id: 'x', lang: 'prs', seats: {} }), newer);
  assert.equal(m.v, 2);
  assert.deepEqual(m.pets, { cat: 1 });
  assert.equal(m.s.hue[0], 'blue');
  const l = bag.unpack(m, { id: 'x', seats: {} });
  assert.equal(l.lang, 'ps');
  assert.deepEqual(l.bagx, { s: { hue: ['blue', stamps.make(Y2026, 0, 'aaaaaaaa')] }, pets: { cat: 1 } });
  const again = bag.pack(l);                                             // and back into her next bag
  assert.deepEqual(again.pets, { cat: 1 });
  assert.deepEqual(again.s.hue, ['blue', stamps.make(Y2026, 0, 'aaaaaaaa')]);
  assert.equal(again.v, 1);
  assert.equal(bag.merge(again, m).v, 2);
});

// the size

const WORDS = ['کتاب', 'مکتب', 'حساب', 'خواندن', 'نوشتن', 'درس', 'سوال', 'جواب', 'عدد', 'کسر', 'جمع', 'تفریق', 'ضرب', 'تقسیم',
  'زمین', 'آب', 'هوا', 'گیاه', 'حیوان', 'خانه', 'مادر', 'پدر', 'برادر', 'خواهر', 'باغ', 'کوه', 'دریا', 'آفتاب'];
function text(r, chars) {
  let s = '';
  while (s.length < chars) s += WORDS[Math.floor(r() * WORDS.length)] + ' ';
  return s.slice(0, chars);
}

// her record with every list at its cap and every lesson of the catalogue done
function fullLearner(r, chars) {
  const st = {};
  let t = Y2026;
  const stamp = (k) => { st[k] = stamps.make(t++, 0, '0123abcd'); };
  const lessons = Array.from({ length: 400 }, (_, i) => `maths-${(i % 12) + 1}-lesson-number-${i}`);
  const l = { id: 'full', band: 's1', year: 8, lang: 'prs', picture: 'book', text: 'normal', theme: 'phone', seats: {},
    done: {}, step: {}, prints: {}, marks: {}, recall: {}, asks: [], made: [], certs: [], uni: [1, 2, 3, 4, 5],
    plan: { label: text(r, 60), lessons: lessons.slice(0, 12), again: {} },
    lock: { salt: 'a'.repeat(32), hash: 'b'.repeat(64), tries: 0 } };
  for (const f of ['band', 'year', 'lang', 'picture', 'text', 'theme', 'plan', 'lock']) stamp(f);
  for (const id of lessons) l.done[id] = { stars: 3, at: t++ };
  for (const id of lessons.slice(0, 300)) { l.marks[id] = 87; stamp(`marks:${id}`); l.prints[id] = 4821; stamp(`prints:${id}`); }
  for (let i = 0; i < 300; i++) { const k = `${lessons[i]}:${(i % 9) + 1}`; l.recall[k] = [i % 6, 20400 + i]; stamp(`recall:${k}`); }
  for (const id of lessons.slice(300, 310)) { l.step[id] = 7; stamp(`step:${id}`); }
  for (let i = 0; i < 30; i++) {
    const k = `k${String(i).padStart(15, '0')}`;
    l.asks.push({ k, id: 1000 + i, q: text(r, chars), a: text(r, chars), source: 'ai', at: Y2026 + i, done: true, dev: '0123abcd' });
    stamp(`asks:${k}`);
  }
  for (let i = 0; i < 50; i++) {
    const id = `m${String(i).padStart(9, '0')}`;
    l.made.push({ id, q: text(r, chars), a: text(r, chars), why: text(r, chars), lang: 'prs', lesson: lessons[i], at: Y2026 + i, due: 20400, sent: 77, status: 'ok' });
    stamp(`made:${id}`);
  }
  for (let i = 0; i < 50; i++) l.certs.push({ path: `maths-${i}`, id: `QC-${String(i).padStart(5, '0')}-ABCDE`, month: '2026-10', server: 'a1a1a1a1a1a1a1a1a1a1' });
  for (const n of l.uni) stamp(`uni:${n}`);
  l.seats.a1a1a1a1a1a1a1a1a1a1 = { token: 'tok_' + 'x'.repeat(40), number: 27, cohort: { id: 'class-7b', label: 'Class 7B' },
    code: 'K7QM4PRT', consent: { kind: 'guardian-on-phone', version: 'hub-2026-10b', at: '2026-10-16T09:41', sent: true }, asked: true, sentBand: 's1', joined: Y2026 };
  stamp('consent:a1a1a1a1a1a1a1a1a1a1');
  l.st = st;
  return l;
}

test('a full record, every list at its cap, seals under 64 KB; without deflate the bag copy loses the oldest retired items first', async () => {
  const r = random(7);
  const typical = bag.pack(fullLearner(r, 120));
  const blob = await bag.seal(typical, KEYS);
  assert.ok(blob.length <= 64 * 1024, `${blob.length} bytes`);
  const raw = JSON.stringify(typical).length;
  const longest = bag.pack(fullLearner(r, 300));                       // every question and answer as long as allowed
  const sealed = await bag.sealFitted(longest, KEYS);
  assert.ok(sealed.blob.length <= 64 * 1024);
  console.log(`# a full record: ${raw} bytes of JSON, ${blob.length} sealed; at the longest texts ${sealed.blob.length} sealed`);
  // a phone without CompressionStream: the bag copy is trimmed, the retired review items first, never the phone's own
  await assert.rejects(bag.seal(typical, KEYS, { deflate: false }), (e) => e.code === 'size');
  const plain = await bag.sealFitted(typical, KEYS, { deflate: false });
  assert.ok(plain.blob.length <= 64 * 1024);
  const kept = Object.values(plain.bag.recall);
  assert.ok(kept.length < 300);
  assert.ok(kept.every((e) => e[0][0] !== 0), 'the retired review items go first');
  assert.deepEqual(plain.bag.done, typical.done);                        // lessons done and stars are never trimmed
  assert.deepEqual(plain.bag.seats, typical.seats);
  assert.deepEqual(await bag.open(plain.blob, KEYS), plain.bag);
  console.log(`# without deflate: ${kept.length} review items, ${Object.keys(plain.bag.marks).length} marks, `
    + `${Object.keys(plain.bag.prints).length} printed sheets left in the bag copy`);
});

// on the phone: every write stamped, and two phones converge through their bags

const use = (phone) => { store = stores[phone]; state.reload(); };
const L = (phone) => { use(phone); return state.learner(); };

test('every write on the phone is stamped by the clock; a value from before W5 stays the oldest', () => {
  store = stores.c;
  store.clear();
  store.set('qalam.v2', JSON.stringify({ v: 2, active: 'old', learners: [{ id: 'old', year: 8, lang: 'ps', done: {}, step: {}, prints: {}, asks: [] }] }));
  state.reload();
  let l = state.learner();
  assert.equal(l.st, undefined);                                         // nothing stamped by loading
  state.setStep('maths-7-fractions-add', 2);
  l = state.learner();
  assert.deepEqual(Object.keys(l.st), ['last', 'step:maths-7-fractions-add']);
  assert.ok(!('lang' in l.st));                                          // untouched: still the oldest
  state.updateChild(l.id, { lang: 'en' });
  const first = state.learner().st.lang;
  state.updateChild(l.id, { lang: 'prs' });
  assert.ok(stamps.newer(state.learner().st.lang, first));
  state.markDone('maths-7-fractions-add', 3);
  l = state.learner();
  assert.equal(l.st['step:maths-7-fractions-add'], undefined);
  assert.ok(l.done['maths-7-fractions-add'].at >= stamps.ms(first));
  const k = state.addAsk({ q: 'why?' }).k;
  assert.equal(state.learner().asks[0].dev, state.device());
  state.updateChild(l.id, { asks: [] });
  assert.ok(stamps.valid(state.learner().gone[`asks:${k}`]));             // removed: a tombstone
  const raw = JSON.parse(store.get('qalam.v2'));
  assert.ok(raw.learners[0].st && raw.learners[0].gone && raw.clock.n >= 0);
});

test('two phones, one learner: the bag carries her record, her later changes win, and the two converge', async () => {
  const HUB = 'a1a1a1a1a1a1a1a1a1a1';
  const realNow = Date.now;
  try {
    // phone A, in 2026
    store = stores.a; store.clear(); state.reload();
    const a = state.addChild({ year: 7, lang: 'prs' });
    state.setSeat(a.id, HUB, { token: 'tok_aaaaaaaaaaaaaaaaaaaaaaaa', number: 27, consent: { kind: 'self', version: 'hub-2026-10b' } });
    state.setStep('maths-7-fractions-add', 1);
    state.firstTry('maths-7-fractions-add', 0, true);
    state.markDone('dari-1-sheen', 2);
    state.setMark('dari-1-sheen', 80);
    state.addAsk({ q: 'why?', at: realNow() });
    const first = bag.pack(L('a'));

    // phone B: a new phone whose clock fell back to 2010; she restores her bag
    Date.now = () => Y2010;
    store = stores.b; store.clear(); state.reload();
    const b = state.addChild({ year: 3, lang: 'en' });
    state.adopt(b.id, bag.unpack(bag.merge(bag.pack(state.learner()), first), state.learner()));
    let lb = L('b');
    assert.equal(lb.year, 7);                                            // her settings came with her (stamped; B's were not)
    assert.equal(lb.done['dari-1-sheen'].stars, 2);
    assert.equal(lb.seats[HUB].token, 'tok_aaaaaaaaaaaaaaaaaaaaaaaa');  // her seat: the same token on the same server
    assert.equal(lb.tries['maths-7-fractions-add'][0], true);
    // on B (still 2010 by its own clock) she changes her language and finishes the lesson: stamped after A's
    state.updateChild(lb.id, { lang: 'ps' });
    state.markDone('maths-7-fractions-add', 3);
    lb = L('b');
    assert.ok(stamps.ms(lb.st.lang) >= stamps.ms(first.s.year[1]));
    // meanwhile on A: a new mark
    Date.now = realNow;
    use('a');
    state.setMark('dari-1-sheen', 95);
    const fromA = bag.pack(L('a'));
    const fromB = bag.pack(L('b'));
    const merged = bag.merge(fromA, fromB);
    for (const p of ['a', 'b']) { use(p); state.adopt(state.learner().id, bag.unpack(merged, state.learner())); }
    const [la, lb2] = [L('a'), L('b')];
    assert.deepEqual(bag.pack(la), bag.pack(lb2));                        // converged
    assert.equal(la.lang, 'ps');                                         // B's later change, though B's clock said 2010
    assert.equal(la.marks['dari-1-sheen'], 95);
    assert.equal(la.done['maths-7-fractions-add'].stars, 3);
    assert.equal(la.step['maths-7-fractions-add'], undefined);           // finished on B: A's place in it goes
    assert.equal(la.asks.length, 1);
    // a phone years ahead (2030) wins only what it changed concurrently, until the others have seen its stamps
    Date.now = () => Y2030;
    use('b');
    state.updateChild(state.learner().id, { theme: 'dark' });
    Date.now = realNow;
    const ahead = bag.pack(L('b'));
    use('a');
    state.updateChild(state.learner().id, { theme: 'light' });           // later in real time, earlier by the stamp
    let m2 = bag.merge(bag.pack(L('a')), ahead);
    assert.equal(m2.s.theme[0], 'dark');
    state.adopt(state.learner().id, bag.unpack(m2, state.learner()));
    state.updateChild(state.learner().id, { theme: 'light' });           // once A has seen it, A's next change wins
    m2 = bag.merge(bag.pack(L('a')), ahead);
    assert.equal(m2.s.theme[0], 'light');
    // a token that died on one phone never comes back from the other's bag
    use('a');
    state.dropSeat(state.learner().id, HUB);
    const m3 = bag.merge(bag.pack(L('a')), bag.pack(L('b')));
    assert.ok(m3.dead.includes('tok_aaaaaaaaaaaaaaaaaaaaaaaa'));
    assert.equal((m3.seats[HUB] || { t: [] }).t.length, 0);
  } finally { Date.now = realNow; }
});

test('PBKDF2 at 100 000 rounds, timed here (the phone measure is in WEBSITE.md, W5)', async (t) => {
  for (const native of [true, false]) {
    const t0 = performance.now();
    await bag.master(CODE, { native });
    t.diagnostic(`${native ? 'crypto.subtle' : 'vendored'}: ${Math.round(performance.now() - t0)} ms`);
  }
  assert.ok(bag.ROUNDS >= 50000);
});
