// The alias pictures (DESIGN.md 6): a learner is a picture, never a name. The phone gives a new learner a picture no
// other learner on this phone uses; the server adds a number when she joins ("Book ۲۷"). The list and the words are
// content/aliases.json's (drafts: reviewers strike any gendered, religious or name-like item, and native speakers
// check the Dari and Pashto words); app/tests/aliases.test.js keeps this copy the same as that file.
// The drawings are plain line art in the icon style, on the Who chip's accent-soft circle (P9 look-over, ruling 4).

export const ALIASES = [
  { id: 'book', name: { prs: 'کتاب', ps: 'کتاب', en: 'Book' },
    d: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>' },
  { id: 'key', name: { prs: 'کلید', ps: 'کیلي', en: 'Key' },
    d: '<circle cx="7.5" cy="12" r="4"/><path d="M11.5 12H21"/><path d="M17.5 12v3.5M20.5 12v2.5"/>' },
  { id: 'cup', name: { prs: 'پیاله', ps: 'پیاله', en: 'Cup' },
    d: '<path d="M4 8h12v5a6 6 0 0 1-12 0z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M3 21h14"/>' },
  { id: 'teapot', name: { prs: 'چاینک', ps: 'چاینکه', en: 'Teapot' },
    d: '<path d="M5 11h12l-1 7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M8 11a3 3 0 0 1 6 0"/><path d="M11 5.5v2.5"/>' +
      '<path d="M17 13l4-3"/><path d="M5.5 13.5H4a1.8 1.8 0 0 0 0 3.6h1.8"/>' },
  { id: 'clock', name: { prs: 'ساعت', ps: 'ګړۍ', en: 'Clock' },
    d: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>' },
  { id: 'apple', name: { prs: 'سیب', ps: 'مڼه', en: 'Apple' },
    d: '<path d="M12 8c-2.5-2-8-1.5-8 4.5C4 17 7 21 9.5 21c1.2 0 1.6-.6 2.5-.6s1.3.6 2.5.6C17 21 20 17 20 12.5 20 6.5 14.5 6 12 8z"/>' +
      '<path d="M12 8c0-2 1-4 3-5"/>' },
  { id: 'grapes', name: { prs: 'انگور', ps: 'انګور', en: 'Grapes' },
    d: '<circle cx="9" cy="9" r="2.5"/><circle cx="15" cy="9" r="2.5"/><circle cx="12" cy="13.5" r="2.5"/>' +
      '<circle cx="8.5" cy="14" r="2.2"/><circle cx="15.5" cy="14" r="2.2"/><circle cx="12" cy="18.5" r="2.3"/><path d="M12 6.5V3l2-1"/>' },
  { id: 'pomegranate', name: { prs: 'انار', ps: 'انار', en: 'Pomegranate' },
    d: '<circle cx="12" cy="14" r="7.5"/><path d="M9.5 6.8 9 4l2 1.3L12 3.5l1 1.8L15 4l-.5 2.8"/>' },
  { id: 'mountain', name: { prs: 'کوه', ps: 'غر', en: 'Mountain' },
    d: '<path d="M2 20 9 7l4 7 2-3 7 9z"/><path d="m7.2 10.4 1.8 1.3 1.6-1.1"/>' },
  { id: 'boat', name: { prs: 'کشتی', ps: 'بېړۍ', en: 'Boat' },
    d: '<path d="M3 15h18l-3 5H6z"/><path d="M12 3v12"/><path d="M12 4l6 9h-6"/><path d="M12 6 7.5 13H12"/>' },
  { id: 'umbrella', name: { prs: 'چتری', ps: 'چترۍ', en: 'Umbrella' },
    d: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v-1"/>' },
  { id: 'bell', name: { prs: 'زنگ', ps: 'زنګ', en: 'Bell' },
    d: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M12 3v2"/>' },
];

export const IDS = ALIASES.map((a) => a.id);
const by = (id) => ALIASES.find((a) => a.id === id) || null;

export const known = (id) => !!by(id);

// a picture no learner on this phone has yet, picked at random among the free ones; when all twelve are taken,
// any picture (the server's number still tells two Books apart)
export function pickFree(used = [], rand = Math.random) {
  const taken = new Set(used);
  const free = IDS.filter((id) => !taken.has(id));
  const from = free.length ? free : IDS;
  return from[Math.floor(rand() * from.length) % from.length];
}

export function aliasName(id, lang = 'prs') {
  const a = by(id);
  return a ? a.name[lang] || a.name.prs : '';
}

// the picture as an inline SVG element, in the current text colour
export function aliasIcon(id, size = 28, sw = 2) {
  const a = by(id) || by('book');
  const t = document.createElement('template');
  t.innerHTML = `<svg class="i alias a-${a.id}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${a.d}</svg>`;
  return t.content.firstChild;
}
