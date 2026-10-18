// Service worker: keeps the whole book on the phone. Generated from js/sw.template.js by tools/build.py.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = 'fhb-shell-' + VERSION;
const AUDIO = 'fhb-audio-v1';
// Android app only: Mo's painted pictures that are not inside the app (path -> content hash). The app shows the old
// drawing (<name>.svg, in the app) until the picture has come once from the website (SITE); then it keeps it here.
const SITE = __SITE__;
const PAINTED = __PAINTED__;
const PICS = 'fhb-pics-v1';
const IN_APK = self.location.hostname === 'appassets.androidplatform.net';
// 'fhb-steps-v1': on-demand picture-step sets, kept by js/anim.js (never deleted here: they outlive app updates)

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
  // narration uploaded in the dashboard editor lives on the worker: <worker>/a/<lang>-<voice>/<id>?v=<hash> (older: /a/<lang>/<id>);
  // the Android app gets the book's own clips from the website: <appUrl>/audio/<lang>-<voice>/<id>.mp3?v=<hash>
  const remoteClip = url.origin !== self.location.origin && (/^\/a\/(fa|ps|en)(-[fm])?\/[^/]+$/.test(url.pathname) || /\/audio\/(fa|ps|en)-[fm]\/[^/]+$/.test(url.pathname));
  if (url.origin !== self.location.origin && !remoteClip) return;
  const path = url.pathname;

  if (path.endsWith('/content/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // inside the Android app the book's own clips (Emergency and CPR, woman's voice) are files in the app: no second copy
  if (!remoteClip && path.includes('/audio/') && self.location.hostname === 'appassets.androidplatform.net') return;
  if (path.includes('/audio/') || remoteClip) {
    // audio clips (never precached): from the phone if downloaded, otherwise fetch once and keep.
    // The app downloads them in packs (urgent first) for the voice the person chose; see startDownloads() in js/app.js.
    e.respondWith(caches.open(AUDIO).then(async (c) => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      // offline and not on the phone: a plain "not here" answer (the app then uses the other voice or the phone's speech)
      const res = await fetch(req).catch(() => new Response('', { status: 504, statusText: 'offline' }));
      if (res.ok && res.status === 200) e.waitUntil(c.put(req.url, res.clone()).catch(() => {}));
      return res;
    }));
    return;
  }
  const rel = path.replace(/^\/+/, '');
  if (IN_APK && PAINTED[rel] && /^https:\/\//.test(SITE)) {
    const key = SITE + rel + '?v=' + PAINTED[rel];
    e.respondWith(caches.open(PICS).then(async (c) => {
      const hit = await c.match(key);
      if (hit) return hit;
      const res = await fetch(key).catch(() => null);
      if (res && res.ok && res.status === 200) { e.waitUntil(c.put(key, res.clone()).catch(() => {})); return res; }
      return fetch(rel.replace(/\.webp$/, '.svg')); // offline: the old drawing inside the app
    }));
    return;
  }
  if (path.includes('/img/steps/')) {
    // picture steps: the Emergency and CPR sets are precached (shell); the other sets ("on-demand", book.steps) are
    // downloaded whole by js/anim.js into its own cache (fhb-steps-v1) and played from there, so here: shell or network
    e.respondWith(caches.open(SHELL).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(SHELL).then((c) => c.match('index.html')).then((hit) => hit || fetch(req)).catch(() => fetch(req)));
    return;
  }
  e.respondWith(caches.open(SHELL).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
});

// a medicine reminder shown by the open (but hidden) page (js/family.js, webNotify): a tap brings the app back (or opens
// it on the family page). Nothing is ever pushed from a server.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || '#/family';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.startsWith(self.registration.scope));
    if (c) return c.focus(); // the page shows its own reminder as soon as it is on the screen again
    return self.clients.openWindow(self.registration.scope + 'index.html' + hash);
  }));
});
