// The service worker (app/sw.js) keeps every file the app needs to open with no network: its SHELL list is the
// app's files, so a new screen or module cannot be forgotten. Run with: node --test app/tests/*.test.js

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const APP = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', APP), 'utf8');
const list = (dir, ext) => readdirSync(new URL(dir, APP)).filter((f) => f.endsWith(ext)).map((f) => dir + f);

test('the service worker keeps every file the app opens with', () => {
  const shell = JSON.parse(sw.slice(sw.indexOf('const SHELL = [') + 14, sw.indexOf('];', sw.indexOf('const SHELL = [')) + 1)
    .replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const want = ['./', 'index.html', 'icon.svg', 'credits.json', 'css/app.css',
    ...list('js/', '.js'), ...list('js/screens/', '.js'), ...list('js/modules/', '.js'), ...list('fonts/', '.woff2'),
    ...readdirSync(new URL('audio/', APP), { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => `/audio/${d.name}/manifest.json`), ...list('audio/bells/', '.opus').map((f) => '/' + f)];   // the bells ring offline too (P19);
  // the voice clips and their manifests stay at the site's root since the move to /app/ (WEBSITE.md 2.2); the
  // Quran's and the Chinese fonts and the voice manifests are kept when first asked for (W3's trim), and named in LAZY
  const lazy = JSON.parse(sw.slice(sw.indexOf('const LAZY = [') + 13, sw.indexOf('];', sw.indexOf('const LAZY')) + 1)
    .replace(/'/g, '"').replace(/\s+/g, ' '));
  // the school bag (W5) and every file of its vendored crypto, which no file of the shell imports
  const vendor = (dir) => list(`js/vendor/${dir}/`, '.js');
  assert.deepEqual(lazy.sort(), ['/audio/bells/break.opus', '/audio/bells/end.opus', '/audio/bells/start.opus',
    '/audio/en/manifest.json', '/audio/prs/manifest.json', '/audio/ps/manifest.json',
    'fonts/amiri-quran.woff2', 'fonts/noto-sc.woff2', 'js/bag.js', 'js/qr.js', ...vendor('noble-ciphers'), ...vendor('noble-hashes'),
    'js/screens/returncode.js'].sort());   // W9: a lost phone's return needs the server anyway
  for (const f of want.filter((x) => x.endsWith('.js') && !lazy.includes(x))) {
    assert.doesNotMatch(readFileSync(new URL(f, APP), 'utf8'), /from '\.\.?\/(bag\.js|qr\.js|vendor\/)/, `${f} imports the bag`);
  }
  assert.deepEqual([...shell].sort(), want.filter((f) => !lazy.includes(f)).sort());
});

test('it caches no API answer and takes over only at the next start', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  assert.doesNotMatch(sw, /skipWaiting|clients\.claim/);
});

test("a certificate's check page is the server's, never the app's page from the cache", () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/v\/'\)\) return;/);
  assert.ok(sw.indexOf("startsWith('/v/')") < sw.indexOf("req.mode === 'navigate'"));
});

test('since the move (W2) its cache is app-shell-*, and it leaves the shared and the website\'s caches alone', () => {
  assert.match(sw, /const SHELL_CACHE = 'app-shell-' \+ VERSION;/);
  const activate = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf('async function staleWhileRevalidate'));
  assert.match(activate, /startsWith\('app-shell-'\)/);
  assert.doesNotMatch(activate, /'shell-'|'site-'|media-v1|MEDIA_CACHE/);
  // its own scope: the website's pages and the staff pages are never answered from the app's cache
  assert.match(sw, /const BASE = new URL\('\.\/', self\.location\)\.pathname;/);
  assert.ok(sw.indexOf('!url.pathname.startsWith(BASE)') < sw.indexOf("req.mode === 'navigate'"));
});

test("the site's worker (site/js/sw.js) replaces the old root worker without downloading a picture or clip again", () => {
  const site = readFileSync(new URL('../site/js/sw.js', APP), 'utf8');
  const activate = site.slice(site.indexOf("addEventListener('activate'"), site.indexOf('async function staleWhileRevalidate'));
  assert.match(activate, /startsWith\('shell-'\)\) \{ await keepClips\(k\)/);            // clips moved to media-v1, then deleted
  assert.match(activate, /startsWith\('site-'\) && k !== SITE_CACHE/);
  assert.doesNotMatch(activate, /app-shell|caches\.delete\(MEDIA|caches\.delete\(QURAN/);
  assert.match(site, /const MEDIA_CACHE = 'media-v1';/);
  assert.match(site, /const QURAN_CACHE = 'quran-v1';/);
  assert.match(site, /c\.add\(OFFLINE\)/);                                              // /offline/ kept at install
  assert.match(site, /skipWaiting\(\)/);                                                 // the old app worker goes at once
  // the app's addresses go to the network; staff pages, /get/, /v/ and the API are never touched
  assert.match(site, /NOT_SITE = \/\^\\\/\(app\|api\|teacher\|admin\|review\|get\|v\|packs\|quran\|audio\|fonts\)/);
});

test('since the move (W2) every sound is asked for at the root, never under /app/', () => {
  const files = (dir) => readdirSync(new URL(dir, APP), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? files(`${dir}${d.name}/`) : d.name.endsWith('.js') ? [dir + d.name] : []));
  for (const f of files('js/')) {
    const src = readFileSync(new URL(f, APP), 'utf8');
    assert.doesNotMatch(src, /['"`]audio\/(?!webm|ogg|mpeg|wav|mp4)/, f);         // 'audio/bells/…' would be /app/audio/…
  }
});
