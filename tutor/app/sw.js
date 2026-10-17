// The service worker (P11): on a secure page (the online home over HTTPS; a laptop's localhost when testing) it keeps
// the app on the phone, so Qalam opened once still opens with no network: the app's own files from the cache at
// once, refreshed in the background for the next start (stale-while-revalidate), lesson pictures and clips kept as
// they are fetched. The API is never cached here: the app keeps its lists, lessons and sheet keys in localStorage,
// as it does on the hub, where plain http allows no service worker (F2). A new version of this file takes over at
// the next start, without a banner. app/tests/sw.test.js keeps SHELL equal to the app's files.

const VERSION = 'qalam-p32-1';
const SHELL_CACHE = 'shell-' + VERSION;
const MEDIA_CACHE = 'media-v1';                // pack pictures and clips: their names change when they change
const QURAN_CACHE = 'quran-v1';                // P29: each surah and verse recitation once opened, never all at once
const SHELL = [
  './',
  'index.html',
  'icon.svg',
  'credits.json',
  'css/app.css',
  'js/account.js',
  'js/android.js',
  'js/aliases.js',
  'js/bands.js',
  'js/certcheck.js',
  'js/day.js',
  'js/events.js',
  'js/graph.js',
  'js/hub.js',
  'js/i18n.js',
  'js/keypad.js',
  'js/library.js',
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
  'js/speech.js',
  'js/state.js',
  'js/ui.js',
  'js/screens/ask.js',
  'js/screens/cert.js',
  'js/screens/check.js',
  'js/screens/consent.js',
  'js/screens/credits.js',
  'js/screens/home.js',
  'js/screens/lesson.js',
  'js/screens/lock.js',
  'js/screens/plan.js',
  'js/screens/quran.js',
  'js/screens/university.js',
  'js/screens/made.js',
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
  'js/modules/homework.js',
  'js/modules/lessons.js',
  'js/modules/made.js',
  'js/modules/photo.js',
  'js/modules/plan.js',
  'js/modules/recall.js',
  'js/modules/sheets.js',
  'js/modules/timetable.js',
  'fonts/amiri-quran.woff2',
  'fonts/naskh-500.woff2',
  'fonts/naskh-700.woff2',
  'fonts/noto-sc.woff2',
  'fonts/vazirmatn-500.woff2',
  'fonts/vazirmatn-800.woff2',
  'audio/bells/break.opus',
  'audio/bells/end.opus',
  'audio/bells/manifest.json',
  'audio/bells/start.opus',
  'audio/en/manifest.json',
  'audio/prs/manifest.json',
  'audio/ps/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((k) => (k.startsWith('shell-') && k !== SHELL_CACHE) || (k.startsWith('quran-') && k !== QURAN_CACHE))
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
  if (/^\/(review|teacher|admin|js\/review|js\/teacher|js\/admin|js\/staff)\//.test(url.pathname) || url.searchParams.has('preview')) return;
  if (url.pathname.startsWith('/get/')) return;                         // the download page and the APK (P23): never kept
  if (url.pathname.startsWith('/v/')) return;                           // a certificate's check page (P25b): the server's
  if (req.mode === 'navigate') {                                       // /, /?join=CODE, /#/...: the app's page
    e.respondWith(staleWhileRevalidate(req, SHELL_CACHE, new Request(new URL('./', self.location).href)));
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
  e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});
