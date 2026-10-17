// Browser check for the bands (P9): renders a screen of the app for each band, in light, in dark and with Bigger
// text, saves a screenshot of each, and checks what a screenshot alone can hide:
//   - contrast: every visible piece of text against the background it sits on, 4.5:1 (3:1 for large text);
//   - clipping: no text cut by its box, and no page wider than the screen (no sideways scroll);
//   - direction: Dari and Pashto pages run right to left, English left to right, and the header starts on the
//     reading side;
//   - the title on one line beside the chip (C5.3), and the draft banner on one whole line (C5 part C, item 8);
//   - the speaker rule: a page with words has a page speaker (or, in early years, the listen button), and scripture
//     (data-voice="none", P29) carries no phone speaker.
// It needs a running hub (the app and the starter pack) and Playwright with a Chromium; neither is a dependency
// of the app. Run from tutor/:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome \
//     node tools/browser_check.mjs --hub http://127.0.0.1:8000 --out shots/ [--screen home] [--widths 390,768,1280]
//       [--langs prs,ps,en] [--variants light,dark,bigger] [--bands p1,s1,ad-literacy] [--full] [--lock]
//       [--at 2027-01-02T09:00] [--day on|off|unset] [--recall maths-7-fractions-add:5,...] [--plan id,id]
//       [--study 19:00|off] [--made 1]
// --at fixes the phone's clock (the school day's Now card and Today list, P19); --day sets her answer to the
// one-time school-day card (unset: the card shows).
// --recall gives her those spaced-review items, due today, with their lessons on the phone (P25a: open a lesson as
// --screen "lesson/<id>?warm=1" to see the warm-up); --plan gives her a plan of those lessons.
// --study gives an adult her study time at that hour for 30 minutes, or "off" (7b; unset: "A time to study" shows).
// --made gives her three of her own questions, due today (P32): one kept on the phone, one sent and checked, one
// with a change asked for (the warm-up shows one when a lesson opens with ?warm=1).
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
  // the title never wraps beside the chip (C5.3): when it would, what follows the speaker has a row of its own
  const h1 = head && head.querySelector(':scope > .grow > h1');
  if (h1 && !head.classList.contains('wrapped')) {
    const after = [...head.querySelectorAll(':scope > .brk ~ *')].some((x) => x.offsetWidth > 0);
    const lh = parseFloat(getComputedStyle(h1).lineHeight) || parseFloat(getComputedStyle(h1).fontSize) * 1.3;
    if (after && h1.getBoundingClientRect().height > lh * 1.5) problems.push('the title wraps beside the chip');
  }
  // the draft banner is one line (C5 part C, item 8), whole
  for (const el of document.querySelectorAll('#app .draft')) {
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    if (el.getBoundingClientRect().height - pad > lh * 1.5 || el.scrollWidth > el.clientWidth + 1) {
      problems.push(`the draft banner is not one whole line: "${el.textContent.slice(0, 30)}"`);
    }
  }
  // the speaker rule
  const root = document.querySelector('#app [data-speaks]');
  const band = html.dataset.band;
  const speaker = document.querySelector('#app [data-page]') || (band === 'ey' && document.querySelector('#app .speaker'));
  if (root && !speaker) problems.push('a screen that speaks has no page speaker');
  // scripture's exemption (P29, C4.7): a verse and its translation take no phone voice, marked data-voice="none",
  // which only scripture may carry; a speaker inside it plays a native speaker's recording (data-recorded) or none
  for (const el of document.querySelectorAll('#app [data-voice="none"]')) {
    if (!el.classList.contains('scripture')) problems.push('data-voice="none" on something that is not scripture');
    for (const sp of el.querySelectorAll('.speaker')) {
      if (!sp.hasAttribute('data-recorded')) problems.push("a phone speaker on scripture (only a recording's)");
    }
  }
  return {
    problems, texts, lowest: Number(lowest.toFixed(2)),
    attrs: { band, look: html.dataset.look, tone: html.dataset.tone, text: html.dataset.text || '', theme: html.dataset.theme || '' },
  };
}

// the review items' lessons, as the phone keeps them after opening each once
const RECALL = args.recall ? args.recall.split(',') : [];
const CACHED = {};
for (const key of RECALL) {
  const id = key.split(':')[0];
  if (!CACHED[id]) CACHED[id] = await (await fetch(`${HUB}/api/lessons/${encodeURIComponent(id)}`)).json();
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
        if (args.at) await page.clock.setFixedTime(new Date(args.at));
        if (args.day === 'on' || args.day === 'off') learner.day = args.day;
        if (args.study && learner.band === 'ad') learner.study = args.study === 'off' ? 'off' : { at: args.study, min: 30 };
        if (RECALL.length) learner.recall = Object.fromEntries(RECALL.map((k) => [k, [1, Math.floor(Date.now() / 864e5)]]));
        if (args.made) {
          const day = Math.floor(Date.now() / 864e5);
          const q = lang === 'en' ? ['What is 3/4 of 12?', '9', '12 split into 4 is 3, and 3 of them is 9']
            : lang === 'ps' ? ['د ۱۲ درې څلورمه څو ده؟', '۹', '']
              : ['سه چهارم ۱۲ چند است؟', '۹', '۱۲ تقسیم بر ۴ می‌شود ۳، و سه تا ۳ می‌شود ۹'];
          learner.made = [
            { id: 'made0001', q: q[0], a: q[1], why: q[2], lang, lesson: null, at: day - 1, due: day },
            { id: 'made0002', q: q[0], a: q[1], why: '', lang, lesson: null, at: day - 3, due: day + 5, sent: 1, status: 'ok' },
            { id: 'made0003', q: q[0], a: '8', why: '', lang, lesson: null, at: day - 2, due: day + 1, sent: 2, status: 'change',
              chips: ['answer_wrong', 'unclear'], reply: lang === 'en' ? 'Count the groups again.'
                : lang === 'ps' ? 'ډلې بیا وشمېره.' : 'گروه‌ها را دوباره بشمار.' },
          ];
        }
        if (args.plan) learner.plan = { label: 'Plan', lessons: args.plan.split(','), again: {} };
        await page.addInitScript(([d, cached]) => {
          try {
            localStorage.setItem('qalam.v2', JSON.stringify(d));
            for (const [id, l] of Object.entries(cached)) localStorage.setItem('qalam.cache.lesson.' + id, JSON.stringify(l));
          } catch { /* blocked */ }
        }, [{ v: 2, active: 'l1', learners: [learner] }, CACHED]);
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
