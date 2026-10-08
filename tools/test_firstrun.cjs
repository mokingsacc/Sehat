// The first run and the district question, at 360 px, with a fake clock (Playwright page.clock.setFixedTime):
//   - a new phone sees one screen, the language; one tap opens the Health tab (no voice, consent or district screens);
//     the woman's voice is chosen, usage counts and the disease watch are on, the Privacy page and Settings keep the
//     off switches;
//   - the district question: not before 24 hours from the first open, never over the Emergency screen or a recording
//     screen, then once;
//     after "Not now" once more 7 days later, then never again; a chosen district ends it and shows in Settings;
//     not asked when counts are off;
//   - a disease-watch report on a new phone (the watch on by default) asks for the district there and then, and is sent;
//     a matching symptom search queues a search signal; switched off in Settings, it stays off;
//   - phones from older versions: a language without a voice gets the woman's voice; the disease watch is switched on
//     for every older phone, except one whose family switched it off in Settings.
// Nothing leaves the test machine (every request outside the local server is blocked).
// Needs Playwright with Chromium:  node tools/test_firstrun.cjs [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => { // the app folder, as a phone gets it
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const H = 3600e3, DAYMS = 24 * H;
const T0 = Date.parse('2026-10-01T08:00:00');
const SV = book.surveillance;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  const newCtx = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.route('**/*', (rt) => (rt.request().url().startsWith(BASE) ? rt.continue() : rt.abort())); // no counts reach the real server
    if (init) await ctx.addInitScript(init.fn, init.arg);
    return ctx;
  };
  // one "app open" at a given time: a new page in the same phone (same storage), the clock fixed at that time
  const open = async (ctx, t, hash = '#/home') => {
    for (const pg of ctx.pages()) await pg.close();
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    await p.clock.setFixedTime(t);
    await p.goto(BASE + 'index.html' + hash);
    await p.waitForSelector('#app main');
    await p.waitForTimeout(3200); // the question waits 2.5 s for the screen to settle
    return p;
  };
  const ls = (p, k) => p.evaluate((k) => JSON.parse(localStorage.getItem('fhb.' + k)), k);
  const asked = (p) => p.$('.dialog-wrap [data-say="ui.consentDistrict"]').then(Boolean);
  const shot = async (p, name) => { if (OUT) await p.screenshot({ path: path.join(OUT, name + '.png') }); };

  // 1. the first run: one screen, then the Health tab
  for (const lang of ['en', 'fa']) {
    const ctx = await newCtx();
    let p = await open(ctx, T0, '');
    ok(await p.$('.welcome [data-setlang="fa"]') && await p.$('.welcome [data-setlang="ps"]') && await p.$('.welcome [data-setlang="en"]'), lang + ': the first screen offers the three languages');
    ok(!(await p.$('.dialog-wrap')), lang + ': no question on the first screen');
    if (lang === 'en') await shot(p, '1-first-run-language');
    await p.click(`.welcome [data-setlang="${lang}"]${lang === 'en' ? '' : '.big'}`);
    await p.waitForTimeout(600);
    ok(await p.$('.hbtn.em'), lang + ': one tap opens the Health tab', await p.$eval('#app', (e) => e.innerText.slice(0, 200)));
    ok(!(await p.$('.voices, .consent, [data-cdist], [data-consent]')), lang + ': no voice, consent or district screen');
    ok(await ls(p, 'lang') === lang && await ls(p, 'voice') === 'f', lang + ': language saved, the woman\'s voice chosen');
    ok(await ls(p, 'firstOpen') === T0, lang + ': first open remembered', await ls(p, 'firstOpen'));
    ok(await ls(p, 'consent') === null && await ls(p, 'watch') === true, lang + ': counts and the disease watch on, with no question');
    await p.waitForTimeout(3000);
    ok(!(await asked(p)), lang + ': no district question on the first day');
    await shot(p, `2-after-first-run-${lang}`);
    await p.goto(BASE + 'index.html#/settings'); await p.waitForTimeout(400);
    ok(await p.$eval('[data-block="ui.set.stats"] .toggle', (e) => e.getAttribute('aria-pressed')) === 'true', lang + ': Settings: usage counts on');
    ok(await p.$eval('[data-block="ui.watchOn"] .toggle', (e) => e.getAttribute('aria-pressed')) === 'true' && await p.$('[data-block="ui.watchOn"] .spk'), lang + ': Settings: disease watch on, with its speaker');
    ok(await p.$('[data-block="ui.district"] [data-action="district"]'), lang + ': Settings: district can be chosen');
    await p.goto(BASE + 'index.html#/privacy'); await p.waitForTimeout(400);
    ok(await p.$eval('[data-block="ui.set.stats"] .toggle', (e) => e.getAttribute('aria-pressed')) === 'true', lang + ': Privacy: the switch is there and on');
    ok(await p.$('[data-block="ui.privacy.usage"] .spk') && !(await p.$('[data-block="ui.privacy.counts"]')), lang + ': Privacy: the new usage line with its speaker');
    ok(await p.$('[data-block="ui.privacy.watchOn"] .spk') && !(await p.$('[data-block="ui.privacy.watch"]')), lang + ': Privacy: the new disease-watch line with its speaker');
    ok(await p.$eval('main .top a.round', (e) => e.getAttribute('href')) === '#/settings' && await p.$('nav.nav'), lang + ': Privacy: back to Settings, with the tabs');
    await p.click('[data-block="ui.set.stats"] .toggle'); await p.waitForTimeout(300);
    ok((await ls(p, 'consent') || {}).ok === false, lang + ': Privacy: the switch turns counts off');
    await p.click('[data-block="ui.set.stats"] .toggle'); await p.waitForTimeout(300);
    ok((await ls(p, 'consent') || {}).ok === true, lang + ': ... and on again');

    // 2. the district question
    p = await open(ctx, T0 + 23 * H);
    ok(!(await asked(p)), lang + ': not asked at 23 hours');
    p = await open(ctx, T0 + DAYMS + 60e3, '#/emergency');
    ok(!(await asked(p)) && await ls(p, 'distAsk') === null, lang + ': never over the Emergency screen');
    p = await open(ctx, T0 + DAYMS + 120e3, '#/home');
    ok(await asked(p), lang + ': asked once 24 hours after the first open');
    ok((await p.$$('.dialog-wrap .places button')).length === SV.districts.length + 1, lang + ': the district buttons and Another province');
    ok(await p.$('.dialog-wrap .dq .spk') && await p.$('.dialog-wrap .btn.notnow'), lang + ': a speaker on the question and a big Not now');
    const nn = await p.$eval('.dialog-wrap .btn.notnow', (e) => { const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, t: e.textContent }; });
    ok(nn.h >= 56 && nn.w > 300, lang + ': Not now is big', nn);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), lang + ': no sideways scroll');
    await shot(p, `3-district-question-${lang}`);
    const t1 = T0 + DAYMS + 120e3;
    await p.click('.dialog-wrap .btn.notnow'); await p.waitForTimeout(300);
    ok(!(await p.$('.dialog-wrap')) && (await ls(p, 'distAsk')).n === 1 && await ls(p, 'district') === null, lang + ': Not now closes it, no district');
    p = await open(ctx, T0 + 2 * DAYMS);
    ok(!(await asked(p)), lang + ': not asked again the next day');
    p = await open(ctx, t1 + 7 * DAYMS - 60e3);
    ok(!(await asked(p)), lang + ': not asked again before 7 days');
    p = await open(ctx, t1 + 7 * DAYMS + 60e3, '#/house');
    ok(await asked(p), lang + ': asked once more 7 days after Not now');
    await p.click('.dialog-wrap [data-pick="__other"]'); await p.waitForTimeout(300);
    ok((await p.$$('.dialog-wrap .places button')).length === SV.provinces.length && await p.$('.dialog-wrap .btn.notnow'), lang + ': Another province lists the provinces, with Not now');
    await p.click('.dialog-wrap .btn.notnow'); await p.waitForTimeout(300);
    ok((await ls(p, 'distAsk')).n === 2, lang + ': second Not now counted');
    for (const d of [8, 30, 400]) { p = await open(ctx, t1 + d * DAYMS); ok(!(await asked(p)), `${lang}: never asked again (day ${d})`); }
    await ctx.close();
  }

  // 3. choosing a district ends it; Settings shows it
  {
    const ctx = await newCtx({ fn: () => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', '"en"'); localStorage.setItem('fhb.voice', '"f"'); } }, arg: null });
    let p = await open(ctx, T0);
    ok(!(await asked(p)), 'pick: not asked on the first open');
    p = await open(ctx, T0 + 25 * H, '#/feedback');
    ok(!(await asked(p)) && await ls(p, 'distAsk') === null, 'pick: never on a recording screen (Feedback)');
    p = await open(ctx, T0 + 25 * H, '#/family');
    ok(await asked(p), 'pick: asked after a day (Family tab)');
    await p.click(`.dialog-wrap [data-pick="${SV.districts[1].id}"]`); await p.waitForTimeout(300);
    ok(await ls(p, 'district') === SV.districts[1].id && !(await p.$('.dialog-wrap')), 'pick: the district is saved');
    p = await open(ctx, T0 + 10 * DAYMS);
    ok(!(await asked(p)), 'pick: never asked again');
    await p.goto(BASE + 'index.html#/settings'); await p.waitForTimeout(400);
    ok(await p.$eval('#mydistrict', (e) => e.textContent) === SV.districts[1].name.en, 'pick: Settings shows the district');
    await ctx.close();
  }

  // 4. counts switched off: not asked
  {
    const ctx = await newCtx({ fn: () => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', '"en"'); localStorage.setItem('fhb.voice', '"f"'); localStorage.setItem('fhb.consent', '{"ok":false,"v":"x","day":"2026-10-01"}'); } }, arg: null });
    await open(ctx, T0);
    const p = await open(ctx, T0 + 3 * DAYMS);
    ok(!(await asked(p)), 'counts off: the district question is not asked');
    await ctx.close();
  }

  // 5. a disease-watch report asks for the district there and then
  {
    const syn = SV.syndromes.find((s) => s.active !== false && s.topics.length);
    const ctx = await newCtx({ fn: () => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', '"en"'); localStorage.setItem('fhb.voice', '"f"'); } }, arg: null });
    const sent = []; // the report upload, answered here (it never reaches the real server)
    const rUrl = String(book.config.analyticsUrl).replace(/\/e\/?$/, '') + '/r';
    await ctx.route((u) => u.href === rUrl, (rt) => { sent.push(rt.request().postData()); rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    let p = await open(ctx, T0, '#/topic/' + syn.topics[0]);
    const yes = await p.$(`[data-rep="yes"][data-syn="${syn.id}"]`);
    ok(yes, 'watch: the report question shows on ' + syn.topics[0]);
    if (yes) {
      await yes.click(); await p.waitForTimeout(300);
      ok(await p.$('.dialog-wrap [data-say="ui.district"]'), 'watch: no district yet, so it is asked there and then');
      await p.click(`.dialog-wrap [data-pick="${SV.districts[0].id}"]`); await p.waitForTimeout(300);
      ok(await p.$('.dialog-wrap [data-say="ui.ageGroup"]'), 'watch: then the age group');
      await p.click(`.dialog-wrap [data-pick="${SV.ageGroups[0].id}"]`); await p.waitForTimeout(300);
      const rq = await ls(p, 'rq');
      ok(rq && rq.some((x) => x.k === 'r' && x.s === syn.id && x.d === SV.districts[0].id), 'watch: the report is queued with the district', rq);
      ok(await ls(p, 'district') === SV.districts[0].id, 'watch: the district is kept for next time');
      await p.waitForTimeout(1500);
      const body = sent.map((x) => JSON.parse(x)).find((b) => b.items.some((i) => i.k === 'r' && i.s === syn.id));
      ok(body && body.items.every((i) => !('lat' in i) && !('lon' in i) && !('gps' in i)) && !/lat|lon|gps|name/i.test(Object.keys(body.items.find((i) => i.k === 'r')).join(' ')), 'watch: the report is sent, with no GPS or names', sent);
      ok((await ls(p, 'rq') || []).length === 0, 'watch: nothing left in the queue once sent');
    }
    // a symptom search that matches an illness that spreads queues a search signal
    const sym = (syn.symptoms || []).find((id) => (book.symptoms || []).some((x) => x.id === id));
    ok(sym, 'watch: the illness has a picture in What is wrong?', syn.symptoms);
    if (sym) {
      p = await open(ctx, T0 + 60e3, '#/ask');
      await p.click(`[data-sym="${sym}"]`); await p.waitForTimeout(1500);
      const rq = await ls(p, 'rq') || [], q = sent.map((x) => JSON.parse(x));
      ok(rq.some((x) => x.k === 's' && x.s === syn.id) || q.some((b) => b.items.some((i) => i.k === 's' && i.s === syn.id)), 'watch: a matching symptom search sends a search signal', { rq, route: await p.evaluate(() => location.hash) });
    }
    // switched off in Settings: off, nothing queued, and still off at the next open
    await p.goto(BASE + 'index.html#/settings'); await p.waitForTimeout(400);
    await p.click('[data-block="ui.watchOn"] .toggle'); await p.waitForTimeout(300);
    ok(await ls(p, 'watch') === false && (await ls(p, 'rq') || []).length === 0, 'watch: the Settings switch turns it off');
    p = await open(ctx, T0 + 2 * DAYMS, '#/topic/' + syn.topics[0]);
    ok(await ls(p, 'watch') === false && !(await p.$('[data-rep="yes"]')), 'watch: switched off, it stays off at the next open, and no report question shows');
    await ctx.close();
  }

  // 6. phones from older versions
  {
    const ctx = await newCtx({ fn: () => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', '"ps"'); localStorage.setItem('fhb.consent', '{"ok":true,"v":"2026-10-07.1","day":"2026-10-07"}'); } }, arg: null });
    const p = await open(ctx, T0);
    ok(await p.$('.hbtn.em') && await ls(p, 'voice') === 'f', 'older phone: a language without a voice opens the Health tab with the woman\'s voice');
    ok(await ls(p, 'watch') === true, 'older phone: a yes to the old question keeps the disease watch on');
    await ctx.close();
  }
  // the app of the morning of 2026-10-08 stored watch=false wherever the old question had no Yes; the switch stored it too
  for (const [label, consent, watch, want] of [
    ['opt-in morning default, never chose', null, false, true],
    ['an older phone that never touched the switch', '{"ok":true,"v":"2026-10-07.1","day":"2026-10-07"}', null, true],
    ['a Yes to the old question, then the watch switched off', '{"ok":true,"v":"2026-10-07.1","day":"2026-10-07"}', false, false],
    ['counts switched off', '{"ok":false,"v":"2026-10-07.1","day":"2026-10-07"}', false, true],
  ]) {
    const ctx = await newCtx({ fn: ([c, w]) => { if (!localStorage.getItem('fhb.lang')) { localStorage.setItem('fhb.lang', '"fa"'); localStorage.setItem('fhb.voice', '"f"'); if (c) localStorage.setItem('fhb.consent', c); if (w !== null) localStorage.setItem('fhb.watch', JSON.stringify(w)); } }, arg: [consent, watch] });
    let p = await open(ctx, T0);
    ok(await ls(p, 'watch') === want && await ls(p, 'watchV') === 2, `older phone (${label}): disease watch ${want ? 'on' : 'off'}`, await ls(p, 'watch'));
    p = await open(ctx, T0 + H);
    ok(await ls(p, 'watch') === want, `older phone (${label}): the same at the next open`);
    if (consent && /false/.test(consent)) {
      await p.goto(BASE + 'index.html#/settings'); await p.waitForTimeout(400);
      ok(await p.$eval('[data-block="ui.watchOn"] .toggle', (e) => e.disabled && e.getAttribute('aria-pressed') === 'false'), `older phone (${label}): with counts off, the watch sends nothing (switch shown off)`);
    }
    await ctx.close();
  }

  ok(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close(); server.close();
  console.log(`first-run tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
