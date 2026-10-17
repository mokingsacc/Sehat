// Browser check for the bands (P9): renders a screen of the app for each band, in light, in dark and with Bigger
// text, saves a screenshot of each, and checks what a screenshot alone can hide:
//   - contrast: every visible piece of text against the background it sits on, 4.5:1 (3:1 for large text);
//   - clipping: no text cut by its box, and no page wider than the screen (no sideways scroll);
//   - direction: Dari and Pashto pages run right to left, English left to right, and the header starts on the
//     reading side;
//   - the speaker rule: a page with words has a page speaker (or, in early years, the listen button).
// It needs a running hub (the app and the starter pack) and Playwright with a Chromium; neither is a dependency
// of the app. Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/browser_check.mjs --hub http://127.0.0.1:8000 --out shots/ [--screen home] [--widths 390,768,1280]
//       [--langs prs,ps,en] [--variants light,dark,bigger] [--bands p1,s1,ad-literacy] [--full] [--lock]
// A shot is what the screen shows when the page opens (--full: the whole page, with the tab bar where the screen
// ends); the checks always cover the whole page.
// Exit code 1 when a check fails. No learner name is ever seeded: a learner is a band, a year and settings.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const HUB = args.hub || 'http://127.0.0.1:8000';
const OUT = args.out || 'shots';
const SCREEN = args.screen || 'home';
const SHOT = SCREEN.replace(/[^a-z0-9]+/gi, '-');
const WIDTHS = (args.widths || '390').split(',').map(Number);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

// one learner per band; adults come in by two doors
const LEARNERS = [
  { tag: 'ey', band: 'ey', year: 0 },
  { tag: 'p1', band: 'p1', year: 1 },
  { tag: 'p2', band: 'p2', year: 4 },
  { tag: 's1', band: 's1', year: 7 },
  { tag: 's2', band: 's2', year: 10 },
  { tag: 'ad-literacy', band: 'ad', track: 'literacy' },
  { tag: 'ad-reader', band: 'ad', track: 'reader' },
];
const ALL_VARIANTS = [
  { tag: 'light', theme: 'light', text: 'normal' },
  { tag: 'dark', theme: 'dark', text: 'normal' },
  { tag: 'bigger', theme: 'light', text: 'large' },
];
const LANGS = (args.langs || 'prs').split(',');
const BAND_TAGS = args.bands ? args.bands.split(',') : null;          // --bands p1,s1,ad-literacy: only these
const VARIANTS = args.variants ? ALL_VARIANTS.filter((v) => args.variants.split(',').includes(v.tag)) : ALL_VARIANTS;

// runs in the page: every check that needs the layout
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
  // the colour behind an element: its own background, laid over its ancestors' (the page last)
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
  const problems = [];
  let texts = 0;
  let lowest = 99;
  for (const el of document.querySelectorAll('#app *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own || !visible(el)) continue;
    texts++;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = behind(el);
    const c = ratio(over(fg, bg), bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    lowest = Math.min(lowest, c);
    if (c < need) problems.push(`contrast ${c.toFixed(2)} < ${need} on ${label(el)} "${own.slice(0, 30)}"`);
    // clipped: the text is wider or taller than a box that hides what overflows
    const clips = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
    if ((clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
        (clips(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      problems.push(`clipped text in ${label(el)} "${own.slice(0, 30)}"`);
    }
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1) problems.push(`off screen: ${label(el)} "${own.slice(0, 30)}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    problems.push(`page is ${document.documentElement.scrollWidth}px wide on a ${innerWidth}px screen`);
  }
  // direction: the document and the header's first item, the who chip, on the reading side
  const html = document.documentElement;
  const want = html.lang.startsWith('en') ? 'ltr' : 'rtl';
  if (html.dir !== want || getComputedStyle(document.body).direction !== want) {
    problems.push(`direction is ${html.dir}/${getComputedStyle(document.body).direction}, want ${want}`);
  }
  const head = document.querySelector('#app header.top');
  // only what shows: online, the net chip is in the header but hidden while all is well
  const shown = head ? [...head.children].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) : [];
  if (shown.length > 1) {
    const first = shown[0].getBoundingClientRect();
    const last = shown[shown.length - 1].getBoundingClientRect();
    if (want === 'rtl' ? first.right < last.right : first.left > last.left) problems.push('header runs the wrong way');
  }
  // the speaker rule
  const root = document.querySelector('#app [data-speaks]');
  const band = html.dataset.band;
  const speaker = document.querySelector('#app [data-page]') || (band === 'ey' && document.querySelector('#app .speaker'));
  if (root && !speaker) problems.push('a screen that speaks has no page speaker');
  return {
    problems, texts, lowest: Number(lowest.toFixed(2)),
    attrs: { band, look: html.dataset.look, tone: html.dataset.tone, text: html.dataset.text || '', theme: html.dataset.theme || '' },
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
mkdirSync(OUT, { recursive: true });
const report = [];
let failed = 0;
for (const width of WIDTHS) {
  for (const lang of LANGS) {
    for (const l of LEARNERS.filter((x) => !BAND_TAGS || BAND_TAGS.includes(x.tag))) {
      for (const v of VARIANTS) {
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: 'light', deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const learner = { id: 'l1', band: l.band, year: l.year ?? null, track: l.track || null, lang, text: v.text, theme: v.theme };
        // --lock: she has a PIN lock with a reset waiting (the lock screen's shot); the hash opens nothing
        if (args.lock && l.band !== 'ey') {
          learner.lock = { salt: '00', hash: '00', tries: 0, until: 0, rounds: 0, last: 0, resetAt: Date.now() + 17 * 3600e3 - 60e3 };
        }
        await page.addInitScript((d) => {
          try { localStorage.setItem('qalam.v2', JSON.stringify(d)); } catch { /* blocked */ }
        }, { v: 2, active: 'l1', learners: [learner] });
        await page.goto(`${HUB}/#/${SCREEN}`);
        await page.waitForSelector('#app .screen', { timeout: 10000 });
        await page.waitForTimeout(700);
        const name = `${SHOT}-${l.tag}-${v.tag}${LANGS.length > 1 ? '-' + lang : ''}${WIDTHS.length > 1 ? '-' + width : ''}.png`;
        await page.screenshot({ path: join(OUT, name), fullPage: !!args.full });
        const r = await page.evaluate(inspect);
        r.problems.push(...errors.map((e) => 'page error: ' + e));
        if (r.problems.length) failed++;
        report.push({ shot: name, width, lang, ...r });
        console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${name}  texts ${r.texts}, lowest contrast ${r.lowest}` +
          (r.problems.length ? '\n  ' + r.problems.join('\n  ') : ''));
        await ctx.close();
      }
    }
  }
}
await browser.close();
writeFileSync(join(OUT, `report-${SHOT}-${LANGS.join('+')}-${WIDTHS.join('+')}.json`), JSON.stringify(report, null, 2));
console.log(`${report.length} screens, ${failed} with problems`);
process.exit(failed ? 1 : 0);
