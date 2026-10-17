// Recorded clips (app/js/speech.js, app/audio): a clip plays before the phone's voice; placeholders, which are
// not speech, play only for a tester; no clip is ever synthetic. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const speech = await import('../js/speech.js');
const i18n = await import('../js/i18n.js');

const AUDIO = new URL('../audio/', import.meta.url);

test('a real recording plays first; a placeholder only when a tester turns placeholders on', () => {
  const clips = { hear: { file: 'hear.opus', speaker: 'prs-01', placeholder: false },
    lesson_done: { file: 'lesson_done.opus', speaker: 'placeholder', placeholder: true },
    bad: { file: 'bad.opus', speaker: 'x', placeholder: false, synthetic: true } };
  assert.equal(speech.clipUrl(clips, 'hear', 'prs', false), 'audio/prs/hear.opus');
  assert.equal(speech.clipUrl(clips, 'lesson_done', 'prs', false), null);
  assert.equal(speech.clipUrl(clips, 'lesson_done', 'prs', true), 'audio/prs/lesson_done.opus');
  assert.equal(speech.clipUrl(clips, 'bad', 'prs', true), null);
  assert.equal(speech.clipUrl(clips, 'missing', 'prs', true), null);
  assert.equal(speech.placeholdersOn(), false);
  store.set('qalam.clips', 'placeholders');
  assert.equal(speech.placeholdersOn(), true);
  store.clear();
});

test('a pack clip from the hub follows the same rule', () => {
  assert.equal(speech.packClip({ url: '/packs/p/audio/prs/a.opus', placeholder: false }, false), '/packs/p/audio/prs/a.opus');
  assert.equal(speech.packClip({ url: '/packs/p/audio/prs/a.opus', placeholder: true }, false), null);
  assert.equal(speech.packClip('/x.opus'), '/x.opus');
  assert.equal(speech.packClip(null), null);
});

test('every interface clip is listed, matches its hash, names a speaker code and is never synthetic', () => {
  // app/audio/bells holds the school day's bells (P19): tones, not words; day.test.js checks them
  const langs = readdirSync(AUDIO, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'bells')
    .map((d) => d.name).sort();
  assert.deepEqual(langs, ['en', 'prs', 'ps']);
  for (const lang of langs) {
    const dir = new URL(lang + '/', AUDIO);
    const m = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
    const files = readdirSync(dir).filter((f) => f !== 'manifest.json');
    const listed = Object.values(m.clips).map((c) => c.file);
    assert.deepEqual(files.sort(), [...listed].sort(), `${lang}: every file in the manifest, and only those`);
    for (const [key, c] of Object.entries(m.clips)) {
      assert.ok(i18n.keys('prs').includes(key), `${lang}/${key}: an i18n key`);
      assert.ok(typeof c.speaker === 'string' && c.speaker && !/\s/.test(c.speaker), `${lang}/${key}: a speaker code`);
      assert.equal(typeof c.placeholder, 'boolean');
      assert.ok(!c.synthetic, `${lang}/${key}: never synthetic`);
      const sha = 'sha256:' + createHash('sha256').update(readFileSync(new URL(c.file, dir))).digest('hex');
      assert.equal(c.sha256, sha, `${lang}/${key}: hash`);
      if (c.placeholder) assert.match(c.note, /PLACEHOLDER/);
    }
  }
});
