// Start-up and the router. One screen at a time, chosen by the address after # (so the phone's Back button
// works). Each screen is a function that returns { el, tab, cleanup, onHub }.
// Sign-up (P10): a class card's QR opens the app with ?join=CODE, which Welcome takes (signup.js). A learner with a
// PIN lock sees the lock on start, on switching to her, and when the app comes back after 5 minutes away; Welcome,
// Who is learning and the class code stay open without it. The teacher's pages are /teacher/, apart (P20).

import * as account from './account.js';
import * as android from './android.js';
import * as bands from './bands.js';
import * as events from './events.js';
import { dir, htmlLang, s, setLang, setTone } from './i18n.js';
import * as hub from './hub.js';
import * as library from './library.js';
import * as lock from './lock.js';
import * as modules from './modules.js';
import * as outbox from './outbox.js';
import * as state from './state.js';
import { loadClips, stop } from './speech.js';
import { busy, h, nav, netChip, sayTab, toast } from './ui.js';

import ask from './screens/ask.js';
import cert from './screens/cert.js';
import check from './screens/check.js';
import consent from './screens/consent.js';
import credits from './screens/credits.js';
import home from './screens/home.js';
import lesson from './screens/lesson.js';
import lockScreen, { afterUnlock } from './screens/lock.js';
import print from './screens/print.js';
import settings from './screens/settings.js';
import signup, { pendingCode } from './screens/signup.js';
import subject from './screens/subject.js';
import subjects from './screens/subjects.js';
import update from './screens/update.js';
import plan from './screens/plan.js';
import quran from './screens/quran.js';
import university from './screens/university.js';
import welcome from './screens/welcome.js';
import who from './screens/who.js';

// the photo screens load only when opened (the `photo` module, online only)
const photo = (args) => import('./modules/photo.js').then((m) => m.default(args));

const SCREENS = { home, subject, subjects, plan, lesson, ask, print, check, photo, welcome, who, credits, consent, lock: lockScreen,
  settings, signup, cert, quran, university };
const NEEDS_NO_CHILD = new Set(['welcome', 'signup']);
const CLEAN = new Set(['welcome', 'signup']);          // the clean adult look, not the learner's
const OPEN = new Set(['welcome', 'who', 'signup', 'lock']);   // shown without opening her lock
const AWAY_MS = 5 * 60e3;
const app = document.getElementById('app');
let current = null;
let seq = 0;

// the band sets the look and tone (bands.js); Welcome and sign-up use the clean adult look, keeping
// the learner's Bigger text and theme
function applyLook(name) {
  const c = state.child();
  if (c) setLang(c.lang);
  const root = document.documentElement;
  const own = c && !CLEAN.has(name);
  bands.apply(root, own ? c : { text: c && c.text, theme: c && c.theme }, { setTone });
  root.lang = htmlLang();
  root.dir = dir();
  document.title = s('app');
  loadClips(c ? c.lang : 'prs');
}

async function route() {
  const n = ++seq;
  stop();
  if (current && current.cleanup) current.cleanup();
  current = null;
  // #/ask?hw=1: what follows ? reaches the screen as args.query (Homework help's door, C2.3)
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...args] = path.split('/').map(decodeURIComponent);
  args.query = new URLSearchParams(query);
  if (!state.child() && !NEEDS_NO_CHILD.has(name)) { location.replace('#/welcome'); return; }
  if (!modules.routeOn(name)) { location.replace(state.child() ? '#/home' : '#/welcome'); return; }   // switched off
  const c = state.child();
  if (c && c.lock && lock.allowed(c.band) && !state.isUnlocked(c.id) && !OPEN.has(name)) {
    afterUnlock(location.hash);
    location.replace('#/lock');
    return;
  }
  if (account.useCohort()) hub.refresh().then(modulesChanged);     // another learner's class
  outbox.flush();                       // a join, consent, band or question waiting to be sent
  // the Android app older than the server's apk.min: one full-screen card, "Please update Qalam" (P23)
  const tooOld = android.apkState(hub.info() && hub.info().apk) === 'required' && name !== 'credits';
  const screen = tooOld ? update : SCREENS[name] || home;
  applyLook(SCREENS[name] && !tooOld ? name : 'home');
  let out;
  try {
    out = await screen(args);
  } catch (e) {
    console.error(e);
    out = { el: h('div', { class: 'empty' }, s('error')), tab: 'lessons' };
  }
  if (n !== seq) { if (out && out.cleanup) out.cleanup(); return; }   // the child already tapped somewhere else
  current = out;
  const tabs = out.tab && bands.hasTabs(document.documentElement.dataset.band);
  app.className = tabs ? '' : 'no-nav';
  app.replaceChildren(out.el, ...(tabs ? [nav(out.tab)] : []));
  window.scrollTo(0, 0);
  sayTab();                      // a tab tapped in years 1 to 3 or adult literacy says its label
}

function refreshChips() {
  document.querySelectorAll('.netchip').forEach((el) => el.replaceWith(netChip()));
}

// the hub's list of modules changed (or was first heard): load what is new, redraw the tabs, leave a screen
// whose module was switched off
async function modulesChanged() {
  if (!modules.sync()) return false;
  await modules.load();
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (!modules.routeOn(name)) { route(); return true; }
  const bar = app.querySelector('nav.tabs');
  if (bar && current && current.tab) bar.replaceWith(nav(current.tab));
  return true;
}

async function hubCameBack() {
  await library.load(true);
  await modulesChanged();
  if (current && current.onHub) current.onHub(true);
}

// ?join=CODE from a class card's QR: Welcome takes the code; the address loses it at once
function joinFromAddress() {
  let code = null;
  try { code = account.normalCode(new URLSearchParams(location.search).get('join') || ''); } catch { /* no address */ }
  if (!new URLSearchParams(location.search).has('join')) return;
  if (code) pendingCode(code);
  try { history.replaceState(null, '', location.pathname + '#/welcome'); } catch { location.hash = '#/welcome'; }
}

// The service worker keeps the app on the phone where the page is secure (the online home over HTTPS, and a
// laptop's localhost for testing). The hub is plain http, where browsers allow none: there the app keeps its lists
// and lessons in localStorage, as before (F2). A new version takes over at the next start, without a banner.
function serviceWorker() {
  if (!globalThis.isSecureContext || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('no service worker', e));
}

// back after 5 minutes away: every lock closes again (not on idle: she may be writing on paper)
function watchAway() {
  let away = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { away = Date.now(); return; }
    if (away && Date.now() - away > AWAY_MS) { state.lockAll(); route(); }
    away = 0;
  });
}

async function boot() {
  if (!state.preview) joinFromAddress();
  const c = state.child();
  if (c) setLang(c.lang);
  if (!state.preview) account.start();       // a reviewer's preview (state.js) never joins
  account.onNote((key) => toast(s(key)));
  outbox.onSent((msg) => toast(msg));
  outbox.onChange(refreshChips);
  hub.onChange((ok) => { if (ok) outbox.flush(); });
  if (!state.preview) serviceWorker();
  watchAway();
  app.replaceChildren(busy());
  window.addEventListener('hashchange', route);
  hub.onChange(refreshChips);
  let answered = false;
  const connecting = hub.connect().then((ok) => { answered = true; return ok; });
  // draw within a second and a half even when the hub is far away; the lists fill in when it answers
  await Promise.race([connecting, new Promise((r) => setTimeout(r, 1500))]);
  const late = !answered;
  await library.load();
  modules.sync();               // the hub's list, else the one kept on the phone, else the built-in five
  await modules.load();
  await route();
  if (!state.preview) events.start();                // send what earlier visits queued, and again whenever the hub comes back
  if (late) connecting.then((ok) => { if (ok) hubCameBack(); });
  // walking into the hub's Wi-Fi lights the app up without a reload; while connected, the modules switched on
  // are read again every minute, so a module the teacher or admin switches off leaves the phones within a minute
  // and the browser's own word on the connection is heard at once
  window.addEventListener('offline', () => hub.lost());
  window.addEventListener('online', async () => { if (!hub.online() && (await hub.connect())) hubCameBack(); });
  let ticks = 0;
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (!hub.online()) { if (await hub.connect()) hubCameBack(); return; }
    if (++ticks % 3 === 0 && (await hub.refresh()) && (await modulesChanged()) && current && current.onHub) {
      current.onHub(true);
    }
  }, 20000);
}

boot();
