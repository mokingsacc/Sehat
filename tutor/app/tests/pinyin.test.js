// Pinyin tones (app/js/pinyin.js, P27a): the line drawn over a Chinese word comes from its tone marks, and an unmarked
// syllable is neutral. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TONE_PATH, tones, words } from '../js/pinyin.js';

test('each marked vowel gives its tone, in order, and a neutral syllable none', () => {
  assert.deepEqual(tones('nǐ'), [3]);
  assert.deepEqual(tones('zàijiàn'), [4, 4]);
  assert.deepEqual(tones('xièxie'), [4]);
  assert.deepEqual(tones('yī'), [1]);
  assert.deepEqual(tones('má'), [2]);
  assert.deepEqual(tones('lǜ'), [4]);
  assert.deepEqual(tones('ma'), []);
  assert.deepEqual(words('nǐ hǎo'), [{ word: 'nǐ', tones: [3] }, { word: 'hǎo', tones: [3] }]);
  assert.deepEqual(Object.keys(TONE_PATH), ['1', '2', '3', '4']);
});
