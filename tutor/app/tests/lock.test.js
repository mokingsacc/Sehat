// The PIN lock (app/js/lock.js) and its SHA-256 (app/js/sha256.js): four digits, five tries then waits of 1, 15 and
// 60 minutes, and "I forgot", a 24-hour countdown that deletes nothing. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

const lock = await import('../js/lock.js');
const { sha256 } = await import('../js/sha256.js');

const MIN = 60e3;
const HOUR = 3600e3;
const T0 = Date.UTC(2026, 9, 16, 9, 0);

test('sha256.js agrees with node for short and long inputs', () => {
  for (const s of ['', 'abc', 'salt:1234', 'ک'.repeat(40), 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(200)]) {
    assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 8)));
  }
});

test('a PIN is four digits, typed in Persian or Latin digits; the hash is 10,000 rounds over salt and PIN', () => {
  assert.equal(lock.digits('۱۲۳۴'), '1234');
  assert.equal(lock.digits('1234'), '1234');
  assert.equal(lock.digits('123'), null);
  assert.equal(lock.digits('12a4'), null);
  const l = lock.make('۲۰۲۶');
  assert.deepEqual(Object.keys(l).sort(), ['hash', 'last', 'resetAt', 'rounds', 'salt', 'tries', 'until']);
  assert.ok(!JSON.stringify(l).includes('2026'));
  // round 1 is sha256(salt:pin); each next round hashes the last digest followed by salt:pin
  const tail = Buffer.from(`${l.salt}:2026`);
  let h = createHash('sha256').update(tail).digest();
  for (let i = 1; i < lock.ROUNDS; i++) h = createHash('sha256').update(Buffer.concat([h, tail])).digest();
  assert.equal(l.hash, h.toString('hex'));
  assert.notEqual(lock.make('2026').salt, l.salt);
});

test('the right PIN opens; five wrong tries wait 1 minute, then 15, then 60', () => {
  let l = lock.make('1234');
  assert.equal(lock.attempt(l, '۱۲۳۴', T0).ok, true);
  let now = T0;
  const fiveWrong = () => {
    for (let i = 0; i < 5; i++) {
      const r = lock.attempt(l, '0000', now);
      assert.equal(r.ok, false);
      l = r.lock;
    }
  };
  fiveWrong();
  assert.equal(lock.waitLeft(l, now), MIN);
  assert.equal(lock.attempt(l, '1234', now + 30e3).ok, false);        // even the right PIN waits
  now += MIN;
  fiveWrong();
  assert.equal(lock.waitLeft(l, now), 15 * MIN);
  now += 15 * MIN;
  fiveWrong();
  assert.equal(lock.waitLeft(l, now), 60 * MIN);
  now += 60 * MIN;
  fiveWrong();
  assert.equal(lock.waitLeft(l, now), 60 * MIN);                      // stays at an hour
  now += 60 * MIN;
  const r = lock.attempt(l, '1234', now);
  assert.equal(r.ok, true);
  assert.deepEqual([r.lock.tries, r.lock.until, r.lock.rounds], [0, 0, 0]);
});

test('a quiet day starts the waits again from one minute', () => {
  let l = lock.make('1234');
  for (let i = 0; i < 5; i++) l = lock.attempt(l, '9999', T0).lock;
  for (let i = 0; i < 5; i++) l = lock.attempt(l, '9999', T0 + MIN).lock;
  assert.equal(lock.waitLeft(l, T0 + MIN), 15 * MIN);
  const later = T0 + 2 * 24 * HOUR;
  for (let i = 0; i < 5; i++) l = lock.attempt(l, '9999', later).lock;
  assert.equal(lock.waitLeft(l, later), MIN);
});

test('"I forgot" starts a 24-hour countdown that asking again does not restart; her PIN cancels it', () => {
  let l = lock.make('1234');
  assert.equal(lock.resetLeft(l, T0), null);
  l = lock.startReset(l, T0);
  assert.equal(lock.hoursLeft(l, T0), 24);
  assert.equal(lock.hoursLeft(l, T0 + 7 * HOUR + 1), 17);              // "a reset is waiting · 17 hours left"
  assert.equal(lock.startReset(l, T0 + 5 * HOUR).resetAt, l.resetAt);
  assert.equal(lock.resetDue(l, T0 + 24 * HOUR - 1), false);
  assert.equal(lock.resetDue(l, T0 + 24 * HOUR), true);
  const r = lock.attempt(l, '1234', T0 + HOUR);
  assert.equal(r.ok, true);
  assert.equal(r.lock.resetAt, null);
});

test('the lock is never for early years', () => {
  assert.equal(lock.allowed('ey'), false);
  for (const b of ['p1', 'p2', 's1', 's2', 'ad']) assert.equal(lock.allowed(b), true);
});
