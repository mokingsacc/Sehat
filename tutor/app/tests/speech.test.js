// The one voice per language (app/js/speech.js, app/audio, C5.6): a text finds its clip by the same hash
// tools/voice.py names the file by; a text joined from several plays its parts' clips in order; the phone's voice is
// reached only for words no build has voiced. Run with: node --test app/tests/*.test.js

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
const VOICE = JSON.parse(readFileSync(new URL('../../content/voice.json', import.meta.url), 'utf8'));

test('the hash is the voice tool\'s (hub/tutor_hub/voicing.py text_hash, the same five texts)', () => {
  const want = [['درس تمام شد! آفرین', 'b4278d0e664b'], ['  این حرف «ش» است.  ', 'd36d9b14db8d'],
    ['Hello. ', '185f8db32271'], ['你好', '670d9743542c'], ['x $1$ + 2.', '97a16e5ea0cd']];
  for (const [t, h] of want) assert.equal(speech.textHash(t), h, t);
  assert.equal(speech.norm('  a   b.  '), 'a b');
});

test('a pack clip from the hub: placeholders only for a tester', () => {
  assert.equal(speech.packClip({ url: '/packs/p/audio/prs/a.opus', placeholder: false }, false), '/packs/p/audio/prs/a.opus');
  assert.equal(speech.packClip({ url: '/packs/p/audio/prs/a.opus', placeholder: true }, false), null);
  assert.equal(speech.packClip({ url: '/packs/p/audio/prs/a.opus', placeholder: true }, true), '/packs/p/audio/prs/a.opus');
  assert.equal(speech.packClip('/x.opus'), '/x.opus');
  assert.equal(speech.packClip(null), null);
  assert.equal(speech.placeholdersOn(), false);
});

test('a joined text plays its parts\' clips in order; a part with no clip is left for the phone', () => {
  const a = 'مضمون‌ها', b = 'هر درس باز است', c = 'درس تمام شد! آفرین';
  speech.addVoices({ prs: { [speech.textHash(a)]: '/a.opus', [speech.textHash(b)]: '/b.opus', [speech.textHash(c)]: '/c.opus' } },
    (u) => 'http://hub' + u);
  assert.equal(speech.clipFor(a + '.', 'prs'), 'http://hub/a.opus');
  assert.equal(speech.clipFor(a, 'ps'), null, 'one language never plays another\'s clip');
  assert.deepEqual(speech.cover([a, b].join('. '), 'prs'), [{ url: 'http://hub/a.opus' }, { url: 'http://hub/b.opus' }]);
  assert.deepEqual(speech.cover(c, 'prs'), [{ url: 'http://hub/c.opus' }], 'a string with its own "!" stays one clip');
  assert.deepEqual(speech.cover([a, 'صنف ۳', b], 'prs'), [{ url: 'http://hub/a.opus' }, { text: 'صنف ۳' }, { url: 'http://hub/b.opus' }]);
  assert.ok(speech.hasClip(`${a}. ${b}`, 'prs'));
  assert.ok(!speech.hasClip(`${a}. نام او`, 'prs'));
});

test('every interface clip is in its record with its hash; the manifest lists only learner clips; one voice', () => {
  // app/audio/bells holds the school day's bells (P19): tones, not words; day.test.js checks them
  const langs = readdirSync(AUDIO, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'bells')
    .map((d) => d.name).sort();
  assert.deepEqual(langs, ['en', 'prs', 'ps']);
  const keys = new Set(i18n.keys('prs').concat(i18n.keys('ps'), i18n.keys('en')));
  for (const lang of langs) {
    const dir = new URL(lang + '/', AUDIO);
    const m = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
    const rec = JSON.parse(readFileSync(new URL('record.json', dir), 'utf8'));
    assert.equal(m.lang, lang);
    assert.equal(m.voice, VOICE.voices[lang], `${lang}: the manifest names the language's one voice`);
    assert.equal(rec.voice, VOICE.voices[lang]);
    const files = readdirSync(dir).filter((f) => f !== 'manifest.json' && f !== 'record.json');
    assert.deepEqual(files.sort(), Object.values(rec.clips).map((c) => c.file).sort(), `${lang}: every file recorded, and only those`);
    for (const [h, c] of Object.entries(rec.clips)) {
      assert.match(h, /^[0-9a-f]{12}$/);
      assert.equal(c.file, h + '.opus');
      const sha = 'sha256:' + createHash('sha256').update(readFileSync(new URL(c.file, dir))).digest('hex');
      assert.equal(c.sha256, sha, `${lang}/${h}: hash`);
      assert.equal(h in m.clips, !!c.learner, `${lang}/${h}: in the learner manifest exactly when the app says it`);
      for (const k of c.keys) {
        const base = k.replace(/\{n=\d+\}$/, '');
        if (c.learner && !k.startsWith('consent:') && !base.includes('.')) assert.ok(keys.has(base), `${lang}/${h}: ${k} is an i18n key`);
      }
    }
  }
});

test('a voice pack: one file per language, read whole or refused (voicepack.js)', async () => {
  const vp = await import('../js/voicepack.js');
  const clip = new Uint8Array([79, 103, 103, 83, 1, 2, 3]);
  const head = new TextEncoder().encode(JSON.stringify({ lang: 'ps', voice: 'Kore', clips: { abcdef012345: [0, 7] },
    files: { 'bells/start.opus': [0, 7] } }));
  const buf = new Uint8Array(8 + 4 + head.length + clip.length);
  buf.set(new TextEncoder().encode('QVOICE1\n'), 0);
  new DataView(buf.buffer).setUint32(8, head.length, false);
  buf.set(head, 12);
  buf.set(clip, 12 + head.length);
  const p = vp.parse(buf.buffer);
  assert.equal(p.lang, 'ps');
  assert.deepEqual(p.clips.abcdef012345, [0, 7]);
  assert.equal(p.base, 12 + head.length);
  assert.equal(vp.fileName('ps'), 'qalam-voice-ps.qvoice');
  assert.throws(() => vp.parse(buf.slice(0, buf.length - 1).buffer), /past the end/);
  assert.throws(() => vp.parse(new TextEncoder().encode('PK\u0003\u0004 not ours').buffer), /not a voice pack/);
});
