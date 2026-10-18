// The virtual school day on the phone (app/js/day.js, P19): today's blocks, where the day is now, the next bell,
// which lesson fills each period, the clock in her digits, the Android app's alarm plan, the learner's switches,
// and the bells' sound files.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const day = await import('../js/day.js');
const i18n = await import('../js/i18n.js');
const modules = await import('../js/modules.js');

// what the hub serves for s1 from the default template (hub/tutor_hub/timetable.py)
const S1 = {
  days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'], holidays: ['2027-03-21'],
  ramadan: { from: '2027-02-08', to: '2027-03-09', start: '09:30', period_min: 30 }, start: '08:00',
  blocks: [{ kind: 'opening', min: 5 }, { kind: 'period', subject: 'auto', min: 40 },
    { kind: 'period', subject: 'auto', min: 40 }, { kind: 'break', min: 15 }, { kind: 'period', subject: 'auto', min: 40 },
    { kind: 'period', subject: 'auto', min: 40 }, { kind: 'sheet', min: 30 }, { kind: 'close', min: 5 }],
};
const SAT = new Date(2027, 0, 2);            // a Saturday
const FRI = new Date(2027, 0, 8);
const HOLIDAY = new Date(2027, 2, 21);
const RAMADAN = new Date(2027, 1, 10);       // a Wednesday in Ramadan
const hm = (h, m = 0) => h * 60 + m;

beforeEach(() => { store.clear(); modules.reset(); i18n.setLang('en'); });

test('a school day has its blocks in order, numbered periods and the start time', () => {
  const d = day.dayOf(S1, SAT);
  assert.equal(d.school, true);
  assert.deepEqual(d.blocks.map((b) => [b.kind, b.start, b.end, b.n]), [
    ['opening', hm(8), hm(8, 5), 0], ['period', hm(8, 5), hm(8, 45), 1], ['period', hm(8, 45), hm(9, 25), 2],
    ['break', hm(9, 25), hm(9, 40), 0], ['period', hm(9, 40), hm(10, 20), 3], ['period', hm(10, 20), hm(11), 4],
    ['sheet', hm(11), hm(11, 30), 0], ['close', hm(11, 30), hm(11, 35), 0]]);
  assert.ok(d.blocks.filter((b) => b.kind === 'period').every((b) => b.subject === 'auto'));
});

test('Friday and holidays have no school; Ramadan starts later with shorter periods', () => {
  assert.deepEqual(day.dayOf(S1, FRI), { school: false, why: 'weekend', blocks: [] });
  assert.deepEqual(day.dayOf(S1, HOLIDAY), { school: false, why: 'holiday', blocks: [] });
  const r = day.dayOf(S1, RAMADAN);
  assert.equal(r.blocks[0].start, hm(9, 30));
  assert.deepEqual(r.blocks.filter((b) => b.kind === 'period').map((b) => b.end - b.start), [30, 30, 30, 30]);
  assert.equal(r.blocks.find((b) => b.kind === 'break').end - r.blocks.find((b) => b.kind === 'break').start, 15);
});

test('a broken or missing timetable means no school day, not a broken one', () => {
  for (const t of [null, {}, { ...S1, blocks: [] }, { ...S1, start: '8am' }, { ...S1, blocks: [{ kind: 'period' }] }]) {
    assert.deepEqual(day.dayOf(t, SAT), { school: false, why: 'none', blocks: [] });
  }
});

test('her own start time moves the day in steps of 30 minutes, at most two hours', () => {
  assert.equal(day.dayOf(S1, SAT, 60).blocks[0].start, hm(9));
  assert.equal(day.dayOf(S1, SAT, -30).blocks[0].start, hm(7, 30));
  assert.equal(day.dayOf(S1, SAT, 45).blocks[0].start, hm(8));          // not a step: ignored
  assert.equal(day.dayOf(S1, SAT, 600).blocks[0].start, hm(10));        // clamped
  assert.deepEqual([day.clampShift(-150), day.clampShift(90), day.clampShift('30')], [-120, 90, 0]);
});

test('where the day is now, and when the next bell rings', () => {
  const d = day.dayOf(S1, SAT);
  assert.deepEqual([day.where(d, hm(7)).phase, day.where(d, hm(7)).next.kind], ['before', 'opening']);
  const w = day.where(d, hm(9, 30));
  assert.deepEqual([w.phase, w.block.kind, w.next.kind, w.next.n], ['in', 'break', 'period', 3]);
  assert.equal(day.where(d, hm(11, 35)).phase, 'after');
  assert.equal(day.where(day.dayOf(S1, FRI), hm(9)).phase, 'none');
  assert.equal(day.nextBoundary(d, hm(7)), hm(8));
  assert.equal(day.nextBoundary(d, hm(8, 5)), hm(8, 45));
  assert.equal(day.nextBoundary(d, hm(11, 31)), hm(11, 35));            // the close's end: Home says the day is done
  assert.equal(day.nextBoundary(d, hm(12)), null);
  assert.deepEqual(['opening', 'period', 'break', 'sheet', 'close'].map(day.bellOf),
    ['start', 'start', 'break', 'start', 'end']);
});

test('periods take her plan first, then the subjects in turn, a fixed subject its own', () => {
  const L = (id, subject) => ({ id, subject });
  const q = { maths: [L('m1', 'maths'), L('m2', 'maths')], science: [L('s1', 'science')], dari: [] };
  const queue = (x) => q[x] || [];
  const d = day.dayOf(S1, SAT);
  const ids = (f) => f.blocks.filter((b) => b.kind === 'period').map((b) => b.lesson && b.lesson.id);
  assert.deepEqual(ids(day.fill(d, { subjects: ['maths', 'science', 'dari'], queue })), ['m1', 's1', 'm2', null]);
  assert.deepEqual(ids(day.fill(d, { plan: [L('p1', 'english')], subjects: ['maths', 'science'], queue })),
    ['p1', 'm1', 's1', 'm2']);
  const fixed = { ...S1, blocks: S1.blocks.map((b, i) => (i === 1 ? { ...b, subject: 'science' } : b)) };
  const f = day.fill(day.dayOf(fixed, SAT), { subjects: ['maths', 'science'], queue });
  assert.deepEqual(ids(f), ['s1', 'm1', 'm2', null]);
  assert.equal(f.blocks[1].subject, 'science');
  // the next day the turn moves on
  q.english = [L('e1', 'english')];
  const three = ['maths', 'science', 'english'];
  assert.deepEqual(ids(day.fill(d, { subjects: three, queue })), ['m1', 's1', 'e1', 'm2']);
  assert.deepEqual(ids(day.fill(d, { subjects: three, queue, dayIndex: 1 })), ['s1', 'e1', 'm1', 'm2']);
  assert.ok(day.fill(d, {}).blocks.every((b) => b.lesson === null));
});

test('the clock is in her digits, with morning and afternoon only when the day crosses noon', () => {
  assert.equal(day.clock(hm(8, 5)), '8:05');
  assert.equal(day.clock(hm(13, 0), true), '1:00 in the afternoon');
  i18n.setLang('prs');
  assert.equal(day.clock(hm(8, 5)), '۸:۰۵');
  assert.equal(day.crossesNoon(day.dayOf(S1, SAT)), false);
  assert.equal(day.crossesNoon(day.dayOf(S1, SAT, 120)), true);
});

test('the Android app gets a week of alarms: a wake-up 30 minutes early and each period, nothing about her', () => {
  const from = new Date(2027, 0, 2, 7, 0);
  const plan = day.alarmPlan(S1, from);
  const days = new Set(plan.map((x) => new Date(x.at).getDate()));
  assert.deepEqual([...days], [2, 3, 4, 5, 6, 7]);                          // Saturday to Thursday; not Friday the 8th
  assert.equal(plan.filter((x) => x.kind === 'wake').length, 6);
  assert.equal(plan.filter((x) => x.kind === 'bell').length, 24);
  assert.deepEqual(Object.keys(plan[0]).sort(), ['at', 'kind']);
  assert.equal(new Date(plan[0].at).getHours() * 60 + new Date(plan[0].at).getMinutes(), hm(7, 30));
  const late = day.alarmPlan(S1, new Date(2027, 0, 2, 9, 0));
  assert.equal(new Date(late[0].at).getDate(), 2);                          // today's later periods only
  assert.equal(late.filter((x) => new Date(x.at).getDate() === 2).length, 2);
});

test('the day is on unless she switched it off, for the school bands, once her cohort sent a timetable', () => {
  const c = { band: 's1', cohort: { id: 'qg1j2918yx' } };
  modules.sync([{ id: 'timetable', bands: ['p1', 'p2', 's1', 's2'], slots: ['home.action', 'settings.row'] }]);
  assert.equal(day.dayOn(c), false);                                        // nothing kept yet
  day.keep(c, S1);
  assert.equal(day.dayOn(c), true);
  assert.equal(day.asked(c), false);
  assert.equal(day.dayOn({ ...c, day: 'off' }), false);
  assert.equal(day.asked({ ...c, day: 'on' }), true);
  assert.equal(day.dayOn({ band: 'ad', cohort: c.cohort }), false);
  assert.equal(day.dayOn({ band: 's2', cohort: c.cohort }), false);         // kept per band
  day.keep(c, null);
  assert.equal(day.dayOn(c), false);
  day.keep(c, S1);
  modules.sync([]);                                                         // the kill switch
  assert.equal(day.dayOn(c), false);
  assert.equal(day.bellsOn(c), true);
  assert.equal(day.bellsOn({ ...c, bells: 'off' }), false);
});

test('alarms go only to the Android app, and only once she said the phone is hers', () => {
  const c = { band: 's1', cohort: { id: 'qg1j2918yx' } };
  modules.sync([{ id: 'timetable', bands: ['s1'], slots: ['home.action'] }]);
  day.keep(c, S1);
  assert.equal(day.syncAlarms(c), false);                                   // a browser: nothing at all
  const calls = [];
  globalThis.QalamAndroid = { setAlarms: (j) => calls.push(['set', JSON.parse(j)]), cancelAlarms: () => calls.push(['cancel']) };
  try {
    day.syncAlarms(c, new Date(2027, 0, 2, 7));
    day.syncAlarms({ ...c, mine: 'yes', alarms: 'off' }, new Date(2027, 0, 2, 7));
    day.syncAlarms({ ...c, mine: 'yes' }, new Date(2027, 0, 2, 7));
    assert.deepEqual(calls.slice(0, 2), [['cancel'], ['cancel']]);
    assert.equal(calls[2][0], 'set');
    assert.equal(calls[2][1].title, 'Qalam');
    assert.deepEqual(Object.keys(calls[2][1]).sort(), ['alarms', 'title']);
  } finally {
    delete globalThis.QalamAndroid;
  }
});

test('the bells are short Opus files whose hashes match their manifest', () => {
  const dir = new URL('../audio/bells/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.deepEqual(Object.keys(m.sounds).sort(), ['break', 'end', 'start']);
  for (const [name, x] of Object.entries(m.sounds)) {
    const b = readFileSync(new URL(x.file, dir));
    assert.equal(x.file, `${name}.opus`);
    assert.equal(createHash('sha256').update(b).digest('hex'), x.sha256.replace(/^sha256:/, ''), name);
    assert.ok(b.length < 40000 && b.subarray(0, 4).toString() === 'OggS', name);
  }
});
