// The app's service worker (P11; moved to /app/sw.js with scope /app/ in W2, WEBSITE.md 2.2): on a secure page (the
// online home over HTTPS; a laptop's localhost when testing) it keeps the app on the phone, so Qalam opened once still
// opens with no network: the app's own files from the cache at once, refreshed in the background for the next start
// (stale-while-revalidate), lesson pictures and clips kept as they are fetched. The API is never cached here: the app
// keeps its lists, lessons and sheet keys in localStorage, as it does on the hub, where plain http allows no service
// worker (F2). A new version of this file takes over at the next start, without a banner. The voice clips stay at
// the site's root (/audio/), shared with the website's speakers; the site's own worker at /sw.js keeps the website and
// shares media-v1 and quran-v1 with this one. app/tests/sw.test.js keeps SHELL equal to the app's files.

const VERSION = 'qalam-w9-1';     // a new name installs the whole shell at once: W9's return code, hub.js and main.js go together
const SHELL_CACHE = 'app-shell-' + VERSION;      // not shell-*: the site's worker deletes the old root worker's cache
const MEDIA_CACHE = 'media-v1';                // pack pictures and clips: their names change when they change
const QURAN_CACHE = 'quran-v1';                // P29: each surah and verse recitation once opened, never all at once
const BASE = new URL('./', self.location).pathname;   // /app/ online and on the hub; / in the APK
// The first open (W3's trim, WEBSITE.md 2.5: at most 0.45 MB): the app's own files and its everyday fonts. Kept as
// they are first asked for instead (below, like any app file): the Quran's Amiri and the Chinese subset, which only
// those lessons draw; each language's voice manifest, which speech.js asks for in her own language only; and the
// bells, which the school day fetches at her first tap while it is on (timetable.js unlockOnFirstTap), so they still
// ring offline; and the school bag's code and its vendored crypto (W5), loaded only when her bag is used, with the
// card's QR maker (W7); and W9's "A code from my teacher", which needs the server anyway.
const LAZY = ['fonts/amiri-quran.woff2', 'fonts/noto-sc.woff2', '/audio/en/manifest.json', '/audio/prs/manifest.json',
  '/audio/ps/manifest.json', '/audio/bells/break.opus', '/audio/bells/end.opus', '/audio/bells/start.opus',
  'js/bag.js', 'js/qr.js', 'js/vendor/noble-ciphers/chacha.js', 'js/vendor/noble-ciphers/_arx.js',
  'js/vendor/noble-ciphers/_poly1305.js', 'js/vendor/noble-ciphers/utils.js', 'js/vendor/noble-hashes/pbkdf2.js',
  'js/vendor/noble-hashes/hkdf.js', 'js/vendor/noble-hashes/hmac.js', 'js/vendor/noble-hashes/sha2.js',
  'js/vendor/noble-hashes/_md.js', 'js/vendor/noble-hashes/_u64.js', 'js/vendor/noble-hashes/utils.js',
  'js/vendor/noble-hashes/crypto.js', 'js/screens/returncode.js'];
const SHELL = [
  './',
  'index.html',
  'icon.svg',
  'credits.json',
  'css/app.css',
  'js/account.js',
  'js/android.js',
  'js/aliases.js',
  'js/bagsync.js',
  'js/bands.js',
  'js/calendar.js',
  'js/certcheck.js',
  'js/day.js',
  'js/events.js',
  'js/floor.js',
  'js/graph.js',
  'js/hub.js',
  'js/i18n.js',
  'js/keypad.js',
  'js/library.js',
  'js/liveclass.js',
  'js/lock.js',
  'js/main.js',
  'js/modules.js',
  'js/numbers.js',
  'js/pinyin.js',
  'js/quran.js',
  'js/outbox.js',
  'js/scan.js',
  'js/sha256.js',
  'js/sheetcode.js',
  'js/speak.js',
  'js/speech.js',
  'js/stamps.js',
  'js/state.js',
  'js/ui.js',
  'js/voicepack.js',
  'js/screens/ask.js',
  'js/screens/schoolbag.js',
  'js/screens/cert.js',
  'js/screens/check.js',
  'js/screens/consent.js',
  'js/screens/contest.js',
  'js/screens/credits.js',
  'js/screens/home.js',
  'js/screens/lesson.js',
  'js/screens/lock.js',
  'js/screens/plan.js',
  'js/screens/quran.js',
  'js/screens/university.js',
  'js/screens/made.js',
  'js/screens/move.js',
  'js/screens/today.js',
  'js/screens/print.js',
  'js/screens/settings.js',
  'js/screens/signup.js',
  'js/screens/subject.js',
  'js/screens/subjects.js',
  'js/screens/update.js',
  'js/screens/welcome.js',
  'js/screens/who.js',
  'js/modules/cert.js',
  'js/modules/check.js',
  'js/modules/contest.js',
  'js/modules/homework.js',
  'js/modules/lessons.js',
  'js/modules/made.js',
  'js/modules/live.js',
  'js/modules/photo.js',
  'js/modules/plan.js',
  'js/modules/recall.js',
  'js/modules/sheets.js',
  'js/modules/timetable.js',
  'fonts/naskh-500.woff2',
  'fonts/naskh-700.woff2',
  'fonts/vazirmatn-500.woff2',
  'fonts/vazirmatn-800.woff2',
  '/audio/bells/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((k) => (k.startsWith('app-shell-') && k !== SHELL_CACHE) || (k.startsWith('quran-') && k !== QURAN_CACHE))
    .map((k) => caches.delete(k)))));        // a new QURAN_CACHE name drops a removed reciter's files (C4.7)
});

// the cached copy at once, and a fresh one into the cache for next time
async function staleWhileRevalidate(req, cacheName, key = req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key, { ignoreSearch: true });
  const fresh = fetch(req).then((r) => {
    if (r && (r.ok || r.type === 'opaque')) cache.put(key, r.clone()).catch(() => {});   // full or refused: still served
    return r;
  }).catch(() => null);
  return hit || (await fresh) || new Response('', { status: 504, statusText: 'offline' });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // the Android app's page is its own (P23): lesson pictures and clips come from the hub or the online home, and are
  // kept like the hub's own, so a lesson opened once plays offline; nothing else from another site is kept
  if (url.origin !== self.location.origin) {
    if (url.pathname.startsWith('/packs/')) e.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
    else if (url.pathname.startsWith('/quran/')) e.respondWith(staleWhileRevalidate(req, QURAN_CACHE));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;                        // the network, or the app's own fallback
  // staff pages and their scripts: never kept (/review/ P17, /teacher/ P20, /admin/ P21, their strings P33)
  if (/^\/(review|teacher|admin)\//.test(url.pathname) || url.pathname.startsWith(BASE + 'js/review/')
    || /^js\/(teacher|admin|staff)\//.test(url.pathname.slice(BASE.length)) || url.searchParams.has('preview')) return;
  if (url.pathname.startsWith('/get/')) return;                         // the download page and the APK (P23): never kept
  if (url.pathname.startsWith('/v/')) return;                           // a certificate's check page (P25b): the server's
  // a voice clip (C5.6): kept like a picture, in the cache the site's worker shares, so the move downloads none again
  // (the bells are in SHELL, kept at install)
  if (/^\/audio\/(?!bells\/).+\.(opus|ogg|mp3)$/.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
    return;
  }
  if (url.pathname.startsWith('/packs/')) {
    e.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
    return;
  }
  if (url.pathname.startsWith('/quran/')) {                             // the Quran set (P29), kept as opened
    e.respondWith(staleWhileRevalidate(req, QURAN_CACHE));
    return;
  }
  // the website's pages are its own worker's (/sw.js); this one keeps the app (and the voice manifests at /audio/)
  if (!url.pathname.startsWith(BASE) && !url.pathname.startsWith('/audio/')) return;
  if (req.mode === 'navigate') {                                       // /app/, /app/?join=CODE, /app/#/...: the app's page
    e.respondWith(staleWhileRevalidate(req, SHELL_CACHE, new Request(new URL('./', self.location).href)));
    return;
  }
  e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});
