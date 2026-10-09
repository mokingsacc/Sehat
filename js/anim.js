// Sehat explainer animations: a tiny player for hand-written SVG + CSS scenes.
// No libraries. Each animation lives in anim/<name>.js (ES module, default export
// {id, title, w, h, css, defs, scenes:[{id, svg, ms?}]}). Narration text is looked up by id
// ("anim.<name>.s1" ...), so the app's own play(ids) / speaker buttons can read it aloud.
//
//   import { mountAnimation, openAnimation } from './anim.js';
//   const ctl = await mountAnimation(el, 'vaccines', { lang, text, play, stop, onClose });
//   await openAnimation('cpr', opts);   // a group (GROUPS below): age picker first, then the variant
//
// Auto-advance: when a scene's narration ends the player waits a moment and goes on.
// "Ends" means: the promise returned by opts.play(ids) resolves (with anything but false or
// 'stopped'), or play() returned true and the app later calls ctl.narrationEnded().
// If play() returns nothing (no clip, no voice), a timer is used instead: about 6 s, longer
// for long lines (scene.ms, opts.sceneMs). Reduced motion: scenes show as still key frames.
// Three kinds of animation share this player: SVG (anim/<name>.js), cine (anim/cine/<name>.js, CINE) and
// picture steps (anim/steps/<name>.json via js/steps.js, STEPS); docs/STEPS_PLAYER.md.
// See docs/ANIMATIONS.md for the data format and the wiring into js/app.js.

const ANIM_BASE = new URL('../anim/', import.meta.url);
const cache = new Map();
const DIG = '۰۱۲۳۴۵۶۷۸۹';
const num = (n, lg) => (lg === 'en' ? String(n) : String(n).replace(/\d/g, (d) => DIG[d]));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// labels the player needs; the app may pass opts.t(key) (its own T) to override
const LBL = {
  previous: { fa: 'قبلی', ps: 'مخکنی', en: 'Previous' },
  next: { fa: 'بعدی', ps: 'بل', en: 'Next' },
  replay: { fa: 'دوباره', ps: 'بیا', en: 'Again' },
  done: { fa: 'تمام', ps: 'پای', en: 'Done' },
  close: { fa: 'بستن', ps: 'بندول', en: 'Close' },
  listen: { fa: 'بشنوید', ps: 'واورئ', en: 'Listen' },
  of: { fa: '{i} از {n}', ps: '{i} له {n}', en: '{i} of {n}' },
};

// Animations that come in variants: the player first asks which one (e.g. CPR by age).
// openAnimation('cpr') shows the picker; each item is an ordinary animation (anim/<anim>.js).
export const GROUPS = {
  cpr: {
    title: 'anim.cpr.title', ask: 'anim.cpr.ask', adult: true,
    items: [
      { anim: 'cpr-newborn', label: 'anim.cpr-newborn.label' },
      { anim: 'cpr-baby', label: 'anim.cpr-baby.label' },
      { anim: 'cpr-child', label: 'anim.cpr-child.label' },
      { anim: 'cpr-adult', label: 'anim.cpr-adult.label' },
    ],
  },
};
export const animGroup = (name) => GROUPS[String(name).replace(/^anim\./, '')] || null;

// "Cine" versions (the js/cine kit, docs/CINE_KIT.md): anim/cine/<name>.js, a module with cine: true, scenes and
// mount(stage, {lang, still}) -> {show(i), destroy()} and poster(i). Used instead of anim/<name>.js when it loads;
// if it is missing or fails, the SVG version plays. opts.cine === false forces the SVG version.
// Mo rejected the cine CPR films on 7 Oct 2026 (anim/cine is not shipped), so no name is listed here.
export const CINE = [];

// Picture-step versions (js/steps.js, docs/STEPS_PLAYER.md): anim/steps/<name>.json with layered pictures in
// img/steps/<name>/, played before the cine and SVG versions. A name goes in this list only when Mo has approved
// its pictures; useSteps(name) adds one at run time (previews). opts.steps === false skips them.
// cpr-baby: approved by Mo on 7 Oct 2026 (demo version); the other ages keep their SVG versions.
export const STEPS = ['cpr-baby'];
export function useSteps(...names) { names.forEach((n) => { if (STEPS.indexOf(n) < 0) STEPS.push(n); }); }

const IC = {
  spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  prev: '<svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

// Shared player look (uses the app's tokens from css/app.css) and shared scene keyframes.
// Scene rule: animated elements carry class "a" and no transform attribute of their own;
// the element's plain (not animated) state is the still key frame used for reduced motion.
const CSS = `
.anim{display:flex;flex-direction:column;gap:10px;color:var(--ink);--accent:var(--red);--accent-d:var(--red-d);--accent-t:var(--red-t)}
.anim.adult{--accent:var(--teal);--accent-d:var(--teal-d);--accent-t:var(--teal-t)}
.anim-top{display:flex;align-items:center;gap:10px}
.anim-top h2{flex:1 1 auto;margin:0;font-size:19px;line-height:1.4}
.anim-stage{position:relative;border-radius:20px;overflow:hidden;background:var(--accent-t);touch-action:pan-y;user-select:none;-webkit-user-select:none}
.anim-svg{display:block;width:100%;height:auto}
.anim-scene{animation:ak-in .3s ease-out}
.anim-dots{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.anim-dots button{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:999px}
.anim-dots i{display:block;width:12px;height:12px;border-radius:999px;background:var(--line);transition:transform .2s,background .2s}
.anim-dots button[aria-current=step] i{background:var(--accent);transform:scale(1.35)}
.anim-dots button.seen i{background:var(--accent-t);box-shadow:0 0 0 2px var(--accent) inset}
.anim-text{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:12px;min-height:96px;transition:box-shadow .2s}
.anim-text p{margin:0;flex:1 1 auto;font-size:19px;line-height:1.75;font-weight:600}
[dir=ltr] .anim-text p{font-size:17.5px;line-height:1.55}
.anim-text.speaking{box-shadow:0 0 0 3px var(--accent) inset}
.anim-ctl{display:grid;grid-template-columns:1fr auto 1.35fr;gap:10px}
.anim-ctl button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:64px;border-radius:18px;font-weight:700;font-size:17px;padding:0 12px;background:var(--card);border:1.5px solid var(--line);color:var(--ink)}
.anim-ctl button svg{width:26px;height:26px;flex:0 0 auto}
.anim-ctl .nx{background:var(--accent);border-color:var(--accent);color:#fff;font-size:19px}
.anim-ctl .rp{min-width:64px}
.anim-ctl button:disabled{opacity:.35}
.anim .spk{width:56px;height:56px;border-radius:999px;background:var(--card);border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--accent);flex:0 0 auto}
.anim .spk svg{width:26px;height:26px}
.anim .spk.speaking{background:var(--accent);color:#fff;border-color:var(--accent)}
.anim[dir=rtl] .flip{transform:scaleX(-1)}
.anim-svg .a{transform-box:fill-box;transform-origin:50% 50%}
.anim-svg .ob{transform-origin:50% 100%}
.anim-svg .ot{transform-origin:50% 0}
.anim-svg .ol{transform-origin:0 50%}
@keyframes ak-in{from{opacity:0}}
@keyframes ak-pop{0%{opacity:0;transform:scale(.2)}70%{opacity:1;transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes ak-out{to{opacity:0}}
@keyframes ak-bob{50%{transform:translateY(-4px)}}
@keyframes ak-float{0%,100%{transform:translate(0,0)}33%{transform:translate(4px,-5px)}66%{transform:translate(-3px,3px)}}
@keyframes ak-pulse{50%{transform:scale(1.12)}}
@keyframes ak-glow{50%{opacity:.35}}
@keyframes ak-blink{0%,40%{opacity:1}50%,90%{opacity:.15}}
@keyframes ak-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes ak-up{from{opacity:0;transform:translateY(14px)}}
@keyframes ak-down{from{opacity:0;transform:translateY(-22px)}}
@keyframes ak-left{from{opacity:0;transform:translateX(40px)}}
@keyframes ak-right{from{opacity:0;transform:translateX(-40px)}}
@keyframes ak-spin{to{transform:rotate(360deg)}}
.anim-svg .br{animation:ak-breathe 3.8s ease-in-out infinite}
@keyframes ak-breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.014)}}
.anim-svg .sw{animation:ak-sway 4.2s ease-in-out infinite}
@keyframes ak-sway{0%,100%{transform:rotate(0)}50%{transform:rotate(1.6deg)}}
.anim-stage>.anim-old{position:absolute;inset:0;width:100%;z-index:1;pointer-events:none;animation:ak-xfade .55s ease-in-out forwards}
@keyframes ak-xfade{from{opacity:1}to{opacity:0}}
.anim-stage>.anim-cam{will-change:transform;transform-origin:var(--cx,50%) var(--cy,55%);animation:ak-cam var(--cd,9s) cubic-bezier(.45,0,.4,1) both}
@keyframes ak-cam{from{transform:translate(var(--x0,0),var(--y0,0)) scale(var(--s0,1))}to{transform:translate(var(--x1,0),var(--y1,0)) scale(var(--s1,1.045))}}
.k-sh{animation:k-sh 6.4s ease-in-out infinite}
@keyframes k-sh{0%,100%{transform:rotate(-.45deg)}50%{transform:rotate(.45deg)}}
.k-br{animation:k-br 3.8s ease-in-out infinite}
@keyframes k-br{0%,100%{transform:scale(1,1)}45%{transform:scale(1.006,1.016)}}
.k-nod{animation:k-nod 6.4s ease-in-out infinite}
@keyframes k-nod{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.4deg)}}
.k-cl{animation:k-cl 4.6s ease-in-out infinite}
@keyframes k-cl{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}}
.anim-poster .anim-svg *{animation:none!important}
.anim-ask{min-height:0}
.anim-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.anim-pick .card{display:flex;flex-direction:column;background:var(--card);border:1.5px solid var(--line);border-radius:var(--r);overflow:hidden}
.anim-pick .pick{display:block;width:100%;padding:0;border:0;background:var(--accent-t);cursor:pointer}
.anim-pick .row{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 10px;flex:1 1 auto}
[dir=rtl] .anim-pick .row{padding:8px 10px 8px 8px}
.anim-pick .row b{flex:1 1 auto;font-size:16.5px;line-height:1.5;cursor:pointer}
[dir=ltr] .anim-pick .row b{font-size:16px;line-height:1.35}
.anim-pick .spk{width:56px;height:56px}
.anim-pick .anim-svg *{animation:none!important}
.anim-overlay{position:fixed;inset:0;z-index:50;background:var(--bg);overflow-y:auto;overscroll-behavior:contain}
.anim-overlay>div{max-width:560px;margin:0 auto;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.anim-overlay .anim{min-height:calc(100vh - 28px - env(safe-area-inset-bottom,0px))}
.anim-overlay .anim-ctl{margin-top:auto}
@media (prefers-reduced-motion:reduce){.anim-svg,.anim-svg *,.anim-scene{animation:none!important}.anim-stage>.anim-old{display:none}.anim-dots i{transition:none}}
.anim.still .anim-svg,.anim.still .anim-svg *,.anim.still .anim-scene{animation:none!important}.anim.still .anim-stage>.anim-old{display:none}
`;

function injectCss(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s);
}

// ---------- where picture-step sets live (Mo, 9 Oct 2026; docs/STEPS_PLAYER.md "Where the pictures live") ----------
// tools/build.py lists every live picture-step set in book.steps and chooses where it lives from its group:
// "precache" (Emergency and CPR) sets are inside the APK and precached from the first open; "on-demand" sets are not.
// An on-demand set downloads the first time a page shows it (automatically on Wi-Fi only, like the voice packs; when
// the person opens the animation itself, on any connection), one file at a time into the cache below. It plays only
// when every one of its files is on the phone (all or nothing); until then the SVG version plays at once, so nothing
// ever waits for the network. A failed or cut-off download is tried again quietly the next time. Inside the Android
// app the files come from the website (config.appUrl), as the narration does. The app calls stepsSetup(book.steps).
const SET_CACHE = 'fhb-steps-v1';
const SETS = { info: {}, base: new URL('../', import.meta.url).href, busy: {}, ready: {}, have: {}, fns: [], swept: false };
const onDemand = (name) => { const e = SETS.info[name]; return e && e.offline === 'on-demand' && e.files && e.files.length ? e : null; };
const setUrl = (f) => new URL(f, SETS.base).href;
const canCache = () => typeof caches !== 'undefined' && !!caches.open;
// data saver, 2G or mobile data (the same test as the voice packs in js/app.js)
const slowNet = () => { const c = navigator.connection; return !!(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '') || /^(cellular|wimax|bluetooth)$/.test(c.type || ''))); };

export function stepsSetup(info, base) {
  SETS.info = info && typeof info === 'object' ? info : {};
  if (base) SETS.base = new URL(base, location.href).href;
  SETS.ready = {}; SETS.have = {};
  if (!canCache()) return;
  Object.keys(SETS.info).forEach((n) => { if (onDemand(n)) haveSet(n); });
  if (!SETS.swept) { SETS.swept = true; setTimeout(sweepSets, 8000); }
}
// true when the animation can play its picture steps now (a precache set, or an on-demand set all on the phone)
export const stepsHave = (name) => !onDemand(name) || !!SETS.have[name];
// fn(name) runs when an on-demand set has finished downloading (the app swaps its posters in)
export function onStepsReady(fn) { SETS.fns.push(fn); }
// a page shows this animation: download its set if it is on-demand and not on the phone yet (Wi-Fi only)
export function prefetchSteps(name) { getSet(String(name).replace(/^anim\./, ''), 'page'); }

function haveSet(name) {
  const e = onDemand(name);
  if (!e || !canCache()) return Promise.resolve(false);
  return caches.open(SET_CACHE).then((c) => Promise.all(e.files.map((f) => c.match(setUrl(f)))))
    .then((rs) => { const ok = rs.every((r) => !!r); if (ok) SETS.have[name] = true; return ok; }, () => false);
}
// the playable set from the phone's cache (pictures as blob: URLs, so it plays with no network and no service
// worker), or null when any file is missing
function readySet(name) {
  const e = onDemand(name);
  if (!e || !canCache()) return Promise.resolve(null);
  if (SETS.ready[name]) return SETS.ready[name];
  const files = e.files;
  const p = caches.open(SET_CACHE).then((c) => Promise.all(files.map((f) => c.match(setUrl(f))))).then((rs) => {
    if (rs.some((r) => !r)) return null; // never part of a set
    return Promise.all([rs[0].json()].concat(rs.slice(1).map((r) => r.blob()))).then((parts) => {
      const srcs = {};
      files.slice(1).forEach((f, i) => { srcs[f] = URL.createObjectURL(parts[i + 1]); });
      return import('./steps.js').then((m) => m.build(name, parts[0], srcs));
    });
  }).catch(() => null).then((s) => {
    if (s) SETS.have[name] = true;
    else if (SETS.ready[name] === p) delete SETS.ready[name];
    return s;
  });
  SETS.ready[name] = p;
  return p;
}
// why: 'page' (a page shows the animation: Wi-Fi only) or 'open' (the person opened it: any connection)
function getSet(name, why) {
  const e = onDemand(name);
  if (!e || SETS.have[name] || SETS.busy[name] || !canCache() || navigator.onLine === false) return;
  if (why !== 'open' && slowNet()) return;
  SETS.busy[name] = true;
  downloadSet(name, e.files).then(() => true, () => false).then((ok) => {
    SETS.busy[name] = false;
    if (ok) readySet(name).then((s) => { if (s) SETS.fns.forEach((fn) => { try { fn(name); } catch (er) {} }); });
  });
}
async function downloadSet(name, files) {
  const c = await caches.open(SET_CACHE);
  for (let i = 0; i < files.length; i++) { // one at a time, gentle on a slow line; files kept from a cut-off try stay
    const u = setUrl(files[i]);
    if (await c.match(u)) continue;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => { if (ac) ac.abort(); }, 60000); // a stalled line: give up, try again next time
    try {
      const r = await fetch(u, ac ? { signal: ac.signal } : {});
      if (!r.ok || r.status !== 200) throw new Error('steps ' + r.status + ' ' + u);
      await c.put(u, r);
    } finally { clearTimeout(t); }
  }
  await dropOldFiles(c, name);
}
// the files of an older version of a set (another ?v=) leave the phone once the new one is complete
async function dropOldFiles(c, name) {
  const e = onDemand(name); if (!e) return;
  const keep = {}; e.files.forEach((f) => { keep[setUrl(f)] = 1; });
  const json = setUrl('anim/steps/' + name + '.json'), dir = setUrl(e.dir || 'img/steps/' + name + '/');
  const keys = await c.keys();
  for (let i = 0; i < keys.length; i++) { const u = keys[i].url; if (!keep[u] && (u.split('?')[0] === json || u.indexOf(dir) === 0)) await c.delete(keys[i]); }
}
// once after the start: files of sets that are no longer on-demand (or no longer in the book) leave the phone
function sweepSets() {
  if (!canCache() || !Object.keys(SETS.info).length || Object.keys(SETS.busy).some((n) => SETS.busy[n])) return;
  caches.open(SET_CACHE).then(async (c) => {
    const keep = {};
    Object.keys(SETS.info).forEach((n) => { const e = onDemand(n); if (e) e.files.forEach((f) => { keep[setUrl(f)] = 1; }); });
    const keys = await c.keys();
    for (let i = 0; i < keys.length; i++) if (!keep[keys[i].url]) await c.delete(keys[i]);
  }).catch(() => {});
}

// why: 'page' (a poster) or 'open' (the player): see getSet
export async function loadAnimation(name, plain, noSteps, why) {
  name = String(name).replace(/^anim\./, '');
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('bad animation id ' + name);
  if (!noSteps && STEPS.includes(name) && onDemand(name)) {
    // on-demand: only a set that is all on the phone plays; otherwise its download starts and the SVG version plays now
    const s = await readySet(name);
    if (s) { injectCss('anim-css', CSS); return s; }
    getSet(name, why || 'page');
  } else if (!noSteps && STEPS.includes(name)) {
    // a picture-step version; if its data is missing or broken, the cine or SVG version plays
    if (!cache.has('steps:' + name)) cache.set('steps:' + name, import('./steps.js').then((m) => m.loadSteps(name)).catch(() => null));
    const s = await cache.get('steps:' + name);
    if (s) { injectCss('anim-css', CSS); return s; }
  }
  if (!plain && CINE.includes(name)) {
    if (!cache.has('cine:' + name)) cache.set('cine:' + name, import(new URL('cine/' + name + '.js', ANIM_BASE).href).then((m) => m.default, () => null));
    const c = await cache.get('cine:' + name);
    if (c && c.cine) { injectCss('anim-css', CSS); injectCss('anim-css-cine-' + name, c.css || ''); return c; }
  }
  if (!cache.has(name)) cache.set(name, import(new URL(name + '.js', ANIM_BASE).href).then((m) => m.default));
  const data = await cache.get(name);
  injectCss('anim-css', CSS);
  injectCss('anim-css-' + name, data.css || '');
  return data;
}

// A still picture of one scene (default the first), e.g. for the topic block's poster.
export async function animPoster(name, i = 0) {
  const d = await loadAnimation(name);
  if (d.cine) return d.poster(i);
  return svgOf(d, d.scenes[i] || d.scenes[0]);
}

// Picture-book look (data v >= 2): a warm light from the upper left and a soft vignette over every scene.
const LIGHT = '<radialGradient id="ak-wl" cx=".12" cy="-.05" r="1.05"><stop offset="0" stop-color="#FFD596" stop-opacity=".26"/><stop offset=".55" stop-color="#FFD596" stop-opacity="0"/></radialGradient>'
  + '<radialGradient id="ak-vg" cx=".5" cy=".45" r=".78"><stop offset=".6" stop-color="#3A2010" stop-opacity="0"/><stop offset="1" stop-color="#3A2010" stop-opacity=".24"/></radialGradient>';
function svgOf(d, sc) {
  const w = d.w || 360, h = d.h || 240, v2 = (d.v || 1) >= 2 && sc.light !== false;
  const over = v2 ? `<rect width="${w}" height="${h}" fill="url(#ak-wl)"/><rect width="${w}" height="${h}" fill="url(#ak-vg)"/>` : '';
  return `<svg class="anim-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs>${d.defs || ''}${v2 ? LIGHT : ''}</defs><g class="anim-scene">${sc.svg}</g>${over}</svg>`;
}

// Camera (data v >= 2): a slow push-in on every scene, or the scene's own cam:
// {o:[x%,y%] origin, s:[from,to] scale, x:[from,to] and y:[from,to] in % of the stage, ms}.
function camStyle(d, sc) {
  if ((d.v || 1) < 2 || sc.cam === false) return '';
  const c = sc.cam || {}, o = c.o || [50, 55], s = c.s || [1, 1.045], x = c.x || [0, 0], y = c.y || [0, 0];
  return `--cx:${o[0]}%;--cy:${o[1]}%;--s0:${s[0]};--s1:${s[1]};--x0:${x[0]}%;--x1:${x[1]}%;--y0:${y[0]}%;--y1:${y[1]}%;--cd:${(c.ms || sc.ms || 9000) + 1500}ms`;
}

export async function mountAnimation(el, name, opts = {}) {
  const d = await loadAnimation(name, opts.cine === false, opts.steps === false, 'open');
  const lg = opts.lang || 'fa';
  const rtl = lg !== 'en';
  const reduce = () => !!opts.still || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const adult = opts.adult != null ? opts.adult : !!d.adult;
  const L = (k) => (opts.t && opts.t(k) && opts.t(k) !== k ? opts.t(k) : (LBL[k][lg] != null ? LBL[k][lg] : LBL[k].en));
  const text = (id) => {
    if (opts.text) return opts.text(id) || '';
    const n = opts.narration && opts.narration[id]; return n ? (n[lg] != null ? n[lg] : n.en != null ? n.en : '') : '';
  };
  const titleId = d.id + '.title';
  const n = d.scenes.length;
  const st = { i: 0, token: 0, timer: 0, t0: 0, seen: new Set(), dead: false };

  el.innerHTML = `<div class="anim${adult ? ' adult' : ''}${opts.still ? ' still' : ''}" dir="${rtl ? 'rtl' : 'ltr'}" lang="${lg === 'fa' ? 'fa-AF' : lg === 'ps' ? 'ps-AF' : 'en'}">
  <div class="anim-top">${opts.onClose ? `<button class="spk ax" aria-label="${esc(L('close'))}">${IC.close}</button>` : ''}<h2>${esc(text(titleId))}</h2><button class="spk at" data-asay="${esc(titleId)}" aria-label="${esc(L('listen'))}">${IC.spk}</button></div>
  <div class="anim-stage"></div>
  <div class="anim-dots">${d.scenes.map((s, k) => `<button data-i="${k}" aria-label="${esc(L('of').replace('{i}', num(k + 1, lg)).replace('{n}', num(n, lg)))}"><i></i></button>`).join('')}</div>
  <div class="anim-text" aria-live="polite"><p></p><button class="spk as" aria-label="${esc(L('listen'))}">${IC.spk}</button></div>
  <div class="anim-ctl"><button class="pv">${IC.prev}<span>${esc(L('previous'))}</span></button><button class="rp" aria-label="${esc(L('replay'))}">${IC.replay}</button><button class="nx"><span></span></button></div>
</div>`;
  const root = el.firstElementChild;
  const $ = (s) => root.querySelector(s);
  const stage = $('.anim-stage'), para = $('.anim-text p'), box = $('.anim-text');

  function clear() { clearTimeout(st.timer); st.timer = 0; }
  function speakingUI(on) { box.classList.toggle('speaking', on); $('.as').classList.toggle('speaking', on); }

  // schedule the move to the next scene, at least minMs after the scene began
  function advanceLater(token, extra = 700) {
    if (token !== st.token || st.dead) return;
    speakingUI(false);
    clear();
    const minMs = opts.minMs != null ? opts.minMs : 3500;
    // a picture-step scene may still be counting (e.g. 30 pushes): let it finish first
    const left = st.cine && st.cine.left ? st.cine.left() : 0;
    const wait = Math.max(extra, minMs - (Date.now() - st.t0), left + (left ? 500 : 0));
    st.timer = setTimeout(function tick() {
      if (token !== st.token || st.dead) return;
      if (document.hidden) { st.timer = setTimeout(tick, 1000); return; }
      if (st.i < n - 1 && opts.autoAdvance !== false) go(st.i + 1);
    }, wait);
  }

  function say(ids) {
    const token = ++st.token; clear(); st.t0 = Date.now();
    const sc = d.scenes[st.i];
    let r = null;
    if (opts.play) { try { r = opts.play(ids || [sc.id]); } catch { r = null; } }
    const hooked = !!(r && typeof r.then === 'function') || r === true;
    speakingUI(hooked);
    if (r === true) return; // the app will call ctl.narrationEnded()
    if (hooked) {
      // resolve with false or 'stopped' when the narration was cut off by the user: then stay
      r.then((v) => (v === false || v === 'stopped' ? token === st.token && speakingUI(false) : advanceLater(token)), () => advanceLater(token));
    } else {
      // no narration hook: about 6 s a scene, longer for long lines so slow readers can finish
      const words = (text(sc.id).match(/\S+/g) || []).length;
      st.timer = setTimeout(() => advanceLater(token, 0), opts.sceneMs || Math.max(sc.ms || 6000, words * 380));
    }
  }

  function render(i, fresh) {
    const sc = d.scenes[i];
    if (d.cine) (st.cine || (st.cine = d.mount(stage, { lang: lg, still: reduce() }))).show(i, true);
    else {
    const old = stage.querySelector('.anim-svg:not(.anim-old)');
    stage.querySelectorAll('.anim-old').forEach((x) => x.remove());
    const tmp = document.createElement('div'); tmp.innerHTML = svgOf(d, sc);
    const svg = tmp.firstElementChild;
    const cam = camStyle(d, sc);
    if (cam) { svg.classList.add('anim-cam'); svg.setAttribute('style', cam); }
    if (old && !fresh && !reduce()) {
      // cross-fade: the old picture stays on top and fades out while the new scene starts underneath
      old.classList.add('anim-old'); old.style.top = '0'; old.classList.remove('anim-cam');
      const tf = getComputedStyle(old).transform; old.style.transform = tf && tf !== 'none' ? tf : '';
      old.style.animation = ''; stage.insertBefore(svg, old);
      setTimeout(() => old.remove(), 600);
    } else { stage.innerHTML = ''; stage.appendChild(svg); }
    }
    para.textContent = text(sc.id);
    $(".as").dataset.asay = sc.id;
    root.querySelectorAll('.anim-dots button').forEach((b, k) => {
      if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('seen', st.seen.has(k) && k !== i);
    });
    $('.pv').disabled = i === 0;
    const last = i === n - 1;
    $('.nx').innerHTML = last ? `${IC.done}<span>${esc(L('done'))}</span>` : `<span>${esc(L('next'))}</span>${IC.next}`;
  }

  function go(i, quiet) {
    if (st.dead) return;
    i = Math.max(0, Math.min(n - 1, i));
    if (stage.firstChild) st.seen.add(st.i);
    st.i = i; st.seen.add(i);
    render(i);
    if (opts.onScene) opts.onScene(i, d.scenes[i].id);
    if (!quiet) say();
  }

  function stopAll() { st.token++; clear(); speakingUI(false); if (opts.stop) try { opts.stop(); } catch {} }

  // events
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('pv')) go(st.i - 1);
    else if (b.classList.contains('nx')) { if (st.i < n - 1) go(st.i + 1); else { stopAll(); if (opts.onClose) opts.onClose(); else go(0); } }
    else if (b.classList.contains('rp')) { render(st.i, true); say(); }
    else if (b.classList.contains('as')) say();
    else if (b.classList.contains('at')) say([titleId, d.scenes[st.i].id]);
    else if (b.classList.contains('ax')) { stopAll(); opts.onClose(); }
    else if (b.dataset.i) go(+b.dataset.i);
  });
  // swipe: the next scene comes from the reading direction (RTL: swipe right for next)
  let sx = null, sy = 0;
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const fwd = rtl ? dx > 0 : dx < 0;
    go(st.i + (fwd ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { sx = null; });
  const onKey = (e) => {
    if (!root.isConnected) return;
    if (e.key === 'ArrowRight') go(st.i + (rtl ? -1 : 1));
    else if (e.key === 'ArrowLeft') go(st.i + (rtl ? 1 : -1));
    else if (e.key === 'Escape' && opts.onClose) { stopAll(); opts.onClose(); }
  };
  document.addEventListener('keydown', onKey);

  go(opts.start || 0, opts.autoplay === false);
  if (opts.autoplay === false) { st.t0 = Date.now(); }

  return {
    get index() { return st.i; },
    get count() { return n; },
    go: (i) => go(i), next: () => go(st.i + 1), back: () => go(st.i - 1),
    replay: () => { render(st.i, true); say(); },
    // the app calls this when the current scene's narration has finished playing
    narrationEnded: () => advanceLater(st.token),
    stop: stopAll,
    destroy() { st.dead = true; stopAll(); if (st.cine) st.cine.destroy(); document.removeEventListener('keydown', onKey); el.innerHTML = ''; },
    reduced: reduce,
  };
}

// The "which one?" screen for a group: four big cards (picture, name, speaker). opts as for
// mountAnimation, plus onPick(animName). Says the question when it opens (unless autoplay is false).
export async function mountPicker(el, name, opts = {}) {
  const g = animGroup(name); if (!g) throw new Error('no animation group ' + name);
  const lg = opts.lang || 'fa';
  const rtl = lg !== 'en';
  const L = (k) => (opts.t && opts.t(k) && opts.t(k) !== k ? opts.t(k) : (LBL[k][lg] != null ? LBL[k][lg] : LBL[k].en));
  const text = (id) => {
    if (opts.text) return opts.text(id) || '';
    const n = opts.narration && opts.narration[id]; return n ? (n[lg] != null ? n[lg] : n.en != null ? n.en : '') : '';
  };
  const posters = await Promise.all(g.items.map((it) => animPoster(it.anim, it.poster || 0)));
  let dead = false;
  const speaking = (b, on) => { el.querySelectorAll('.spk.speaking').forEach((x) => x.classList.remove('speaking')); if (b && on) b.classList.add('speaking'); };
  const say = (ids, b) => {
    let r = null;
    if (opts.play) { try { r = opts.play(ids); } catch { r = null; } }
    if (r && typeof r.then === 'function') { speaking(b, true); r.then(() => !dead && speaking(b, false), () => !dead && speaking(b, false)); }
  };
  el.innerHTML = `<div class="anim${g.adult ? ' adult' : ''}" dir="${rtl ? 'rtl' : 'ltr'}" lang="${lg === 'fa' ? 'fa-AF' : lg === 'ps' ? 'ps-AF' : 'en'}">
  <div class="anim-top">${opts.onClose ? `<button class="spk ax" aria-label="${esc(L('close'))}">${IC.close}</button>` : ''}<h2>${esc(text(g.title))}</h2><button class="spk" data-asay="${esc(g.title)}" aria-label="${esc(L('listen'))}">${IC.spk}</button></div>
  <div class="anim-text anim-ask"><p>${esc(text(g.ask))}</p><button class="spk" data-asay="${esc(g.ask)}" aria-label="${esc(L('listen'))}">${IC.spk}</button></div>
  <div class="anim-pick">${g.items.map((it, k) => `<div class="card"><button class="pick" data-pick="${esc(it.anim)}" aria-label="${esc(text(it.label))}">${posters[k]}</button>
    <div class="row"><b data-pick="${esc(it.anim)}">${esc(text(it.label))}</b><button class="spk" data-asay="${esc(it.label)}" aria-label="${esc(L('listen'))}">${IC.spk}</button></div></div>`).join('')}</div>
</div>`;
  const root = el.firstElementChild;
  const stop = () => { speaking(null); if (opts.stop) try { opts.stop(); } catch {} };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick],button'); if (!t) return;
    if (t.dataset.pick) { stop(); if (opts.onPick) opts.onPick(t.dataset.pick); }
    else if (t.dataset.asay) say([t.dataset.asay], t);
    else if (t.classList.contains('ax')) { stop(); opts.onClose(); }
  });
  const onKey = (e) => { if (root.isConnected && e.key === 'Escape' && opts.onClose) { stop(); opts.onClose(); } };
  document.addEventListener('keydown', onKey);
  if (opts.autoplay !== false) say([g.ask], root.querySelector('.anim-ask .spk'));
  return { group: g, stop, destroy() { dead = true; stop(); document.removeEventListener('keydown', onKey); el.innerHTML = ''; } };
}

// Full-screen player over the page (what a topic's "anim" block opens). Returns the controller.
// For a group name (e.g. 'cpr') it first shows the picker, then plays the chosen variant;
// opts.pick skips the picker (e.g. 'cpr-baby').
export async function openAnimation(name, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'anim-overlay'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const inner = document.createElement('div'); wrap.appendChild(inner);
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  let ctl = null;
  const close = () => {
    if (!wrap.isConnected) return;
    if (ctl) ctl.destroy();
    wrap.remove(); document.body.style.overflow = prevOverflow;
    if (opts.onClose) opts.onClose();
  };
  const play = async (anim) => {
    if (ctl) ctl.destroy();
    ctl = await mountAnimation(inner, anim, { ...opts, onClose: close });
    ctl.close = close; wrap.scrollTop = 0;
    if (opts.onPick && anim !== name) opts.onPick(anim);
    return ctl;
  };
  try {
    if (animGroup(name) && !opts.pick) {
      ctl = await mountPicker(inner, name, { ...opts, onClose: close, onPick: (a) => { play(a).catch(close); } });
      ctl.close = close;
      ctl.choose = play;
      return ctl;
    }
    return await play(opts.pick || name);
  } catch (e) { close(); throw e; }
}
