// Family records: the parts without screens, so tools/test_family.mjs can test them in Node.
// A person is kept in localStorage "fhb.kids" (the old name: children came first) as
//   { id, v: 2, pic: 'baby' | 'child' | 'woman' | 'man', sex: 'm' | 'f', name (typed, may be ''), nameRec (a media id),
//     dob (children; ISO date), given {visitId: date} (child vaccines), td {td1: date ...} (women's tetanus vaccine),
//     weights [{id, d, kg?, cm?, pos?, muac?}] (growth for children, weight for adults), hcm (an adult's height, cm),
//     preg (pregnant now), meds [...], notes [...], readings [...], u (last change, ms) }
// Voice recordings and photos are blobs in IndexedDB (js/family.js); the person keeps only their ids.
// Family voice notes that belong to no one person are kept in localStorage "fhb.famnotes" as [{ id, d (ISO date),
// t (ms), rec (a media id) }].
// MEDICAL DEFAULTS (docs/REVIEW.md, "Family records"):
//   adult weight for height (BMI, kg/m²): under 16 very thin -> clinic this week; 16 to 18.4 a little thin; 18.5 to 24.9
//   healthy; 25 to 29.9 a little heavy; 30 or more very heavy -> ask the clinic to check blood pressure and sugar.
//   Not judged in pregnancy or for anyone under 18. Weight 5% or more below a weight from 1 to 6 months before -> clinic this week.
//   Tetanus-diphtheria (Td) for women: dose 2 at least 4 weeks after dose 1 (and in pregnancy at least 2 weeks before the
//   birth), dose 3 at least 6 months after dose 2, doses 4 and 5 at least 1 year after the one before; a late dose does not
//   mean starting again (WHO tetanus position paper 2017; the Afghan EPI card). TD_GAP gives the earliest day.

export const DAY_MS = 864e5;
export const PICS = ['baby', 'child', 'woman', 'man'];
export const isAdult = (p) => !!p && (p.pic === 'woman' || p.pic === 'man');
export const isChild = (p) => !!p && !isAdult(p);
const pad2 = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY_MS);
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
export const newId = (p = 'x') => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');

/* ---------- old records (children only: {id, name, sex, dob, given, weights}) become people ---------- */
export function migrate(list, today = localDay()) {
  let changed = false;
  const out = (Array.isArray(list) ? list : []).filter((p) => p && typeof p === 'object' && p.id);
  for (const p of out) {
    if (p.v !== 2) {
      if (!PICS.includes(p.pic)) p.pic = p.dob && dayDiff(p.dob, today) < 365 ? 'baby' : 'child';
      p.v = 2; changed = true;
    }
    if (p.pic === 'woman') p.sex = 'f'; else if (p.pic === 'man') p.sex = 'm'; else if (p.sex !== 'f') p.sex = 'm';
    for (const k of ['weights', 'meds', 'notes', 'readings']) if (!Array.isArray(p[k])) { p[k] = []; changed = true; }
    for (const k of ['given', 'td']) if (!p[k] || typeof p[k] !== 'object') { p[k] = {}; changed = true; }
    if (typeof p.name !== 'string') { p.name = ''; changed = true; }
  }
  return { list: out, changed };
}

/* ---------- women's tetanus vaccine (Td): 5 doses ---------- */
export const TD = ['td1', 'td2', 'td3', 'td4', 'td5'];
const TD_GAP = [0, 28, 183, 365, 365]; // days after the dose before
// { n: doses given, next: index of the next dose or -1 when all 5 are given, from: earliest day for it (null = any time) }
export function tdPlan(td = {}) {
  let n = 0;
  while (n < 5 && td[TD[n]]) n++;
  if (n >= 5) return { n, next: -1, from: null };
  return { n, next: n, from: n ? addDays(td[TD[n - 1]], TD_GAP[n]) : null };
}
// who gets the Td card: every woman, and a girl of 12 or more who is recorded as a child (a pregnant teenager needs
// it too; Mo, 12 Oct 2026, audit HM-18). A child's age comes from her date of birth.
export const TD_GIRL_YEARS = 12;
export function tdFor(p, today = localDay()) {
  if (!p) return false;
  if (p.pic === 'woman') return true;
  if (p.pic !== 'child' || p.sex !== 'f' || !p.dob) return false;
  const [y, m, d] = today.split('-').map(Number), [by, bm, bd] = p.dob.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0) >= TD_GIRL_YEARS;
}

/* ---------- adults: weight for height ---------- */
export function bmi(kg, cm) { if (!(kg > 0 && cm > 0)) return null; const m = cm / 100; return Math.round((kg / (m * m)) * 10) / 10; }
export function bmiLevel(b) { return b == null ? null : b < 16 ? 'vthin' : b < 18.5 ? 'thin' : b < 25 ? 'ok' : b < 30 ? 'heavy' : 'vheavy'; }
export const BMI_LV = { vthin: 'soon', thin: 'watch', ok: 'ok', heavy: 'watch', vheavy: 'soon' }; // colour of the card
// the advice after the latest weight: { bmi, lv, say: [...narration ids], loss }
export function adultAdvice(p, today = localDay()) {
  const ws = (p.weights || []).filter((e) => e.kg > 0).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const last = ws[ws.length - 1]; if (!last) return null;
  const out = { bmi: null, lv: null, say: [], loss: false };
  if (p.preg) out.say.push('ui.fam.bmi.preg');
  else {
    out.bmi = bmi(last.kg, p.hcm);
    out.lv = bmiLevel(out.bmi);
    if (out.lv) out.say.push('ui.fam.bmi.' + out.lv);
    // losing weight without trying: 5% or more below a weight from 1 to 6 months before
    const before = ws.filter((e) => { const g = dayDiff(e.d, last.d); return g >= 28 && g <= 183; });
    const top = before.reduce((m, e) => Math.max(m, e.kg), 0);
    if (top && last.kg <= top * 0.95) { out.loss = true; out.say.push('ui.fam.w.loss'); }
  }
  return out;
}

/* ---------- numbers read aloud: 0 to 999, with one decimal ---------- */
// [ids] for a number, e.g. 72.5 -> ui.num.72, ui.num.point, ui.num.5; 120 -> ui.num.100and, ui.num.20
export function numIds(x, unit) {
  const ids = [];
  if (!isFinite(x) || x < 0 || x >= 1000) return ids;
  const s = String(Math.round(x * 10) / 10), [ip, dp] = s.split('.'), n = +ip;
  if (n >= 100) { const h = Math.floor(n / 100), r = n % 100; ids.push(`ui.num.${h}00${r ? 'and' : ''}`); if (r) ids.push(`ui.num.${r}`); }
  else ids.push(`ui.num.${n}`);
  if (dp) ids.push('ui.num.point', ...dp.split('').map((d) => `ui.num.${d}`));
  if (unit) ids.push('ui.num.' + unit);
  return ids;
}
// the space used, as [text number, unit] and the narration ids
export function sizeOf(bytes) {
  const mb = bytes / 1048576;
  if (mb >= 0.1) { const v = Math.round(mb * 10) / 10; return { v, unit: 'mb', ids: numIds(v, 'mb') }; }
  const kb = Math.max(1, Math.round(bytes / 1024)); return { v: kb, unit: 'kb', ids: numIds(Math.min(kb, 999), 'kb') };
}

/* ---------- medicines and their reminders ---------- */
// The four times of day. The family can move each one (#/family/times, kept in localStorage "fhb.medtimes" and sent with
// the records); these are the usual times. Every time is a time of the phone's own clock, in the phone's own time zone:
// a dose is a calendar day (localDay) and a time "HH:MM", turned into a moment only when it is needed, so a phone whose
// clock or time zone changes still reminds at 07:00 on its own clock.
export const SLOTS = ['morning', 'noon', 'evening', 'night'];
export const TIMES = { morning: '07:00', noon: '12:00', evening: '18:00', night: '21:00' };
// the hours each time may move between, so "morning" stays in the morning (its sun picture stays true) and no dose
// crosses midnight
export const SLOT_HOURS = { morning: [4, 11], noon: [10, 15], evening: [15, 21], night: [18, 23] };
export const REMIND_MIN = 180; // a dose shows as due from its time until 3 hours later
export const SNOOZE_MIN = 15;
export const AHEAD_DAYS = 7; // the phone (Android app) is given the doses of today and the next 7 days
const HM_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
// the family's times: only well-formed ones, each inside its hours; anything else is the usual time
export function cleanTimes(t) {
  const out = {};
  for (const s of SLOTS) {
    const v = t && typeof t === 'object' ? t[s] : null, m = typeof v === 'string' ? HM_RE.exec(v) : null, r = SLOT_HOURS[s];
    out[s] = m && +m[1] >= r[0] && +m[1] <= r[1] ? v : TIMES[s];
  }
  return out;
}
export const isUsualTimes = (t) => SLOTS.every((s) => cleanTimes(t)[s] === TIMES[s]);
// one hour later (dh = 1) or earlier (dh = -1), never outside the slot's hours
export function moveTime(times, slot, dh) {
  const t = cleanTimes(times), r = SLOT_HOURS[slot]; if (!r) return t;
  t[slot] = pad2(Math.min(r[1], Math.max(r[0], +t[slot].slice(0, 2) + dh))) + t[slot].slice(2);
  return t;
}
// the hour on a 12-hour clock (as people say it: "7 in the evening"), and the narration of a time: slot, hour, o'clock
export const hour12 = (hm) => (+hm.slice(0, 2) % 12) || 12;
export const timeIds = (slot, hm) => ['ui.fam.t.' + slot, 'ui.num.' + hour12(hm), 'ui.fam.oclock'];
// a slot's moment on a calendar day (ISO), on the phone's own clock and time zone (never UTC)
export function slotTime(day, slot, times = TIMES) {
  const hm = times[slot] || TIMES[slot], [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, +hm.slice(0, 2), +hm.slice(3)).getTime();
}
export function medActive(m, today = localDay()) {
  if (!m || m.on === false) return false;
  if (m.days > 0 && m.d && dayDiff(m.d, today) >= m.days) return false;
  return true;
}
export function daysLeft(m, today = localDay()) { return m.days > 0 && m.d ? Math.max(0, m.days - dayDiff(m.d, today)) : null; }
// doses due now: [{ p, m, slot, at }] (at = ms of the dose time today), earliest first
export function dueMeds(people, now = new Date(), times = TIMES) {
  const day = localDay(now), out = [];
  for (const p of people || []) for (const m of p.meds || []) {
    if (!medActive(m, day) || (m.d && m.d > day)) continue;
    for (const slot of m.times || []) {
      if (!TIMES[slot]) continue;
      const at = slotTime(day, slot, times);
      if (now.getTime() < at || now.getTime() >= at + REMIND_MIN * 60000) continue;
      if (((m.taken || {})[day] || []).includes(slot)) continue;
      const z = m.snooze; if (z && z.k === day + '|' + slot && z.until > now.getTime()) continue;
      out.push({ p, m, slot, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
// every dose from the one due now to the end of the next AHEAD_DAYS days that is not taken yet, earliest first, for the
// phone's own reminders (Android app): [{ p, m, slot, day, key, at, hm, abs }]. key names the dose (day|medicine|slot); a
// snoozed dose ("Later") comes at the end of its 15 minutes as a new key (…|until) with abs = true (a moment, not a time
// of day). hm = the time of day, so the phone can work the moment out again after a time zone or clock change.
export function upcoming(people, now = new Date(), times = TIMES, days = AHEAD_DAYS, max = 200) {
  const t0 = now.getTime(), out = [];
  for (let k = 0; k <= days; k++) {
    const day = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k));
    for (const p of people || []) for (const m of p.meds || []) {
      if (!medActive(m, day) || (m.d && m.d > day)) continue;
      const taken = (m.taken || {})[day] || [];
      for (const slot of m.times || []) {
        if (!TIMES[slot] || taken.includes(slot)) continue;
        const at = slotTime(day, slot, times), key = day + '|' + m.id + '|' + slot;
        if (at + REMIND_MIN * 60000 <= t0) continue; // its time is over
        const z = m.snooze;
        if (z && z.k === day + '|' + slot && z.until > t0) out.push({ p, m, slot, day, key: key + '|' + z.until, at: z.until, hm: times[slot] || TIMES[slot], abs: true });
        else out.push({ p, m, slot, day, key, at, hm: times[slot] || TIMES[slot], abs: false });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}
export function markTaken(m, day, slot) {
  m.taken = m.taken || {};
  const t = (m.taken[day] = m.taken[day] || []); if (!t.includes(slot)) t.push(slot);
  for (const k of Object.keys(m.taken)) if (dayDiff(k, day) > 60) delete m.taken[k]; // keep two months
}
export function snooze(m, day, slot, now = Date.now()) { m.snooze = { k: day + '|' + slot, until: now + SNOOZE_MIN * 60000 }; }

/* ---------- copying the records to another phone: one zip file ---------- */
export const BUNDLE = 'sehat-family.json';
// every media id a person refers to
export function mediaIds(p) {
  const ids = [];
  if (p.nameRec) ids.push(p.nameRec);
  for (const m of p.meds || []) { if (m.rec) ids.push(m.rec); if (m.photo) ids.push(m.photo); }
  for (const n of p.notes || []) if (n.rec) ids.push(n.rec);
  return ids;
}
export const MEDIA_RE = /^[a-z0-9]{4,40}$/;
// the family voice notes (no one person's): only well-formed rows, at most 500
export function cleanNotes(list) {
  const out = [], seen = {};
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(n.id) || seen[n.id]) continue;
    if (typeof n.rec !== 'string' || !MEDIA_RE.test(n.rec)) continue;
    const d = typeof n.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.d) ? n.d : null; if (!d) continue;
    seen[n.id] = 1; out.push({ id: n.id, d, t: typeof n.t === 'number' && isFinite(n.t) ? n.t : 0, rec: n.rec });
    if (out.length >= 500) break;
  }
  return out;
}
export const noteMediaIds = (notes) => (notes || []).map((n) => n.rec).filter(Boolean);
// notes: the family voice notes (they travel with the people)
// times: the family's medicine times (only when they are not the usual ones)
export function makeBundle(people, media, now = new Date(), notes = [], times = null) {
  // media: [{id, type, bytes}] (the blobs travel as separate files media/<id>)
  const b = { app: 'sehat', kind: 'family', v: 1, made: now.toISOString(), people, notes, media: media.map((x) => ({ id: x.id, type: x.type })) };
  if (times && !isUsualTimes(times)) b.times = cleanTimes(times);
  return b;
}
const KEEP = ['id', 'v', 'pic', 'sex', 'name', 'nameRec', 'dob', 'given', 'td', 'weights', 'hcm', 'preg', 'meds', 'notes', 'readings', 'u'];
// checks a bundle from another phone; returns { people, notes, media, times } with only the known fields (times: null
// when the file has none), or null
export function readBundle(j) {
  if (!j || j.app !== 'sehat' || j.kind !== 'family' || !Array.isArray(j.people)) return null;
  const people = [];
  for (const raw of j.people) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id)) continue;
    const p = {}; for (const k of KEEP) if (raw[k] !== undefined) p[k] = raw[k];
    if (typeof p.name === 'string') p.name = p.name.slice(0, 40);
    if (p.dob && !/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) delete p.dob;
    people.push(p);
  }
  const { list } = migrate(people);
  const media = (Array.isArray(j.media) ? j.media : []).filter((m) => m && MEDIA_RE.test(m.id) && /^(audio|image)\/[a-z0-9.+;=-]+$/i.test(String(m.type || '')));
  return { people: list, notes: cleanNotes(j.notes), media, times: j.times && typeof j.times === 'object' ? cleanTimes(j.times) : null };
}
// adds the people from another phone: a new person is added; the same person (same id) is replaced only when the
// copy is newer. Nothing on this phone is deleted.
export function mergePeople(mine, theirs) {
  const out = mine.slice(); let added = 0, updated = 0;
  for (const p of theirs) {
    const i = out.findIndex((x) => x.id === p.id);
    if (i < 0) { out.push(p); added++; }
    else if ((p.u || 0) > (out[i].u || 0)) { out[i] = p; updated++; }
  }
  return { list: out, added, updated };
}
// adds the family voice notes from another phone that this phone does not have yet
export function mergeNotes(mine, theirs) {
  const out = mine.slice(); let added = 0;
  for (const n of theirs) if (!out.some((x) => x.id === n.id)) { out.push(n); added++; }
  return { list: out, added };
}
