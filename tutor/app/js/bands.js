// Age bands, looks and tones (DESIGN.md, the C1 spec). The learner never picks a look: her year, or the adult door
// she took, sets the band, and the band sets the rest, as five attributes on <html>:
//   data-band  ey (year 0), p1 (1-3), p2 (4-6), s1 (7-9), s2 (10-12), ad (adults; track literacy or reader)
//   data-look  bold or clean: sizes, radii, borders, the reading font, read-on-open
//   data-tone  child or adult: the palette, the words (stars or check marks), the pictures the packs use
//   data-text  absent, or large ("Bigger text": every size times 1.25)
//   data-theme absent (follows the phone), light or dark
// The server only ever learns the band.

export const BANDS = ['ey', 'p1', 'p2', 's1', 's2', 'ad'];
export const TRACKS = ['literacy', 'reader'];
export const THEMES = ['phone', 'light', 'dark'];

export function bandOfYear(year) {
  if (year === null || year === undefined || year === '') return null;
  const y = Number(year);
  if (!Number.isInteger(y) || y < 0 || y > 12) return null;
  return y === 0 ? 'ey' : y <= 3 ? 'p1' : y <= 6 ? 'p2' : y <= 9 ? 's1' : 's2';
}

// a learner record -> its band (adults keep theirs; school learners follow their year)
export function bandOf(l) {
  if (!l) return null;
  if (l.band === 'ad') return 'ad';
  return bandOfYear(l.year) || (BANDS.includes(l.band) ? l.band : null);
}

export function lookOf(band, track) {
  if (band === 'ad') return track === 'reader' ? 'clean' : 'bold';
  return band === 's1' || band === 's2' ? 'clean' : 'bold';
}

export function toneOf(band) {
  return band === 'ey' || band === 'p1' || band === 'p2' ? 'child' : 'adult';
}

// what is read aloud when it opens, without a tap: 'home' or 'step' (a lesson step)
const READ_ON_OPEN = { ey: ['home', 'step', 'all'], p1: ['home', 'step'], p2: ['step'], s1: [], s2: [] };
export function readsOnOpen(band, track, where) {
  if (band === 'ad') return track === 'literacy' && (where === 'home' || where === 'step');
  return (READ_ON_OPEN[band] || []).includes(where);
}

// the shell's tabs: none in early years (no text the child must read; the grown-up's corner instead)
export const hasTabs = (band) => band !== 'ey';
// stars for children, "Correct, 8 of 10" and a check mark for adults
export const praise = (band) => (toneOf(band) === 'child' ? 'stars' : 'check');

// everything the attributes say, for a learner (or for screens with no learner: Welcome, Teacher)
export function attrs(l) {
  const band = bandOf(l);
  if (!band) {
    return { band: null, look: 'clean', tone: 'adult', text: l && l.text === 'large' ? 'large' : null,
      theme: l && (l.theme === 'light' || l.theme === 'dark') ? l.theme : null };
  }
  return {
    band,
    look: lookOf(band, l.track),
    tone: toneOf(band),
    text: l.text === 'large' ? 'large' : null,
    theme: l.theme === 'light' || l.theme === 'dark' ? l.theme : null,
  };
}

// set the attributes on <html>, then theme-color from the accent and color-scheme from the theme
export function apply(root, l, { setTone } = {}) {
  const a = attrs(l);
  for (const [k, v] of Object.entries(a)) {
    if (v) root.setAttribute('data-' + k, v); else root.removeAttribute('data-' + k);
  }
  root.removeAttribute('data-mode');
  if (setTone) setTone(a.tone);
  const doc = root.ownerDocument;
  if (doc && doc.defaultView) {
    const cs = doc.defaultView.getComputedStyle(root);
    const meta = doc.querySelector('meta[name="theme-color"]');
    const accent = cs.getPropertyValue('--accent').trim();
    if (meta && accent) meta.setAttribute('content', accent);
  }
  return a;
}

// WCAG contrast, for the token check (app/tests/bands.test.js) and the browser check (tools/browser_check.mjs)
export function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
