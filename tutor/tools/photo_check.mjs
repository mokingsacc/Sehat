// Browser check for photo marking (P14, C2.2), in Chromium with a fixture camera: the test photos from
// tools/make_test_photos.mjs play as the phone's camera (--use-file-for-fake-video-capture). It walks Check my
// sheet -> "This sheet?" -> the explainer -> the camera, which must take the photo itself -> the reading ring ->
// "What I read" -> Fix on the keypad -> "Yes, mark it" -> the marks; then the file-input route with the camera
// refused, and "Photos need the internet" with the server out of reach. The photo route is intercepted: the check
// reads the strip the page sends (it must be a JPEG 600 px wide, as tall as the sheet's tiles need, with nothing
// else in the request), answers with what was written on the paper, and checks the page kept no picture in
// localStorage, IndexedDB or the Cache API.
// Needs a running online server whose cohort has photo on (TUTOR_HOME=online TUTOR_COHORT=<staging id>
// TUTOR_AI_PROVIDER=fake), the photos (--photos, from make_test_photos.mjs) and Playwright with a Chromium. Run from tutor/:
//   PLAYWRIGHT=... CHROMIUM=... node tools/photo_check.mjs --hub http://127.0.0.1:8099 --photos shots/photos --out shots/p14
// Exit code 1 when a check fails.

import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = (args.hub || 'http://127.0.0.1:8099').replace(/\/$/, '');
const PHOTOS = resolve(args.photos || 'shots/photos');
const OUT = args.out || 'shots/p14';
const CASE = args.case || 'm7-prs-tilted';
const VISION = JSON.parse(readFileSync(resolve(args.fixtures || 'hub/tests/fixtures/photos', 'vision.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : '  (' + detail + ')'}`); if (!ok) problems.push(what); return ok; };

function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

async function learner() {
  const v = (await (await fetch(HUB + '/api/hello')).json()).consent;
  const r = await (await fetch(HUB + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ band: 's1', lang: 'prs', picture: 'key', consent: { kind: 'guardian-on-phone', version: v } }) })).json();
  const c = VISION.cases[CASE];
  return { v: 2, active: 'l1', learners: [{ id: 'l1', band: 's1', year: 7, lang: c.lang, picture: 'key', token: r.token,
    consent: { kind: 'guardian-on-phone', version: v, at: '2026-10-16T10:00', sent: true }, asked: true, lockOffered: true,
    prints: { [c.lesson]: c.seed }, text: 'normal', theme: 'phone' }] };
}

async function open(browser, { camera = true, offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2,
    permissions: camera ? ['camera'] : [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((d) => { try { if (!localStorage.getItem('qalam.v2')) localStorage.setItem('qalam.v2', JSON.stringify(d)); } catch { /* */ } }, await learner());
  if (!camera) await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
  const sent = [];
  await page.route('**/api/m/photo/mark', async (route) => {
    const body = JSON.parse(route.request().postData());
    sent.push(body);
    await new Promise((r) => setTimeout(r, 1500));                  // long enough to see the ring
    const c = VISION.cases[CASE];
    await route.fulfill({ json: { code: c.code, readings: c.written } });
  });
  return { ctx, page, errors, sent };
}

function checkStrip(sent, label) {
  const c = VISION.cases[CASE];
  check(`${label}: one strip was sent`, sent.length === 1, String(sent.length));
  if (!sent.length) return;
  const b = sent[0];
  check(`${label}: the request holds the code, seed, language and strip only`,
    JSON.stringify(Object.keys(b).sort()) === '["code","lang","seed","strip"]' && b.code === c.code && b.seed === c.seed, JSON.stringify(Object.keys(b)));
  const bytes = Buffer.from(b.strip, 'base64');
  const size = jpegSize(bytes);
  const rows = Math.ceil(c.written.length / 2);
  check(`${label}: the strip is a JPEG of the sheet's cells only (600 x ${13 + rows * 237})`,
    size && size[0] === 600 && size[1] === 13 + rows * 237, JSON.stringify(size));
  check(`${label}: the strip is small (${bytes.length} bytes)`, bytes.length < 80000);
}

async function nothingKept(page, label) {
  const kept = await page.evaluate(async () => {
    const big = Object.keys(localStorage).filter((k) => /data:image|\/9j\//.test(localStorage.getItem(k) || '') || (localStorage.getItem(k) || '').length > 20000);
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
    const cached = [];
    if (self.caches) for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) if (/blob:|data:|\/api\/m\/photo/.test(r.url)) cached.push(r.url);
    return { big, dbs, cached };
  });
  check(`${label}: no picture in localStorage, IndexedDB or the Cache API`, !kept.big.length && !kept.dbs.length && !kept.cached.length, JSON.stringify(kept));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${join(PHOTOS, CASE + '.y4m')}`] });

// 1. the in-page camera
{
  const { ctx, page, errors, sent } = await open(browser);
  await page.goto(`${HUB}/app/#/check`);
  await page.waitForSelector('.this-sheet', { timeout: 15000 });
  await page.screenshot({ path: join(OUT, '1-this-sheet.png') });
  check('"This sheet?" offers "Take a photo" first, then "Type my answers"',
    (await page.locator('.this-sheet a').allTextContents()).map((t) => t.trim()).join('|').includes('|'));
  await page.click('.this-sheet a[href^="#/photo/"]');
  await page.waitForSelector('.photo-pic');
  await page.screenshot({ path: join(OUT, '2-explainer.png') });
  await page.click('.photo .btn.primary');
  await page.waitForSelector('video.cam', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, '3-camera.png') });
  check('the camera screen is dark whatever her theme', await page.evaluate(() => document.querySelector('.cam-wrap').dataset.theme === 'dark'));
  const t0 = Date.now();
  await page.waitForSelector('.read-ring, .flat:not(.dim)', { timeout: 15000 });
  check('the camera took the photo itself once the squares held still', true, `${Date.now() - t0} ms`);
  if (await page.locator('.read-ring').count()) await page.screenshot({ path: join(OUT, '4-reading.png') });
  else {
    await page.screenshot({ path: join(OUT, '4-is-this-clear.png') });
    check('quality passed (no "Is this clear?")', false);
    await page.locator('.photo .btn.outline').last().click();       // "Use it anyway"
  }
  await page.waitForSelector('.read-row', { timeout: 15000 });
  await page.screenshot({ path: join(OUT, '5-what-i-read.png'), fullPage: true });
  const rows = await page.locator('.read-row').count();
  check(`"What I read" has a row, her tile and a Fix for each cell (${rows})`, rows === VISION.cases[CASE].written.length &&
    await page.locator('.read-row canvas.tile').count() === rows);
  checkStrip(sent, 'camera');
  // Fix row 1 on the keypad: 9/9 (wrong)
  await page.locator('.read-row .link').first().click();
  await page.waitForSelector('.kp');
  await page.screenshot({ path: join(OUT, '6-keypad.png') });
  for (let i = 0; i < 6; i++) await page.locator('.kp-key.op').last().click();
  await page.locator('.kp-key', { hasText: '۹' }).click();
  await page.locator('.kp-key', { hasText: '/' }).click();
  await page.locator('.kp-key', { hasText: '۹' }).click();
  await page.locator('.kp .btn.primary').click();
  check('Fix replaced the reading', (await page.locator('.reading-value').first().textContent()).includes('۹/۹'));
  await page.locator('.actions .btn.primary').click();
  await page.waitForSelector('.check-row input', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '7-marked.png'), fullPage: true });
  const values = await page.locator('.check-row input').evaluateAll((els) => els.map((e) => e.value));
  const want = VISION.cases[CASE].written.map((x, i) => (i === 0 ? '9/9' : x.read));
  check('her confirmed answers are typed into the check and marked', JSON.stringify(values) === JSON.stringify(want), JSON.stringify(values));
  check('the marks show (the phone marked them)', await page.locator('.score:not(.hidden)').count() === 1);
  await nothingKept(page, 'camera');
  check('no page errors (camera)', !errors.length, errors.join('; '));
  await ctx.close();
}

// 2. the camera refused: the phone's own camera through a file input
{
  const { ctx, page, errors, sent } = await open(browser, { camera: false });
  await page.goto(`${HUB}/app/#/photo/${VISION.cases[CASE].lesson}/${VISION.cases[CASE].seed}`);
  await page.waitForSelector('.photo .btn.primary', { timeout: 15000 });
  await page.click('.photo .btn.primary');                         // the explainer's Start: refused, so the fallback
  await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 10000 });
  await page.screenshot({ path: join(OUT, '8-file-input.png') });
  await page.setInputFiles('input[type=file]', join(PHOTOS, CASE + '-photo.jpg'));
  await page.waitForSelector('.read-row', { timeout: 20000 });
  await page.screenshot({ path: join(OUT, '9-file-what-i-read.png'), fullPage: true });
  checkStrip(sent, 'file input');
  check('after a file photo, the gallery note shows', await page.locator('.photo .muted.small').count() >= 1);
  await nothingKept(page, 'file input');
  check('no page errors (file input)', !errors.length, errors.join('; '));
  await ctx.close();
}

// 3. the server out of reach: "Photos need the internet" in place of "Take a photo"
{
  const { ctx, page } = await open(browser);
  await page.goto(`${HUB}/app/#/check`);
  await page.waitForSelector('.this-sheet', { timeout: 15000 });
  await page.route('**/api/**', (r) => r.abort());
  await page.reload();
  await page.waitForSelector('.this-sheet', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, '10-offline.png') });
  check('offline: "Photos need the internet", and no "Take a photo"',
    await page.locator('.this-sheet a[href^="#/photo/"]').count() === 0 && await page.locator('.this-sheet .muted.small').count() === 1);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `${problems.length} problem(s)` : 'all checks passed');
process.exit(problems.length ? 1 : 0);
