// Tests for the family records data rules (js/family-data.js), the zip reader (js/zip.js) and the strings the family
// screens use. Run: node tools/test_family.mjs
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import * as D from '../js/family-data.js';
import { makeZip, readZip } from '../js/zip.js';

const ROOT = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const book = JSON.parse(readFileSync(ROOT + 'content/book.json', 'utf8'));

// migration of the old child records
{
  const old = [{ id: 'k1', name: 'Ali', sex: 'm', dob: '2026-06-01', given: { 'vaccines.birth': '2026-06-01' }, weights: [{ d: '2026-07-01', kg: 5 }] }, { id: 'k2', name: 'Zahra', sex: 'f', dob: '2021-01-01' }, null, { name: 'no id' }];
  const { list, changed } = D.migrate(old, '2026-10-07');
  ok(changed, 'migrate: changed');
  eq(list.length, 2, 'migrate: drops broken rows');
  eq([list[0].pic, list[1].pic], ['baby', 'child'], 'migrate: baby under 1 year, else child');
  eq(list[0].weights, [{ d: '2026-07-01', kg: 5 }], 'migrate: keeps weights');
  eq(list[0].given['vaccines.birth'], '2026-06-01', 'migrate: keeps vaccines');
  ok(Array.isArray(list[1].meds) && Array.isArray(list[1].notes) && Array.isArray(list[1].readings) && list[1].td && list[1].weights, 'migrate: new fields');
  eq(list.map((p) => p.v), [2, 2], 'migrate: version');
  const again = D.migrate(list, '2026-10-07'); ok(!again.changed, 'migrate: second run changes nothing');
  const w = D.migrate([{ id: 'w', v: 2, pic: 'woman', sex: 'm', name: '' }]).list[0]; eq(w.sex, 'f', 'migrate: woman is f');
  ok(D.isAdult(w) && !D.isChild(w) && D.isChild(list[0]), 'isAdult / isChild');
}
// women's tetanus vaccine
{
  eq(D.tdPlan({}), { n: 0, next: 0, from: null }, 'td: none given');
  eq(D.tdPlan({ td1: '2026-01-01' }), { n: 1, next: 1, from: '2026-01-29' }, 'td: dose 2 four weeks later');
  eq(D.tdPlan({ td1: '2026-01-01', td2: '2026-02-01' }).from, '2026-08-03', 'td: dose 3 six months later');
  eq(D.tdPlan({ td1: 'a', td2: 'b', td3: '2026-01-01' }).from, '2027-01-01', 'td: dose 4 one year later');
  eq(D.tdPlan({ td1: 'a', td2: 'b', td3: 'c', td4: 'd', td5: 'e' }), { n: 5, next: -1, from: null }, 'td: all given');
  eq(D.tdPlan({ td1: '2026-01-01', td3: '2026-03-01' }).next, 1, 'td: a gap means dose 2 is next');
}
// adults: weight for height
{
  eq(D.bmi(60, 165), 22, 'bmi 60 kg 165 cm'); eq(D.bmi(60, null), null, 'bmi needs height');
  eq([15.9, 16, 18.4, 18.5, 24.9, 25, 29.9, 30].map(D.bmiLevel), ['vthin', 'thin', 'thin', 'ok', 'ok', 'heavy', 'heavy', 'vheavy'], 'bmi levels');
  const p = { hcm: 160, weights: [{ d: '2026-04-01', kg: 60 }, { d: '2026-09-20', kg: 56 }] };
  const a = D.adultAdvice(p); eq(a.lv, 'ok', 'advice: level'); ok(a.loss && a.say.includes('ui.fam.w.loss'), 'advice: 6.7% loss in 5.7 months');
  const b = D.adultAdvice({ hcm: 160, weights: [{ d: '2026-09-01', kg: 60 }, { d: '2026-09-20', kg: 56 }] }); ok(!b.loss, 'advice: loss within 4 weeks is not counted');
  const c = D.adultAdvice({ hcm: 160, preg: true, weights: [{ d: '2026-09-20', kg: 80 }] }); eq(c.say, ['ui.fam.bmi.preg'], 'advice: pregnancy');
  eq(D.adultAdvice({ weights: [] }), null, 'advice: no weight');
  eq(D.adultAdvice({ weights: [{ d: '2026-09-20', kg: 70 }] }).say, [], 'advice: no height, no loss');
}
// numbers read aloud
{
  eq(D.numIds(0), ['ui.num.0'], 'num 0');
  eq(D.numIds(7, 'kg'), ['ui.num.7', 'ui.num.kg'], 'num 7 kg');
  eq(D.numIds(72.5, 'kg'), ['ui.num.72', 'ui.num.point', 'ui.num.5', 'ui.num.kg'], 'num 72.5');
  eq(D.numIds(100), ['ui.num.100'], 'num 100'); eq(D.numIds(120), ['ui.num.100and', 'ui.num.20'], 'num 120');
  eq(D.numIds(305.5, 'cm'), ['ui.num.300and', 'ui.num.5', 'ui.num.point', 'ui.num.5', 'ui.num.cm'], 'num 305.5');
  eq(D.numIds(7.25), ['ui.num.7', 'ui.num.point', 'ui.num.3'], 'num rounds to one decimal');
  eq(D.numIds(1000), [], 'num too big'); eq(D.numIds(-1), [], 'num negative');
  let missing = [];
  for (let x = 0; x < 1000; x += 0.5) for (const id of D.numIds(x, 'kg')) if (!book.narration[id]) missing.push(id);
  for (const u of ['cm', 'days', 'mb', 'kb']) if (!book.narration['ui.num.' + u]) missing.push(u);
  eq([...new Set(missing)], [], 'every number id 0 to 999.5 has a narration line');
  eq(D.sizeOf(3 * 1048576).ids, ['ui.num.3', 'ui.num.mb'], 'size 3 MB'); eq(D.sizeOf(20480).unit, 'kb', 'size 20 KB');
  const pa = book.narration['ui.num.75'], pb = book.narration['ui.num.21'];
  eq([pa.fa, pa.ps, pa.en], ['هفتاد و پنج', 'پنځه اویا', 'seventy-five'], 'number words 75'); eq(pb.ps, 'یوویشت', 'Pashto 21');
}
// medicines and reminders
{
  const now = new Date(2026, 9, 7, 8, 0); // 08:00 local
  const m = { id: 'd1', d: '2026-10-05', times: ['morning', 'evening'], on: true };
  const p = { id: 'p1', meds: [m] };
  eq(D.dueMeds([p], now).map((x) => x.slot), ['morning'], 'due: morning at 08:00');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 6, 59)).length, 0, 'due: not before the time');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 10, 1)).length, 0, 'due: not 3 hours after');
  D.markTaken(m, '2026-10-07', 'morning'); eq(D.dueMeds([p], now).length, 0, 'due: taken');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 18, 30)).map((x) => x.slot), ['evening'], 'due: evening');
  D.snooze(m, '2026-10-07', 'evening', new Date(2026, 9, 7, 18, 30).getTime());
  eq(D.dueMeds([p], new Date(2026, 9, 7, 18, 40)).length, 0, 'due: snoozed'); eq(D.dueMeds([p], new Date(2026, 9, 7, 18, 46)).length, 1, 'due: after 15 minutes');
  const m2 = { id: 'd2', d: '2026-10-01', days: 5, times: ['noon'] };
  ok(!D.medActive(m2, '2026-10-06') && D.medActive(m2, '2026-10-05'), 'medicine for 5 days'); eq(D.daysLeft(m2, '2026-10-03'), 3, 'days left');
  eq(D.dueMeds([{ id: 'x', meds: [{ id: 'f', d: '2026-10-08', times: ['morning'] }] }], now).length, 0, 'due: not before the start day');
  eq(D.dueMeds([{ id: 'x', meds: [{ id: 'o', d: '2026-10-01', times: ['morning'], on: false }] }], now).length, 0, 'due: stopped');
}
// copying to another phone
{
  const people = D.migrate([{ id: 'k1', v: 2, pic: 'child', sex: 'f', name: 'Zahra', nameRec: 'a1abc', dob: '2024-01-01', meds: [{ id: 'm', rec: 'a2abc', photo: 'p3abc' }], notes: [{ id: 'n', rec: 'a4abc' }], u: 5 }]).list;
  eq(D.mediaIds(people[0]), ['a1abc', 'a2abc', 'p3abc', 'a4abc'], 'media ids');
  const b = D.makeBundle(people, [{ id: 'a1abc', type: 'audio/webm' }], new Date(0));
  const back = D.readBundle(JSON.parse(JSON.stringify(b)));
  eq(back.people[0].name, 'Zahra', 'bundle round trip'); eq(back.media, [{ id: 'a1abc', type: 'audio/webm' }], 'bundle media');
  eq(D.readBundle({ app: 'other', kind: 'family', people: [] }), null, 'bundle: wrong app');
  const bad = D.readBundle({ app: 'sehat', kind: 'family', people: [{ id: '../x' }, { id: 'ok', evil: 1, name: 'x'.repeat(99), dob: 'bad' }], media: [{ id: '../../x', type: 'audio/webm' }, { id: 'abcd1', type: 'text/html' }] });
  eq([bad.people.length, bad.people[0].id, bad.people[0].name.length, 'evil' in bad.people[0], 'dob' in bad.people[0], bad.people[0].pic, bad.media.length], [1, 'ok', 40, false, false, 'child', 0], 'bundle: cleans bad rows and fields');
  const mine = [{ id: 'a', u: 10, name: 'mine' }, { id: 'b', u: 10, name: 'old' }];
  const r = D.mergePeople(mine, [{ id: 'a', u: 5, name: 'older copy' }, { id: 'b', u: 20, name: 'newer' }, { id: 'c', u: 1, name: 'new' }]);
  eq([r.added, r.updated, r.list.map((x) => x.name)], [1, 1, ['mine', 'newer', 'new']], 'merge: newer wins, nothing deleted');
}
// zip: write and read back; a deflated file
{
  const enc = new TextEncoder();
  const z = makeZip([{ name: 'sehat-family.json', data: enc.encode('{"a":1}') }, { name: 'media/a1', data: new Uint8Array([1, 2, 3, 250]) }]);
  const files = await readZip(new Uint8Array(await z.arrayBuffer()));
  eq(files.map((f) => f.name), ['sehat-family.json', 'media/a1'], 'zip names'); eq([...files[1].data], [1, 2, 3, 250], 'zip data');
  eq(await readZip(new Uint8Array([1, 2, 3])), null, 'zip: not a zip');
  // a deflated entry, as a phone's own zip tool would make
  const data = enc.encode('hello hello hello hello'), comp = deflateRawSync(data), name = enc.encode('x.txt');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
  const cd = Buffer.concat([ch, name]), body = Buffer.concat([lh, name, comp]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(body.length, 16);
  const got = await readZip(new Uint8Array(Buffer.concat([body, cd, end])));
  eq(got && new TextDecoder().decode(got[0].data), 'hello hello hello hello', 'zip: deflated entry');
}
// every string the family screens use is in the book
{
  const src = ['js/family.js', 'js/numpad.js'].map((f) => readFileSync(ROOT + f, 'utf8')).join('\n');
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9]+)'/g)].map((m) => m[1]));
  for (const k of ['picBaby', 'picChild', 'picWoman', 'picMan', 'tMorning', 'tNoon', 'tEvening', 'tNight', 'appWhatsApp', 'appTelegram', 'appImo', 'appMessenger', 'kg', 'cm', 'daysWord', 'lvUrgent', 'lvOk']) keys.add(k);
  eq([...keys].filter((k) => !book.ui[k]), [], 'ui text keys exist');
  const ids = new Set([...src.matchAll(/'(ui\.fam\.[a-z0-9.-]+)'/g)].map((m) => m[1]).filter((x) => !x.endsWith('.')));
  for (const p of D.PICS) ids.add('ui.fam.pic.' + p);
  for (const t of Object.keys(D.TIMES)) ids.add('ui.fam.t.' + t);
  for (const t of D.TD) ids.add('ui.fam.' + t);
  for (const a of ['whatsapp', 'telegram', 'imo', 'messenger']) ids.add('ui.fam.x.' + a);
  for (const l of ['vthin', 'thin', 'ok', 'heavy', 'vheavy']) ids.add('ui.fam.bmi.' + l);
  eq([...ids].filter((k) => !book.narration[k]), [], 'narration ids exist');
  for (const id of ids) { const n = book.narration[id]; if (n) ok(n.fa && n.ps && n.en, id + ' has fa, ps, en'); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
