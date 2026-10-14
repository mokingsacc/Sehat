// Start-up and the router. One screen at a time, chosen by the address after # (so the phone's Back button
// works). Each screen is a function that returns { el, tab, cleanup, onHub }.

import { getLang, s, setLang } from './i18n.js';
import * as hub from './hub.js';
import * as library from './library.js';
import * as state from './state.js';
import { stop } from './speech.js';
import { busy, h, hubChip, nav } from './ui.js';

import ask from './screens/ask.js';
import check from './screens/check.js';
import home from './screens/home.js';
import lesson from './screens/lesson.js';
import print from './screens/print.js';
import subject from './screens/subject.js';
import teacher from './screens/teacher.js';
import welcome from './screens/welcome.js';
import who from './screens/who.js';

const SCREENS = { home, subject, lesson, ask, print, check, teacher, welcome, who };
const NEEDS_NO_CHILD = new Set(['welcome', 'teacher']);
const app = document.getElementById('app');
let current = null;
let seq = 0;

// the look follows the child's year: bold for years 0 to 6, clean for 7 to 12
function applyLook(name) {
  const c = state.child();
  if (c) setLang(c.lang);
  const root = document.documentElement;
  root.dataset.mode = name === 'welcome' || name === 'teacher' || !c ? 'big' : state.mode(c);
  root.lang = getLang() === 'ps' ? 'ps-AF' : 'fa-AF';
  document.title = s('app');
}

async function route() {
  const n = ++seq;
  stop();
  if (current && current.cleanup) current.cleanup();
  current = null;
  const [name = '', ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (!state.child() && !NEEDS_NO_CHILD.has(name)) { location.replace('#/welcome'); return; }
  const screen = SCREENS[name] || home;
  applyLook(SCREENS[name] ? name : 'home');
  let out;
  try {
    out = await screen(args);
  } catch (e) {
    console.error(e);
    out = { el: h('div', { class: 'empty' }, s('error')), tab: 'lessons' };
  }
  if (n !== seq) { if (out && out.cleanup) out.cleanup(); return; }   // the child already tapped somewhere else
  current = out;
  app.className = out.tab ? '' : 'no-nav';
  app.replaceChildren(out.el, ...(out.tab ? [nav(out.tab)] : []));
  window.scrollTo(0, 0);
}

function refreshChips() {
  document.querySelectorAll('.hubchip').forEach((el) => el.replaceWith(hubChip()));
}

async function hubCameBack() {
  await library.load(true);
  if (current && current.onHub) current.onHub(true);
}

async function boot() {
  const c = state.child();
  if (c) setLang(c.lang);
  app.replaceChildren(busy());
  window.addEventListener('hashchange', route);
  hub.onChange(refreshChips);
  let answered = false;
  const connecting = hub.connect().then((ok) => { answered = true; return ok; });
  // draw within a second and a half even when the hub is far away; the lists fill in when it answers
  await Promise.race([connecting, new Promise((r) => setTimeout(r, 1500))]);
  const late = !answered;
  await library.load();
  await route();
  if (late) connecting.then((ok) => { if (ok) hubCameBack(); });
  // walking into the hub's Wi-Fi lights the app up without a reload
  setInterval(async () => {
    if (!hub.online() && document.visibilityState === 'visible' && (await hub.connect())) hubCameBack();
  }, 20000);
}

boot();
