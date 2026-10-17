// Browser check for certificates (P25b, C4.2), against a server in online mode (TUTOR_HOME=online, fake AI), in
// Chromium through Playwright:
//   1. A learner joins and her events say she finished the pathway "Everyday maths: money" (through the API).
//   2. The phone opens #/cert/ad-money: the server writes the certificate; she types a sentinel name and prints. The
//      paper (print media) carries the name in its line, under the title "Qalam certificate QC-...".
//   3. The sentinel is in no request (address or body), no storage (local, session, cache), no console line, no title
//      after printing and, with --log, not in the server's log; the paper leaves the page after printing.
//   4. /v/<id> says the certificate is real; a made-up number is not found.
// Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/cert_check.mjs --hub http://127.0.0.1:8001 --out shots/ [--log hub.log]
// Exit code 1 when a check fails.

import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = (args.hub || 'http://127.0.0.1:8001').replace(/\/$/, '');
const OUT = args.out || 'shots';
const SENTINEL = 'Zarghuna Sentinel-7731';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

let problems = 0;
const ok = (good, what) => { console.log(`${good ? 'ok  ' : 'FAIL'} ${what}`); if (!good) problems += 1; };
const api = async (path, body, token) => {
  const r = await fetch(HUB + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Learner-Token': token } : {}) },
    body: JSON.stringify(body) });
  return [r.status, await r.json().catch(() => ({}))];
};

const hello = await (await fetch(HUB + '/api/hello')).json();
ok(hello.home === 'online' && hello.modules.some((m) => m.id === 'cert'), 'an online server with certificates on');
const [js, joined] = await api('/api/join', { band: 'ad', lang: 'en', picture: 'key', consent: { kind: 'self', version: hello.consent } });
ok(js === 200, 'she joined with consent');
const at = new Date().toISOString().slice(0, 16);
const [es] = await api('/api/events', { events: [{ at, verb: 'lesson.done', object: 'adult-maths-1-numbers', value: 3 },
  { at, verb: 'check.done', object: 'adult-maths-2-change', value: 90 }] }, joined.token);
ok(es === 200, 'her events say she finished the pathway');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const seen = [];
page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() || ''}`));
page.on('console', (m) => seen.push('console ' + m.text()));
page.on('pageerror', (e) => { seen.push('error ' + e); ok(false, 'no page error: ' + e); });
await page.addInitScript(([learner]) => {
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('qalam.v2', JSON.stringify({ v: 2, active: 'l1', learners: [learner] }));
  }
  // the print dialog: what would print, and the title it would print under
  window.print = () => {
    const p = document.querySelector('.cert-print');
    window.__printed = { title: document.title, text: p ? p.innerText : '' };
  };
}, [{ id: 'l1', band: 'ad', track: 'reader', lang: 'en', token: joined.token, number: joined.number, cohort: joined.cohort,
  sentBand: 'ad', consent: { kind: 'self', version: hello.consent, at, sent: true },
  done: { 'adult-maths-1-numbers': { stars: 3 }, 'adult-maths-2-change': { stars: 2 } } }]);

await page.goto(HUB + '/#/cert/ad-money');
await page.waitForSelector('.cert-in', { timeout: 15000 });
const id = (await page.textContent('.cert-screen .m')).trim();
ok(/^QC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(id), `the certificate's number (${id})`);
await page.screenshot({ path: `${OUT}/cert-screen.png`, fullPage: true });
await page.fill('.cert-in', SENTINEL);
await page.click('.cert-screen .btn.warm');
const printed = await page.evaluate(() => window.__printed);
ok(printed && printed.text.includes(SENTINEL), 'the paper carries the typed name in its line');
ok(printed && printed.title === `Qalam certificate ${id}`, `the title names no one (${printed && printed.title})`);
ok(printed && /finished the lessons and practice sheets/.test(printed.text) && !/passed/i.test(printed.text),
  'the paper says "has finished", never "passed"');
await page.emulateMedia({ media: 'print' });
await page.setViewportSize({ width: 1123, height: 794 });
await page.screenshot({ path: `${OUT}/cert-paper.png` });
await page.emulateMedia({ media: 'screen' });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
ok(await page.evaluate(() => !document.querySelector('.cert-print') && !document.title.includes('Zarghuna')),
  'after printing the paper leaves the page');
await page.goto(HUB + '/#/home');
await page.waitForSelector('#app .screen');
const stored = await page.evaluate(async () => {
  const out = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.title, document.cookie];
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    for (const r of await c.keys()) out.push(r.url + ' ' + (await (await c.match(r)).text()).slice(0, 200000));
  }
  return out.join('\n');
});
ok(!stored.includes(SENTINEL) && stored.includes(id), 'the name is in no storage; the number is');
ok(!seen.join('\n').includes(SENTINEL), `the name is in no request or console line (${seen.length} seen)`);
if (args.log) ok(!readFileSync(args.log, 'utf8').includes(SENTINEL), "the name is not in the server's log");

await page.goto(`${HUB}/v/${id}`);
await page.waitForSelector('.v-found', { timeout: 10000 });
ok((await page.textContent('.v-found')).includes('real Qalam certificate'), '/v/<id> says it is real');
await page.screenshot({ path: `${OUT}/cert-v.png`, fullPage: true });
await page.goto(`${HUB}/v/QC-00000-00000`);
await page.waitForFunction(() => /find this number|پیدا نشد|ونه موندل/.test(document.body.innerText), null, { timeout: 10000 });
ok(true, '/v/ with a made-up number: not found');
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'certificate checks pass');
process.exit(problems ? 1 : 0);
