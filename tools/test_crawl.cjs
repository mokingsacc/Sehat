// A crawl over the whole app as a phone gets it, in fa, ps and en at 320 and 360 px.
// It opens the three tabs and every screen reachable from them (following every in-app link), every topic page,
// Emergency and each age, each CPR animation, search, Settings, Share, and Family (adding a child and a woman, and
// recording voice notes with the fake microphone: kept for the family, and given to a person),
// and checks on every screen:
//   - no console errors, page errors or failed requests (clips that are simply not there are allowed: the app falls back);
//   - no sideways scroll;
//   - no title cut mid-word, clipped, running into its speaker or out of its card; header pieces never overlap;
//   - every narrated block has a speaker, and every speaker is at least 56 px;
//   - on the screens that have been gone over line by line (SPOKEN below: the clinic list, Settings, search,
//     Emergency, Feedback, Privacy, Family and Growth), every piece of text has a speaker; elsewhere text without
//     one is listed as a note (a to-do list);
//   - every list row has a picture;
//   - every in-app link opens a real page (not the Health tab fallback), "What does my reading mean?" on each
//     home kit page opens that device's Health page, and Home pages have no danger or clinic boxes (Mo's rule);
//   - every picture loads;
//   - the red Emergency button is in the header except on the Health tab and in the emergency flow.
// Needs Playwright with Chromium:  node tools/test_crawl.cjs [screenshot folder]
// LANGS=fa,en WIDTHS=320 to run part of it; VERBOSE=1 lists every problem in every language and width.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8'));
const LANGS = (process.env.LANGS || 'fa,ps,en').split(',');
const WIDTHS = (process.env.WIDTHS || '320,360').split(',').map(Number);
const MIN_SPK = 56;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => { // the app folder, as a phone gets it
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

// which lists are on the Home side (no medical advice there), and which kit page should open which reading page
const HOUSE = new Set(Object.entries(book.config.lists).filter(([, c]) => c.tab === 'house').flatMap(([n]) => book.sections[n] || []));
const KIT_READING = { 'kit-bp': 'reading-bp', 'kit-thermometer': 'reading-temp', 'kit-glucometer': 'reading-sugar', 'kit-oximeter': 'reading-spo2', 'kit-muac': 'reading-muac' };
const READING_DEV = { 'reading-bp': 'bp', 'reading-temp': 'temp', 'reading-sugar': 'sugar', 'reading-spo2': 'spo2', 'reading-muac': 'muac' };

// problems: key "category | screen | detail" -> set of runs ("fa-320")
const PROBS = new Map(); const COUNTS = {}; let screens = 0, checks = 0;
const HARD = new Set(['console', 'request', 'pageerror', 'scroll', 'title', 'link', 'image', 'emergency', 'home-advice', 'reading-link', 'no-speaker', 'small-speaker', 'no-picture', 'anim', 'search', 'family', 'unspoken-text-here']);
// screens where every piece of text must have a speaker (Mo's rule: many people cannot read). The recording studio
// (#/studio) is the narrator's tool and is left out.
const SPOKEN = /^#\/(near|settings|ask|emergency|feedback|privacy|family|growth)\b/;
function prob(cat, screen, detail, run) {
  if (cat === 'unspoken-text' && SPOKEN.test(screen)) cat = 'unspoken-text-here';
  const k = `${cat} | ${screen} | ${detail}`;
  if (!PROBS.has(k)) PROBS.set(k, new Set()); PROBS.get(k).add(run);
  COUNTS[cat] = (COUNTS[cat] || 0) + 1;
}

// in the page: everything that can be measured on the screen as it is drawn now
function measure(MIN) {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('details:not([open]) > :not(summary)'); };
  const label = (e) => { const c = (e.className && typeof e.className === 'string' ? e.className : e.tagName).trim().split(/\s+/).slice(0, 2).join('.'); return c; };
  const textRects = (root, skip) => {
    const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue; if (skip && skip.some((s) => s.contains(n))) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0) out.push({ r, t: n.nodeValue.trim().slice(0, 30) });
    }
    return out;
  };
  const hit = (a, b, pad) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
  const P = [];
  const root = document.querySelector('.anim-overlay') || document.querySelector('main');
  if (!root) return { probs: [['render', 'no main']], links: [] };
  // titles: no word split over two lines, nothing clipped, nothing touching its speaker, nothing out of its card
  for (const spk of root.querySelectorAll('.spk')) {
    if (!vis(spk)) continue; const sr = spk.getBoundingClientRect();
    const box = spk.closest('[data-block], .top, .title-row, .hbtn, .trow, .srow, .vstrip, .blk, .panel') || spk.parentElement;
    for (const { r, t } of textRects(box, [...box.querySelectorAll('.spk')])) if (hit(r, sr, 4)) P.push(['title', 'text touches speaker: ' + t]);
  }
  for (const card of root.querySelectorAll('.hbtn, .trow, .tcard, .srow, .srowbig, .vstrip, .blk, .listcard, .ptile, .tile, .card, .kidcard, .panel, .top, .title-row, .vcard, .erow, .em-age, .pcard, .group-h')) {
    if (!vis(card)) continue; const cr = card.getBoundingClientRect();
    for (const { r, t } of textRects(card)) if (r.left < cr.left - 1 || r.right > cr.right + 1) { P.push(['title', `text leaves ${label(card)}: ${t}`]); break; }
  }
  for (const e of root.querySelectorAll('.t, h1, h2, h3, .s, .empill span, .pn')) if (vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') P.push(['title', `clipped ${label(e)}: ${e.textContent.trim().slice(0, 30)}`]);
  for (const e of root.querySelectorAll('.t, h1, h2, h3, .s, .empill span, .tx, .pn, .h')) {
    if (!vis(e)) continue; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const re = /[^\s/-]+[/-]?/g; let mm; while ((mm = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, mm.index); rg.setEnd(n, mm.index + mm[0].length); const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top / 4))); if (tops.size > 1) P.push(['title', `word split in ${label(e)}: ${mm[0]}`]); } }
  }
  for (const top of root.querySelectorAll('.top, .title-row, .anim-top')) {
    const kids = [...top.children].filter(vis).map((e) => [e, e.getBoundingClientRect()]);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (hit(kids[i][1], kids[j][1], -0.5)) P.push(['title', `header pieces overlap: ${label(kids[i][0])} / ${label(kids[j][0])}`]);
  }
  // speakers: every narrated block has one, every one is big enough
  for (const b of root.querySelectorAll('[data-block]')) {
    if (!vis(b)) continue;
    if (!b.querySelector('.spk, [data-say]') && !b.matches('[data-say]')) P.push(['no-speaker', `block ${b.dataset.block} (${label(b)})`]);
  }
  for (const s of root.querySelectorAll('.spk')) {
    if (!vis(s)) continue; const r = s.getBoundingClientRect();
    if (Math.min(r.width, r.height) < MIN - 0.5) { const host = s.closest('[data-block]') || s.parentElement; P.push(['small-speaker', `${Math.round(Math.min(r.width, r.height))} px in ${label(host)}`]); }
  }
  // text that no speaker covers (a to-do list: each needs a narration line in four voices first):
  // its nearest container with a speaker must hold just that one speaker
  // (.credit: licence and version lines in Latin letters; .agechip without a block: a person's own typed name and age,
  // which no clip can say; their record says the name in their own recorded voice)
  const SKIP = 'nav, .top, .topic-hero, .empill, button, select, option, input, textarea, label.chip, .sources, .credit, .agechip:not([data-block]), svg, [aria-hidden=true], .numpad, #toast, .anim-ctl, .anim-cap';
  const seen = new Set();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let tn;
  while ((tn = w.nextNode())) {
    const txt = tn.nodeValue.trim(); if (txt.length < 2 || /^[\d\s.,:/·%°+\-–۰-۹٫]+$/.test(txt)) continue;
    const el = tn.parentElement; if (!el || el.closest(SKIP) || !vis(el)) continue;
    let a = el; while (a && a !== root && !a.querySelector('.spk:not(.ax), [data-say], [data-asay]') && !a.matches('[data-ids]')) a = a.parentElement;
    if (!a || a === root || a.querySelectorAll('.spk:not(.ax)').length > 1 && !el.closest('[data-block]')) { const k = txt.slice(0, 40); if (!seen.has(k)) { seen.add(k); P.push(['unspoken-text', k]); } }
  }
  // list rows: a picture each
  for (const row of root.querySelectorAll('.trow, .erow, .ptile, .hbtn, .em-age')) {
    if (!vis(row) || !row.querySelector('a, button.grow')) continue;
    const img = row.querySelector('img, [data-poster] svg, .em-pic svg');
    // the Emergency and "What is wrong?" buttons on the Health tab keep their icon by design
    if (!img) P.push([row.matches('.hbtn.em, .hbtn.ask') ? 'icon-row' : 'no-picture', `${label(row)}: ${(row.querySelector('.t') || row).textContent.trim().slice(0, 30)}`]);
  }
  // pictures load
  for (const im of document.querySelectorAll('img')) if (vis(im) && im.complete && !im.naturalWidth) P.push(['image', `broken ${im.getAttribute('src')}`]);
  const links = [...document.querySelectorAll('main a[href^="#/"], nav a[href^="#/"]')].map((a) => a.getAttribute('href'));
  return {
    probs: P, links: [...new Set(links)],
    scroll: document.scrollingElement.scrollWidth - innerWidth,
    pill: !!document.querySelector('main .top .empill, main .topic-hero .empill'), nav: !!document.querySelector('nav.nav'),
    isHealth: !!document.querySelector('main .hbtn.em'), blocks: [...document.querySelectorAll('main [data-block]')].map((e) => e.dataset.block),
    houseAdvice: [...document.querySelectorAll('main .alert.urgent, main .alert.soon, main .blk.clinic')].map((e) => e.className), // ("don't" boxes are safety tips, allowed)
    linkBlocks: [...document.querySelectorAll('main .blk.link a[href], main a.blk.link[href]')].map((a) => a.getAttribute('href')),
  };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }); // a fake microphone for the voice notes
  for (const width of WIDTHS) for (const lang of LANGS) {
    const run = `${lang}-${width}`;
    const ctx = await b.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: ['microphone'] });
    const p = await ctx.newPage(); let cur = '#/home';
    p.on('pageerror', (e) => prob('pageerror', cur, e.message.slice(0, 160), run));
    p.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource/.test(t)) prob('console', cur, t.slice(0, 160), run); } });
    p.on('requestfailed', (r) => { const u = r.url(); if (/\/audio\//.test(u) || /net::ERR_ABORTED/.test(r.failure() && r.failure().errorText) && /\.mp3/.test(u)) return; prob('request', cur, `${r.failure() && r.failure().errorText} ${u.replace(BASE, '')}`, run); });
    p.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !/\/audio\/.*\.mp3/.test(u)) prob('request', cur, `${r.status()} ${u.replace(BASE, '')}`, run); });
    await p.route(/workers\.dev|\/e$|\/r$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    // 0. the first run (a phone with nothing saved): only the language screen; tools/test_firstrun.cjs tests the rest
    await p.goto(BASE + 'index.html?first'); await p.waitForSelector('main .welcome [data-setlang]', { timeout: 15000 }); cur = '#/welcome';
    if (await p.$('.voices, .consent, [data-consent], [data-cdist], .dialog-wrap')) prob('first-run', cur, 'a setup screen or question besides the language', run);
    { const m = await p.evaluate(measure, MIN_SPK); screens++; checks += m.probs.length + 2; for (const [cat, d] of m.probs) prob(cat, cur, d, run); if (m.scroll > 0) prob('scroll', cur, `${m.scroll} px sideways`, run); }
    if (OUT) await p.screenshot({ path: path.join(OUT, `${run}-_welcome.png`), fullPage: true });
    // then the language is set; counts are on by default, and the crawl switches them off (no counts from tests)
    await p.addInitScript(([lg, CV]) => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', JSON.stringify('f')); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); } window.confirm = () => true; }, [lang, book.config.consentVersion]);
    await p.goto(BASE + 'index.html#/home'); await p.waitForSelector('main .hbtn', { timeout: 15000 });

    const settle = async () => {
      await p.waitForTimeout(120);
      await p.evaluate(() => { document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }); return Promise.race([new Promise((r) => setTimeout(r, 2500)), Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))))]); });
      await p.waitForTimeout(60);
    };
    const go = async (h) => { const prev = cur; cur = h; await p.evaluate((x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; }, h); await settle(); return prev; };
    const look = async (h, prev, opts = {}) => {
      screens++;
      const m = await p.evaluate(measure, MIN_SPK);
      for (const [cat, d] of m.probs) prob(cat, h, d, run);
      checks += m.probs.length + 6;
      if (m.scroll > 0) prob('scroll', h, `${m.scroll} px sideways`, run);
      // the Health tab is what the router falls back to: anywhere else, it means the link is broken
      if (h !== '#/home' && h !== '#/' && m.isHealth && !opts.mayBeHome) prob('link', h, `opens the Health tab instead (from ${prev})`, run);
      const tm = /^#\/topic\/([^/]+)\/(.+)$/.exec(h); if (tm && !m.blocks.includes(decodeURIComponent(tm[2]))) prob('link', h, 'the block it points to is not on the page', run);
      // the red Emergency button: everywhere with a tab bar, except the Health tab and the emergency flow
      const inEm = /^#\/emergency/.test(h) || (/^#\/topic\//.test(h) && /^#\/emergency/.test(prev || ''));
      if (m.nav) {
        if (h === '#/home' && m.pill) prob('emergency', h, 'Health tab shows the header Emergency button', run);
        else if (inEm && m.pill) prob('emergency', h, 'Emergency button inside the emergency flow', run);
        else if (h !== '#/home' && !inEm && !m.pill) prob('emergency', h, 'no Emergency button in the header', run);
      }
      const tid = (/^#\/topic\/([^/]+)/.exec(h) || [])[1];
      if (tid && HOUSE.has(tid) && m.houseAdvice.length) prob('home-advice', h, `Home page with ${m.houseAdvice.join(', ')}`, run);
      if (tid && KIT_READING[tid]) { const want = '#/topic/' + KIT_READING[tid]; if (!m.linkBlocks.includes(want)) prob('reading-link', h, `no "What does my reading mean?" link to ${want} (has ${m.linkBlocks.join(' ')})`, run); }
      if (tid && READING_DEV[tid]) { const want = '#/tool/reading/' + READING_DEV[tid]; if (!m.links.includes(want)) prob('reading-link', h, `Health reading page has no checker link ${want}`, run); }
      if (OUT && opts.shot) await p.screenshot({ path: path.join(OUT, `${run}-${h.replace(/[#/]+/g, '_')}.png`), fullPage: true });
      return m;
    };

    // 1. a breadth-first walk over every link, from the tabs, every topic, every list and every age
    const seen = new Set(); const queue = [];
    const add = (h, from) => { h = h.replace(/\/$/, ''); if (!seen.has(h)) { seen.add(h); queue.push([h, from]); } };
    for (const h of ['#/home', '#/house', '#/family', '#/emergency', '#/firstaid', '#/children', '#/adults', '#/ask', '#/settings', '#/share', '#/feedback', '#/near', '#/privacy', '#/growth'])  add(h, 'start');
    for (const a of book.config.emergency) add('#/emergency/' + a.id, 'start');
    for (const n of Object.keys(book.config.lists)) add('#/s/' + n, 'start');
    for (const t of Object.keys(book.topics)) add('#/topic/' + t, 'start');
    while (queue.length) {
      const [h, from] = queue.shift();
      if (from !== 'start' && from !== cur) await go(from); // open the page from where its link is, as people do
      const prev = await go(h);
      const m = await look(h, prev, { shot: !/^#\/topic\//.test(h) });
      for (const l of m.links) add(l, h);
    }
    // links seen in the walk point to real topics
    for (const h of seen) { const t = (/^#\/topic\/([^/]+)/.exec(h) || [])[1]; if (t && !book.topics[t]) prob('link', h, 'no such topic', run); }

    // 2. each CPR animation: the "Watch how" button on each age page, and the play poster on each CPR page
    const animBtns = [];
    for (const a of book.config.emergency) if (a.anim) animBtns.push(['#/emergency/' + a.id, `.em-watch[data-variant="${a.anim}"]`]);
    for (const t of Object.keys(book.topics)) if (book.topics[t].blocks && book.topics[t].blocks.some((x) => x.type === 'anim')) animBtns.push(['#/topic/' + t, 'button.poster']);
    for (const [h, sel] of animBtns) {
      await go('#/home'); await go(h);
      const n = await p.$$eval(sel, (x) => x.length);
      for (let i = 0; i < n; i++) {
        const btns = await p.$$(sel); await btns[i].click();
        const ov = await p.waitForSelector('.anim-overlay svg, .anim-overlay img, .anim-overlay canvas', { timeout: 8000 }).catch(() => null);
        const tag = `${h} animation ${i + 1}`;
        if (!ov) { prob('anim', tag, 'the player did not open with a picture', run); continue; }
        await p.waitForTimeout(900);
        const picker = await p.$('.anim-overlay [data-pick]');
        if (picker) { const picks = await p.$$eval('.anim-overlay [data-pick]', (x) => x.map((e) => e.dataset.pick)); screens++; const m = await p.evaluate(measure, MIN_SPK); for (const [c, d] of m.probs) prob(c, tag + ' (picker)', d, run); await p.click(`.anim-overlay [data-pick="${picks[0]}"]`); await p.waitForTimeout(900); }
        screens++; cur = tag;
        const m = await p.evaluate(measure, MIN_SPK); for (const [c, d] of m.probs) prob(c, tag, d, run);
        if (m.scroll > 0) prob('scroll', tag, `${m.scroll} px sideways`, run);
        if (OUT) await p.screenshot({ path: path.join(OUT, `${run}-anim-${h.replace(/[#/]+/g, '_')}-${i}.png`) });
        const x = await p.$('.anim-overlay .ax'); if (x) await x.click(); else prob('anim', tag, 'no close button', run);
        await p.waitForTimeout(200);
        if (await p.$('.anim-overlay')) { prob('anim', tag, 'the player did not close', run); await p.evaluate(() => document.querySelectorAll('.anim-overlay').forEach((e) => e.remove())); }
        cur = h;
      }
    }

    // 3. search: a few words in the language, results show and open real pages
    const Q = { fa: ['تب', 'اسهال', 'سرفه طفل', 'سوختگی'], ps: ['تبه', 'نس ناستی', 'ټوخی', 'سوځیدل'], en: ['fever', 'diarrhoea', 'cough child', 'burn'] }[lang];
    for (const q of Q) {
      await go('#/home'); await go('#/ask');
      await p.fill('#askq', q); await p.waitForTimeout(250); await p.press('#askq', 'Enter'); await settle();
      const tag = `#/ask "${q}"`; screens++;
      const m = await p.evaluate(measure, MIN_SPK); for (const [c, d] of m.probs) prob(c, tag, d, run);
      if (m.scroll > 0) prob('scroll', tag, `${m.scroll} px sideways`, run);
      const res = await p.$$eval('#askres a[href^="#/"]', (x) => x.map((a) => a.getAttribute('href')));
      if (!res.length) prob('search', tag, 'no results', run);
      if (OUT && q === Q[0]) await p.screenshot({ path: path.join(OUT, `${run}-search.png`), fullPage: true });
      for (const l of res.slice(0, 3)) { const prev = await go(l); await look(l, prev); await go('#/ask'); }
    }
    // the symptom buttons under the search
    await go('#/ask'); const syms = await p.$$eval('.sym', (x) => x.length);
    for (let i = 0; i < syms; i++) { await go('#/ask'); const s = await p.$$('.sym'); await s[i].click(); await settle(); const res = await p.$$eval('#askres a[href^="#/"]', (x) => x.length); if (!res) prob('search', `#/ask symptom ${i + 1}`, 'no results', run); }

    // 4. Family: a voice note with no one in the family yet: one tap records, Stop keeps it as a family voice note
    const famNotes = () => p.evaluate(() => JSON.parse(localStorage.getItem('fhb.famnotes') || '[]').length);
    const recordVoice = async (tag) => {
      await go('#/family'); await p.click('a[href="#/family/voice"]'); cur = '#/family/voice';
      if (!(await p.waitForSelector('.recbox.on [data-fam-rec]', { timeout: 6000 }).catch(() => null))) { prob('family', tag, 'one tap did not start recording', run); return false; }
      await p.waitForTimeout(2300); await look('#/family/voice (recording)', '#/family', { shot: true });
      await p.click('[data-fam-rec]'); return true;
    };
    {
      const before = await famNotes();
      if (await recordVoice('#/family/voice (no one yet)')) {
        await p.waitForFunction((n) => location.hash === '#/family' && JSON.parse(localStorage.getItem('fhb.famnotes') || '[]').length === n + 1, before, { timeout: 6000 }).catch(() => prob('family', '#/family/voice', 'with no one in the family, the note was not kept as a family voice note', run));
        await settle(); cur = '#/family'; await look('#/family (a family voice note)', '#/family/voice', { shot: true });
        if (!(await p.$('.fvnotes [data-fam-play]'))) prob('family', '#/family', 'the family voice note is not listed', run);
      }
    }
    // 5. Family: add a child and a woman, then every screen of their records
    for (const [pic, name] of [['child', lang === 'en' ? 'Abdul Rahman' : 'عبدالرحیم'], ['woman', lang === 'en' ? 'Zarghuna' : 'سپوږمۍ ګلالۍ']]) {
      await go('#/family'); await go('#/family/add');
      await p.click(`[data-fam-pic="${pic}"]`); await p.waitForTimeout(150);
      await look('#/family/add', '#/family');
      await p.fill('[data-fam-in="name"]', name);
      await p.click('[data-fam="save-person"]'); await settle(); cur = '#/family/person';
      const on = await p.evaluate(() => location.hash);
      if (on !== '#/family/person') { prob('family', '#/family/add', `saving a ${pic} stays on ${on}`, run); continue; }
      const m = await look('#/family/person', '#/family/add', { shot: true });
      const shown = await p.$eval('main .top h1', (e) => e.textContent).catch(() => '');
      if (shown !== name) prob('family', '#/family/person', `the bar shows "${shown}" for "${name}"`, run);
      for (const l of m.links.filter((x) => /^#\/(family|growth)/.test(x))) {
        const prev = await go(l); const mm = await look(l + ` (${pic})`, prev, { shot: true });
        for (const l2 of mm.links.filter((x) => /^#\/(family|growth)/.test(x) && x !== '#/family' && x !== '#/family/person')) { const pv = await go(l2); await look(l2 + ` (${pic})`, pv); await go(l); }
        await go('#/family/person');
      }
    }
    await go('#/family'); await look('#/family (2 people)', '#/family/person', { shot: true });
    const people = await p.$$eval('main .pcard', (x) => x.length);
    if (people !== 2) prob('family', '#/family', `${people} people listed after adding 2`, run);
    // a voice note with people: "Who is this note for?", then saved in that person's doctor's notes
    if (await recordVoice('#/family/voice (2 people)')) {
      if (!(await p.waitForSelector('[data-fam-voiceto]', { timeout: 6000 }).catch(() => null))) prob('family', '#/family/voice', 'no "Who is this note for?" after Stop', run);
      else {
        await settle(); await look('#/family/voice (who is it for?)', '#/family/voice', { shot: true });
        const n = await p.$$eval('[data-fam-voiceto]', (x) => x.length); if (n !== 2) prob('family', '#/family/voice', `${n} people to choose from, not 2`, run);
        for (const sel of ['[data-fam="voice-new"]', '[data-fam="voice-keep"]']) if (!(await p.$(sel))) prob('family', '#/family/voice', `no ${sel}`, run);
        await p.click('[data-fam-voiceto]'); await p.waitForTimeout(600); await settle(); cur = '#/family/notes';
        const h = await p.evaluate(() => location.hash); if (h !== '#/family/notes') prob('family', '#/family/voice', `choosing a person opens ${h}, not their doctor's notes`, run);
        const got = await p.evaluate(() => { const k = JSON.parse(localStorage.getItem('fhb.kids')), id = JSON.parse(localStorage.getItem('fhb.kid')); const x = k.find((y) => y.id === id); return x ? x.notes.length : -1; });
        if (got !== 1) prob('family', '#/family/notes', `${got} notes for the chosen person, not 1`, run);
        await look('#/family/notes (a voice note)', '#/family/voice', { shot: true });
      }
    }
    // the Health tab with a child in the family
    await go('#/home'); await look('#/home', '#/family', { shot: true });
    await ctx.close();
    console.log(`${run}: ${seen.size} addresses, ${animBtns.length} animation pages, ${screens} screens so far`);
  }
  await b.close(); server.close();
  // the report: each problem once, with the runs it showed in
  const byCat = {};
  for (const [k, runs] of PROBS) { const cat = k.split(' | ')[0]; (byCat[cat] = byCat[cat] || []).push([k, runs]); }
  let hard = 0;
  for (const cat of Object.keys(byCat).sort()) {
    const list = byCat[cat]; if (HARD.has(cat)) hard += list.length;
    console.log(`\n${HARD.has(cat) ? 'FAIL' : 'NOTE'} ${cat}: ${list.length} different problem(s), ${COUNTS[cat]} in all`);
    for (const [k, runs] of list.slice(0, process.env.VERBOSE ? 1e9 : 40)) console.log(`  ${k.slice(cat.length + 3)}  [${[...runs].join(' ')}]`);
    if (!process.env.VERBOSE && list.length > 40) console.log(`  ... and ${list.length - 40} more (VERBOSE=1 lists them all)`);
  }
  console.log(`\ncrawl: ${screens} screens in ${LANGS.length * WIDTHS.length} runs, ${checks} checks, ${hard} problem(s)`);
  process.exit(hard ? 1 : 0);
})();
