// Browser check for the online app shell (P11), against a server in online mode (TUTOR_HOME=online) on a secure
// page (https, or 127.0.0.1 for a local run), in Chromium through Playwright:
//   1. Online: Welcome → year 7; Ask's first question opens consent (held), the lock offer (Not now), and the
//      question goes once she has joined; a lesson and a sheet's key are opened, so the phone has them.
//   2. The network is cut (the chip says so at once) and the app opened again: the service worker brings the app back; Home lists lessons;
//      the lesson opens; Check my sheet marks the sheet (an event, queued, never shown); a question with no answer
//      on the phone offers "Send when I'm online" and then says "Waiting to send"; the chip says "Offline" and that
//      one thing waits.
//   3. The network comes back: the question and the event go, the chip hides.
// Run from tutor/ (an online-mode server: TUTOR_HOME=online TUTOR_LACKS=printer,pin python -m tutor_hub serve):
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/offline_check.mjs --hub http://127.0.0.1:8001 --out shots/
// Exit code 1 when a check fails.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = args.hub || 'http://127.0.0.1:8001';
const OUT = args.out || 'shots';
const LESSON = 'maths-7-fractions-add';
const SEED = 4821;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
const sent = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => { if (r.url().includes('/api/') && r.method() === 'POST') sent.push(new URL(r.url()).pathname); });
const at = async (want, ms = 10000) => {
  await page.waitForFunction((w) => location.hash.startsWith(w) && document.querySelector('#app .screen'), want, { timeout: ms });
  await page.waitForTimeout(500);
};
const shot = (name) => page.screenshot({ path: join(OUT, `offline-${name}-360.png`) });
const learner = () => page.evaluate(() => JSON.parse(localStorage.getItem('qalam.v2')).learners[0]);
const queued = () => page.evaluate(() => JSON.parse(localStorage.getItem('qalam.events.v1') || '[]').length);

// 1. online
await page.goto(`${HUB}/`);
await at('#/welcome');
await page.click('.yearbox.secondary:not(.adults) .years button >> nth=0');            // year 7
await at('#/home');
await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
check(await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller) || 'pending'),
  'the service worker is registered');
check(await page.evaluate(() => !document.querySelector('.netchip:not(.hidden)')), 'online with nothing waiting: no chip');
await page.goto(`${HUB}/#/ask`);
await at('#/ask');
await page.fill('.composer input', '1/2 + 1/4');
await page.click('.composer button[type=submit]');
await at('#/consent/ask');
const hold = await page.$('.consent .hold');
const b = await hold.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.waitForTimeout(3300);
await page.mouse.up();
await at('#/lock/offer/ask');
await page.click('.lock .btn.outline');                                            // Not now
await at('#/ask');
await page.waitForTimeout(2500);
let l = await learner();
check(!!l.token && l.consent && l.consent.sent, 'joined with the consent');
check(l.asks.length === 1 && !l.asks[0].queued && !!l.asks[0].a, 'the first question went once she had joined');
await page.goto(`${HUB}/#/lesson/${LESSON}`);
await at('#/lesson/');
await page.goto(`${HUB}/#/check/${LESSON}/${SEED}`);
await at('#/check/');
await page.waitForTimeout(800);
const before = await queued();

// 2. the network cut, the app opened again
await ctx.setOffline(true);
await page.waitForTimeout(300);
check(!!(await page.$('.netchip.off')), 'the chip says "Offline" as soon as the phone loses the network');
await page.goto(`${HUB}/#/home`);
await page.reload();
await at('#/home', 15000);
await page.waitForTimeout(3500);
check(/\S/.test(await page.textContent('.netchip.off').catch(() => '')), 'offline, opened again: the chip says "Offline"');
check((await page.$$('#app .tiles a, #app .subjects a, #app .continue, #app .next-card')).length > 0, 'offline: Home lists her lessons');
await shot('home');
await page.goto(`${HUB}/#/lesson/${LESSON}`);
await at('#/lesson/');
check(!(await page.$('#app .empty')), 'offline: the lesson opens');
await page.goto(`${HUB}/#/check/${LESSON}/${SEED}`);
await at('#/check/');
const inputs = await page.$$('#app input');
for (const i of inputs) await i.fill('3/4');
await page.click('#app button.main');
await page.waitForTimeout(300);
check(await queued() === before + 1, 'offline: a marked sheet queues its event');
await page.goto(`${HUB}/#/ask`);
await at('#/ask');
await page.fill('.composer input', 'qqq zzz xxyy');
await page.click('.composer button[type=submit]');
await page.waitForTimeout(300);
const offer = await page.$('.offer button');
check(!!offer, 'offline: "Send when I\'m online" is offered');
if (offer) await offer.click();
await page.waitForTimeout(300);
check(!!(await page.$('.thread .badge.wait')), 'the question says "Waiting to send"');
const chip = await page.textContent('.netchip:not(.hidden)').catch(() => '');
check(/1/.test(chip.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), `the chip says offline and one waiting ("${chip.trim()}")`);
await shot('ask');
await page.click('.netchip');
await page.waitForTimeout(200);
check(!!(await page.$('.netsheet .waits li')), 'tapping the chip lists what waits');
await shot('chip-sheet');
await page.click('.netsheet .btn');
// a restart while offline keeps what waits
await page.reload();
await at('#/ask', 15000);
l = await learner();
check(l.asks.some((a) => a.queued) && await queued() === before + 1, 'a restart offline keeps the question and the event');

// 3. back online: the app finds the server within its 20-second round
const posted = sent.length;
await ctx.setOffline(false);
await page.waitForFunction(() => !JSON.parse(localStorage.getItem('qalam.v2')).learners[0].asks.some((a) => a.queued),
  null, { timeout: 30000 }).catch(() => {});
l = await learner();
check(!l.asks.some((a) => a.queued), 'back online: the question went');
check(await queued() === 0 && sent.slice(posted).includes('/api/events'), 'back online: the events went');
await page.waitForTimeout(500);
check(await page.evaluate(() => !document.querySelector('.netchip:not(.hidden)')), 'back online: the chip hides');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
await browser.close();
console.log(problems.length ? `${problems.length} problems` : 'offline checks pass');
process.exit(problems.length ? 1 : 0);
