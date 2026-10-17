// Speech practice without AI (C5.5, app/js/speak.js): her recording stays in memory, is dropped when the step
// closes, and never reaches storage, a request, an event or a log; three goes, then on. P14's pattern: every writer
// is patched to fail the test if it is called. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const writes = [];
const deny = (what) => () => { writes.push(what); throw new Error('a writer was called: ' + what); };
globalThis.localStorage = { getItem: () => null, setItem: deny('localStorage'), removeItem: deny('localStorage') };
globalThis.sessionStorage = { getItem: () => null, setItem: deny('sessionStorage'), removeItem: deny('sessionStorage') };
globalThis.indexedDB = { open: deny('indexedDB') };
globalThis.fetch = deny('fetch');
globalThis.XMLHttpRequest = deny('XMLHttpRequest');
globalThis.WebSocket = deny('WebSocket');
const realLog = console.log;
console.log = deny('console.log'); console.warn = deny('console.warn'); console.error = deny('console.error');
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: deny('sendBeacon') }, configurable: true });

const practice = await import('../js/speak.js');

function fakes() {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const urls = { made: [], revoked: [], createObjectURL(b) { this.made.push(b); return 'blob:' + this.made.length; },
    revokeObjectURL(u) { this.revoked.push(u); } };
  class Recorder {
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3])]) }); this.onstop(); }
  }
  const media = { asked: 0, getUserMedia: async () => { media.asked++; return { getTracks: () => tracks }; } };
  return { tracks, urls, Recorder, media };
}

test('record, play mine, mark: three goes then on; nothing written anywhere', async () => {
  const f = fakes();
  const seen = [];
  const P = practice.session({ media: f.media, Recorder: f.Recorder, urls: f.urls, onChange: (s) => seen.push(s) });
  assert.equal(await P.record(), true);
  assert.ok(P.recording());
  await P.record();                                   // the second tap stops
  assert.deepEqual(seen, ['recording', 'recorded']);
  assert.equal(P.mine(), 'blob:1');
  assert.equal(f.urls.made[0].size, 3, 'the recording is a Blob in memory');
  assert.ok(f.tracks[0].stopped, 'the microphone is let go after each recording');
  assert.equal(P.mark(false), 'again');
  assert.equal(P.mark(false), 'again');
  assert.equal(P.mark(false), 'go_on', 'three goes, then "Let\'s go on."');
  assert.equal(P.mark(true), 'over');
  P.drop();
  assert.equal(P.mine(), null, 'dropped when the step closes');
  assert.deepEqual(f.urls.revoked, ['blob:1']);
  assert.deepEqual(writes, []);
});

test('"I said it" ends the step; a step closed while recording keeps nothing', async () => {
  const f = fakes();
  const P = practice.session({ media: f.media, Recorder: f.Recorder, urls: f.urls });
  await P.record();
  P.drop();
  assert.equal(P.mine(), null);
  assert.deepEqual(f.urls.made, [], 'no recording is made once the step has closed');
  assert.ok(f.tracks[0].stopped);
  assert.equal(await P.record(), false, 'a closed step records no more');
  const Q = practice.session({ media: f.media, Recorder: f.Recorder, urls: f.urls });
  assert.equal(Q.mark(true), 'said');
  assert.equal(practice.firstTap(), true);
  assert.equal(practice.firstTap(), false, 'the microphone line shows once');
  assert.deepEqual(writes, []);
});

test('speak: no AI, no capability, off in every seed cohort', () => {
  console.log = realLog;
  const m = JSON.parse(readFileSync(new URL('../../modules/speak/module.json', import.meta.url), 'utf8'));
  assert.deepEqual(m.capabilities, []);
  assert.equal(m.offline, 'yes');
  for (const c of ['open', 'hub', 'staging']) {
    const doc = JSON.parse(readFileSync(new URL(`../../cohorts/${c}.json`, import.meta.url), 'utf8'));
    assert.ok(!doc.modules.speak, `${c}: speak is off by default`);
  }
  const src = readFileSync(new URL('../js/speak.js', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|localStorage|indexedDB|sendBeacon|XMLHttpRequest|import /.test(src), 'speak.js imports and writes nothing');
});
