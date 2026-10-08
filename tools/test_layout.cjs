// Health, Home and Family tabs on narrow phones: no text touches a speaker button, no word is split over two lines,
// nothing leaves its card, the header pieces never overlap; at 320, 360 and 412 px, in fa, ps and en, at normal text size
// and with the phone's large-text setting (fonts 15% and 30% bigger). Also: the Health tab has no Emergency button in its
// header (its big red Emergency card is right there); the other screens keep it. With a person, Family also lists two
// family voice notes.
// Needs Playwright with Chromium:  node tools/test_layout.cjs [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8'));
const SCALES = (process.env.SCALES || '1,1.15,1.3').split(',').map(Number);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => { // the app folder, as a phone gets it
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const KID = { id: 'k1', v: 2, given: {}, td: {}, weights: [], meds: [], notes: [], readings: [], sex: 'f', name: 'Zarghuna Gulalai', dob: '2026-08-20', pic: null };
// in the page: what collides
function measure(scale) {
  if (scale !== 1 && !window.__scaled) { // the phone's large-text setting (Android WebView text zoom): every font size in the style sheet grows
    window.__scaled = true;
    const walk = (rules) => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); if (r.style && /px$/.test(r.style.fontSize)) r.style.fontSize = (parseFloat(r.style.fontSize) * scale) + 'px'; } };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) {} }
    dispatchEvent(new Event('resize'));
  }
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
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
  const probs = [];
  const main = document.querySelector('main');
  // 1. text near a speaker: at least 4 px clear
  for (const spk of main.querySelectorAll('.spk')) {
    if (!vis(spk)) continue; const sr = spk.getBoundingClientRect();
    const box = spk.closest('[data-block], .top, .title-row, .hbtn, .trow, .srow, .vstrip, .blk, .panel') || spk.parentElement;
    for (const { r, t } of textRects(box, [...box.querySelectorAll('.spk')])) if (hit(r, sr, 4)) probs.push(['text touches speaker', t, Math.round(r.right), Math.round(sr.left)]);
  }
  // 2. text that leaves its card
  for (const card of main.querySelectorAll('.hbtn, .trow, .tcard, .srow, .srowbig, .vstrip, .blk, .listcard, .ptile, .tile, .card, .kidcard, .panel, .top, .title-row, .vcard')) {
    if (!vis(card)) continue; const cr = card.getBoundingClientRect();
    for (const { r, t } of textRects(card)) if (r.left < cr.left - 1 || r.right > cr.right + 1) probs.push(['text leaves card', card.className, t, Math.round(r.left), Math.round(r.right), Math.round(cr.left), Math.round(cr.right)]);
  }
  // 3. clipped single words (scrollWidth > clientWidth)
  for (const e of main.querySelectorAll('.t, h1, h2, .s, .empill span')) if (vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') probs.push(['clipped', e.className, e.textContent.slice(0, 30)]);
  // 4. a word split over two lines ("Emergen-cy")
  for (const e of main.querySelectorAll('.t, h1, h2, .s, .empill span, .tx, .body, .pn')) {
    if (!vis(e)) continue; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const re = /\S+/g; let mm; while ((mm = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, mm.index); rg.setEnd(n, mm.index + mm[0].length); const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top / 4))); if (tops.size > 1) probs.push(['word split', mm[0]]); } }
  }
  // 5. the header bar: its pieces never overlap each other
  for (const top of main.querySelectorAll('.top, .title-row')) {
    const kids = [...top.children].filter(vis).map((e) => [e, e.getBoundingClientRect()]);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (hit(kids[i][1], kids[j][1], -0.5)) probs.push(['header pieces overlap', kids[i][0].className || kids[i][0].tagName, kids[j][0].className || kids[j][0].tagName]);
    const h = top.querySelector('h1'); if (h && vis(h)) for (const { r, t } of textRects(h)) { const hr = h.getBoundingClientRect(); if (r.right > hr.right + 1 || r.left < hr.left - 1) probs.push(['header title spills', t]); }
  }
  return { probs, scroll: document.scrollingElement.scrollWidth - innerWidth, pill: !!main.querySelector('.top .empill'), heroPill: !!main.querySelector('.topic-hero .empill') };
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  for (const scale of SCALES) for (const width of [320, 360, 412]) for (const lang of ['fa', 'ps', 'en']) for (const kids of [0, 1]) {
    if (kids && scale !== 1 && width !== 320) continue;
    const tag = `${lang}-${width}${scale !== 1 ? '-x' + scale : ''}${kids ? '-kid' : ''}`;
    const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    await p.route(/workers\.dev/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.addInitScript(([lg, CV, kid]) => { localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', JSON.stringify('f')); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); if (kid) { localStorage.setItem('fhb.kids', JSON.stringify([kid])); localStorage.setItem('fhb.kid', JSON.stringify(kid.id)); localStorage.setItem('fhb.famnotes', JSON.stringify([{ id: 'g1', d: '2026-10-08', t: Date.now(), rec: 'a1abcd' }, { id: 'g2', d: '2026-10-01', t: 0, rec: 'a2abcd' }])); } }, [lang, book.config.consentVersion, kids ? KID : null]);
    for (const [name, hash] of [['health', '#/home'], ['home', '#/house'], ['family', '#/family'], ['emergency', '#/emergency'], ['children', '#/children'], ['topic', '#/topic/fever']]) {
      if (scale !== 1 && !['health', 'home', 'family'].includes(name)) continue;
      if (kids && name !== 'family' && name !== 'health') continue;
      await p.goto(BASE + 'index.html' + hash); await p.waitForSelector('main .top, main .topic-hero', { timeout: 8000 }).catch(() => {});
      ok(!(await p.$('.welcome, .voices, .consent, .dialog-wrap')), `${lang} ${width} ${name}: no setup screen or question once the language is chosen`);
      await p.waitForTimeout(300);
      await p.evaluate(() => { document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }); return Promise.race([new Promise((r) => setTimeout(r, 2500)), Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))]); });
      await p.evaluate(measure, scale); await p.waitForTimeout(150); const m = await p.evaluate(measure, scale);
      if (['health', 'home', 'family'].includes(name)) {
        ok(m.probs.length === 0, `${tag} ${name}: no text touches a speaker or leaves its card`, m.probs.slice(0, 6));
        ok(m.scroll <= 0, `${tag} ${name}: no sideways scroll`, m.scroll);
        if (OUT) await p.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
      }
      if (scale === 1 && !kids) {
        if (name === 'health') ok(!m.pill, `${tag}: Health tab has no Emergency button in its header`);
        if (name === 'home' || name === 'family' || name === 'children') ok(m.pill, `${tag}: ${name} keeps the Emergency button in its header`);
        if (name === 'topic') ok(m.heroPill, `${tag}: a topic page keeps the Emergency button`);
        if (name === 'emergency') ok(!m.pill, `${tag}: the Emergency screen has no Emergency button`);
      }
    }
    ok(errs.length === 0, `${tag}: no page errors`, errs);
    await ctx.close();
  }
  // a person's record in Family: long names in the bar and in the person header shrink or wrap between words, never mid-word
  const NAMES = ['Zarghuna', 'Abdul Rahman', 'عبدالرحیم', 'سپوږمۍ ګلالۍ'];
  for (const width of [320, 360]) for (const lang of ['fa', 'ps', 'en']) for (const name of NAMES) {
    const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    await p.route(/workers\.dev/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const kid = { ...KID, name, pic: 'child' };
    await p.addInitScript(([lg, CV, k]) => { localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', JSON.stringify('f')); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); localStorage.setItem('fhb.kids', JSON.stringify([k])); localStorage.setItem('fhb.kid', JSON.stringify(k.id)); }, [lang, book.config.consentVersion, kid]);
    await p.goto(BASE + 'index.html#/family/person'); await p.waitForSelector('main .phead', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(400);
    const m = await p.evaluate(measure, 1);
    const shown = await p.evaluate(() => [...document.querySelectorAll('main .top h1, main .phead .pn')].map((e) => e.textContent));
    ok(shown.length === 2 && shown.every((t) => t === shown[0]) && shown[0] === name, `${lang}-${width} person "${name}": the name shows in the bar and the header`, shown);
    const split = m.probs.filter((x) => x[0] === 'word split' || x[0] === 'header title spills' || x[0] === 'header pieces overlap');
    ok(split.length === 0, `${lang}-${width} person "${name}": the name is not cut mid-word and stays in the bar`, split.slice(0, 4));
    ok(m.scroll <= 0, `${lang}-${width} person "${name}": no sideways scroll`, m.scroll);
    ok(errs.length === 0, `${lang}-${width} person "${name}": no page errors`, errs);
    if (OUT) await p.screenshot({ path: `${OUT}/${lang}-${width}-person-${NAMES.indexOf(name)}.png` });
    await ctx.close();
  }
  await b.close(); server.close();
  console.log(`tab layout tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
