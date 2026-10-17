// Browser check for the staff pages (P33 and P34, C5.1): /admin/, /teacher/ and /review/ in English, Dari and Pashto,
// at a phone's and a laptop's width, through the hub's PINs, in Chromium through Playwright. For each screen it saves
// a screenshot and checks what a screenshot alone can hide:
//   - no sideways scroll, and no text off the screen outside a box that scrolls on its own;
//   - no clipped text, and contrast 4.5:1 (3:1 for large text) as the learner check counts it;
//   - direction: Dari and Pashto right to left, English left to right, the header starting on the reading side;
//   - the picker: three languages, the current one pressed; the draft line in Dari and Pashto;
//   - no Content-Security-Policy violation and no page error.
// Staff pages have no speakers (rulings 13 and 20), so there is no speaker rule. It needs a running hub (the PIN
// gate: a hub with its data folder) and Playwright with a Chromium; neither is a dependency of the app. Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/staff_check.mjs --hub http://127.0.0.1:8000 --data /path/to/hub/data --out shots/
//       [--langs en,prs,ps] [--widths 390,1366] [--pages admin,teacher,review] [--seed]
// Start the hub fresh for each run: every page opening asks /me before the PIN is typed, which the hub counts as a
// wrong try (L2), and a run's 18 openings stay under the 30 an hour after which the hub checks one PIN in 10 seconds.
// --seed first makes two made-up classes (no person in them) with a few learners, and switches AI off in one, so
// the pages have something to show. Exit code 1 when a check fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = args.hub || 'http://127.0.0.1:8000';
const OUT = args.out || 'shots';
const LANGS = (args.langs || 'en,prs,ps').split(',');
const WIDTHS = (args.widths || '390,1366').split(',').map(Number);
const PAGES = (args.pages || 'admin,teacher,review').split(',');
const DATA = args.data || 'data';
const PIN = readFileSync(join(DATA, 'teacher-pin.txt'), 'utf8').trim();
const ADMIN_PIN = readFileSync(join(DATA, 'admin-pin.txt'), 'utf8').trim();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

async function call(path, { method = 'GET', body, pin = ADMIN_PIN } = {}) {
  const r = await fetch(HUB + path, { method, headers: { 'content-type': 'application/json', 'x-admin-pin': pin, 'x-qalam': '1' },
    body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

if (args.seed) {
  const have = (await call('/api/m/admin/cohorts')).data.cohorts || [];
  for (const [label, langs, bands, n] of [['Mazar class', ['prs', 'ps', 'en'], ['ey', 'p1', 'p2', 's1', 's2', 'ad'], 6],
    ['Evening adults', ['prs'], ['ad'], 3]]) {
    if (have.some((c) => c.label === label)) continue;
    const r = await call('/api/m/admin/cohorts', { method: 'POST', body: { label, langs, bands } });
    for (let i = 0; i < n; i++) {
      await fetch(`${HUB}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cohort_code: r.data.code, band: bands[i % bands.length], lang: langs[i % langs.length],
          picture: ['book', 'key', 'cup'][i % 3] }) });
    }
    if (label === 'Evening adults') await call(`/api/m/admin/cohorts/${r.data.id}/kill`, { method: 'POST', body: { switch: 'ai', on: false } });
  }
}

// runs in the page: the layout checks
function inspect() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((u, v) => v - u); return (p + 0.05) / (q + 0.05); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = over(c, base);
    return base;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const label = (el) => (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' +
    el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase());
  const scrolls = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
    const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const problems = [];
  let texts = 0;
  let lowest = 99;
  for (const el of document.querySelectorAll('main *, .amodal *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own || !visible(el) || el.closest('iframe, option, select')) continue;
    texts++;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = behind(el);
    const c = ratio(over(fg, bg), bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    lowest = Math.min(lowest, c);
    if (c < need && !el.closest('[disabled]')) problems.push(`contrast ${c.toFixed(2)} < ${need} on ${label(el)} "${own.slice(0, 30)}"`);
    const clips = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
    if ((clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (clips(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
      || (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)) problems.push(`clipped text in ${label(el)} "${own.slice(0, 30)}"`);
    const r = el.getBoundingClientRect();
    if ((r.left < -1 || r.right > innerWidth + 1) && !scrolls(el)) problems.push(`off screen: ${label(el)} "${own.slice(0, 30)}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    problems.push(`page is ${document.documentElement.scrollWidth}px wide on a ${innerWidth}px screen`);
  }
  const html = document.documentElement;
  const want = html.lang.startsWith('en') ? 'ltr' : 'rtl';
  if (html.dir !== want || getComputedStyle(document.body).direction !== want) {
    problems.push(`direction is ${html.dir}/${getComputedStyle(document.body).direction}, want ${want}`);
  }
  const head = document.querySelector('main header.top');
  const title = head && head.querySelector('h1');
  const end = head && head.querySelector('.staff-langs');
  if (title && end) {
    const a = title.getBoundingClientRect();
    const b = end.getBoundingClientRect();
    if (Math.abs(a.top - b.top) < 8 && (want === 'rtl' ? a.right < b.right : a.left > b.left)) problems.push('header runs the wrong way');
  }
  const pick = document.querySelectorAll('main .staff-langs button');
  if (pick.length !== 3) problems.push(`the language picker has ${pick.length} buttons`);
  else if ([...pick].filter((b) => b.getAttribute('aria-pressed') === 'true').length !== 1) problems.push('the picker shows no one language pressed');
  if (want === 'rtl' && !document.querySelector('.staff-draft')) problems.push('no "Draft translation" line in a draft language');
  return { problems, texts, lowest: Number(lowest.toFixed(2)) };
}

// each page's screens: a name and how to reach it from the page as it opens
const SCREENS = {
  admin: [
    ['pin', async () => {}],
    ['cohorts', async (p) => { await pin(p, ADMIN_PIN); }],
    ['cohort', async (p) => { await p.click('main .atable a'); }],
    ['content', async (p) => menu(p, 1)],
    ['spend', async (p) => menu(p, 2)],
    ['safety', async (p) => menu(p, 3)],
    ['staff', async (p) => menu(p, 4)],
    ['log', async (p) => menu(p, 5)],
  ],
  teacher: [
    ['pin', async () => {}],
    ['todo', async (p) => { await pin(p, PIN); }],
    ['class', async (p) => p.click('main .ttabs button:nth-child(2)')],
    ['lessons', async (p) => p.click('main .ttabs button:nth-child(3)')],
    ['wishes', async (p) => p.click('main .ttabs button:nth-child(4)')],
  ],
  review: [
    ['pin', async () => {}],
    ['role', async (p) => { await pin(p, PIN); }],
    ['queue', async (p) => { await p.fill('main form input[maxlength="4"]', 'AB'); await p.click('main form button[type=submit]'); }],
  ],
};
async function pin(p, value) {
  await p.fill('main form input[type=password]', value);
  await p.click('main form button[type=submit]');
}
async function menu(p, i) {
  if (await p.isVisible('main .amenu')) await p.click(`main .amenu button:nth-child(${i + 1})`);
  else await p.selectOption('main .amenu-select', { index: i });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
mkdirSync(OUT, { recursive: true });
const report = [];
let failed = 0;
for (const name of PAGES) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 760 ? 844 : 768 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('page error: ' + e));
      page.on('console', (m) => { if (/Content.Security.Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 160)); });
      await page.addInitScript((l) => {
        try { localStorage.setItem('qalam.staff.lang', l); } catch { /* blocked */ }
        document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`));
      }, lang);
      await page.goto(`${HUB}/${name}/`);
      for (const [screen, go] of SCREENS[name]) {
        try {
          await go(page);
          await page.waitForTimeout(500);
          await page.waitForFunction(() => !document.querySelector('main .empty') || document.querySelector('main .empty').textContent !== '…');
        } catch (e) { errors.push(`could not reach ${screen}: ${String(e).split('\n')[0]}`); }
        const shot = `${name}-${screen}-${lang}-${width}.png`;
        await page.screenshot({ path: join(OUT, shot), fullPage: true });
        const r = await page.evaluate(inspect);
        r.problems.push(...errors.splice(0));
        if (r.problems.length) failed++;
        report.push({ shot, lang, width, ...r });
        console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${shot}  texts ${r.texts}, lowest contrast ${r.lowest}` +
          (r.problems.length ? '\n  ' + r.problems.join('\n  ') : ''));
      }
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(join(OUT, 'report-staff.json'), JSON.stringify(report, null, 2));
console.log(`${report.length} screens, ${failed} with problems`);
process.exit(failed ? 1 : 0);
