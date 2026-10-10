// "Get the app: works with no internet": the small banner at the top of the Health tab (js/share.js, Mo 2026-10-10).
//   - an Android phone in a browser sees it under the header, above the red Emergency card, in fa, ps and en at 320, 360
//     and 412 px: right to left in fa and ps, no text touching its speaker, a 56 px speaker, a big close button, no
//     sideways scroll; on a 360 x 640 phone the Emergency card and CPR and first aid stay whole on the first screen;
//   - "Get" opens a sheet with the red download button (the same file as the Share page) and the install steps, each
//     with a speaker; the download button starts the download, and with no internet it says so and stays in the app;
//   - × hides it, and it stays hidden after the app is opened again; a phone that cannot keep that (storage blocked)
//     simply shows it again; tapping Get and × are counted (tool-banner-getapk, tool-banner-close), nothing else;
//   - never on an iPhone or a computer, never inside the Android app (its address, appassets.androidplatform.net, or its
//     bridge), and not when the website runs from the home screen (display-mode standalone).
// Nothing leaves the test machine (every request outside the local server is blocked or answered here).
// Needs Playwright with Chromium:  node tools/test_apkbanner.cjs [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const file = (u) => { const f = path.join(ROOT, decodeURIComponent(new URL(u, 'http://x').pathname).replace(/^\/+/, '') || 'index.html'); return f.startsWith(ROOT) && fs.existsSync(f) && !fs.statSync(f).isDirectory() ? f : null; };
const server = http.createServer((q, r) => { // the app folder, as a phone gets it
  const f = file(q.url); if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const APK = 'https://github.com/mokingsacc/Sehat/releases/latest/download/sehat.apk';
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// in the page: where the banner sits and what collides in it
function measure() {
  const b = document.querySelector('main .getapp'); if (!b) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, c, pad) => a.l < c.r + pad && c.l < a.r + pad && a.t < c.b + pad && c.t < a.b + pad;
  const probs = [], br = R(b), spk = R(b.querySelector('.spk')), x = R(b.querySelector('.gx')), go = R(b.querySelector('.go')), tx = R(b.querySelector('.tx'));
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
    for (const q of rg.getClientRects()) {
      const r = { l: q.left, r: q.right, t: q.top, b: q.bottom }; if (!q.width) continue;
      if (hit(r, spk, 4) || hit(r, x, 2)) probs.push(['text touches a button', n.nodeValue.slice(0, 20)]);
      if (r.l < br.l - 1 || r.r > br.r + 1) probs.push(['text leaves the banner', n.nodeValue.slice(0, 20)]);
    }
  }
  const top = document.querySelector('main .top'), em = document.querySelector('main .hbtn.em'), fa = document.querySelector('main .hbtn.fa'), nav = document.querySelector('.nav');
  return {
    probs, br, spk, x, go, tx, scroll: document.scrollingElement.scrollWidth - innerWidth,
    dir: getComputedStyle(b).direction, under: R(top).b <= br.t + 0.5, aboveEm: !!em && br.b <= R(em).t,
    navTop: R(nav).t, emB: em ? R(em).b : 0, faB: fa ? R(fa).b : 0, height: br.h,
  };
}
const usage = () => localStorage.getItem('fhb.usage') || '';

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  // a phone; init(): extra setup in the page before the app starts (language chosen, so no first-run screen)
  const phone = async ({ ua = 'android', width = 360, height = 640, lang = 'en', init = null, initArg = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: ua !== 'desktop', hasTouch: ua !== 'desktop', userAgent: UA[ua], serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route('**/*', (rt) => {
      const u = rt.request().url();
      if (u.startsWith(BASE)) return rt.continue();
      if (u.startsWith('https://appassets.androidplatform.net/')) { const f = file(u); return f ? rt.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }) : rt.fulfill({ status: 404, body: '' }); }
      if (u === APK) return rt.fulfill({ status: 200, headers: { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename=sehat.apk' }, body: 'PK-test' });
      return rt.abort();
    });
    await ctx.addInitScript((lg) => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', JSON.stringify('f')); } }, lang);
    if (init) await ctx.addInitScript(init, initArg);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', (e) => p.errs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) p.errs.push('console ' + m.text()); });
    return { ctx, p };
  };
  const openHome = async (p, base = BASE) => {
    await p.goto(base + 'index.html#/home'); await p.waitForSelector('main .hbtn.em', { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(300);
  };

  // 1. where it sits and how it looks, every language and width
  for (const width of [320, 360, 412]) for (const lang of ['fa', 'ps', 'en']) {
    const tag = `${lang}-${width}`;
    const { ctx, p } = await phone({ width, lang });
    await openHome(p);
    const m = await p.evaluate(measure);
    ok(!!m, `${tag}: the banner shows on an Android phone in a browser`);
    if (m) {
      ok(m.under && m.aboveEm, `${tag}: under the header and above the Emergency card`, m);
      ok(m.probs.length === 0, `${tag}: no text touches the speaker or the close button or leaves the banner`, m.probs);
      ok(m.scroll <= 0, `${tag}: no sideways scroll`, m.scroll);
      ok(m.spk.w >= 56 && m.spk.h >= 56, `${tag}: the speaker is at least 56 px`, m.spk);
      ok(m.x.w >= 40 && m.x.h >= 56, `${tag}: the close button is a big target`, m.x);
      ok(m.height <= 80, `${tag}: the banner stays small (${Math.round(m.height)} px)`, m.height);
      const rtl = lang !== 'en';
      ok(m.dir === (rtl ? 'rtl' : 'ltr'), `${tag}: ${rtl ? 'right to left' : 'left to right'}`, m.dir);
      ok(rtl ? m.go.l > m.tx.l && m.x.r < m.spk.l : m.go.r < m.tx.r && m.x.l > m.spk.r, `${tag}: Get first and × last in reading order`, [m.go, m.tx, m.spk, m.x]);
      if (width === 360) {
        ok(m.emB <= m.navTop && m.faB <= m.navTop, `${tag} x 640: the Emergency card and CPR and first aid stay whole on the first screen`, [m.emB, m.faB, m.navTop]);
        if (OUT && (lang === 'en' || lang === 'fa')) await p.screenshot({ path: `${OUT}/${lang}-360-health.png` });
      }
    }
    if (width === 360) { // the speaker reads the banner's line
      const said = await p.$eval('main .getapp .spk', (e) => e.dataset.say);
      ok(said === 'ui.getapp', `${tag}: its speaker reads ui.getapp`, said);
    }
    ok(p.errs.length === 0, `${tag}: no page errors`, p.errs);
    await ctx.close();
  }

  // 2. Get: the sheet with the download and the install steps; the download; no internet
  for (const lang of ['en', 'fa']) {
    const { ctx, p } = await phone({ lang });
    await openHome(p);
    await p.click('main .getapp .grow');
    await p.waitForSelector('.dialog .getapp-sheet', { timeout: 3000 }).catch(() => {});
    const sh = await p.evaluate(() => {
      const d = document.querySelector('.dialog .getapp-sheet'); if (!d) return null;
      const a = d.querySelector('a[data-share="apk"]');
      return { href: a && a.href, steps: d.querySelectorAll('.step').length, spk: [...d.querySelectorAll('.spk')].map((s) => [s.dataset.say, Math.round(s.getBoundingClientRect().width)]), lead: !!d.querySelector('[data-block="ui.getapp.lead"] .spk') };
    });
    ok(!!sh, `${lang}: Get opens the sheet`);
    if (sh) {
      ok(sh.href === APK, `${lang}: the sheet's red button is the same app file as the Share page`, sh.href);
      ok(sh.steps === 4 && sh.lead, `${lang}: the sheet has its line and the four install steps`, sh);
      ok(sh.spk.length >= 7 && sh.spk.every(([id, w]) => id && w >= 56), `${lang}: every line in the sheet has a 56 px speaker`, sh.spk);
    }
    if (OUT) await p.screenshot({ path: `${OUT}/${lang}-360-get-sheet.png` });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.dialog a[data-share="apk"]')]);
    ok(!!dl && /sehat\.apk$/.test(dl.suggestedFilename()), `${lang}: the red button downloads sehat.apk`, dl && dl.suggestedFilename());
    ok(/127\.0\.0\.1/.test(p.url()), `${lang}: the app stays open while the file downloads`, p.url());
    // no internet: a message, and the app stays
    await p.click('.dialog [data-close]'); await p.waitForTimeout(100);
    ok(!(await p.$('.dialog-wrap')), `${lang}: the sheet closes`);
    await ctx.setOffline(true);
    await p.click('main .getapp .grow'); await p.waitForSelector('.dialog a[data-share="apk"]');
    await p.click('.dialog a[data-share="apk"]'); await p.waitForTimeout(400);
    const t = await p.evaluate(() => ({ toast: document.querySelector('#toast.show') ? document.querySelector('#toast').textContent : '', url: location.href }));
    ok(/127\.0\.0\.1/.test(t.url) && t.toast.length > 0, `${lang}: with no internet it says so and stays in the app`, t);
    await ctx.setOffline(false);
    // counted on the phone (saved when the page is left)
    await p.reload(); await p.waitForSelector('main .hbtn.em'); await p.waitForTimeout(200);
    const u = await p.evaluate(usage);
    ok(u.includes('act/tool-banner-getapk') && u.includes('act/tool-share-getapk'), `${lang}: Get and the download are counted`, u.slice(0, 300));
    ok(p.errs.length === 0, `${lang} Get: no page errors`, p.errs);
    await ctx.close();
  }

  // 3. ×: gone, and gone after opening again; counted
  {
    const { ctx, p } = await phone({ lang: 'fa' });
    await openHome(p);
    await p.click('main .getapp .gx'); await p.waitForTimeout(150);
    ok(!(await p.$('main .getapp')), 'fa: × hides the banner at once');
    ok(await p.evaluate(() => localStorage.getItem('fhb.apkBannerOff') === 'true'), 'fa: × is kept on the phone');
    await p.reload(); await p.waitForSelector('main .hbtn.em'); await p.waitForTimeout(300);
    ok(!(await p.$('main .getapp')), 'fa: still hidden after the app is opened again');
    await p.goto(BASE + 'index.html#/house'); await p.waitForTimeout(200); await p.goto(BASE + 'index.html#/home'); await p.waitForTimeout(300);
    ok(!(await p.$('main .getapp')), 'fa: still hidden after going to another tab and back');
    const u = await p.evaluate(usage);
    ok(u.includes('act/tool-banner-close') && !u.includes('act/tool-banner-getapk'), 'fa: × is counted', u.slice(0, 300));
    await p.goto(BASE + 'index.html#/share'); await p.waitForSelector('main a[data-share="apk"]', { timeout: 5000 }).catch(() => {});
    ok(!!(await p.$('main a[data-share="apk"]')), 'fa: the Share page still offers the app file after ×');
    ok(p.errs.length === 0, 'fa ×: no page errors', p.errs);
    await ctx.close();
  }
  // a phone that cannot keep anything (storage blocked): × still hides it, and it shows again next time
  {
    const block = () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k) === 'fhb.apkBannerOff') throw new Error('QuotaExceededError'); return set.call(this, k, v); }; };
    const { ctx, p } = await phone({ lang: 'ps', init: block });
    await openHome(p);
    await p.click('main .getapp .gx'); await p.waitForTimeout(150);
    ok(!(await p.$('main .getapp')), 'ps, storage blocked: × hides the banner');
    await p.reload(); await p.waitForSelector('main .hbtn.em'); await p.waitForTimeout(300);
    ok(!!(await p.$('main .getapp')), 'ps, storage blocked: it shows again next time');
    ok(p.errs.length === 0, 'ps, storage blocked: no page errors', p.errs);
    await ctx.close();
  }

  // 4. never on an iPhone or a computer, inside the Android app, or from the home screen
  const absent = async (label, opts, base = BASE) => {
    const { ctx, p } = await phone(opts);
    await openHome(p, base);
    const em = !!(await p.$('main .hbtn.em'));
    ok(em && !(await p.$('main .getapp')), `${label}: no banner (the Health tab is there)`, { em });
    ok(p.errs.length === 0, `${label}: no page errors`, p.errs);
    await ctx.close();
  };
  await absent('iPhone', { ua: 'iphone', lang: 'fa' });
  await absent('computer', { ua: 'desktop', lang: 'en', width: 1280, height: 800 });
  await absent('Android app address (appassets.androidplatform.net)', { lang: 'fa' }, 'https://appassets.androidplatform.net/');
  await absent('Android app bridge', { lang: 'fa', init: () => { window.FHBAndroid = { shareApp() {}, isInstalled() { return false; }, shareAppTo() { return false; } }; } });
  await absent('added to the home screen (standalone)', { lang: 'en', init: () => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q)); } });

  await browser.close(); server.close();
  console.log(`Get-the-app banner tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
