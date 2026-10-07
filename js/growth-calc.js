// Growth tracker arithmetic: WHO Child Growth Standards (2006) z-scores and the plain-words result after each measurement.
// No DOM here, so tools/test_growth.mjs can test it in Node. The tables come from content/who-growth.json
// (made by tools/make_who_growth.py from the WHO's own LMS tables). js/growth.js draws the screens.
//
// MEDICAL DEFAULTS (docs/REVIEW.md, "Growth tracker and Share Sehat"): they match content/src/topics/growth.json and kit-muac.json.
//   weight-for-length/height below -3 SD, or a red arm tape   -> "very thin": clinic TODAY (+ the hospital-now signs)
//   weight-for-length/height -3 to -2 SD, or a yellow tape    -> "a little thin": clinic THIS WEEK
//   weight-for-age below -2 SD (below -3: "very light")      -> clinic THIS WEEK for a check
//   weight lower than at a visit 2 or more weeks before      -> "going down": clinic THIS WEEK
//   weight not up by 0.1 kg since a visit 2 weeks (under 6 months), 4 weeks (6 to 23 months) or 8 weeks (2 to 5 years)
//     before                                                 -> "not going up": clinic THIS WEEK
//   length/height-for-age below -2 SD (below -3: "very short") -> tell the clinic, this month
//   weight-for-length/height above +2 SD (above +3: "very heavy") -> ask the clinic about food, this month
//   numbers outside WHO's plausible ranges                   -> "measure again"
// Length: lying down under 2 years, standing from 2 years. Measured the other way, 0.7 cm is added (standing under 2)
// or taken away (lying from 2), as WHO does.

export const DAY_MS = 864e5;
const MAX_DAYS = 1826; // 5 years: the end of the WHO tables

/* ---------- LMS ---------- */
// value of L, M and S at x in a table (a list of segments {x0, dx, n, last, L, M, S}); null outside the table
export function lms(tab, x) {
  if (!tab || !(x >= 0 || x < 0)) return null;
  let g = null;
  for (const s of tab) if (x >= s.x0 - 1e-9 && x <= s.last + 1e-9) g = s;
  if (!g) return null;
  const at = (i) => (i >= g.n - 1 ? g.last : g.x0 + i * g.dx);
  const i = Math.max(0, Math.min(Math.floor((x - g.x0) / g.dx + 1e-9), g.n - 2));
  const xa = at(i), xb = at(i + 1), t = xb > xa ? Math.min(1, Math.max(0, (x - xa) / (xb - xa))) : 0;
  const v = (a) => (typeof a === 'number' ? a : a[i] + (a[i + 1] - a[i]) * t);
  return { L: v(g.L), M: v(g.M), S: v(g.S) };
}
export function zLMS(y, p) { return Math.abs(p.L) < 1e-7 ? Math.log(y / p.M) / p.S : (Math.pow(y / p.M, p.L) - 1) / (p.L * p.S); }
export function yLMS(z, p) { return Math.abs(p.L) < 1e-7 ? p.M * Math.exp(p.S * z) : p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L); }
// weight-based indicators: beyond 3 SD WHO measures in steps of the distance between 2 and 3 SD
export function zWeight(y, p) {
  const z = zLMS(y, p);
  if (z > 3) { const s3 = yLMS(3, p); return 3 + (y - s3) / (s3 - yLMS(2, p)); }
  if (z < -3) { const s3 = yLMS(-3, p); return -3 + (y - s3) / (yLMS(-2, p) - s3); }
  return z;
}

/* ---------- one measurement ---------- */
export function ageDays(dobISO, dateISO) { return Math.round((Date.parse(dateISO + 'T12:00:00Z') - Date.parse(dobISO + 'T12:00:00Z')) / DAY_MS); }
// the length (under 2 years) or height (from 2 years) the WHO tables expect, with the 0.7 cm adjustment when needed
export function lengthFor(age, cm, pos) {
  if (!(cm > 0)) return null;
  if (age < 731 && pos === 'standing') return { v: cm + 0.7, adj: 0.7 };
  if (age >= 731 && pos === 'lying') return { v: cm - 0.7, adj: -0.7 };
  return { v: cm, adj: 0 };
}
// WHO "flags": z-scores this far out are almost always a mistake in measuring or writing
const FLAG = { wfa: [-6, 5], lhfa: [-6, 6], wfl: [-5, 5] };
export const implausible = (ind, z) => z != null && (z < FLAG[ind][0] || z > FLAG[ind][1]);

// z-scores of one entry {d, kg, cm, pos, muac} for a child {sex 'm'|'f', dob}; null where not measured or outside the tables
export function zscores(who, kid, e) {
  const sex = kid.sex === 'f' ? 'f' : 'm', age = ageDays(kid.dob, e.d);
  const out = { age, wfa: null, lhfa: null, wfl: null, len: null, adj: 0, wflTable: age < 731 ? 'wfl' : 'wfh' };
  if (!(age >= 0 && age <= MAX_DAYS)) return out;
  if (e.kg > 0) { const p = lms(who.wfa[sex], age); if (p) out.wfa = zWeight(e.kg, p); }
  const L = lengthFor(age, e.cm, e.pos);
  if (L) {
    out.len = L.v; out.adj = L.adj;
    const p = lms(who.lhfa[sex], age); if (p) out.lhfa = zLMS(L.v, p);
    if (e.kg > 0) { const q = lms(who[out.wflTable][sex], Math.round(L.v * 10) / 10); if (q) out.wfl = zWeight(e.kg, q); }
  }
  return out;
}

/* ---------- the result in plain words ---------- */
// lv: today | soon | month | check | ok. Each finding has a headline and the reason to see the clinic (narration ids).
export const RANK = { today: 5, soon: 4, check: 3, month: 2, ok: 0 };
export const FINDINGS = {
  thin3: { lv: 'today', say: ['ui.gr.r.thin3', 'ui.gr.why.thin3', 'growth.home-care'], hosp: true },
  muacRed: { lv: 'today', say: ['ui.gr.r.muac-red', 'ui.gr.why.thin3', 'growth.home-care'], hosp: true },
  thin2: { lv: 'soon', say: ['ui.gr.r.thin2', 'ui.gr.why.thin2'], hosp: true },
  muacYellow: { lv: 'soon', say: ['ui.gr.r.muac-yellow', 'ui.gr.why.thin2'], hosp: true },
  falling: { lv: 'soon', say: ['ui.gr.r.falling', 'ui.gr.why.falter'], hosp: true },
  flat: { lv: 'soon', say: ['ui.gr.r.flat', 'ui.gr.why.falter'], hosp: true },
  light3: { lv: 'soon', say: ['ui.gr.r.light3', 'ui.gr.why.light'], hosp: true },
  light2: { lv: 'soon', say: ['ui.gr.r.light2', 'ui.gr.why.light'], hosp: true },
  check: { lv: 'check', say: ['ui.gr.r.check'] },
  short3: { lv: 'month', say: ['ui.gr.r.short3', 'ui.gr.why.short'] },
  short2: { lv: 'month', say: ['ui.gr.r.short2', 'ui.gr.why.short'] },
  heavy3: { lv: 'month', say: ['ui.gr.r.heavy3', 'ui.gr.why.heavy'] },
  heavy2: { lv: 'month', say: ['ui.gr.r.heavy2', 'ui.gr.why.heavy'] },
  ok: { lv: 'ok', say: ['ui.gr.r.ok'] },
};
// days back to look for "not going up": 2 weeks under 6 months, 4 weeks under 2 years, 8 weeks from 2 years
const flatGap = (age) => (age < 183 ? 14 : age < 731 ? 28 : 56);

// entries: all of the child's entries (any order). Returns { lv, keys: [finding keys, worst first], z, tips: [narration ids], say: [ids to read] }
export function assess(who, kid, entry, entries) {
  const z = zscores(who, kid, entry), keys = [], tips = [];
  if (z.age < 0) return { lv: 'check', keys: ['check'], z, tips, say: ['ui.gr.baddate'], hosp: false };
  const inRange = z.age <= MAX_DAYS;
  const bad = { wfa: implausible('wfa', z.wfa), lhfa: implausible('lhfa', z.lhfa), wfl: implausible('wfl', z.wfl) };
  if (bad.wfa || bad.lhfa || bad.wfl) keys.push('check');
  const wasting = [];
  if (z.wfl != null && !bad.wfl) {
    if (z.wfl < -3) wasting.push('thin3'); else if (z.wfl < -2) wasting.push('thin2');
    else if (z.wfl > 3) keys.push('heavy3'); else if (z.wfl > 2) keys.push('heavy2');
  }
  if (entry.muac && z.age >= 183 && inRange) { if (entry.muac === 'r') wasting.push('muacRed'); else if (entry.muac === 'y') wasting.push('muacYellow'); }
  // a red tape and "very thin" by weight say the same thing: keep one of each level
  if (wasting.includes('thin3') && wasting.includes('muacRed')) wasting.splice(wasting.indexOf('muacRed'), 1);
  if (wasting.includes('thin2') && wasting.includes('muacYellow')) wasting.splice(wasting.indexOf('muacYellow'), 1);
  if ((wasting.includes('thin3') || wasting.includes('muacRed')) && wasting.includes('thin2')) wasting.splice(wasting.indexOf('thin2'), 1);
  if ((wasting.includes('thin3') || wasting.includes('muacRed')) && wasting.includes('muacYellow')) wasting.splice(wasting.indexOf('muacYellow'), 1);
  keys.push(...wasting);
  // light for age: only when "thin" does not already say it
  if (z.wfa != null && !bad.wfa && !wasting.length) { if (z.wfa < -3) keys.push('light3'); else if (z.wfa < -2) keys.push('light2'); }
  if (z.lhfa != null && !bad.lhfa) { if (z.lhfa < -3) keys.push('short3'); else if (z.lhfa < -2) keys.push('short2'); }
  // weight going down, or not going up, since an earlier visit
  if (entry.kg > 0 && inRange) {
    const t = Date.parse(entry.d + 'T12:00:00Z'), back = (e) => (t - Date.parse(e.d + 'T12:00:00Z')) / DAY_MS;
    const before = (entries || []).filter((e) => e !== entry && e.kg > 0 && back(e) >= 14).sort((a, b) => (a.d < b.d ? 1 : -1));
    const prev = before[0], old = before.find((e) => back(e) >= flatGap(z.age));
    if (prev && entry.kg <= prev.kg - 0.1) keys.push('falling');
    else if (old && entry.kg < old.kg + 0.1) keys.push('flat');
  }
  if (!inRange) tips.push('ui.gr.over5');
  else {
    if (z.adj) tips.push(z.adj > 0 ? 'ui.gr.adj-standing' : 'ui.gr.adj-lying');
    if (entry.kg > 0 && !(entry.cm > 0)) tips.push('ui.gr.nolength');
  }
  if (!keys.length) keys.push('ok');
  keys.sort((a, b) => RANK[FINDINGS[b].lv] - RANK[FINDINGS[a].lv]);
  const top = keys.slice(0, 3), say = [];
  for (const k of top) for (const id of FINDINGS[k].say) if (!say.includes(id)) say.push(id);
  const lv = FINDINGS[top[0]].lv, hosp = top.some((k) => FINDINGS[k].hosp);
  if (top.some((k) => k === 'thin3' || k === 'muacRed')) say.push('growth.urgent', 'growth.urgent.feet', 'growth.urgent.thin', 'growth.urgent.eat');
  return { lv, keys: top, z, tips, say, hosp };
}

/* ---------- chart lines ---------- */
// the value at each SD line (-3, -2, 0, 2, 3) for each x; xs in days (age charts) or cm (weight-for-length/height)
export function curves(who, ind, sex, xs, zs = [-3, -2, 0, 2, 3]) {
  const tab = who[ind][sex === 'f' ? 'f' : 'm'];
  return zs.map((z) => ({ z, pts: xs.map((x) => { const p = lms(tab, x); return p ? [x, yLMS(z, p)] : null; }).filter(Boolean) }));
}
