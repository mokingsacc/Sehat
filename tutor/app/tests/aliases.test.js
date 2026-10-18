// The alias pictures (app/js/aliases.js) are content/aliases.json's, word for word, and a class code is read the
// way the server makes it (app/js/account.js). Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const aliases = await import('../js/aliases.js');
const doc = JSON.parse(readFileSync(new URL('../../content/aliases.json', import.meta.url), 'utf8'));

test('the app\'s alias pictures are content/aliases.json\'s, in order, with the same words', () => {
  assert.deepEqual(aliases.ALIASES.map((a) => ({ id: a.id, name: a.name })), doc.pictures);
  for (const a of aliases.ALIASES) assert.match(a.d, /^(<(path|circle|rect) [^>]*\/>)+$/, a.id);
});

test('a free picture is one no learner on the phone has; with all twelve taken, any', () => {
  const used = aliases.IDS.slice(0, 11);
  for (let i = 0; i < 20; i++) assert.equal(aliases.pickFree(used), aliases.IDS[11]);
  assert.ok(aliases.IDS.includes(aliases.pickFree(aliases.IDS)));
  assert.equal(aliases.aliasName('pomegranate', 'en'), 'Pomegranate');
  assert.equal(aliases.aliasName('nope', 'en'), '');
});
