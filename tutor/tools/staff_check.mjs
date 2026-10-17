// Browser check for the staff pages (P33 and P34, C5.1): /admin/, /teacher/ and /review/ in English, Dari and Pashto,
// at a phone's and a laptop's width, through the hub's PINs, in Chromium through Playwright. For each screen it saves
// a screenshot and checks what a screenshot alone can hide:
//   - no sideways scroll, and no text off the screen outside a box that scrolls on its own;
//   - no clipped text, and contrast 4.5:1 (3:1 for large text) as the learner check counts it;
//   - direction: Dari and Pashto right to left, English left to right, the header starting on the reading side;
//   - the picker: three languages, the current one pressed; the draft line in Dari and Pashto;
//   - no English words on a Dari or Pashto page outside what staff typed (dir="auto") and codes (dir="ltr");
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
  // no English left on a Dari or Pashto page: words the page writes come from the string files (a label or a name
  // an admin typed, dir="auto", and codes, dir="ltr", are hers to write)
  if (want === 'rtl') {
    const OK = new Set(['PIN', 'AI', 'PDF', 'QR', 'OK', 'Tanzil', 'QuranEnc', 'Qalam', 'Gemini', 'kbps', 'OpenAI', 'Claude',
      'Anthropic', 'Google', 'Ollama']);           // names of things, not words
    for (const el of document.querySelectorAll('main *, .amodal *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
      const words = (own.match(/[A-Za-z]{3,}/g) || []).filter((w) => !OK.has(w));
      if (!words.length || !visible(el) || el.closest('[dir="ltr"], [dir="auto"], code, pre, .m, option, select, textarea')) continue;
      problems.push(`English on a ${html.lang} page: ${label(el)} "${own.trim().slice(0, 40)}"`);
    }
  }
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
    // the Live tab (P30a, C6.3) with the live routes, the microphone and WebRTC as stand-ins (liveStubs)
    ['live', async (p) => p.click('main .ttabs button:nth-child(5)')],
    ['live-room', async (p) => { await p.click('main section .chips button:nth-child(2)'); await p.click('main section .btn.primary'); await p.waitForTimeout(2600); }],
    // the floor (P30b, C6.4): "Give the floor" on the first raised hand of an adult-only class, then her voice plays
    ['live-floor', async (p) => { await p.click('main .live-hand-list .btn.primary'); await p.waitForTimeout(2600); }],
    ['live-end', async (p) => { await p.click('main .live-state .btn.kill'); }],
    // the Contests tab (P31, C6.5), sixth while the Live tab shows (contestStubs); Escape first leaves "End the class?"
    ['contests', async (p) => { await p.keyboard.press('Escape'); await p.click('main .ttabs button:nth-child(6)'); }],
  ],
  review: [
    ['pin', async () => {}],
    ['role', async (p) => { await pin(p, PIN); }],
    ['queue', async (p) => { await p.fill('main form input[maxlength="4"]', 'AB'); await p.click('main form button[type=submit]'); }],
    ['contest', async (p) => { await p.click('main nav.subjects a[href="#"] >> nth=-1'); await p.waitForTimeout(800); }],
  ],
};
// The teacher page's Live tab: no hub serves live classes without the relay's secrets, so /me says live is on (contestStubs) and
// the live routes answer as the hub would; getUserMedia gives a silent track and RTCPeerConnection is a stub. The
// learner side of the same rule is in browser_check.mjs --live.
let firstLesson;
async function liveStubs(page) {
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  let floor = null;                      // the floor as the stand-in hub holds it (P30b)
  await page.route(/\/api\/m\/teacher\/live(\/[^?]*)?(\?|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/teacher/live')) {
      return route.fulfill(json({ on: true, open: null, floor: true, today: 1, per_day: 2, max_minutes: 45, month: { minutes: 340 },
        subjects: ['maths', 'science', 'english', 'dari', 'pashto', 'class'] }));
    }
    if (path.endsWith('/start')) return route.fulfill(json({ id: 'abcdefgh23456789', ice: [], max_minutes: 45 }));
    if (path.endsWith('/sdp')) return route.fulfill(json({ sdp: 'v=0\r\n' }));
    if (path.endsWith('/roster')) {
      const first = await firstOf();
      return route.fulfill(json({ v: 4, here: 14, audio: 'on', minutes: 41, max_minutes: 45, floor, over: false,
        board: first ? { lesson: first.id, step: 2 } : null,
        hands: [{ alias: 'key-3', picture: 'key', number: 3, reason: 1, since: new Date(Date.now() - 90e3).toISOString() },
          { alias: 'cup-11', picture: 'cup', number: 11, reason: 3, since: new Date(Date.now() - 30e3).toISOString() }] }));
    }
    if (path.endsWith('/floor')) {
      const body = route.request().postDataJSON() || {};
      floor = body.alias ? { alias: body.alias, until: new Date(Date.now() + 90e3).toISOString(), on: true } : null;
      return route.fulfill(json({ floor, v: 5 }));
    }
    if (path.endsWith('/listen')) return route.fulfill(json({ sdp: 'v=0\r\n', type: 'offer', renegotiate: true, answer: null }));
    return route.fulfill(json({ ok: true }));
  });
  await page.addInitScript(() => {
    const silent = () => new AudioContext().createMediaStreamDestination().stream;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => silent();
    window.RTCPeerConnection = class {
      addTransceiver(track) {
        const sender = { track, replaceTrack: async (x) => { sender.track = x; } };
        return { mid: '0', sender };
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
      async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' }; }
      async setLocalDescription(d) { this.localDescription = d; }
      async setRemoteDescription() {}
      close() {}
    };
  });
}

// Contests (P31, C6.5) on all three pages: no contest file ships with the content, so the admin's Content, the
// teacher's Contests tab and the review queue get one made-up contest (on a real lesson, for the review preview) in
// the shapes the hub answers with; the routes themselves are tested in hub/tests/test_contest.py.
async function contestStubs(page) {
  const lesson = await firstOf();
  const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString().slice(0, 16);
  const X = { id: 'maths-week-3', title: { prs: 'مسابقهٔ ریاضی، هفتهٔ سوم', ps: 'د ریاضي سیالي، درېیمه اوونۍ', en: 'Maths week 3' },
    subject: 'maths', bands: ['s1', 's2'], langs: ['prs', 'ps', 'en'], opens_at: soon(-1), closes_at: soon(47), minutes: 20, n: 5,
    certificate: true, scope: 'class' };
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const merged = async (route, add) => {
    const r = await route.fetch();
    const j = await r.json().catch(() => ({}));
    await route.fulfill({ response: r, json: { ...j, ...add(j) } });
  };
  await page.route('**/api/m/admin/content*', (route) => merged(route, (j) => ({ contests: [{ ...X, short: '3f9a1c2e',
    roles: { 'Dari reader': true, 'Pashto reader': true, 'maths teacher': true }, signed: true, phase: 'open', took_part: 9,
    releases: Object.fromEntries((j.cohorts || []).slice(0, 1).map((c) => [c.id, { open: true, earlier: false, at: new Date().toISOString(), took_part: 9 }])) },
  { ...X, id: 'science-week-1', title: { prs: 'مسابقهٔ ساینس', ps: 'د ساینس سیالي', en: 'Science week 1' }, subject: 'science',
    opens_at: soon(30), closes_at: soon(54), short: '81b0d4aa', roles: { 'Dari reader': true, 'Pashto reader': false, 'science teacher': false },
    signed: false, phase: 'soon', took_part: 0, releases: {} }] })));
  await page.route('**/api/m/teacher/me*', (route) => merged(route, () => ({ live: true, contest: true })));   // and the Live tab
  await page.route('**/api/m/teacher/contests*', (route) => route.fulfill(json({ contests: [{ ...X, phase: 'open', took_part: 3, of: 6,
    learners: [{ picture: 'book', number: 1, band: 's1', percent: 80 }, { picture: 'cup', number: 3, band: 's1', percent: 40 },
      { picture: 'key', number: 2, band: 's2', percent: 100 }] }] })));
  await page.route('**/api/m/review/queue*', (route) => merged(route, () => ({ contests: [{ id: X.id, title: X.title, subject: 'maths',
    items: 5, status: 'todo' }] })));
  await page.route(/\/api\/m\/review\/contests\/[^/?]+(\?|$)/, (route) => route.fulfill(json({ contest: X, hash: 'sha256:3f9a1c2e',
    short: '3f9a1c2e', role: 'maths teacher', needs: ['Dari reader', 'Pashto reader', 'maths teacher'], signed: [],
    steps: [{ n: 0, hash: 'sha256:0', last: 'ok', changed: false, chips: [], text: '' },
      ...[1, 2].map((n) => ({ n, hash: 'sha256:' + n, last: null, changed: false, chips: [], text: '',
        item: { lesson: lesson ? lesson.id : 'none', step: n + 1, title: lesson ? lesson.title : { en: 'A lesson' },
          question: { kind: 'choice', options: [{ en: '1/2', prs: '۱/۲', ps: '۱/۲' }, { en: '2/3', prs: '۲/۳', ps: '۲/۳' }] },
          answer: 0, why: { en: 'Half of the shape is shaded.', prs: 'نیم شکل رنگ شده است.', ps: 'د شکل نیمه رنګ شوې ده.' } } }))] })));
}

async function firstOf() {               // the class's first lesson, once (the live board and the review preview)
  if (firstLesson === undefined) {
    const d = await (await fetch(`${HUB}/api/m/teacher/lessons`, { headers: { 'x-teacher-pin': PIN } })).json().catch(() => ({}));
    firstLesson = (d.lessons || [])[0] || null;
  }
  return firstLesson;
}

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
      if (name === 'teacher') await liveStubs(page);
      await contestStubs(page);
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
