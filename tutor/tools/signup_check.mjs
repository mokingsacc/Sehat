// Browser check for sign-up (P10; DESIGN.md 6 to 8), against a running hub, in Chromium through Playwright:
//   1. A class card: /?join=CODE → Welcome says "Class code found" → year 8 → the consent screen (its four rows read
//      on open; "Hold to agree" held for 3 seconds) → the lock offer (1234 twice) → Home. The phone joined: it holds a
//      token, a number and the consent record, and no name. Timed: it must take under 3 minutes.
//   2. No card, early years: "Not in school yet" → Home at once; no join, no consent, no event leaves the phone; the
//      grown-up's corner opens Who is learning after a 2-second press.
//   3. The lock: the learner of 1 opens the app again → the lock; a wrong PIN says so; "I forgot" shows the 24-hour
//      reset; her PIN opens Home and cancels the reset.
// Every screen is spoken: each one either reads itself on open or has a page speaker that, tapped, says something
// (a stand-in voice records what would be said; nothing is played). Screenshots at 360 px go to --out.
// Run from tutor/ (a class code from `python -m tutor_hub class-code`):
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/signup_check.mjs --hub http://127.0.0.1:8000 --code K7QM-4PRT --out shots/ [--lang prs]
// Exit code 1 when a check fails.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = args.hub || 'http://127.0.0.1:8000';
const OUT = args.out || 'shots';
const CODE = args.code;
const LANG = args.lang || 'prs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
if (!CODE) { console.error('--code: a class code from `python -m tutor_hub class-code`'); process.exit(2); }

// a stand-in voice for every language: records what would be said
function fakeVoice() {
  window.__said = [];
  const voices = ['fa-IR', 'ps-AF', 'en-GB'].map((lang) => ({ lang, name: 'stand-in ' + lang }));
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => voices, speak: (u) => window.__said.push(u.text), cancel() {}, onvoiceschanged: null } });
  navigator.vibrate = () => true;
}

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
mkdirSync(OUT, { recursive: true });

async function newPhone() {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: false });
  await ctx.addInitScript(fakeVoice);
  const page = await ctx.newPage();
  const sent = [];
  const errors = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) sent.push([r.method(), new URL(r.url()).pathname, r.postData()]); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, sent, errors };
}

const hash = (page) => page.evaluate(() => location.hash);
async function at(page, want, ms = 8000) {
  await page.waitForFunction((w) => location.hash.startsWith(w) && document.querySelector('#app .screen'), want, { timeout: ms });
  await page.waitForTimeout(600);           // read-on-open waits 300 to 400 ms
}
// the screen spoke on open, or its page speaker says something when tapped
async function spoken(page, name) {
  let said = await page.evaluate(() => window.__said.length);
  if (!said) {
    const spk = await page.$('#app [data-page]');
    if (spk) { await spk.click(); said = await page.evaluate(() => window.__said.length); }
  }
  check(said > 0, `${name}: spoken`);
  await page.evaluate(() => { window.__said = []; });
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `signup-${name}-${LANG}-360.png`) });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('qalam.v2')));

// 1. a class card
const t0 = Date.now();
const a = await newPhone();
await a.page.goto(`${HUB}/?join=${encodeURIComponent(CODE)}`);
await at(a.page, '#/welcome');
check(!(await a.page.evaluate(() => location.search.includes('join'))), 'the class code leaves the address at once');
if (LANG !== 'prs') { await a.page.click(`.langs button[lang="${LANG === 'ps' ? 'ps-AF' : 'en'}"]`); await a.page.waitForTimeout(300); }
check((await a.page.textContent('.top .kicker')).trim().length > 0, 'Welcome says the class code was found');
await spoken(a.page, 'Welcome');
await shot(a.page, 'welcome');
await a.page.click('.yearbox.secondary:not(.adults) .years button >> nth=1');        // year 8
await at(a.page, '#/consent/');
check((await a.page.$$('.consent-row')).length === 4, 'consent: four rows');
await spoken(a.page, 'Consent');
await shot(a.page, 'consent');
const hold = await a.page.$('.consent .hold');
await hold.scrollIntoViewIfNeeded();                                       // below the fold in English at 360 px
const box = await hold.boundingBox();
await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await a.page.mouse.down();
await a.page.waitForTimeout(1200);
await a.page.mouse.up();                                                   // too early: nothing happens
check((await hash(a.page)).startsWith('#/consent/'), 'letting go early cancels');
await a.page.mouse.down();
await a.page.waitForTimeout(3300);
await a.page.mouse.up();
await at(a.page, '#/lock/offer/');
await spoken(a.page, 'Lock offer');
await shot(a.page, 'lock-offer');
await a.page.keyboard.type('1234');
await a.page.waitForTimeout(400);
await a.page.keyboard.type('1234');
await at(a.page, '#/home');
await spoken(a.page, 'Home');
await a.page.waitForTimeout(1500);                                         // the join goes out
const l1 = (await stored(a.page)).learners[0];
// since W4 what came with joining is her seat on this hub, under the hub's id (WEBSITE.md 3.3)
const hubId = (await (await fetch(`${HUB}/api/hello`)).json()).id;
const s1 = (l1.seats || {})[hubId] || {};
check(!!s1.token && !!s1.number && s1.consent && s1.consent.sent === true && s1.code === CODE.replace('-', ''),
  "joined: a token, a number, the class code and the consent sent, her seat under the hub's id");
check(!!l1.lock && !JSON.stringify(l1).includes('1234'), 'the lock is kept as a hash, never the PIN');
check(!('name' in l1), 'qalam.v2 holds no name');
const join1 = a.sent.find(([m, p]) => m === 'POST' && p === '/api/join');
check(!!join1 && Object.keys(JSON.parse(join1[2])).sort().join() === 'band,cohort_code,consent,lang,picture', 'the join carries no name');
const secs = (Date.now() - t0) / 1000;
check(secs < 180, `sign-up with a class card took ${secs.toFixed(0)} s (under 3 minutes)`);
await a.page.goto(`${HUB}/app/#/who`);
await at(a.page, '#/who');
await spoken(a.page, 'Who is learning');
await shot(a.page, 'who');
await a.page.goto(`${HUB}/app/#/settings`);
await a.page.reload();                                                      // the app opened again
await at(a.page, '#/');
check((await hash(a.page)).startsWith('#/lock'), 'Settings is behind her lock after a reload');

// 3. the lock (same phone, opened again)
await a.page.evaluate(() => { window.__said = []; });
await spoken(a.page, 'Lock');
await shot(a.page, 'lock');
await a.page.keyboard.type('0000');
await a.page.waitForTimeout(500);
check((await a.page.textContent('.lock .msg')).trim().length > 0, 'a wrong PIN says so');
await a.page.click('.lock .link >> nth=0');                                  // I forgot
await a.page.waitForTimeout(200);
check((await a.page.textContent('.lock .reset')).trim().length > 0, '"I forgot" shows the reset waiting, with its hours');
await shot(a.page, 'lock-reset');
await a.page.keyboard.type('1234');
await at(a.page, '#/settings');
check(!(await stored(a.page)).learners[0].lock.resetAt, 'her PIN cancels the reset');
await spoken(a.page, 'Settings');
await shot(a.page, 'settings');
check(a.errors.length === 0, 'no page errors (class card)' + (a.errors.length ? ': ' + a.errors.join('; ') : ''));
await a.ctx.close();

// 2. no card, early years
const b = await newPhone();
await b.page.goto(`${HUB}/app/`);
await at(b.page, '#/welcome');
await b.page.click('.yearbox.primary .dashed');
await at(b.page, '#/home');
await b.page.waitForTimeout(1500);
const l2 = (await stored(b.page)).learners[0];
check(l2.band === 'ey' && !Object.keys(l2.seats || {}).length && l2.picture, 'early years: on the phone only, with an alias picture');
check(!b.sent.some(([, p]) => p === '/api/join' || p === '/api/events' || p === '/api/me'), 'no join, no consent, no event left the phone');
const corner = await b.page.$('.round.corner');
const cb = await corner.boundingBox();
await b.page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await b.page.mouse.down();
await b.page.waitForTimeout(600);
await shot(b.page, 'ey-corner-holding');
await b.page.waitForTimeout(1700);
await b.page.mouse.up();
await at(b.page, '#/who');
check(true, 'the grown-up\'s corner opens Who is learning after 2 seconds');
await shot(b.page, 'ey-who');
check(b.errors.length === 0, 'no page errors (early years)' + (b.errors.length ? ': ' + b.errors.join('; ') : ''));
await b.ctx.close();

await browser.close();
console.log(problems.length ? `${problems.length} problems` : 'sign-up checks pass');
process.exit(problems.length ? 1 : 0);
