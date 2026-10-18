// An adult's study time (7b, C4.10; app/js/day.js and modules/timetable.js): off until she says yes, Saturday to
// Thursday, the minutes left, the bells' times, the APK's alarm at the start, and what the phone keeps.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
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
const state = await import('../js/state.js');
const timetable = await import('../js/modules/timetable.js');

const TT = { id: 'timetable', bands: ['p1', 'p2', 's1', 's2', 'ad'], slots: ['home.action', 'settings.row'] };
const SAT = (h, m = 0) => new Date(2027, 0, 2, h, m);         // a Saturday
const FRI = new Date(2027, 0, 8, 19, 10);
const ST = { at: '19:00', min: 30 };

beforeEach(() => {
  store.clear();
  state.reload();
  modules.reset();
  modules.sync([TT]);
  i18n.setLang('en');
});

test('off until she says yes: the card asks once, for adults only, and the module switch takes it away', () => {
  const c = { band: 'ad' };
  assert.equal(timetable.studyCan(c) && !day.studyAsked(c), true);
  assert.equal(day.studyOn(c), false);
  assert.equal(day.studyAsked({ ...c, study: 'off' }), true);
  assert.equal(day.studyOn({ ...c, study: 'off' }), false);
  assert.equal(day.studyOn({ ...c, study: ST }), true);
  assert.equal(timetable.studyCan({ band: 's1' }), false);
  assert.equal(day.studyOn({ band: 's1', study: ST }), false);
  modules.sync([]);                                                         // the cohort's "School day off"
  assert.equal(timetable.studyCan(c), false);
  assert.equal(day.studyOn({ ...c, study: ST }), false);
  modules.sync([{ ...TT, bands: ['p1', 'p2', 's1', 's2'] }]);               // the timetable module without adults
  assert.equal(day.studyOn({ ...c, study: ST }), false);
});

test('Saturday to Thursday: the minutes left, the next bell, and Friday free', () => {
  assert.equal(day.studyLeft(ST, SAT(18, 59)), null);
  assert.equal(day.studyLeft(ST, SAT(19, 10)), 20);
  assert.equal(day.studyLeft(ST, SAT(19, 30)), null);
  assert.equal(day.studyNext(ST, SAT(18, 0)), 19 * 60);
  assert.equal(day.studyNext(ST, SAT(19, 0)), 19 * 60 + 30);
  assert.equal(day.studyNext(ST, SAT(19, 30)), null);
  assert.equal(day.studyOf(ST, FRI), null);
  assert.equal(day.studyLeft(ST, FRI), null);
  assert.equal(day.studyLeft({ at: '06:30', min: 60 }, SAT(7, 15)), 15);
  assert.equal(i18n.s('study_left', { n: 20 }), 'Study time: 20 minutes left');
});

test("the time in P19's words: morning, afternoon and evening, in her digits", () => {
  assert.equal(day.studyClock(19 * 60), '7:00 in the evening');
  assert.equal(day.studyClock(14 * 60 + 30), '2:30 in the afternoon');
  assert.equal(day.studyClock(6 * 60), '6:00 in the morning');
  i18n.setLang('prs');
  assert.equal(day.studyClock(19 * 60), '۷:۰۰ شام');
});

test('the phone keeps a study time on the half hour from 5:00 to 22:30, 15 to 60 minutes, or off', () => {
  const c = state.addChild({ band: 'ad', track: 'reader', lang: 'prs' });
  const kept = (v) => { state.updateChild(c.id, { study: v }); state.reload(); return state.byId(c.id).study; };
  assert.deepEqual(kept({ at: '19:00', min: 30 }), { at: '19:00', min: 30 });
  assert.deepEqual(kept({ at: '05:00', min: 60, extra: 1 }), { at: '05:00', min: 60 });
  assert.equal(kept('off'), 'off');
  for (const bad of [{ at: '19:15', min: 30 }, { at: '04:30', min: 30 }, { at: '23:00', min: 30 }, { at: '19:00', min: 20 },
    'on', 7, null]) assert.equal(kept(bad), undefined, JSON.stringify(bad));
});

test("the APK's alarm at the start, Saturday to Thursday, only once the phone is hers", () => {
  const from = SAT(20);
  const plan = day.studyAlarms(ST, from);
  assert.equal(plan.length, 5);                                             // Sat's has passed; Fri has none
  assert.ok(plan.every((x) => x.kind === 'bell' && new Date(x.at).getHours() === 19 && new Date(x.at).getDay() !== 5));
  const c = { band: 'ad', study: ST };
  const calls = [];
  globalThis.QalamAndroid = { setAlarms: (j) => calls.push(['set', JSON.parse(j)]), cancelAlarms: () => calls.push(['cancel']) };
  try {
    day.syncAlarms(c, from);
    day.syncAlarms({ ...c, mine: 'yes', alarms: 'off' }, from);
    day.syncAlarms({ ...c, mine: 'yes', study: 'off' }, from);
    day.syncAlarms({ ...c, mine: 'yes' }, from);
    assert.deepEqual(calls.slice(0, 3), [['cancel'], ['cancel'], ['cancel']]);
    assert.deepEqual(calls[3][1], { title: 'Qalam', alarms: plan });
  } finally {
    delete globalThis.QalamAndroid;
  }
});
