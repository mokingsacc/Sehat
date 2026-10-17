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
//       [--study 19:00|off] [--made 1] [--live home|block|listen|reasons|up|coming|over] [--board <lesson id>]
//       [--contest home|card|run|send|result|answers|cert]
// --at fixes the phone's clock (the school day's Now card and Today list, P19); --day sets her answer to the
// one-time school-day card (unset: the card shows).
// --recall gives her those spaced-review items, due today, with their lessons on the phone (P25a: open a lesson as
// --screen "lesson/<id>?warm=1" to see the warm-up); --plan gives her a plan of those lessons.
// --study gives an adult her study time at that hour for 30 minutes, or "off" (7b; unset: "A time to study" shows).
// --made gives her three of her own questions, due today (P32): one kept on the phone, one sent and checked, one
// with a change asked for (the warm-up shows one when a lesson opens with ?warm=1).
// --live (P30a, C6.2) turns the live module on for her class in hello, with an open class "Live class: Maths", and
// answers the live routes with stand-ins (no hub serves live classes: they are held without the relay's secrets);
// the browser's RTCPeerConnection is a stub that "connects" and plays a silent track. home: Home's card outside a
// block; block: a live block in the timetable (use --at inside it) and the Now card's Join; on the screen
// (--screen live/abcdefgh23456789): listen (sound on, the board showing --board's step 0), reasons (the three
// chips open), up (her hand up), coming (the sound off), over (the class ended).
// --contest (P31, C6.6) turns the contest module on in hello with one contest, "Maths week 3", of five questions
// from the starter lessons, and answers the contest routes as the hub would (no hub serves one without a signed
// contest file). home: Home's row; card: #/contest/maths-week-3 with Join; run: the run on question 2 (she answered
// the first), the countdown in the header; send: the last question with "Send?" open (the focus must be on
// Cancel); result: sent, before the close; answers: after the close, her answers against the key; cert: the
// contest's certificate screen. The screen is set for each phase.
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
const SHOT = (args.contest && !args.screen ? `contest-${args.contest}` : SCREEN).replace(/[^a-z0-9]+/gi, '-');
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

// --contest: hello says contest is on; the contest routes answer as the hub would, with real lesson steps
const CONTEST = 'maths-week-3';
const CONTEST_ITEMS = [['maths-7-fractions-add', 3], ['maths-7-fractions-add', 5], ['maths-7-fractions-add', 6],
  ['adult-maths-1-numbers', 2], ['adult-maths-1-numbers', 4]];
const CONTEST_STEPS = [];
if (args.contest) {
  for (const [id, n] of CONTEST_ITEMS) {
    const L = await (await fetch(`${HUB}/api/lessons/${id}`)).json();
    CONTEST_STEPS.push(L.steps[n - 1]);
  }
}
async function contestStubs(page, learner) {
  const phase = args.contest;
  Object.assign(learner, { token: 'tok_browsercheck_0000000000', number: 7, picture: 'apple', sentBand: learner.band,
    consent: { kind: 'self', version: 1, at: '2027-01-01T08:00' } });
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString().slice(0, 16);
  const closed = phase === 'answers' || phase === 'cert';
  const opens = closed ? now - 3 * 3600e3 : now - 3600e3;
  const closes = closed ? now - 3600e3 : now + 2 * 3600e3;
  const title = { prs: 'مسابقهٔ ریاضی، هفتهٔ سوم', ps: 'د ریاضي سیالي، درېیمه اونۍ', en: 'Maths week 3' };
  const strip = (st) => Object.fromEntries(Object.entries(st).filter(([k]) => !['answer', 'why', 'hints', 'recall'].includes(k)));
  const questions = CONTEST_STEPS.map(strip);
  const item = { id: CONTEST, title, subject: 'maths', opens_at: iso(opens), closes_at: iso(closes), minutes: 20, n: questions.length,
    certificate: true, phase: closed ? 'closed' : 'open', mine: null };
  const sent = { n: 5, right: 3, percent: 60, at: now - 600e3 };
  if (phase === 'run' || phase === 'send') {
    learner.contests = [{ id: CONTEST, subject: 'maths', joined: now - 4 * 60e3, closes: iso(closes),
      answers: phase === 'send' ? [1, '1/2', 0, 1, null] : [1, null, null, null, null] }];
  }
  if (phase === 'result' || closed) {
    learner.contests = [{ id: CONTEST, subject: 'maths', joined: now - 30 * 60e3, closes: iso(closes), answers: [1, '2/4', 0, 1, '12'], ...sent }];
  }
  if (phase === 'cert') learner.certs = [{ path: 'contest:' + CONTEST, id: 'QC-ABCDE-FGHJK', month: '2027-10' }];
  const cached = phase === 'card' || phase === 'home' ? {} : { [`contest.${CONTEST}`]: { title, subject: 'maths', opens_at: iso(opens),
    closes_at: iso(closes), minutes: 20, certificate: true, questions } };
  if (phase === 'cert') {
    cached['cert.QC-ABCDE-FGHJK'] = { lang: learner.lang, lessons: 0, months: { prs: 'عقرب ۱۴۰۶', ps: 'لړم ۱۴۰۶', en: 'Aqrab 1406' },
      url: `${HUB}/v/QC-ABCDE-FGHJK`, paper: { css: '', body: '<div class="cert-paper"><div class="cert-name"></div></div>' } };
  }
  await page.addInitScript((c) => {
    try { for (const [k, v] of Object.entries(c)) localStorage.setItem('qalam.cache.' + k, JSON.stringify(v)); } catch { /* blocked */ }
  }, cached);
  await page.route('**/api/hello*', async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.modules = [...(j.modules || []), { id: 'contest', version: '0.1.0', slots: ['home.action'], bands: ['p1', 'p2', 's1', 's2', 'ad'],
      needs: [], offline: 'partly', risk: 'low', settings: { per_day: 3 } }];
    if (!j.modules.some((m) => m.id === 'cert')) j.modules.push({ id: 'cert', version: '0.1.0', slots: [], bands: ['p1', 'p2', 's1', 's2', 'ad'], needs: [] });
    await route.fulfill({ response: r, json: j });
  });
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/m/contest?*', (route) => route.fulfill(json({ contests: closed ? [] : [{ ...item, mine: phase === 'result' ? { percent: 60 } : null }] })));
  await page.route(/\/api\/m\/contest\/[a-z0-9-]+(\/(answers|key))?(\?|$)/, (route) => {
    const what = new URL(route.request().url()).pathname.split('/').pop();
    if (what === 'answers') return route.fulfill(json({ right: 3, n: 5, percent: 60 }));
    if (what === 'key') return route.fulfill(json({ id: CONTEST, key: CONTEST_STEPS.map((st) => ({ kind: st.kind, answer: st.answer, why: st.why })) }));
    return route.fulfill(json({ id: CONTEST, title, subject: 'maths', minutes: 20, closes_at: iso(closes), questions }));
  });
}
const CONTEST_SCREEN = { home: 'home', card: `contest/${CONTEST}`, run: `contest/${CONTEST}/run`, send: `contest/${CONTEST}/run`,
  result: `contest/${CONTEST}`, answers: `contest/${CONTEST}/answers`, cert: `cert/contest:${CONTEST}` };

// --live: hello says live is on and a class is open; the live routes answer as the hub would; WebRTC is a stub
const LIVE_ID = 'abcdefgh23456789';
async function liveStubs(page, learner) {
  const phase = args.live;
  // a token the hub would not know: sentBand keeps account.js from asking the hub about it
  Object.assign(learner, { token: 'tok_browsercheck_0000000000', number: 7, picture: 'apple', sentBand: learner.band });
  const state = { v: 3, audio: phase === 'coming' ? 'off' : 'on', floor: null, pub: 1, over: phase === 'over',
    board: phase === 'listen' || phase === 'up' || phase === 'reasons' ? { lesson: args.board || 'maths-7-fractions-add', step: 0 } : null,
    hand: phase === 'up' ? 1 : null };
  const open = { id: LIVE_ID, subject: 'maths', since: '2027-01-02T08:45:00Z' };
  await page.route('**/api/hello*', async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.modules = [...(j.modules || []), { id: 'live', version: '0.1.0', slots: ['home.action'], bands: ['p1', 'p2', 's1', 's2', 'ad'],
      needs: ['internet'], offline: false, risk: 'low', settings: { max_minutes: 45, per_day: 2 } }];
    j.live = open;
    await route.fulfill({ response: r, json: j });
  });
  if (phase === 'block') {
    await page.route('**/api/m/timetable*', async (route) => {
      const r = await route.fetch();
      const j = await r.json();
      const i = j.timetable && j.timetable.blocks ? j.timetable.blocks.findIndex((b, k) => b.kind === 'period' && k > 1) : -1;
      if (i >= 0) j.timetable.blocks[i] = { kind: 'live', subject: 'maths', min: j.timetable.blocks[i].min };
      await route.fulfill({ response: r, json: j });
    });
  }
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/m/live?*', (route) => route.fulfill(json({ ...open, here: 12 })));
  await page.route('**/api/m/live', (route) => route.fulfill(json({ ...open, here: 12 })));
  await page.route(/\/api\/m\/live\/[a-z0-9]+\/(join|sdp|answer|state|hand|leave)/, (route) => {
    const what = new URL(route.request().url()).pathname.split('/').pop();
    if (what === 'join') return route.fulfill(json({ ticket: 'ticketticketticketticketab', ice: [], state, v: state.v }));
    if (what === 'sdp') return route.fulfill(json({ sdp: 'v=0\r\n', type: 'offer', renegotiate: true, answer: null, audio: state.audio }));
    if (what === 'state') return route.fulfill({ status: 204, body: '' });
    return route.fulfill(json({ ok: true }));
  });
  await page.addInitScript(() => {
    // a stand-in for the browser's WebRTC: it "connects" and hands the page a silent track
    window.RTCPeerConnection = class {
      constructor() { this.iceConnectionState = 'new'; this.localDescription = null; }
      async setRemoteDescription() {
        setTimeout(() => {
          const ac = new AudioContext();
          const stream = ac.createMediaStreamDestination().stream;
          if (this.ontrack) this.ontrack({ streams: [stream], track: stream.getAudioTracks()[0] });
          this.iceConnectionState = 'connected';
          if (this.oniceconnectionstatechange) this.oniceconnectionstatechange();
        }, 50);
      }
      async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' }; }
      async setLocalDescription(d) { this.localDescription = d; }
      close() {}
    };
  });
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
        if (args.live) await liveStubs(page, learner);
        if (args.contest) await contestStubs(page, learner);
        await page.addInitScript(([d, cached]) => {
          try {
            localStorage.setItem('qalam.v2', JSON.stringify(d));
            for (const [id, l] of Object.entries(cached)) localStorage.setItem('qalam.cache.lesson.' + id, JSON.stringify(l));
          } catch { /* blocked */ }
        }, [{ v: 2, active: 'l1', learners: [learner] }, CACHED]);
        await page.goto(`${HUB}/#/${args.contest && !args.screen ? CONTEST_SCREEN[args.contest] : SCREEN}`);
        await page.waitForSelector('#app .screen', { timeout: 10000 });
        await page.waitForTimeout(700);
        if (args.live === 'reasons') { await page.click('.live-raise'); await page.waitForTimeout(200); }
        if (args.contest === 'send' && !(await page.$('.contest-run'))) {
          if (l.band !== 'ey') errors.push('Send?: no contest run on the screen');      // early years never see one
        } else if (args.contest === 'send') {
          // to the last question, then Send: the sheet opens with the focus on Cancel, and the run shows no hint or why
          for (let k = 0; k < CONTEST_STEPS.length && !(await page.$('.netsheet')); k++) {
            await page.click('.contest-run .actions .main');
            await page.waitForTimeout(80);
          }
          await page.waitForSelector('.netsheet');
          const focus = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('sheet-no'));
          if (!focus) errors.push('Send?: the focus is not on Cancel');
        }
        if (args.contest === 'run' || args.contest === 'send') {
          const leak = await page.evaluate(() => [...document.querySelectorAll('.contest-run .why, .contest-run .hint, .contest-run .feedback')].length);
          if (leak) errors.push('the run shows a hint, a why or feedback');
          const lines = await page.evaluate(() => { const el = document.querySelector('.contest-left'); if (!el) return 0;
            const r = document.createRange(); r.selectNodeContents(el);
            return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
          if (lines > 1) errors.push('the countdown wraps');
        }
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
