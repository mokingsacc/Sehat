// The site's service worker (WEBSITE.md 2.2, W2), at /sw.js with scope /: it took the place of the app's old worker
// at this address when the app moved to /app/, where the app's own worker now lives (/app/sw.js, scope /app/).
// - It keeps the site's pages in site-<VERSION>: /offline/ at install, every other page as it is visited, served at
//   once and refreshed in the background (stale-while-revalidate). A return visit costs nothing.
// - The app's addresses are the network's: /app/ goes there, and with no network and no app on the phone yet it
//   answers with /offline/#app ("Qalam is not on this phone yet"). The staff pages, /get/, /v/ and /api/ are never
//   touched.
// - Pictures, clips and the Quran's files go in the caches the app's worker shares (media-v1, quran-v1), so nothing
//   the phone already has is downloaded again, even while this worker still controls the first /app/ visit.
// - On activate it deletes the old app worker's shell-* cache, moving the voice clips it kept into media-v1 first,
//   and every older site-* cache; it never touches app-shell-*, media-v1 or quran-v1.
// - A page of the old app still open at / (it came from the old cache) finds its next files under /app/.
// tools/make_site.py writes VERSION (a hash of the pages) when it copies this file to the site's root.

const VERSION = '__VERSION__';
const SITE_CACHE = 'site-' + VERSION;
const MEDIA_CACHE = 'media-v1';
const QURAN_CACHE = 'quran-v1';
const OFFLINE = '/offline/';
const NOT_SITE = /^\/(app|api|teacher|admin|review|get|v|packs|quran|audio|fonts)(\/|$)/;
// the old app's page, still open at / from before the move: the files it asks for next live under /app/ now
const OLD_APP = /^\/(?:(?:js|css|fonts)\/.+|icon\.svg|credits\.json)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SITE_CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

async function keepClips(oldShell) {
  const from = await caches.open(oldShell);
  const to = await caches.open(MEDIA_CACHE);
  for (const req of await from.keys()) {
    const p = new URL(req.url).pathname;
    if (/^\/audio\/.+\.(opus|ogg|mp3)$/.test(p)) {
      const r = await from.match(req);
      if (r) await to.put(req, r).catch(() => {});
    }
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('shell-')) { await keepClips(k).catch(() => {}); await caches.delete(k); }
      else if (k.startsWith('site-') && k !== SITE_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: cacheName === SITE_CACHE });
  const fresh = fetch(req).then((r) => {
    if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()).catch(() => {});
    return r;
  }).catch(() => null);
  return hit || (await fresh) || null;
}

async function page(req) {
  const r = await staleWhileRevalidate(req, SITE_CACHE);
  if (r) return r;
  return (await caches.match(OFFLINE)) || new Response('offline', { status: 503 });
}

async function app(req) {
  try {
    return await fetch(req);
  } catch {
    const off = await caches.match(OFFLINE);
    if (!off) return new Response('offline', { status: 503 });
    const html = (await off.text()).replace('<html ', '<html data-app="none" ');
    return new Response(html, { headers: off.headers });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/packs/') || /^\/audio\/.+\.(opus|ogg|mp3)$/.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req, MEDIA_CACHE).then((r) => r || fetch(req)));
    return;
  }
  if (url.pathname.startsWith('/quran/')) {
    e.respondWith(staleWhileRevalidate(req, QURAN_CACHE).then((r) => r || fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode !== 'navigate') {
    if (OLD_APP.test(url.pathname)) e.respondWith(fetch('/app' + url.pathname + url.search));
    return;
  }
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) { e.respondWith(app(req)); return; }
  if (NOT_SITE.test(url.pathname)) return;
  e.respondWith(page(req));
});
