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
  // the Td card: every woman, and a girl recorded as a child from her 12th birthday (Mo, 12 Oct 2026)
  eq([D.tdFor({ pic: 'woman' }), D.tdFor({ pic: 'man' }), D.tdFor({ pic: 'child', sex: 'f', dob: '2014-10-12' }, '2026-10-12'), D.tdFor({ pic: 'child', sex: 'f', dob: '2014-10-13' }, '2026-10-12'), D.tdFor({ pic: 'child', sex: 'm', dob: '2010-01-01' }, '2026-10-12'), D.tdFor({ pic: 'child', sex: 'f' }, '2026-10-12')], [true, false, true, false, false, false], 'td: women, and girls of 12 or more');
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
// the family's own medicine times (#/family/times)
{
  eq(D.cleanTimes(null), D.TIMES, 'times: usual times when none are kept');
  eq(D.cleanTimes({ morning: '06:00', noon: '25:00', evening: 'x', night: '22:30', evil: 1 }), { morning: '06:00', noon: '12:00', evening: '18:00', night: '22:30' }, 'times: bad ones become the usual ones');
  eq(D.cleanTimes({ morning: '21:00', night: '02:00' }), D.TIMES, 'times: a time outside its part of the day is not kept');
  eq(D.moveTime(D.TIMES, 'morning', -1).morning, '06:00', 'times: one hour earlier');
  eq(D.moveTime(D.TIMES, 'night', 1).night, '22:00', 'times: one hour later');
  let t = D.TIMES; for (let i = 0; i < 30; i++) t = D.moveTime(t, 'morning', -1); eq(t.morning, '04:00', 'times: morning stops at 4');
  t = D.TIMES; for (let i = 0; i < 30; i++) t = D.moveTime(t, 'night', 1); eq(t.night, '23:00', 'times: bedtime stops at 23 (no dose after midnight)');
  ok(D.isUsualTimes(D.TIMES) && !D.isUsualTimes({ ...D.TIMES, noon: '13:00' }) && D.isUsualTimes(null), 'times: usual or not');
  eq([D.hour12('07:00'), D.hour12('12:00'), D.hour12('18:00'), D.hour12('00:00')], [7, 12, 6, 12], 'times: 12-hour clock');
  eq(D.timeIds('evening', '18:00'), ['ui.fam.t.evening', 'ui.num.6', 'ui.fam.oclock'], 'times: spoken as "evening, six o\'clock"');
  const my = { ...D.TIMES, morning: '05:00', night: '23:00' };
  const m = { id: 'd1', d: '2026-10-05', times: ['morning', 'night'] }, p = { id: 'p1', meds: [m] };
  eq(D.dueMeds([p], new Date(2026, 9, 7, 5, 30), my).map((x) => x.slot), ['morning'], 'times: due at the family\'s morning (05:00)');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 5, 30)).length, 0, 'times: not due at 05:30 with the usual 07:00');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 8, 1), my).length, 0, 'times: 3 hours after 05:00 it is over');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 22, 30), my).length, 0, 'times: bedtime 23:00 not due at 22:30');
  eq(D.dueMeds([p], new Date(2026, 9, 7, 23, 10), my).map((x) => x.slot), ['night'], 'times: bedtime due at 23:10');
}
// the doses the Android app is given (upcoming)
{
  const now = new Date(2026, 9, 7, 8, 0);
  const m = { id: 'd1', d: '2026-10-07', days: 2, times: ['morning', 'evening'] }, p = { id: 'p1', meds: [m] };
  let u = D.upcoming([p], now);
  eq(u.map((x) => x.key), ['2026-10-07|d1|morning', '2026-10-07|d1|evening', '2026-10-08|d1|morning', '2026-10-08|d1|evening'], 'upcoming: the dose due now, then the next ones, until the last day (2 days)');
  eq([u[0].d, u[0].day, u[0].hm, u[0].abs, u[0].at], [undefined, '2026-10-07', '07:00', false, new Date(2026, 9, 7, 7, 0).getTime()], 'upcoming: day, time of day, moment');
  D.markTaken(m, '2026-10-07', 'morning'); u = D.upcoming([p], now);
  eq(u[0].key, '2026-10-07|d1|evening', 'upcoming: a taken dose is not reminded');
  const m2 = { id: 'd2', d: '2026-10-07', times: ['noon'] }; u = D.upcoming([{ id: 'p', meds: [m2] }], new Date(2026, 9, 7, 15, 1));
  eq([u.length, u[0].day], [D.AHEAD_DAYS, '2026-10-08'], 'upcoming: a dose whose 3 hours are over is gone; 7 days ahead');
  D.snooze(m2, '2026-10-07', 'noon', new Date(2026, 9, 7, 12, 30).getTime());
  u = D.upcoming([{ id: 'p', meds: [m2] }], new Date(2026, 9, 7, 12, 31));
  eq([u[0].key, u[0].abs, u[0].at], ['2026-10-07|d2|noon|' + (new Date(2026, 9, 7, 12, 45).getTime()), true, new Date(2026, 9, 7, 12, 45).getTime()], 'upcoming: "Later" reminds again 15 minutes later, as a new reminder');
  const my = { ...D.TIMES, evening: '20:00' };
  eq(D.upcoming([p], now, my)[0].hm, '20:00', 'upcoming: the family\'s own times');
  eq(D.upcoming([{ id: 'x', meds: [{ id: 'o', d: '2026-10-01', times: ['noon'], on: false }, { id: 'f', d: '2026-10-09', times: ['noon'] }] }], now).map((x) => x.day)[0], '2026-10-09', 'upcoming: not a stopped medicine, not before the start day');
  eq(D.upcoming([{ id: 'x', meds: [{ id: 'a', d: '2026-10-01', times: D.SLOTS }] }], now, D.TIMES, 7, 10).length, 10, 'upcoming: at most max');
  ok(D.upcoming([p, { id: 'q', meds: [{ id: 'z', d: '2026-10-01', times: ['noon'] }] }], now).every((x, i, a) => !i || a[i - 1].at <= x.at), 'upcoming: earliest first');
}
// the phone's own clock and time zone: a phone that moves to another time zone or whose clock is changed
{
  const was = process.env.TZ;
  const at7 = (tz, day = '2026-10-12') => { process.env.TZ = tz; return D.slotTime(day, 'morning'); };
  eq(at7('Asia/Kabul'), Date.UTC(2026, 9, 12, 2, 30), 'time zone: 07:00 in Kabul (UTC+4:30)');
  eq(at7('Asia/Tehran'), Date.UTC(2026, 9, 12, 3, 30), 'time zone: 07:00 in Tehran (UTC+3:30)');
  eq(at7('Asia/Karachi'), Date.UTC(2026, 9, 12, 2, 0), 'time zone: 07:00 in Karachi (UTC+5)');
  eq(at7('America/New_York', '2026-03-08'), Date.UTC(2026, 2, 8, 11, 0), 'time zone: 07:00 on a clock-change day (summer time starts)');
  for (const tz of ['Asia/Kabul', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'America/New_York']) {
    process.env.TZ = tz;
    const m = { id: 'd', d: '2026-10-12', times: ['morning', 'night'] }, p = { id: 'p', meds: [m] };
    const early = new Date(2026, 9, 12, 0, 30); // half past midnight on the phone: still the same calendar day everywhere
    eq(D.localDay(early), '2026-10-12', `time zone ${tz}: the day is the phone's own day`);
    const u = D.upcoming([p], early);
    eq([u[0].key, new Date(u[0].at).getHours(), new Date(u[0].at).getMinutes(), u[1].key], ['2026-10-12|d|morning', 7, 0, '2026-10-12|d|night'], `time zone ${tz}: 07:00 on the phone's clock`);
    eq(D.dueMeds([p], new Date(2026, 9, 12, 7, 5)).map((x) => x.slot), ['morning'], `time zone ${tz}: due at 07:05 on the phone's clock`);
  }
  // the clock is put forward past a dose time (or the phone was off): the dose is due, and stays due for 3 hours
  process.env.TZ = 'Asia/Kabul';
  const m = { id: 'd', d: '2026-10-12', times: ['noon'] }, p = { id: 'p', meds: [m] };
  eq(D.dueMeds([p], new Date(2026, 9, 12, 11, 0)).length, 0, 'clock: 11:00, nothing due');
  eq(D.dueMeds([p], new Date(2026, 9, 12, 13, 30)).length, 1, 'clock put forward to 13:30: noon is due');
  eq(D.upcoming([p], new Date(2026, 9, 12, 13, 30))[0].key, '2026-10-12|d|noon', 'clock put forward: the phone is told the dose due now');
  // the family's code makes no dose time from UTC: only the date sums (addDays, dayDiff) use a UTC noon on purpose
  const src = readFileSync(ROOT + 'js/family-data.js', 'utf8') + readFileSync(ROOT + 'js/family.js', 'utf8');
  eq([...src.matchAll(/getUTC\w+|setUTC\w+|Date\.UTC|toUTCString/g)].map((x) => x[0]), [], 'no UTC clock reading in the family code');
  if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
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
  // the family voice notes (no one person's) travel in the same file
  const notes = [{ id: 'g1', d: '2026-10-08', t: 5, rec: 'a9abc' }];
  eq(D.noteMediaIds(notes), ['a9abc'], 'family voice notes: media ids');
  const nb = D.readBundle(JSON.parse(JSON.stringify(D.makeBundle(people, [], new Date(0), notes))));
  eq(nb.notes, notes, 'family voice notes: bundle round trip');
  eq(D.readBundle(JSON.parse(JSON.stringify(b))).notes, [], 'family voice notes: none in the file');
  eq(D.readBundle({ app: 'sehat', kind: 'family', people: [] }).notes, [], 'family voice notes: a file from an older app');
  eq(D.cleanNotes([{ id: 'g1', d: '2026-10-08', rec: 'a9abc', evil: 1 }, { id: 'g1', d: '2026-10-08', rec: 'a9abc' }, { id: '../x', d: '2026-10-08', rec: 'a9abc' }, { id: 'g2', d: 'bad', rec: 'a9abc' }, { id: 'g3', d: '2026-10-08', rec: '../../x' }, null, 'x']),
    [{ id: 'g1', d: '2026-10-08', t: 0, rec: 'a9abc' }], 'family voice notes: bad rows and fields dropped');
  eq(D.cleanNotes('nope'), [], 'family voice notes: not a list');
  // the family's medicine times travel in the same file (only when they are not the usual ones)
  const my = { ...D.TIMES, morning: '06:00' };
  eq(D.readBundle(JSON.parse(JSON.stringify(D.makeBundle(people, [], new Date(0), [], my)))).times, my, 'times: bundle round trip');
  ok(!('times' in D.makeBundle(people, [], new Date(0), [], D.TIMES)), 'times: the usual times are not written');
  eq(D.readBundle(JSON.parse(JSON.stringify(b))).times, null, 'times: none in an older file');
  eq(D.readBundle({ app: 'sehat', kind: 'family', people: [], times: { morning: '23:00', noon: 5 } }).times, D.TIMES, 'times: bad times in a file are not kept');
  const mn = D.mergeNotes([{ id: 'g1' }], [{ id: 'g1' }, { id: 'g2' }]);
  eq([mn.added, mn.list.map((x) => x.id)], [1, ['g1', 'g2']], 'family voice notes: merge adds the new ones only');
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
  for (const s of D.SLOTS) for (let h = D.SLOT_HOURS[s][0]; h <= D.SLOT_HOURS[s][1]; h++) D.timeIds(s, String(h).padStart(2, '0') + ':00').forEach((x) => ids.add(x));
  for (const t of D.TD) ids.add('ui.fam.' + t);
  for (const a of ['whatsapp', 'telegram', 'imo', 'messenger']) ids.add('ui.fam.x.' + a);
  for (const l of ['vthin', 'thin', 'ok', 'heavy', 'vheavy']) ids.add('ui.fam.bmi.' + l);
  eq([...ids].filter((k) => !book.narration[k]), [], 'narration ids exist');
  for (const id of ids) { const n = book.narration[id]; if (n) ok(n.fa && n.ps && n.en, id + ' has fa, ps, en'); }
  // Mo: the "This book does not replace a doctor" box stays on the Health pages, not on the Family screens (nor on the
  // growth charts, which open from a child's record)
  for (const f of ['js/family.js', 'js/growth.js']) ok(!/disclaimer/.test(readFileSync(ROOT + f, 'utf8')), f + ': no "does not replace a doctor" box');
  // old phones: no ?? or ?. in the family code
  for (const f of ['js/family.js', 'js/family-data.js']) ok(!/\?\?|\?\.(?![0-9])/.test(readFileSync(ROOT + f, 'utf8').replace(/'[^'\n]*'|`[^`]*`|\/\/[^\n]*/g, '')), f + ': no ?? or ?. (old Android WebView)');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
