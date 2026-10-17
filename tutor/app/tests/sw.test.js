// The service worker (app/sw.js) keeps every file the app needs to open with no network: its SHELL list is the
// app's files, so a new screen or module cannot be forgotten. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const APP = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', APP), 'utf8');
const list = (dir, ext) => readdirSync(new URL(dir, APP)).filter((f) => f.endsWith(ext)).map((f) => dir + f);

test('the service worker keeps every file the app opens with', () => {
  const shell = JSON.parse(sw.slice(sw.indexOf('const SHELL = [') + 14, sw.indexOf('];', sw.indexOf('const SHELL')) + 1)
    .replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const want = ['./', 'index.html', 'icon.svg', 'credits.json', 'css/app.css',
    ...list('js/', '.js'), ...list('js/screens/', '.js'), ...list('js/modules/', '.js'), ...list('fonts/', '.woff2'),
    ...readdirSync(new URL('audio/', APP), { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => `audio/${d.name}/manifest.json`), ...list('audio/bells/', '.opus')];   // the bells ring offline too (P19)
  assert.deepEqual([...shell].sort(), [...want].sort());
});

test('it caches no API answer and takes over only at the next start', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  assert.doesNotMatch(sw, /skipWaiting|clients\.claim/);
});
