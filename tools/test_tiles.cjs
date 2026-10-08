// "What is wrong?" picture pages (#/sym/<id>/<age>, content/src/symptoms.json "page") in a phone browser, fa, ps and en.
// Opens every picture from the grid, and every age of it, and checks:
//   - danger signs first: the first box on the page is the red "hospital now" box (not breathing and choking: the red
//     "send for a car" row and the first-aid pages come first), and nothing amber, no step and no page list comes before it;
//   - every sign in a box has a speaker of at least 56 px, and every narrated block on the page has one;
//   - every piece of text on the page has a speaker (except the age pictures, read by the "Who is sick?" speaker);
//   - no Home-tab page anywhere on the page (Mo's rule: no medical advice from the Home side);
//   - no dead end: a way back to the pictures, the nearest-clinic row, every link opens a real page, and a page opened
//     from a picture's page goes back to it; every list row has a picture;
//   - no console errors and no sideways scroll; the age pictures switch the boxes.
// Needs Playwright with Chromium:  node tools/test_tiles.cjs [screenshot folder]
// The screenshot folder gets phone-size pictures (360 px) of Cough, Fever, Diarrhoea, Newborn and Back pain in fa and en.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8'));
const LANGS = (process.env.LANGS || 'fa,ps,en').split(',');
const SHOTS = ['cough', 'fever', 'diarrhoea', 'newborn', 'back'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const HOUSE = new Set(Object.entries(book.config.lists).filter(([, c]) => c.tab === 'house').flatMap(([n]) => book.sections[n] || []));
let pass = 0, fail = 0; const FAILS = [];
const ok = (c, label) => { if (c) pass++; else { fail++; FAILS.push(label); } };

// in the page: what is on the screen now
function look(MIN) {
  const main = document.querySelector('main');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('details:not([open]) > :not(summary)'); };
  // the content in order: each red or amber box, step, care block, page row, first-aid row
  const order = [...main.querySelectorAll('.alert, .blk.step, .blk.clinic, .trow, .erow, .em-car, .em-ages, .group-h, .blk.link')].map((e) =>
    e.matches('.alert.urgent') ? 'red' : e.matches('.alert.soon') ? 'amber' : e.matches('.alert.dont') ? 'dont' : e.matches('.em-car') ? 'car' : e.matches('.em-ages') ? 'cpr'
      : e.matches('.erow') ? 'now' : e.matches('.trow.tool') ? 'tool' : e.matches('.trow') ? 'page' : e.matches('.group-h') ? 'head:' + e.dataset.block : 'step');
  const signs = [...main.querySelectorAll('.alert .item, .alert .ah')].map((e) => { const s = e.querySelector('.spk'); const r = s && s.getBoundingClientRect(); return { id: e.dataset.block, say: s && s.dataset.say, size: r ? Math.min(r.width, r.height) : 0 }; });
  const blocks = [...main.querySelectorAll('[data-block]')].filter(vis).map((b) => ({ id: b.dataset.block, spk: !!(b.querySelector('.spk, [data-say]') || b.matches('[data-say]')) }));
  const small = [...main.querySelectorAll('.spk')].filter(vis).map((s) => { const r = s.getBoundingClientRect(); return Math.min(r.width, r.height); }).filter((x) => x < MIN - 0.5);
  // text with no speaker over it (the age pictures are read by the "Who is sick?" speaker above them)
  const SKIP = 'nav, .topic-hero, .listen, .sources, button, svg, [aria-hidden=true], #toast';
  const unspoken = []; const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || el.closest(SKIP) || !vis(el)) continue;
    let a = el; while (a && a !== main && !a.querySelector('.spk')) a = a.parentElement;
    if (!a || a === main) unspoken.push(t.slice(0, 40));
  }
  const rowsNoPic = [...main.querySelectorAll('.trow, .erow')].filter((r) => !r.querySelector('img')).map((r) => r.textContent.trim().slice(0, 30));
  const links = [...main.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href'));
  const tabs = [...main.querySelectorAll('.agetab')].map((a) => ({ href: a.getAttribute('href'), on: a.classList.contains('on') }));
  const redItems = [...main.querySelectorAll('.alert.urgent .item')].map((e) => e.dataset.block);
  return { order, signs, blocks, small, unspoken, rowsNoPic, links, tabs, redItems, scroll: document.scrollingElement.scrollWidth - innerWidth, h1: (main.querySelector('h1') || {}).textContent };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  let pages = 0;
  for (const lang of LANGS) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.route(/workers\.dev|\/e$|\/r$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.addInitScript(([lg, CV]) => { localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', '"f"'); localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' })); }, [lang, book.config.consentVersion]);
    await p.goto(BASE + 'index.html#/ask'); await p.waitForSelector('main a.sym', { timeout: 15000 });
    const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(150); };
    const tiles = await p.$$eval('a.sym', (x) => x.map((a) => a.getAttribute('href')));
    ok(tiles.length === book.symptoms.length, `${lang}: ${tiles.length} pictures on #/ask, ${book.symptoms.length} in the book`);
    for (const href of tiles) {
      const id = href.split('/')[2], sym = book.symptoms.find((x) => x.id === id), pg = sym.page;
      await go('#/ask'); await p.click(`a.sym[href="${href}"]`); await p.waitForTimeout(200);
      ok(await p.evaluate(() => location.hash) === href, `${lang} ${id}: the picture opens ${href}`);
      const ages = pg.ages || ['anyone'];
      for (const age of ages) {
        const tag = `${lang} ${id}/${age}`; pages++;
        if (ages.length > 1) {
          const tab = await p.$(`.agetab[data-symage="${age}"]`); ok(!!tab, `${tag}: an age picture`);
          if (tab) { await tab.click(); await p.waitForTimeout(150); }
        }
        const m = await p.evaluate(look, 56);
        const want = (pg.red || {})[age] || (pg.red || {}).all;
        // danger first
        const firstBox = m.order.find((x) => !/^head:|^car$|^cpr$|^now$/.test(x) || x === 'now' && !pg.nowFirst);
        ok(firstBox === 'red', `${tag}: the first box is the red danger box (order: ${m.order.slice(0, 6).join(' ')})`);
        const redAt = m.order.indexOf('red');
        if (pg.nowFirst) ok(m.order[0] === 'car', `${tag}: "send for a car" comes first`);
        ok(!m.order.slice(0, redAt).some((x) => /^(amber|step|page|tool|dont)$/.test(x)), `${tag}: nothing amber, no step and no page before the red box`);
        ok(want && JSON.stringify(m.redItems) === JSON.stringify(want.items.map((i) => i.id)), `${tag}: the red box shows this age's signs`);
        if (ages.length > 1) ok(m.tabs.filter((t) => t.on).length === 1 && m.tabs.find((t) => t.on).href.endsWith('/' + age), `${tag}: this age's picture is the one picked`);
        // a speaker on every sign and every block
        ok(m.signs.length > 1 && m.signs.every((s) => s.say === s.id && book.narration[s.id] && s.size >= 55.5), `${tag}: every sign has its own speaker of 56 px (${m.signs.filter((s) => !(s.say === s.id && s.size >= 55.5)).map((s) => s.id).join(' ')})`);
        ok(m.blocks.every((x) => x.spk), `${tag}: every narrated block has a speaker (${m.blocks.filter((x) => !x.spk).map((x) => x.id).join(' ')})`);
        ok(!m.small.length, `${tag}: speakers at least 56 px (${m.small.join(' ')})`);
        ok(!m.unspoken.length, `${tag}: every text has a speaker (${m.unspoken.slice(0, 3).join(' | ')})`);
        ok(!m.rowsNoPic.length, `${tag}: every row has a picture (${m.rowsNoPic.join(' | ')})`);
        // no Home-tab page, no dead end
        const tids = m.links.filter((l) => /^#\/topic\//.test(l)).map((l) => l.split('/')[2]);
        ok(!tids.some((t) => HOUSE.has(t)), `${tag}: no Home-tab page (${tids.filter((t) => HOUSE.has(t)).join(' ')})`);
        ok(tids.every((t) => book.topics[t]), `${tag}: every page link opens a real page`);
        ok(m.links.includes('#/ask') && m.links.includes('#/near'), `${tag}: a way back to the pictures and to the nearest clinic`);
        ok(m.scroll <= 0, `${tag}: no sideways scroll (${m.scroll} px)`);
        if (OUT && SHOTS.includes(id) && (lang === 'fa' || lang === 'en') && age === (pg.default || ages[0])) {
          await p.reload(); await p.waitForTimeout(500); // a fresh page: no speaker playing
          await p.evaluate(() => scrollTo(0, 0));
          await p.screenshot({ path: path.join(OUT, `${id}-${lang}-top.png`) });
          await p.screenshot({ path: path.join(OUT, `${id}-${lang}-full.png`), fullPage: true });
        }
      }
      // a page opened from here comes back here
      const here = await p.evaluate(() => location.hash);
      const link = await p.$('main .trow a.grow[href^="#/topic/"], main .erow a.grow[href^="#/topic/"]');
      if (link) {
        await link.click(); await p.waitForTimeout(200);
        const back = await p.$eval('main .topic-hero a.round', (a) => a.getAttribute('href')).catch(() => '');
        ok(back === here, `${lang} ${id}: a page opened from the picture's page goes back to it (${back})`);
      }
    }
    // typed words: the picture's page comes first, and no Home-tab page
    for (const [q, want] of Object.entries({ fa: { 'طفلم سرفه دارد': 'cough', 'کمرم درد می‌کند': 'back' }, ps: { 'ماشوم مې ټوخی لري': 'cough' }, en: { 'my child has a cough': 'cough', 'back pain': 'back', 'toothache': 'teeth' } }[lang])) {
      await go('#/ask'); await p.fill('#askq', q); await p.press('#askq', 'Enter'); await p.waitForTimeout(250);
      const hrefs = await p.$$eval('#askres a.rt', (x) => x.map((a) => a.getAttribute('href')));
      ok(hrefs[0] === '#/sym/' + want, `${lang} "${q}": the ${want} picture's page comes first (${hrefs.slice(0, 3).join(' ')})`);
      ok(!hrefs.some((h) => HOUSE.has((/^#\/topic\/([\w-]+)/.exec(h) || [])[1])), `${lang} "${q}": no Home-tab page`);
    }
    ok(!errs.length, `${lang}: no console errors (${errs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await b.close(); server.close();
  for (const f of FAILS.slice(0, 60)) console.log('FAIL', f);
  if (FAILS.length > 60) console.log(`... and ${FAILS.length - 60} more`);
  console.log(`tiles: ${pages} picture pages (every age) in ${LANGS.length} languages, ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
