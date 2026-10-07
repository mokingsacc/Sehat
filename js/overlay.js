// Editor changes as an "overlay" on top of the book that came with the app (see docs/EDITOR_AND_RELEASES.md).
// Shared by the app (js/app.js applies an overlay to its own book) and the server (server/worker.js works out the
// overlay when the editor publishes, and merges a new app release into the editor's draft).
// The book is cut into "units" that are each replaced whole: one topic, one topic list, the home screen, one
// interface text, one spoken interface line, the list of places, one page's symptom-finder words. A unit from the editor carries a fingerprint of the
// app's version it was edited from (base) and the time of the last save (ts). On the phone it is used when the app's
// own unit is still that base (the app did not change it), or when the editor saved it after the app was built.
// So an app release never hides the editor's other changes, and a publish never undoes a release's other fixes.
// Plain ES2018 (old Android phones): no ?? or ?. and no Object.fromEntries.
export const FORMAT = 1;
const LISTS = ['children', 'women', 'everyone', 'kit', 'emergency'];
const PACKS = ['urgent', 'children', 'women', 'everyone'];
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// FNV-1a over the UTF-16 code units: a short, fast fingerprint (not for security)
export function hash(s) {
  let h = 0x811c9dc5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
export const jsonOf = (v) => (v === undefined || v === null ? '' : JSON.stringify(v));
export const fp = (v) => hash(jsonOf(v));

// every unit key a book has
export function unitKeys(b) {
  const k = [];
  for (const id of Object.keys((b && b.topics) || {})) k.push('topic:' + id);
  for (const s of LISTS) if (b && b.sections && Array.isArray(b.sections[s])) k.push('list:' + s);
  if (b && b.config && Array.isArray(b.config.home)) k.push('home');
  for (const id of Object.keys((b && b.ui) || {})) k.push('ui:' + id);
  for (const id of Object.keys((b && b.narration) || {})) if (id.indexOf('ui.') === 0 || id.indexOf('anim.') === 0) k.push('say:' + id);
  if (b && b.facilities && Array.isArray(b.facilities.facilities)) k.push('facilities');
  for (const id of Object.keys((b && b.search && b.search.pages) || {})) k.push('search:' + id);
  return k;
}
export function getUnit(b, k) {
  if (!b) return undefined;
  const i = k.indexOf(':'), kind = i < 0 ? k : k.slice(0, i), id = i < 0 ? '' : k.slice(i + 1);
  if (kind === 'topic') return own(b.topics, id) ? b.topics[id] : undefined;
  if (kind === 'list') return b.sections && own(b.sections, id) ? b.sections[id] : undefined;
  if (kind === 'home') return b.config ? b.config.home : undefined;
  if (kind === 'ui') return own(b.ui, id) ? b.ui[id] : undefined;
  if (kind === 'say') return own(b.narration, id) ? b.narration[id] : undefined;
  if (kind === 'facilities') return b.facilities ? b.facilities.facilities : undefined;
  if (kind === 'search') return b.search && own(b.search.pages, id) ? b.search.pages[id] : undefined;
  return undefined;
}
// v undefined or null removes the unit (a deleted topic)
export function setUnit(b, k, v) {
  const i = k.indexOf(':'), kind = i < 0 ? k : k.slice(0, i), id = i < 0 ? '' : k.slice(i + 1);
  const gone = v === undefined || v === null;
  const put = (o, key) => { if (gone) delete o[key]; else o[key] = v; };
  if (kind === 'topic') put(b.topics = b.topics || {}, id);
  else if (kind === 'list') put(b.sections = b.sections || {}, id);
  else if (kind === 'home') { b.config = b.config || {}; if (gone) delete b.config.home; else b.config.home = v; }
  else if (kind === 'ui') put(b.ui = b.ui || {}, id);
  else if (kind === 'say') put(b.narration = b.narration || {}, id);
  else if (kind === 'facilities') b.facilities = Object.assign({}, b.facilities || {}, { facilities: gone ? [] : v });
  else if (kind === 'search') { b.search = b.search || { version: 1, pages: {} }; put(b.search.pages = b.search.pages || {}, id); }
}
// the narration ids that belong to a topic: "<id>.title" and "<id>.<anything>"
export const topicSay = (tid, id) => id === tid + '.title' || id.indexOf(tid + '.') === 0;

// Server: the units where the draft differs from the base it was imported from.
export function diffUnits(draft, base, edits) {
  const keys = new Set(unitKeys(draft).concat(unitKeys(base))), out = [];
  for (const k of keys) {
    const dv = getUnit(draft, k), bv = getUnit(base, k);
    if (jsonOf(dv) === jsonOf(bv)) continue;
    out.push({ k, v: dv === undefined ? null : dv, base: fp(bv), ts: (edits && +edits[k]) || 0 });
  }
  return out;
}
// Server: bring a new app book into the editor's draft. Units the editor did not change (draft = base) take the
// app's new version; units the editor changed keep the editor's version. Without a known base (a draft from
// before this existed), every unit that differs from the app is kept and listed, because nobody can tell who
// changed it. Returns the new draft and the lists of kept and both-changed units.
export function rebase(app, draft, base) {
  const out = JSON.parse(JSON.stringify(app)), kept = [], both = [];
  const keys = new Set(unitKeys(app).concat(unitKeys(draft)).concat(base ? unitKeys(base) : []));
  for (const k of keys) {
    const dv = getUnit(draft, k), av = getUnit(app, k);
    if (base) {
      const bv = getUnit(base, k);
      if (jsonOf(dv) === jsonOf(bv)) continue; // the editor did not change it: the app's version stays
      if (jsonOf(av) !== jsonOf(bv) && jsonOf(av) !== jsonOf(dv)) both.push(k);
    } else if (jsonOf(dv) === jsonOf(av)) continue;
    setUnit(out, k, dv);
    kept.push(k);
  }
  return { book: out, kept, both };
}

// App: the shipped book with the overlay's units applied. Never changes "shipped".
// Returns {book, used: [unit keys], skipped: [unit keys the app changed after the editor did]}.
export function applyOverlay(shipped, ov) {
  const b = JSON.parse(JSON.stringify(shipped)), used = [], skipped = [];
  if (!ov || ov.format !== FORMAT || !Array.isArray(ov.units)) return { book: b, used, skipped };
  const built = Date.parse(shipped.built) || 0, say = (ov.say && typeof ov.say === 'object') ? ov.say : {};
  const take = (u) => fp(getUnit(shipped, u.k)) === u.base || (+u.ts || 0) > built;
  const order = [];
  // topics first, then the lists that name them, then everything else
  const rank = (k) => (k.indexOf('topic:') === 0 ? 0 : k.indexOf('list:') === 0 ? 1 : 2);
  const units = ov.units.filter((u) => u && typeof u.k === 'string').sort((a, c) => rank(a.k) - rank(c.k));
  // topics the Emergency screen opens are never removed by the overlay
  const needed = new Set();
  for (const a of (shipped.config && shipped.config.emergency) || []) for (const t of [a.cpr].concat(a.topics || [])) if (t) needed.add(t);
  for (const u of units) {
    if (!take(u)) { skipped.push(u.k); continue; }
    const tid = u.k.indexOf('topic:') === 0 ? u.k.slice(6) : null;
    // the vaccine page is only changed by app releases
    if (tid === 'vaccines' || (tid && !u.v && needed.has(tid))) { skipped.push(u.k); continue; }
    setUnit(b, u.k, u.v);
    used.push(u.k);
    if (tid) { // the topic's spoken lines come with it
      for (const id of Object.keys(b.narration || {})) if (topicSay(tid, id)) delete b.narration[id];
      if (u.v) for (const id of Object.keys(say)) if (topicSay(tid, id)) { b.narration[id] = say[id]; order.push(id); }
    }
  }
  // lists name only topics that exist, each once; a deleted topic leaves the lists
  for (const s of LISTS) if (b.sections && Array.isArray(b.sections[s])) {
    const seen = new Set();
    b.sections[s] = b.sections[s].filter((t) => own(b.topics, t) && !seen.has(t) && seen.add(t));
  }
  // recording order and download packs: new spoken lines go with their topic
  if (Array.isArray(b.order)) {
    const have = new Set(b.order);
    b.order = b.order.filter((k) => own(b.narration, k));
    for (const k of order) if (!have.has(k)) { b.order.push(k); have.add(k); }
  }
  if (b.packs && b.packs.ids) {
    const inPack = new Set();
    for (const p of PACKS) for (const k of b.packs.ids[p] || []) inPack.add(k);
    const urgentTopics = new Set((b.config && b.config.urgentTopics) || []);
    for (const k of order) {
      if (inPack.has(k)) continue;
      const tid = k.split('.')[0], t = b.topics[tid] || {};
      const urgentBox = (t.blocks || []).some((x) => x && x.type === 'alert' && x.level === 'urgent' && (x.id === k || (x.items || []).some((it) => it && it.id === k)));
      const p = k === tid + '.title' || urgentTopics.has(tid) || urgentBox ? 'urgent'
        : ['children', 'women', 'everyone'].filter((s) => ((b.sections || {})[s] || []).indexOf(tid) >= 0)[0] || 'everyone';
      (b.packs.ids[p] = b.packs.ids[p] || []).push(k);
      inPack.add(k);
    }
  }
  // clips uploaded in the editor, used only while the spoken text is still the text they were recorded for
  const audio = (ov.audio && typeof ov.audio === 'object') ? ov.audio : {};
  b.audio = b.audio || {};
  for (const slot of Object.keys(audio)) {
    const lg = slot.slice(0, 2), clips = audio[slot] || {};
    for (const id of Object.keys(clips)) {
      const c = clips[id], n = (b.narration || {})[id];
      if (!Array.isArray(c) || typeof c[0] !== 'string' || !n || hash(String(n[lg] || '')) !== c[1]) continue;
      (b.audio[slot] = b.audio[slot] || {})[id] = c[0];
    }
  }
  b.edition = typeof ov.version === 'string' ? ov.version : '';
  return { book: b, used, skipped };
}
