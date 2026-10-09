// Narration clips at 360 px in Dari and Pashto, woman's and man's voice: each speaker plays the clip of the chosen voice
// (Emergency, a topic, the Home page, the baby CPR film), a clip played once still plays offline, a clip not on the phone
// falls back quietly when offline, the urgent pack downloads Emergency and CPR first, on mobile data only that part
// downloads by itself, and the Android app plays its own Emergency and CPR clips (woman's voice) and gets the rest from
// the website. No console errors anywhere.
// Needs Playwright with Chromium and the audio/ folder:  node tools/test_voices.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const file = (u) => { const f = path.join(ROOT, decodeURIComponent(u.split('?')[0]).replace(/^\/+/, '') || 'index.html'); return f.startsWith(ROOT) && fs.existsSync(f) && !fs.statSync(f).isDirectory() ? f : null; };
let down = false; // "no internet": the test server answers nothing (Playwright's offline mode does not cover the service worker)
const server = http.createServer((q, r) => {
  if (down) return q.socket.destroy();
  const f = file(q.url); if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*' }); fs.createReadStream(f).pipe(r);
});
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const clipPath = (slot, id) => (book.audio[slot][id] || '').split('?')[0];

// in the page: log every clip lookup (getClip asks the audio cache first) and every sound that really starts playing
function hooks([lg, v, CV, auto]) {
  localStorage.setItem('fhb.lang', JSON.stringify(lg)); localStorage.setItem('fhb.voice', JSON.stringify(v));
  localStorage.setItem('fhb.consent', JSON.stringify({ v: CV, ok: false, day: '2026-10-07' }));
  if (!auto) localStorage.setItem('fhb.dlAuto', 'false');
  window.__looked = []; window.__played = 0; window.__fetched = [];
  const bare = (r) => { const u = new URL(typeof r === 'string' ? r : r.url, location.href); return u.origin + u.pathname; };
  const m = Cache.prototype.match; Cache.prototype.match = function (r, o) { const u = bare(r); if (/\/audio\//.test(u)) window.__looked.push(u); return m.call(this, r, o); };
  const f = window.fetch; window.fetch = function (r, o) { const u = bare(r); if (/\/audio\//.test(u)) window.__fetched.push(u); return f.call(this, r, o); };
  const pl = HTMLMediaElement.prototype.play; // the app's player is not in the page, so count on the element itself
  HTMLMediaElement.prototype.play = function () { if (!this.__hooked) { this.__hooked = true; this.addEventListener('playing', () => { window.__played++; }); } return pl.call(this); };
}
async function tapAndCheck(p, sel, slot, label, base) {
  const el = await p.$(sel); ok(!!el, label + ': speaker found', sel); if (!el) return null;
  const id = await el.getAttribute('data-say');
  const before = await p.evaluate(() => [window.__looked.length, window.__played]);
  await el.click();
  await p.waitForFunction((n) => window.__played > n, before[1], { timeout: 8000 }).catch(() => {});
  const [looked, played] = await p.evaluate((n) => [window.__looked.slice(n), window.__played], before[0]);
  const want = new URL(clipPath(slot, id), base).href;
  ok(looked[0] === want, `${label}: ${id} asks for the ${slot} clip`, { looked, want, toast: await p.$eval('#toast', (t) => t.textContent).catch(() => '') });
  ok(played > before[1], `${label}: ${id} plays`);
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await p.waitForTimeout(250);
  return id;
}
async function go(p, base, hash) { await p.goto(base + 'index.html' + hash); await p.waitForSelector('main', { timeout: 8000 }); await p.waitForTimeout(400); }

(async () => {
  await new Promise((r) => server.listen(0, r));
  const BASE = `http://localhost:${server.address().port}/`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const CV = book.config.consentVersion;
  for (const lg of ['fa', 'ps']) for (const v of ['f', 'm']) {
    const slot = `${lg}-${v}`, L = slot;
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.fulfill({ status: 204, body: '' })); // no analytics from tests
    const p = await ctx.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
    await p.addInitScript(hooks, [lg, v, CV, false]);
    await go(p, BASE, '#/home');
    await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(600); // the service worker now handles the page
    ok(await p.evaluate(() => !!navigator.serviceWorker.controller), L + ': service worker running');
    const home = await tapAndCheck(p, 'main .spk[data-say]', slot, L + ' home', BASE);
    await go(p, BASE, '#/emergency');
    await tapAndCheck(p, '.em-who .spk', slot, L + ' emergency', BASE);
    await go(p, BASE, '#/topic/diarrhoea');
    const topic = await tapAndCheck(p, 'main .blk .spk[data-say]', slot, L + ' topic', BASE);
    // the baby CPR film narrates its first scene in this voice
    await go(p, BASE, '#/emergency/baby');
    let n0 = await p.evaluate(() => [window.__looked.length, window.__played]);
    await p.click('.em-watch');
    await p.waitForFunction((n) => window.__played > n, n0[1], { timeout: 10000 }).catch(() => {});
    let looked = await p.evaluate((n) => window.__looked.slice(n), n0[0]);
    const cprWant = book.config.emergency.find((a) => a.id === 'baby').anim;
    ok(looked.length && new RegExp(`/audio/${slot}/anim\\.${cprWant}\\.(title|s1)\\.mp3`).test(looked[0]), L + ': baby CPR film plays its own clip', looked[0]);
    ok(await p.evaluate((n) => window.__played > n, n0[1]), L + ': baby CPR film narration plays');
    await p.goto(BASE + 'index.html#/home'); await p.waitForTimeout(400);
    // offline: what was played once still plays; what was not falls back without breaking
    await ctx.setOffline(true); down = true;
    await go(p, BASE, '#/topic/diarrhoea');
    await tapAndCheck(p, `main .spk[data-say="${topic}"]`, slot, L + ' offline, played before', BASE);
    await go(p, BASE, '#/topic/malaria');
    const el = await p.$('main .blk .spk[data-say]'); const pl = await p.evaluate(() => [window.__played, window.__looked.length]);
    await el.click(); await p.waitForTimeout(1800);
    const lk = await p.evaluate((n) => window.__looked.slice(n), pl[1]);
    ok(lk.length === 2 && lk[0].includes(`/audio/${slot}/`) && lk[1].includes(`/audio/${lg}-${v === 'f' ? 'm' : 'f'}/`), L + ': offline, never played: tries this voice, then the other voice', lk);
    const toast = await p.$eval('#toast', (t) => t.classList.contains('show') ? t.textContent : '').catch(() => '');
    ok(await p.evaluate((n) => window.__played === n, pl[0]), L + ': offline, never played: no sound, no hang');
    ok(toast === book.ui.noAudio[lg], L + ': offline, never played: the usual "not recorded" note', toast);
    ok(!!(await p.$('main .blk')), L + ': page still works');
    await ctx.setOffline(false); down = false;
    ok(!errs.length, L + ': no console errors', errs);
    await ctx.close();
    void home;
  }

  // the urgent pack downloads by itself, Emergency and CPR first; Settings shows progress; downloaded clips play offline
  {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.fulfill({ status: 204, body: '' }));
    const p = await ctx.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
    await ctx.route((u) => u.href.startsWith(BASE + 'audio/'), (r) => setTimeout(() => r.continue(), 25)); // a slow line, to see the progress
    await p.addInitScript(hooks, ['ps', 'f', CV, true]);
    await go(p, BASE, '#/settings');
    await p.waitForFunction(() => window.__fetched.length >= 60, null, { timeout: 20000 }).catch(() => {});
    const got = await p.evaluate(() => window.__fetched.slice(0, 60));
    const st = await p.$eval('#packs [data-pack=urgent] .s', (e) => e.textContent).catch(() => '');
    const em = book.config.emergency, cpr = new Set(em.map((a) => a.cpr));
    const first = got.map((u) => decodeURIComponent(u.split('/').pop().replace(/\.mp3.*$/, '')));
    ok(got.every((u) => u.includes('/audio/ps-f/')), 'pack: only the chosen voice downloads', got.find((u) => !u.includes('/audio/ps-f/')));
    ok(first.length === 60 && first.every((id) => /^ui\.(emergency|emergencyWho|sendForCar|near|cprFirstAid|age)/.test(id) || cpr.has(id.split('.')[0]) || /^anim\.cpr/.test(id)), 'pack: Emergency and CPR come first', first);
    ok(/[%٪]/.test(st), 'pack: Settings shows the urgent pack downloading with progress', st);
    // wait for the CPR pages of the urgent pack, then play one offline
    await p.waitForFunction(() => window.__fetched.length >= 140, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    await ctx.setOffline(true); await p.waitForTimeout(500); down = true; // the downloads stop at the next clip
    await go(p, BASE, '#/topic/cpr-baby');
    const sp = await p.$$eval('main .spk[data-say]', (a) => a.map((e) => e.getAttribute('data-say')));
    const idx = sp.findIndex((id) => id.startsWith('cpr-baby.') && id !== 'cpr-baby.title');
    if (idx >= 0) await tapAndCheck(p, `main .spk[data-say="${sp[idx]}"]`, 'ps-f', 'pack offline (downloaded, never played)', BASE);
    else ok(false, 'pack: cpr-baby speaker found');
    await ctx.setOffline(false); down = false;
    // voice choice in Settings: big buttons with speakers; the man's voice for Pashto, and Dari keeps its own
    await go(p, BASE, '#/settings');
    ok((await p.$$('#voicepanel .voicebtn button.big')).length === 2 && (await p.$$('#voicepanel .voicebtn .spk')).length === 2, 'settings: woman and man buttons, each with a speaker');
    ok(await p.$eval('#voicepanel [data-voice=f]', (e) => e.getAttribute('aria-pressed')) === 'true', 'settings: woman\'s voice chosen');
    await p.click('#voicepanel [data-voice=m]'); await p.waitForTimeout(300);
    ok(await p.$eval('#voicepanel [data-voice=m]', (e) => e.getAttribute('aria-pressed')) === 'true', 'settings: man\'s voice chosen');
    const keepOld = async () => { if (await p.waitForSelector('.dialog-wrap [data-oldvoice=keep]', { timeout: 2500 }).catch(() => null)) await p.click('.dialog-wrap [data-oldvoice=keep]'); }; // "delete the old voice?" keep
    await keepOld();
    await p.click('[data-lang=fa]'); await keepOld();
    ok(await p.$eval('#voicepanel [data-voice=f]', (e) => e.getAttribute('aria-pressed')) === 'true', 'settings: Dari starts with the woman\'s voice');
    await p.click('[data-lang=ps]'); await keepOld();
    ok(await p.$eval('#voicepanel [data-voice=m]', (e) => e.getAttribute('aria-pressed')) === 'true', 'settings: Pashto keeps the man\'s voice');
    ok(!errs.length, 'pack: no console errors', errs);
    await ctx.close();
  }

  // on mobile data only the urgent pack downloads by itself; the others wait for a tap on Download (or Wi-Fi).
  // The same when the phone does not say what connection it has (no navigator.connection: iPhones, computers) and
  // with data saver on Wi-Fi: only Wi-Fi or a cable counts (onWifi() in js/anim.js).
  for (const [NET, conn] of [['mobile data', { type: 'cellular', effectiveType: '4g', saveData: false }], ['no connection info', null], ['data saver', { type: 'wifi', effectiveType: '4g', saveData: true }]]) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.fulfill({ status: 204, body: '' }));
    const p = await ctx.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
    await p.addInitScript((c) => { Object.defineProperty(navigator, 'connection', { configurable: true, value: c ? Object.assign({ addEventListener() {} }, c) : undefined }); }, conn);
    await p.addInitScript(hooks, ['fa', 'm', CV, true]);
    await go(p, BASE, '#/settings');
    // (only the lines that have a clip in this voice: new lines wait for the voices thread)
    const first = new Set(book.packs.first.filter((id) => (book.audio['fa-m'] || {})[id])), firstN = first.size;
    await p.waitForFunction((n) => window.__fetched.length >= n, firstN, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const got = await p.evaluate(() => window.__fetched.slice()), n = got.length;
    ok(n === firstN && got.every((u) => u.includes('/audio/fa-m/') && first.has(u.split('/').pop().replace(/\.mp3$/, ''))),
      NET + ': only the Emergency and CPR part downloads by itself', { n, firstN });
    ok(!!(await p.$('#packs [data-pack=urgent] [data-dlpack=urgent]')), NET + ': the rest of the urgent pack has a Download button');
    ok(!!(await p.$('#packs [data-pack=children] [data-dlpack=children]')), NET + ': the children pack has a Download button');
    await p.click('#packs [data-dlpack=children]');
    await p.waitForFunction((n) => window.__fetched.length > n + 50, n, { timeout: 20000 }).catch(() => {});
    const more = await p.evaluate((n) => window.__fetched.slice(n), n);
    const kids = new Set(book.packs.ids.children);
    ok(more.length > 50 && more.every((u) => u.includes('/audio/fa-m/') && kids.has(u.split('/').pop().replace(/\.mp3$/, ''))), NET + ': Download gets the children pack', more.slice(0, 3));
    ok(!errs.length, NET + ': no console errors', errs);
    await ctx.close();
  }

  // the Android app: the page is https://appassets.androidplatform.net/assets/. Inside: only the Emergency and CPR clips
  // in the woman's voice of Dari and Pashto (book.bundle); every other clip comes from the website (appUrl).
  {
    const APK = 'https://appassets.androidplatform.net/assets/', SITE = book.config.appUrl;
    const inApk = new Set(); for (const sl of book.bundle.slots) for (const id of book.bundle.ids) if (book.audio[sl][id]) inApk.add(clipPath(sl, id));
    ok(book.bundle.slots.join() === 'fa-f,ps-f' && inApk.size > 100, 'apk: Emergency and CPR clips of fa-f and ps-f are listed', book.bundle.slots);
    for (const [lg, v, auto] of [['fa', 'f', true], ['ps', 'f', false], ['fa', 'm', false]]) {
      const L = `apk ${lg}-${v}`;
      const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      let offline = false; const siteHits = [], apkHits = [];
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        const local = u.startsWith(APK) ? u.slice(APK.length).split('?')[0] : u.startsWith(SITE) ? u.slice(SITE.length).split('?')[0] : null;
        if (local === null) return route.fulfill({ status: 204, body: '' });
        if (u.startsWith(APK) && /^audio\//.test(local)) { if (!inApk.has(local)) return route.fulfill({ status: 404, body: '' }); apkHits.push(local); } // only the bundled clips are in the app
        if (u.startsWith(SITE)) { if (offline) return route.abort('internetdisconnected'); siteHits.push(local); }
        const f = file('/' + local);
        if (!f) return route.fulfill({ status: 404, body: '' });
        route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
      });
      const p = await ctx.newPage(); const errs = [];
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
      // mobile data, and a switch for "no internet" (the files inside the app still load then)
      await p.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular', effectiveType: '4g', saveData: false, addEventListener() {} } });
        Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => localStorage.getItem('t.off') !== '1' });
      });
      await p.addInitScript(hooks, [lg, v, CV, auto]);
      const goOffline = async () => { offline = true; await p.evaluate(() => localStorage.setItem('t.off', '1')); };
      if (v === 'f') {
        await go(p, APK, '#/emergency');
        await tapAndCheck(p, '.em-who .spk', `${lg}-f`, L + ' (inside the app)', APK);
        if (auto) { await p.waitForTimeout(3000); ok(!siteHits.some((h) => h.startsWith('audio/')), L + ': on mobile data nothing downloads (Emergency and CPR are inside)', siteHits.filter((h) => h.startsWith('audio/')).slice(0, 3)); }
        await goOffline();
        await go(p, APK, '#/emergency/baby');
        const cprId = book.config.emergency.find((a) => a.id === 'baby').cpr + '.title';
        await tapAndCheck(p, `main .spk[data-say="${cprId}"]`, `${lg}-f`, L + ' offline, never played (inside the app)', APK);
        await go(p, APK, '#/home'); await go(p, APK, '#/emergency');
        await tapAndCheck(p, '.em-who .spk', `${lg}-f`, L + ' offline again', APK);
        await go(p, APK, '#/emergency/baby'); // the baby CPR film narrates offline
        const n0 = await p.evaluate(() => window.__played); await p.click('.em-watch');
        await p.waitForFunction((n) => window.__played > n, n0, { timeout: 10000 }).catch(() => {});
        ok(await p.evaluate((n) => window.__played > n, n0), L + ': offline, the baby CPR film narrates');
        ok(!siteHits.some((h) => h.startsWith('audio/')), L + ': no clip came from the website', siteHits.filter((h) => h.startsWith('audio/')).slice(0, 3));
      } else {
        await go(p, APK, '#/emergency');
        await tapAndCheck(p, '.em-who .spk', `${lg}-m`, L + ' (from the website)', SITE);
        ok(siteHits.some((h) => h === `audio/${lg}-m/ui.emergencyWho.mp3`), L + ': the man\'s clip came from the website', siteHits.slice(-3));
        await goOffline();
        await go(p, APK, '#/home'); await go(p, APK, '#/emergency');
        await tapAndCheck(p, '.em-who .spk', `${lg}-m`, L + ' offline, played before', SITE);
        await go(p, APK, '#/emergency/baby');
        const cprId = book.config.emergency.find((a) => a.id === 'baby').cpr + '.title';
        const n0 = await p.evaluate(() => [window.__looked.length, window.__played]);
        await p.click(`main .spk[data-say="${cprId}"]`);
        await p.waitForFunction((n) => window.__played > n, n0[1], { timeout: 8000 }).catch(() => {});
        const lk = await p.evaluate((n) => window.__looked.slice(n), n0[0]);
        ok(lk[0] === new URL(clipPath(`${lg}-m`, cprId), SITE).href && lk[1] === new URL(clipPath(`${lg}-f`, cprId), APK).href, L + ': offline, not downloaded: falls back to the woman\'s clip inside the app', lk);
        ok(await p.evaluate((n) => window.__played > n, n0[1]), L + ': offline, the fallback plays');
      }
      ok(!errs.length, L + ': no console errors', errs);
      await ctx.close();
    }
  }
  await b.close(); server.close();
  console.log(`voice tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
