// Service worker: keeps the whole book on the phone. Generated from js/sw.template.js by tools/build.py.
const VERSION = '2026.10.07-0b686e';
const PRECACHE = [
 "./",
 "index.html",
 "manifest.webmanifest",
 "content/book.json",
 "content/who-growth.json",
 "css/app.css",
 "css/growth-share.css",
 "js/anim.js",
 "js/app.js",
 "js/growth-calc.js",
 "js/growth.js",
 "js/jalali.js",
 "js/qr.js",
 "js/search-ui.js",
 "js/search.js",
 "js/share.js",
 "js/stats.js",
 "js/tools.js",
 "js/zip.js",
 "anim/cpr-adult.js",
 "anim/cpr-baby.js",
 "anim/cpr-child.js",
 "anim/cpr-newborn.js",
 "anim/handwashing.js",
 "anim/herd.js",
 "anim/nappies.js",
 "anim/ors.js",
 "anim/spread.js",
 "anim/vaccines.js",
 "anim/water.js",
 "fonts/naskh-arabic.woff2",
 "fonts/naskh-latin.woff2",
 "fonts/fonts.css",
 "img/icons/_dot.svg",
 "img/icons/animals.svg",
 "img/icons/baby-movement.svg",
 "img/icons/baby.svg",
 "img/icons/belly-pain.svg",
 "img/icons/birth-plan.svg",
 "img/icons/bleeding.svg",
 "img/icons/bowl-food.svg",
 "img/icons/bp.svg",
 "img/icons/breastfeed.svg",
 "img/icons/breathe.svg",
 "img/icons/breathing-fast.svg",
 "img/icons/burn.svg",
 "img/icons/calendar.svg",
 "img/icons/car.svg",
 "img/icons/card.svg",
 "img/icons/check.svg",
 "img/icons/chest-indrawing.svg",
 "img/icons/choking.svg",
 "img/icons/clinic.svg",
 "img/icons/clock.svg",
 "img/icons/convulsion.svg",
 "img/icons/cool-water.svg",
 "img/icons/cord.svg",
 "img/icons/cough.svg",
 "img/icons/cup-spoon.svg",
 "img/icons/dog.svg",
 "img/icons/drops.svg",
 "img/icons/eye-blurred.svg",
 "img/icons/eye-sunken.svg",
 "img/icons/eye.svg",
 "img/icons/family.svg",
 "img/icons/fever.svg",
 "img/icons/food-iron.svg",
 "img/icons/foot.svg",
 "img/icons/growth.svg",
 "img/icons/handwash.svg",
 "img/icons/headache.svg",
 "img/icons/heart.svg",
 "img/icons/hospital.svg",
 "img/icons/house.svg",
 "img/icons/insect.svg",
 "img/icons/iron-pill.svg",
 "img/icons/jaundice.svg",
 "img/icons/lump.svg",
 "img/icons/lungs.svg",
 "img/icons/mask.svg",
 "img/icons/midwife.svg",
 "img/icons/milestones.svg",
 "img/icons/milk.svg",
 "img/icons/money.svg",
 "img/icons/moon.svg",
 "img/icons/muac.svg",
 "img/icons/newborn-warm.svg",
 "img/icons/no-drink.svg",
 "img/icons/no.svg",
 "img/icons/ors.svg",
 "img/icons/people.svg",
 "img/icons/phone.svg",
 "img/icons/pill.svg",
 "img/icons/poison.svg",
 "img/icons/pregnant.svg",
 "img/icons/rash.svg",
 "img/icons/rest.svg",
 "img/icons/sad.svg",
 "img/icons/salt.svg",
 "img/icons/skin-pinch.svg",
 "img/icons/sleep.svg",
 "img/icons/sleepy.svg",
 "img/icons/smoke.svg",
 "img/icons/stiff-neck.svg",
 "img/icons/stool-blood.svg",
 "img/icons/stove.svg",
 "img/icons/stroke-face.svg",
 "img/icons/sugar.svg",
 "img/icons/swelling.svg",
 "img/icons/swollen-feet.svg",
 "img/icons/syringe.svg",
 "img/icons/talk.svg",
 "img/icons/thermometer.svg",
 "img/icons/tooth.svg",
 "img/icons/toys-play.svg",
 "img/icons/urine-blood.svg",
 "img/icons/vomit.svg",
 "img/icons/walk.svg",
 "img/icons/warning.svg",
 "img/icons/water.svg",
 "img/icons/waters.svg",
 "img/icons/weight-loss.svg",
 "img/icons/window.svg",
 "img/icons/wound.svg",
 "img/icons/zinc.svg",
 "img/topics/adults-generic.svg",
 "img/topics/after-birth.svg",
 "img/topics/allergy-severe.svg",
 "img/topics/anaemia.svg",
 "img/topics/animal-illness.svg",
 "img/topics/blood-pressure.svg",
 "img/topics/breastfeeding.svg",
 "img/topics/child-safety.svg",
 "img/topics/children-generic.svg",
 "img/topics/cold-hypothermia.svg",
 "img/topics/cough.svg",
 "img/topics/danger-child.svg",
 "img/topics/diabetes.svg",
 "img/topics/diarrhoea.svg",
 "img/topics/drowning.svg",
 "img/topics/fever-fits.svg",
 "img/topics/fever.svg",
 "img/topics/first-aid.svg",
 "img/topics/floods-quakes.svg",
 "img/topics/growth.svg",
 "img/topics/head-injury.svg",
 "img/topics/hygiene.svg",
 "img/topics/kit-bp.svg",
 "img/topics/kit-buy.svg",
 "img/topics/kit-first-aid.svg",
 "img/topics/kit-glucometer.svg",
 "img/topics/kit-muac.svg",
 "img/topics/kit-oximeter.svg",
 "img/topics/kit-scale.svg",
 "img/topics/kit-thermometer.svg",
 "img/topics/leishmaniasis.svg",
 "img/topics/low-sugar.svg",
 "img/topics/measles.svg",
 "img/topics/newborn.svg",
 "img/topics/poisoning.svg",
 "img/topics/pregnancy-care.svg",
 "img/topics/pregnancy-danger.svg",
 "img/topics/red-flags.svg",
 "img/topics/stress.svg",
 "img/topics/tb.svg",
 "img/topics/vaccines.svg",
 "img/topics/winter-home.svg",
 "img/pics/bp-sit.svg",
 "img/pics/breath-watch.svg",
 "img/pics/chest-indrawing.svg",
 "img/pics/em-asthma-spacer.svg",
 "img/pics/em-bleeding-press.svg",
 "img/pics/em-bleeding-tourniquet.svg",
 "img/pics/em-burns-cool.svg",
 "img/pics/em-choking-adult-back.svg",
 "img/pics/em-choking-adult-belly.svg",
 "img/pics/em-choking-baby-back.svg",
 "img/pics/em-choking-baby-chest.svg",
 "img/pics/em-cpr-adult-hands.svg",
 "img/pics/em-cpr-baby-breaths.svg",
 "img/pics/em-cpr-baby-thumbs.svg",
 "img/pics/em-cpr-child-hand.svg",
 "img/pics/em-cpr-newborn-breaths.svg",
 "img/pics/em-electric-stick.svg",
 "img/pics/em-eye-wash.svg",
 "img/pics/em-heat-cooling.svg",
 "img/pics/em-nosebleed-pinch.svg",
 "img/pics/em-recovery-baby.svg",
 "img/pics/em-recovery-position.svg",
 "img/pics/em-seizure-cushion.svg",
 "img/pics/em-snakebite-splint.svg",
 "img/pics/em-spine-hold.svg",
 "img/pics/fever-touch.svg",
 "img/pics/measure-height.svg",
 "img/pics/measure-hold.svg",
 "img/pics/measure-length.svg",
 "img/pics/share-install.svg",
 "img/app/home-adults.svg",
 "img/app/home-children.svg",
 "img/app/icon.svg",
 "img/app/placeholder.svg",
 "img/app/welcome.svg",
 "img/app/apple-touch-icon.png",
 "img/app/icon-192.png",
 "img/app/icon-512.png",
 "img/app/icon-maskable-512.png"
];
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
