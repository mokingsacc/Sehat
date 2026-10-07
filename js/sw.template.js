// Service worker: keeps the whole book on the phone. Generated from js/sw.template.js by tools/build.py.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = 'fhb-shell-' + VERSION;
const AUDIO = 'fhb-audio-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fhb-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // narration uploaded in the dashboard editor lives on the worker: <worker>/a/<lang>-<voice>/<id>?v=<hash> (older: /a/<lang>/<id>)
  const remoteClip = url.origin !== self.location.origin && /^\/a\/(fa|ps|en)(-[fm])?\/[^/]+$/.test(url.pathname);
  if (url.origin !== self.location.origin && !remoteClip) return;
  const path = url.pathname;

  if (path.endsWith('/content/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  if (path.includes('/audio/') || remoteClip) {
    // audio clips (never precached): from the phone if downloaded, otherwise fetch once and keep.
    // The app downloads them in packs (urgent first) for the voice the person chose; see startDownloads() in js/app.js.
    e.respondWith(caches.open(AUDIO).then(async (c) => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) e.waitUntil(c.put(req.url, res.clone()).catch(() => {}));
      return res;
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(SHELL).then((c) => c.match('index.html')).then((hit) => hit || fetch(req)).catch(() => fetch(req)));
    return;
  }
  e.respondWith(caches.open(SHELL).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
});
