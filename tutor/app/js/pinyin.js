// Pinyin's tone marks (P27a, C4.4): the tone each marked vowel carries, so a Chinese word is drawn with a small line
// over it per tone: level (1), rising (2), dipping (3), falling (4). A syllable with no mark is neutral and has none.
// Pure functions, tested in app/tests/pinyin.test.js.

const MARKS = { 1: 'āēīōūǖ', 2: 'áéíóúǘ', 3: 'ǎěǐǒǔǚ', 4: 'àèìòùǜ' };
// each tone's line in a 24 by 15 box: level, rising, dipping, falling
export const TONE_PATH = { 1: 'M2 4H22', 2: 'M2 12L22 3', 3: 'M2 4L12 12L22 4', 4: 'M2 3L22 12' };

// the tones of the marked vowels in a word, in order: "nǐ" -> [3], "zàijiàn" -> [4, 4], "xie" -> []
export function tones(word) {
  const out = [];
  for (const ch of String(word || '').toLowerCase()) {
    for (const [t, m] of Object.entries(MARKS)) if (m.includes(ch)) out.push(Number(t));
  }
  return out;
}

// a pinyin line as its words, each with its tones: "nǐ hǎo" -> [{word: 'nǐ', tones: [3]}, {word: 'hǎo', tones: [3]}]
export const words = (pinyin) => String(pinyin || '').split(/\s+/).filter(Boolean).map((word) => ({ word, tones: tones(word) }));
