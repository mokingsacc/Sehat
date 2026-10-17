// The Solar Hijri calendar as Afghanistan keeps it, for the learner's app and the staff pages (staff/lang.js
// re-exports it): a Gregorian day to [year, month, day], and since P31 a moment as "3 Aqrab, 08:00" in her language and
// digits (a contest's window). The Afghan month names are cert.py's; Dari and Pashto are drafts for a native speaker.

const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;
// The Solar Hijri calendar as Afghanistan keeps it (Hamal first: six months of 31 days, five of 30, Hut 29 or 30),
// with the year's first day found by the known 33-year leap rules and their break years (the arithmetic that matches
// the astronomical calendar for these centuries). The Python copy is cert.py's hijri_date(); one table of known days
// (hub/tests/hijri_dates.json) tests both (app/tests/staff.test.js, through staff/lang.js).
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
// the day of March on which Solar Hijri year jy begins
export function nowruz(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  const n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  return 20 + leapJ - leapG;
}
const dayNo = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
// a Gregorian day (year, month 1-12, day) -> [Solar Hijri year, month 1-12, day]
export function hijri(gy, gm, gd) {
  let jy = gy - 621;
  let start = dayNo(gy, 3, nowruz(jy));
  const at = dayNo(gy, gm, gd);
  if (at < start) { jy -= 1; start = dayNo(gy - 1, 3, nowruz(jy)); }
  const k = at - start;
  const m = k < 186 ? div(k, 31) : 6 + div(k - 186, 30);
  const d = k < 186 ? mod(k, 31) + 1 : mod(k - 186, 30) + 1;
  return [jy, m + 1, d];
}

// the Afghan month names, Hamal first: Dari, Pashto, and as English writes them
export const MONTHS = {
  prs: ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'],
  ps: ['وری', 'غویی', 'غبرگولی', 'چنگاښ', 'زمری', 'وږی', 'تله', 'لړم', 'لیندۍ', 'مرغومی', 'سلواغه', 'کب'],
  en: ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sonbola', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalw', 'Hut'],
};

const pad = (n) => String(n).padStart(2, '0');
const digits = (x, l) => (l === 'en' ? x : x.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]));

// a server's UTC minute ("2027-10-25T08:00") as the phone's own day and time: "3 Aqrab, 08:00", "۳ عقرب، ۰۸:۰۰"
export function moment(iso, l) {
  const d = new Date(/[zZ]$/.test(String(iso)) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const [, m, dd] = hijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const name = (MONTHS[l] || MONTHS.prs)[m - 1];
  return digits(`${dd} ${name}${l === 'en' ? ', ' : '، '}${pad(d.getHours())}:${pad(d.getMinutes())}`, l);
}
