// Unit tests for the growth tracker arithmetic (js/growth-calc.js), the WHO tables (content/who-growth.json),
// the QR maker (js/qr.js) and the narration the results read out. No packages needed: node tools/test_growth.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = await import(path.join(ROOT, 'js/growth-calc.js'));
const { qrMatrix } = await import(path.join(ROOT, 'js/qr.js'));
const who = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/who-growth.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) pass++; else { fail++; console.log('FAIL', label, extra !== undefined ? JSON.stringify(extra) : ''); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------- 1. the compact tables give the WHO values (rows copied from the WHO anthro tables) ---------- */
const REF = [["wfa","m",1326,-0.0977,15.6101,0.12508],["wfa","m",617,0.0071,11.4011,0.11224],["wfa","m",1617,-0.1298,17.2,0.13077],["wfa","f",839,-0.3047,12.2173,0.12491],["wfa","m",197,0.1197,8.112,0.10925],["wfa","m",296,0.0846,9.0943,0.10887],["wfa","f",0,0.3809,3.2322,0.14171],["wfa","f",3,0.2986,3.2315,0.14657],["wfa","f",10,0.2497,3.4314,0.14498],["lhfa","f",1536,1,104.1703,0.04226],["lhfa","f",367,1,74.0852,0.0348],["lhfa","m",385,1,76.5124,0.03148],["lhfa","m",1497,1,103.9909,0.04075],["lhfa","f",560,1,81.1134,0.03607],["lhfa","m",237,1,70.2994,0.03126],["lhfa","m",730,1,87.8018,0.03479],["lhfa","m",731,1,87.1303,0.03508],["wfl","f",83.8,-0.3833,10.9289,0.08904],["wfl","m",88.9,-0.3521,12.4574,0.0806],["wfl","m",52.6,-0.3521,3.9059,0.08735],["wfl","m",62.6,-0.3521,6.678,0.08264],["wfl","f",68.7,-0.3833,7.893,0.09083],["wfl","f",65.5,-0.3833,7.195,0.09115],["wfh","m",79.3,-0.3521,10.4475,0.08308],["wfh","m",114.2,-0.3521,20.0757,0.09066],["wfh","m",83.5,-0.3521,11.3114,0.08209],["wfh","f",96.8,-0.3833,14.3537,0.0901],["wfh","m",77.1,-0.3521,10.0459,0.08318],["wfh","m",90.3,-0.3521,12.9569,0.0803]];
for (const [ind, sex, x, L, M, S] of REF) {
  const p = G.lms(who[ind][sex], x), ref = { L, M, S };
  ok(p && near(p.M, M, M * 6e-4) && near(p.S, S, 3e-4) && near(p.L, L, 3e-3), `${ind} ${sex} at ${x}: LMS`, { p, ref });
  for (const z of [-3, -2, 2, 3]) ok(p && near(G.zLMS(G.yLMS(z, ref), p), z, 0.01), `${ind} ${sex} at ${x}: z ${z}`);
}
ok(G.lms(who.wfl.m, 44.9) === null && G.lms(who.wfl.m, 110.1) === null && G.lms(who.wfh.f, 64.9) === null, 'outside the length tables: null');
ok(G.lms(who.wfa.m, 1827) === null && G.lms(who.wfa.m, -1) === null, 'outside 0 to 5 years: null');
ok(near(G.lms(who.lhfa.m, 730).M - G.lms(who.lhfa.m, 731).M, 0.6715, 0.01), 'length->height step at 2 years is kept, not smoothed');
ok(/WHO/.test(who._source) && /anthro/.test(who._source), 'the file names its source');

/* ---------- 2. z-scores ---------- */
const p12 = G.lms(who.wfa.m, 365);
ok(near(G.zWeight(G.yLMS(3, p12), p12), 3, 1e-9) && near(G.zWeight(G.yLMS(-3, p12), p12), -3, 1e-9), 'restricted z meets the LMS z at +-3');
const sd23 = G.yLMS(3, p12) - G.yLMS(2, p12);
ok(near(G.zWeight(G.yLMS(3, p12) + sd23, p12), 4, 1e-9), 'beyond +3 SD: steps of the 2-to-3 SD distance');
ok(near(G.zWeight(G.yLMS(-3, p12) - (G.yLMS(-2, p12) - G.yLMS(-3, p12)), p12), -4, 1e-9), 'beyond -3 SD likewise');
ok(G.ageDays('2025-01-01', '2026-01-01') === 365 && G.ageDays('2026-03-01', '2026-02-28') === -1, 'age in days');
ok(G.lengthFor(400, 75, 'standing').v === 75.7 && G.lengthFor(400, 75, 'lying').v === 75, 'standing under 2 years: +0.7 cm');
ok(near(G.lengthFor(800, 88, 'lying').v, 87.3, 1e-9) && G.lengthFor(800, 88, 'standing').adj === 0, 'lying from 2 years: -0.7 cm');
ok(G.lengthFor(400, 75, undefined).adj === 0 && G.lengthFor(400, null, 'lying') === null, 'no position given: no adjustment; no length: null');

/* ---------- 3. the plain-words result ---------- */
const day = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const girl = { sex: 'f', dob: '2025-06-01' }, d1 = day(girl.dob, 365);
const lenM = G.lms(who.lhfa.f, 365).M; // a median-length girl of 1 year
const wAt = (z, len = lenM, table = 'wfl') => Math.round(G.yLMS(z, G.lms(who[table].f, Math.round(len * 10) / 10)) * 100) / 100;
const A = (e, list) => G.assess(who, girl, e, list || [e]);
let r = A({ d: d1, kg: wAt(0), cm: lenM, pos: 'lying' });
ok(r.lv === 'ok' && r.keys[0] === 'ok' && r.say[0] === 'ui.gr.r.ok' && !r.hosp, 'median girl: growing well', r);
r = A({ d: d1, kg: wAt(-3.4), cm: lenM, pos: 'lying' });
ok(r.lv === 'today' && r.keys[0] === 'thin3' && r.hosp && r.say.includes('growth.urgent') && r.say.includes('growth.home-care'), 'very thin: clinic today, hospital signs read out', r);
ok(!r.keys.includes('light2') && !r.keys.includes('light3'), 'very thin is not repeated as light for age');
r = A({ d: d1, kg: wAt(-2.5), cm: lenM, pos: 'lying' });
ok(r.lv === 'soon' && r.keys[0] === 'thin2', 'a little thin: clinic this week', r);
r = A({ d: d1, kg: wAt(0), cm: lenM, pos: 'lying', muac: 'r' });
ok(r.lv === 'today' && r.keys[0] === 'muacRed' && r.say.includes('growth.urgent.feet'), 'red arm tape: clinic today', r);
r = A({ d: d1, kg: wAt(-3.4), cm: lenM, pos: 'lying', muac: 'r' });
ok(r.keys.filter((k) => k === 'thin3' || k === 'muacRed').length === 1, 'red tape and very thin say it once', r);
r = A({ d: d1, kg: wAt(0), cm: lenM, muac: 'y' });
ok(r.lv === 'soon' && r.keys[0] === 'muacYellow', 'yellow arm tape: clinic this week', r);
r = G.assess(who, girl, { d: day(girl.dob, 120), kg: G.yLMS(0, G.lms(who.wfa.f, 120)), muac: 'r' }, null);
ok(!r.keys.includes('muacRed'), 'arm tape ignored under 6 months', r);
const wfa = (z, a = 365) => Math.round(G.yLMS(z, G.lms(who.wfa.f, a)) * 100) / 100;
r = A({ d: d1, kg: wfa(-2.5) });
ok(r.lv === 'soon' && r.keys[0] === 'light2' && r.tips.includes('ui.gr.nolength'), 'a little light for age (weight only): clinic this week, asks for the length', r);
r = A({ d: d1, kg: wfa(-3.5) });
ok(r.keys[0] === 'light3', 'very light for age', r);
r = A({ d: d1, kg: wAt(0), cm: Math.round(G.yLMS(-3.5, G.lms(who.lhfa.f, 365)) * 10) / 10, pos: 'lying' });
ok(r.keys.includes('short3') && r.lv !== 'today', 'very short for age: this month', r);
r = A({ d: d1, kg: wAt(2.5), cm: lenM, pos: 'lying' });
ok(r.lv === 'month' && r.keys[0] === 'heavy2', 'a little heavy for length: this month', r);
r = A({ d: d1, kg: wAt(3.5), cm: lenM, pos: 'lying' });
ok(r.keys[0] === 'heavy3', 'very heavy for length', r);
r = A({ d: d1, kg: 30, cm: lenM, pos: 'lying' });
ok(r.keys[0] === 'check' && r.say[0] === 'ui.gr.r.check', 'impossible weight: measure again', r);
r = A({ d: day(girl.dob, -3), kg: 3 });
ok(r.lv === 'check' && r.say[0] === 'ui.gr.baddate', 'date before birth', r);
r = A({ d: day(girl.dob, 2000), kg: 20, cm: 110, pos: 'standing' });
ok(r.lv === 'ok' && r.tips.includes('ui.gr.over5') && r.z.wfa === null, 'over 5 years: no z-scores, a note', r);
r = A({ d: d1, kg: wAt(0, lenM + 0.7), cm: lenM, pos: 'standing' });
ok(r.tips.includes('ui.gr.adj-standing') && near(r.z.len, lenM + 0.7, 1e-9), 'measured standing under 2: +0.7 and a note', r);
// weight going down or not up between visits
const v0 = { d: day(girl.dob, 300), kg: 8.0 };
r = A({ d: day(girl.dob, 321), kg: 7.8 }, [v0]);
ok(r.keys.includes('falling') && r.lv === 'soon' && r.say.includes('ui.gr.why.falter'), 'weight down since 3 weeks ago: clinic this week', r);
r = A({ d: day(girl.dob, 305), kg: 7.8 }, [v0]);
ok(!r.keys.includes('falling'), 'a visit only 5 days before is not compared', r);
r = A({ d: day(girl.dob, 330), kg: 8.05 }, [v0]);
ok(r.keys.includes('flat'), 'not up by 0.1 kg in 30 days at 10 months: not going up', r);
r = A({ d: day(girl.dob, 320), kg: 8.05 }, [v0]);
ok(!r.keys.includes('flat'), '20 days at 10 months: too soon to say', r);
r = G.assess(who, girl, { d: day(girl.dob, 90), kg: 5.0 }, [{ d: day(girl.dob, 75), kg: 5.0 }, { d: day(girl.dob, 90), kg: 5.0 }]);
ok(r.keys.includes('flat'), 'under 6 months: 2 weeks without gain is enough', r);
const boy = { sex: 'm', dob: '2023-01-01' };
r = G.assess(who, boy, { d: '2025-03-02', kg: 12.6 }, [{ d: '2025-01-31', kg: 12.6 }]);
ok(!r.keys.includes('flat'), '2-year-old: one month without gain is not flagged', r);
r = G.assess(who, boy, { d: '2025-04-02', kg: 12.6 }, [{ d: '2025-01-31', kg: 12.6 }]);
ok(r.keys.includes('flat'), '2-year-old: two months without gain is flagged', r);
r = A({ d: day(girl.dob, 330), kg: 8.4 }, [v0]);
ok(!r.keys.includes('flat') && !r.keys.includes('falling'), 'gaining: no warning', r);
// worst first, at most three findings
r = A({ d: d1, kg: wAt(-2.5), cm: Math.round(G.yLMS(-2.5, G.lms(who.lhfa.f, 365)) * 10) / 10, pos: 'lying', muac: 'r' }, [{ d: day(girl.dob, 330), kg: 9.5 }]);
ok(r.keys.length <= 3 && r.keys[0] === 'muacRed' && G.RANK[G.FINDINGS[r.keys[r.keys.length - 1]].lv] <= G.RANK[G.FINDINGS[r.keys[0]].lv], 'worst first, at most three', r);

/* ---------- 4. every line the results read out exists in all three languages ---------- */
const book = fs.existsSync(path.join(ROOT, 'content/book.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'content/book.json'), 'utf8')) : null;
if (book) {
  const ids = new Set(['ui.gr.over5', 'ui.gr.nolength', 'ui.gr.adj-standing', 'ui.gr.adj-lying', 'ui.gr.baddate', 'growth.urgent', 'growth.urgent.feet', 'growth.urgent.thin', 'growth.urgent.eat']);
  for (const f of Object.values(G.FINDINGS)) f.say.forEach((i) => ids.add(i));
  for (const i of ids) ok(book.narration[i] && ['fa', 'ps', 'en'].every((lg) => book.narration[i][lg]), 'narration ' + i);
  const js = fs.readFileSync(path.join(ROOT, 'js/growth.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/share.js'), 'utf8');
  for (const m of js.matchAll(/'(ui\.(?:gr|sh)\.[a-z0-9.-]*[a-z0-9]|ui\.growth|ui\.share-(?:app|web))'/g)) ok(book.narration[m[1]], 'narration used in js: ' + m[1]);
  for (const a of ['whatsapp', 'telegram', 'imo', 'messenger', 'nearby', 'other', 'link', 'copy', 'apk']) ok(book.narration['ui.sh.b.' + a], 'speaker line for the button ' + a);
  for (const m of js.matchAll(/\bT\('([A-Za-z]+)'/g)) ok(book.ui[m[1]], 'ui text used in js: ' + m[1]);
  ok(book.ui.growth && book.narration['ui.growth'] && book.ui.shareApp && book.ui.shareAppSub && book.ui.shareWebSub && book.narration['ui.share-app'] && book.narration['ui.share-web'], 'keys the home card and quick tools look for');
} else console.log('(content/book.json missing: run tools/build.py for the narration checks)');

/* ---------- 5. QR codes: right size, finder patterns, readable format information ---------- */
for (const [text, ver] of [['https://mokingsacc.github.io/Sehat/', 3], ['A', 1], ['x'.repeat(100), 6], ['y'.repeat(213), 10]]) {
  const M = qrMatrix(text), n = 17 + 4 * ver;
  ok(M && M.length === n, `QR "${text.slice(0, 12)}…" is version ${ver}`, M && M.length);
  const finder = (x0, y0) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); if (M[y0 + y][x0 + x] !== (d !== 2)) return false; } return true; };
  ok(finder(0, 0) && finder(n - 7, 0) && finder(0, n - 7), 'three finder patterns');
  let bits = 0; for (let i = 0; i <= 5; i++) bits |= (M[i][8] ? 1 : 0) << i;
  bits |= (M[7][8] ? 1 : 0) << 6; bits |= (M[8][8] ? 1 : 0) << 7; bits |= (M[8][7] ? 1 : 0) << 8; for (let i = 9; i < 15; i++) bits |= (M[8][14 - i] ? 1 : 0) << i;
  const raw = bits ^ 0x5412, data = raw >>> 10; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  ok((((data << 10) | rem) === raw) && (data >>> 3) === 0, 'format information: valid, level M', raw.toString(2));
  let bits2 = 0; for (let i = 0; i < 8; i++) bits2 |= (M[8][n - 1 - i] ? 1 : 0) << i; for (let i = 8; i < 15; i++) bits2 |= (M[n - 15 + i][8] ? 1 : 0) << i;
  ok(bits2 === bits && M[n - 8][8] === true, 'second copy of the format information, dark module');
}
ok(qrMatrix('z'.repeat(214)) === null, 'too long for version 10: no code');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
