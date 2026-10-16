// "Nearest clinic" (#/near): every clinic and hospital of Samangan (content/src/facilities.json) on a drawn map of
// the province, with the list under it; and "Check the clinics" (#/check): the same places with a few big buttons
// for people in Samangan to say whether each one is really there and open (Mo, 16 Oct 2026: "they may lose trust
// in the app if it shows them the wrong clinic"). Plain ES module.
//
// How sure the app is about each place is shown, never hidden: a solid pin is a known building; a white pin with a
// dashed edge is a village or a town whose building is not known yet ("where": village, district); a place with no
// position is in the list only. Each card says whether people in Samangan have checked it.
//
// The map (content/map.json, made by the map tools in the video/map build folder): the main roads, rivers and town
// names, small enough to ship in the APK, so it works offline from the first minute. The shaded mountains
// (maps/relief.webp) and the village roads and names (maps/roads-detail.json) come from the website the first time the
// page is opened online and stay on the phone (Cache Storage). Map units: 1 = 10 m; x east, y south.
//
// Location: only when the person presses "Find where I am" (the phone asks first). It stays on the phone: the
// distances are worked out here and nothing about it is counted or sent. On the check page, "I am at this place now"
// sends that one position with that place's answers, and says so.
import { toJalali } from './jalali.js';

const MAP_CACHE = 'fhb-map-v1';
// private places (you pay): purple; hospitals: blue; government clinics: green
const PRIV = /^(private-|lab$|xray$|ultrasound$|dental$|eye$|physio$|pharmacy$|midwife$)/;
const KIND = (f) => (PRIV.test(f.type || '') ? 'p' : /hospital|special/.test(f.type || '') ? 'h' : 'c'); // special: the trauma hospital in Kunduz
// the order of the government clinics in a list: the biggest first
const RANK = { 'provincial-hospital': 0, 'regional-hospital': 0, 'district-hospital': 1, 'chc-plus': 2, chc: 2, bhc: 3, shc: 4, fhh: 5, maternity: 5, special: 6, mht: 7 };
const GLYPH = { // the signs on the pins: a house with a cross for hospitals, a cross for clinics
  h: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 20.5v-10L12 4.8l7.5 5.7v10z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M10.9 10.2h2.2v2.6h2.6V15h-2.6v2.6h-2.2V15H8.3v-2.2h2.6z" fill="currentColor"/></svg>',
  c: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 4h5.2v5.4H20v5.2h-5.4V20H9.4v-5.4H4V9.4h5.4z" fill="currentColor"/></svg>',
  p: '',
};
const ARROW = (deg) => `<svg viewBox="0 0 24 24" style="transform:rotate(${Math.round(deg)}deg)" aria-hidden="true"><path d="M12 2 19 21 12 17 5 21z" fill="currentColor"/></svg>`;
const PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7z" fill="currentColor"/><circle cx="12" cy="9.5" r="2.6" fill="#fff"/></svg>';
const ANS = ['yes', 'no', 'dk'];

export function distKm(a, b) {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
// Google Maps: the way from here to the place (opens the Google Maps app when the phone has it)
export const wayUrl = (f) => `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`;

export function initClinics(ctx) {
  const { S, esc, T, L, num, ic, I, spk, play, track, listenBar, top, toast, store, openerTab, groupHead, render, siteBase, REC, askVoice } = ctx;
  const M = { map: null, loading: null, extras: null, relief: '', detail: null, view: null, sel: null, fit: '', pos: store.get('lastPos', null), busy: false, dist: store.get('nearDist', null), priv: false, live: null, sized: false };
  // the check page: the answers so far, kept on the phone until Send ({id: {open, pin, here, text, voice, d, ts}})
  const C = { a: store.get('chk', {}), dist: store.get('chkDist', null), busy: '', rec: null, recFac: '', chunks: [], stream: null, asked: false, sending: false, typed: false };
  const say = (id) => L(S.book.narration[id]);
  const has = (id) => !!S.book.narration[id];
  const sayBlk = (id, cls = 'blk lead') => (has(id) ? `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(say(id))}</div>${spk(id)}</div>` : '');
  const book = () => S.book.facilities || {};
  const listed = () => (book().facilities || []).filter((f) => f.status !== 'closed');
  const placed = (f) => f.lat != null && f.lon != null;
  const districts = () => book().districts || [];
  const distName = (id) => { const d = districts().find((x) => x.id === id); return d ? L(d.name) : ''; };
  const kindText = (f) => T(S.book.ui['ft_' + f.type] ? 'ft_' + f.type : 'ft_other');
  // the district the family chose for the disease watch (Aybak city is in Aybak here)
  const homeDist = () => { const d = String(store.get('district', '') || '').replace(/-city$/, ''); return districts().some((x) => x.id === d) ? d : ''; };
  const nearDist = () => (M.dist == null ? homeDist() : M.dist);
  const chkDist = () => (C.dist == null ? homeDist() : C.dist);
  const byRank = (a, b) => (KIND(a) === 'p') - (KIND(b) === 'p') || (RANK[a.type] == null ? 9 : RANK[a.type]) - (RANK[b.type] == null ? 9 : RANK[b.type]) || L(a.name).localeCompare(L(b.name));
  // a date as people there say it: the solar month and year (2026-03 = Hut 1404); a year alone: the solar year it mostly is
  function when(s) {
    const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(s || '')); if (!m) return '';
    if (!m[2]) return num(S.lang === 'en' ? +m[1] : +m[1] - 621);
    const j = toJalali(new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15, 12));
    return `${m[3] ? num(j.jd) + ' ' : ''}${S.book.months[S.lang][j.jm - 1]} ${num(j.jy)}`;
  }
  const kmText = (f, d) => esc(T(f.where === 'building' ? 'km' : 'kmAbout', { n: num(d < 10 ? d.toFixed(1) : Math.round(d)) }));

  /* ---------- the map's data ---------- */
  function loadMap() {
    if (M.map) return Promise.resolve(M.map);
    if (!M.loading) M.loading = fetch('content/map.json').then((r) => (r.ok ? r.json() : null)).then((m) => { M.map = m; return m; }).catch(() => { M.loading = null; return null; });
    return M.loading;
  }
  const xy = (lon, lat) => { const p = M.map.proj, c = Math.cos(p.latc * Math.PI / 180); return [(lon - p.lon0) * c * p.k, (p.lat1 - lat) * p.k]; };
  // the shaded mountains and the village roads and names: from the phone's cache, or downloaded once (any connection:
  // the person opened this page; about 340 KB). Inside the Android app they come from the website (siteBase).
  function extras() {
    if (M.extras) return M.extras;
    const m = M.map, base = (siteBase && siteBase()) || new URL('./', location.href).href;
    const url = (f) => new URL(f, base).href;
    const canCache = typeof caches !== 'undefined' && !!caches.open;
    const get = async (f, type) => {
      const u = url(f);
      if (canCache) { try { const c = await caches.open(MAP_CACHE); const hit = await c.match(u); if (hit) return type === 'json' ? hit.json() : hit.blob(); } catch (e) { /* no cache: fetch */ } }
      if (navigator.onLine === false) return null;
      const r = await fetch(u); if (!r.ok) return null;
      if (canCache) { try { const c = await caches.open(MAP_CACHE); await c.put(u, r.clone()); } catch (e) { /* a full phone: used this time only */ } }
      return type === 'json' ? r.json() : r.blob();
    };
    M.extras = Promise.all([
      m.relief ? get(m.relief, 'blob').then((b) => { if (b) M.relief = URL.createObjectURL(b); }).catch(() => {}) : null,
      m.detail ? get(m.detail, 'json').then((d) => { if (d && d.roads) M.detail = d; }).catch(() => {}) : null,
    ]).then(() => { if (!M.relief || !M.detail) M.extras = null; }); // something did not come: try again next time
    // old versions of the two files are dropped from the cache once the new ones are in
    M.extras.then(() => { if (!canCache || !M.relief || !M.detail) return; caches.open(MAP_CACHE).then((c) => c.keys().then((ks) => ks.forEach((k) => { if (k.url !== url(m.relief) && k.url !== url(m.detail)) c.delete(k); }))).catch(() => {}); });
    return M.extras;
  }

  /* ---------- the cards ---------- */
  // how sure the app is about a place, in words: checked by people there, or not yet (with the date of the latest news)
  // no news for over two years and nobody has checked it: said plainly, it may have closed (tools/build.py says it too)
  function oldNews(f) {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(f.status_date || '')); if (f.checked || f.status === 'open' || !m) return '';
    const t = new Date(+m[1], m[2] ? +m[2] - 1 : 5, 15); if (Date.now() - t.getTime() < 730 * 864e5) return '';
    return num(S.lang === 'en' ? +m[1] : m[2] ? toJalali(t).jy : +m[1] - 621);
  }
  function trustLine(f) {
    if (f.checked) return `<span class="ftrust ok">${ic('check')}${esc(T('facChecked', { d: when(f.checked) }))}</span>`;
    const y = oldNews(f); if (y) return `<span class="ftrust old">${esc(T('facOld', { y }))}</span>`;
    return `<span class="ftrust">${esc(f.status_date ? T('facNews', { d: when(f.status_date) }) : T('facNotChecked'))}</span>`;
  }
  // where the place is, in words, when the map cannot show the building
  const approxLine = (f) => (f.where === 'building' ? '' : `<div class="approxline">${esc(T(f.where === 'village' ? 'facNearVillage' : f.where === 'district' ? 'facInTown' : 'facPlaceUnknown'))}</div>`);
  const pinBadge = (f, n) => { const k = KIND(f); return `<span class="fpin k-${k}${f.where === 'building' ? '' : ' approx'}">${n ? `<b>${num(n)}</b>` : GLYPH[k]}</span>`; };
  const whereText = (f) => [f.place ? L(f.place) : '', distName(f.district)].filter(Boolean).join(' · ');
  function wayBtn(f) {
    if (!placed(f)) return '';
    const label = f.where === 'building' ? 'directions' : f.where === 'village' ? 'wayVillage' : 'wayTown';
    return `<a class="sbtn" href="${wayUrl(f)}" target="_blank" rel="noopener" data-cl="way" data-fac="${esc(f.id)}">${PIN_ICON}${esc(T(label))}</a>`;
  }
  function card(r, n) {
    const { f, d, b } = r, sid = 'ui.fac.' + f.id, k = KIND(f), w = whereText(f);
    const svc = (f.services || []).map((s) => `<span class="svc">${esc(T('svc_' + s))}</span>`).join('');
    return `<div class="fac k-${k}${M.sel === f.id ? ' sel' : ''}" id="fac-${esc(f.id)}"${has(sid) ? ` data-block="${esc(sid)}"` : ''}>
      <div class="fh">${pinBadge(f, n)}<b class="fname">${esc(L(f.name))}</b>${has(sid) ? spk(sid) : ''}</div>
      <div class="fsub">${d != null ? `<span class="dist">${ARROW(b)}${kmText(f, d)}</span>` : ''}<span class="muted">${esc(kindText(f))}${w ? ' · ' + esc(w) : ''}</span></div>${approxLine(f)}
      ${svc ? `<div class="svcs">${svc}</div>` : ''}<div class="ftrow">${trustLine(f)}</div>
      ${placed(f) ? `<div class="row2">${wayBtn(f)}<button class="sbtn ghost" data-cl="show" data-fac="${esc(f.id)}">${esc(T('onMap'))}</button></div>` : ''}</div>`;
  }
  // the district buttons: on the list page "All" first; the check page asks for one district
  const chips = (cl, cur, all) => `<div class="dchips">${all ? `<button class="dchip" data-cl="${cl}" data-d="" aria-pressed="${!cur}">${esc(T('allDistricts'))}</button>` : ''}${districts().filter((x) => x.id !== 'outside' && x.id !== 'unknown').map((x) => `<button class="dchip" data-cl="${cl}" data-d="${esc(x.id)}" aria-pressed="${cur === x.id}">${esc(L(x.name))}</button>`).join('')}</div>`;
  const key = () => `<div class="mkey" data-block="ui.nearKey"><div class="kk"><span><i class="fpin k-h">${GLYPH.h}</i>${esc(T('kindH'))}</span><span><i class="fpin k-c">${GLYPH.c}</i>${esc(T('kindC'))}</span><span><i class="fpin k-p"></i>${esc(T('kindP'))}</span><span><i class="fpin k-c approx">${GLYPH.c}</i>${esc(T('kindApprox'))}</span></div>${spk('ui.nearKey')}</div>`;
  const mapBox = (mode) => `<div class="cmap" id="cmap" data-mode="${mode}"><div class="cm-msg">${esc(T('mapLoading'))}</div></div>`;

  /* ---------- #/near: the map and the list ---------- */
  function screen() {
    const ids = ['ui.nearLead'];
    let html = top(T('near')) + listenBar(ids) + sayBlk('ui.nearLead');
    html += `<button class="btn cl-go" data-cl="locate">${PIN_ICON} ${esc(M.busy ? T('locating') : T('findMe'))}</button>`;
    const tab = openerTab('home'); // Back goes to the screen that opened it, and its tab stays lit
    const all = listed();
    if (!all.length) return { html: html + `<p class="muted center">${esc(T('noFacilities'))}</p>`, nav: tab };
    const d = nearDist(), inD = (f) => !d || f.district === d, me = M.pos;
    html += mapBox('near') + key(); ids.push('ui.nearKey');
    html += chips('dist', d, true);
    const pubIn = all.filter((f) => KIND(f) !== 'p' && !f.outside && inD(f)).sort(byRank);
    const head = (key2, sid, extra) => { if (has(sid)) ids.push(sid); return groupHead(T(key2, extra), sid); };
    const cards = (list, numbered) => list.map((r, i) => { if (has('ui.fac.' + r.f.id)) ids.push('ui.fac.' + r.f.id); return card(r, numbered ? i + 1 : 0); }).join('');
    const plain = (list) => list.map((f) => ({ f, d: null, b: 0 }));
    if (me) { // with a position: the nearest places first, numbered as on the map; the district's unplaced ones after them
      const near = all.filter((f) => placed(f) && inD(f) && (M.priv || KIND(f) !== 'p')).map((f) => ({ f, d: distKm(me, f), b: bearing(me, f) })).sort((a, b) => a.d - b.d).slice(0, 20);
      html += head('nearHere', 'ui.nearHere') + cards(near, true);
      const myD = d || gpsDist(me) || homeDist() || (near.find((r) => !r.f.outside && KIND(r.f) !== 'p') || { f: {} }).f.district;
      const unplaced = all.filter((f) => !placed(f) && KIND(f) !== 'p' && f.district === myD).sort(byRank);
      if (unplaced.length) html += head('nearUnplaced', 'ui.nearUnplaced', { d: distName(myD) }) + cards(plain(unplaced));
    } else { // without: the hospitals, then the government clinics (by district when all are shown)
      const H = pubIn.filter((f) => KIND(f) === 'h'), Cl = pubIn.filter((f) => KIND(f) === 'c');
      if (H.length) html += head('kindHs', 'ui.nearH') + cards(plain(H));
      if (Cl.length) {
        html += head('kindCs', 'ui.nearC');
        if (d) { html += cards(plain(Cl)); const unk = all.filter((f) => KIND(f) !== 'p' && f.district === 'unknown').sort(byRank); if (unk.length && d !== 'unknown') html += `<h3 class="dsub">${esc(distName('unknown'))}</h3>` + cards(plain(unk)); }
        else for (const x of districts()) { const part = Cl.filter((f) => f.district === x.id); if (part.length) html += `<h3 class="dsub">${esc(L(x.name))}</h3>` + cards(plain(part)); }
      }
      if (!H.length && !Cl.length) html += `<p class="muted center">${esc(T('noFacilitiesHere'))}</p>`;
    }
    // the big hospitals outside Samangan, where doctors send people
    const out = all.filter((f) => f.outside && KIND(f) !== 'p');
    if (out.length && !me) html += head('kindOs', 'ui.nearO') + cards(plain(out));
    // private places (you pay): only when asked for, to keep the page short
    const priv = all.filter((f) => KIND(f) === 'p' && inD(f));
    if (priv.length) {
      if (M.priv && !me) html += head('kindPs', 'ui.nearP') + cards(plain(priv.sort(byRank)));
      html += `<button class="btn ghost" data-cl="priv">${esc(T(M.priv ? 'hidePrivate' : 'showPrivate', { n: num(priv.length) }))}</button>`;
    }
    ids.push('ui.nearTrust'); html += sayBlk('ui.nearTrust', 'blk tip');
    if (has('ui.nearHelp')) { ids.push('ui.nearHelp'); html += `<div class="srow" data-block="ui.nearHelp">${ic('talk')}<a class="grow" href="#/check"><div class="t">${esc(T('checkTitle'))}</div><div class="s">${esc(say('ui.nearHelp'))}</div></a>${spk('ui.nearHelp')}</div>`; }
    html += `<p class="muted center credit" style="font-size:13px" dir="ltr">${esc(T('mapCredit'))}</p>`; // the licences: shown, not read aloud
    return { html, nav: tab };
  }

  // the district someone is in, roughly: the nearest district town (the middle of the valley for Dara-i-Suf); the list
  // names the district, and its buttons choose another
  function gpsDist(p) {
    if (!M.map || !p) return '';
    const ids = new Set(districts().map((x) => x.id)), [x, y] = xy(p.lon, p.lat);
    let best = '', bd = Infinity;
    for (const l of M.map.labels || []) if (ids.has(l.id)) { const dd = Math.hypot(l.x - x, l.y - y); if (dd < bd) { bd = dd; best = l.id; } }
    return best;
  }

  /* ---------- #/check: is it right? ---------- */
  const answered = (v) => !!(v && (v.open || v.pin || v.here || v.voice || (v.text && v.text.trim())));
  const nAnswered = () => Object.keys(C.a).filter((k) => answered(C.a[k])).length;
  const nQueued = () => [...REC.keys].filter((k) => k.startsWith('chkq/')).length;
  function setA(id, patch) {
    C.a[id] = { ...(C.a[id] || {}), ...patch, ts: Date.now() };
    if (!C.a[id].d) C.a[id].d = chkDist() || '';
    store.set('chk', C.a);
  }
  const yn = (id, q) => { const v = (C.a[id] || {})[q] || ''; return `<div class="yn">${ANS.map((a) => `<button class="ynb ${a}" data-cl="ans" data-fac="${esc(id)}" data-q="${q}" data-a="${a}" aria-pressed="${v === a}">${esc(T('chk_' + a))}</button>`).join('')}</div>`; };
  const ask = (q, sid) => `<div class="chq" data-block="${esc(sid)}"><b>${esc(T(q))}</b>${spk(sid)}</div>`;
  function hereBox(id) {
    const v = C.a[id] || {}, h = v.here;
    const msg = C.busy === id ? T('locating') : h ? T(h.acc > 100 ? 'chkHereWeak' : 'chkHereOk', { n: num(h.acc) }) : '';
    return `<button class="sbtn here${h ? ' done' : ''}" data-cl="here" data-fac="${esc(id)}"${C.busy === id ? ' disabled' : ''}>${PIN_ICON}${esc(T('chkHere'))}</button>${msg ? `<div class="chkmsg${h && h.acc > 100 ? ' warn' : ''}">${h && h.acc <= 100 ? ic('check') : ''}${esc(msg)}</div>` : ''}`;
  }
  function noteBox(id, open) {
    const v = C.a[id] || {}, on = C.recFac === id;
    if (!open && !v.text && !v.voice) return `<button class="sbtn ghost notebtn" data-cl="note" data-fac="${esc(id)}">${esc(T('chkNote'))}</button>`;
    return `<div class="chknote"><button class="recbig small${on ? ' on' : ''}" data-cl="rec" data-fac="${esc(id)}" aria-label="${esc(T('fbRecord'))}">${on ? I.stop.replace('<svg', '<svg fill="#fff"') : I.mic}</button><div class="grow"><div class="muted">${esc(on ? T('recording') : v.voice ? T('fbRecorded') + ' ✓' : T('fbRecord'))}</div>
      <textarea data-chktext="${esc(id)}" rows="2" maxlength="1000" placeholder="${esc(T('chkWrite'))}">${esc(v.text || '')}</textarea></div></div>`;
  }
  function checkCard(f) {
    const id = f.id, sid = 'ui.fac.' + id, w = whereText(f), done = answered(C.a[id]);
    return `<div class="fac chkc k-${KIND(f)}${done ? ' done' : ''}" id="chk-${esc(id)}"${has(sid) ? ` data-block="${esc(sid)}"` : ''}>
      <div class="fh">${pinBadge(f, 0)}<b class="fname">${esc(L(f.name))}</b>${has(sid) ? spk(sid) : ''}</div>
      <div class="muted">${esc(kindText(f))}${w ? ' · ' + esc(w) : ''}</div>${approxLine(f)}<div class="ftrow">${trustLine(f)}</div>
      ${ask('chkOpen', 'ui.chkOpenQ')}${yn(id, 'open')}
      ${f.where === 'building' ? ask('chkPin', 'ui.chkPinQ') + yn(id, 'pin') : ''}
      <div class="chkrow">${hereBox(id)}${placed(f) ? `<button class="sbtn ghost" data-cl="show" data-fac="${esc(id)}">${esc(T('onMap'))}</button>` : ''}</div>
      ${noteBox(id, false)}</div>`;
  }
  function missingCard() {
    const id = 'new';
    return `<div class="fac chkc new${answered(C.a[id]) ? ' done' : ''}" id="chk-new" data-block="ui.checkMissing"><div class="fh"><span class="fpin k-c approx">+</span><b class="fname">${esc(T('chkMissing'))}</b>${spk('ui.checkMissing')}</div>
      <div class="muted">${esc(T('chkMissingSub'))}</div>${noteBox(id, true)}<div class="chkrow">${hereBox(id)}</div></div>`;
  }
  const sendBtn = () => { const n = nAnswered(); return `<button class="btn cl-go big" id="chksend" data-cl="send"${n ? '' : ' disabled'}>${esc(n ? T('chkSendN', { n: num(n) }) : T('chkSend'))}</button>`; };
  function check() {
    const ids = ['ui.check'];
    let html = top(T('checkTitle')) + listenBar(ids) + sayBlk('ui.check');
    const q = nQueued();
    if (q) html += `<div class="blk tip chkq">${ic('clock')}<div class="body">${esc(T('chkWaiting', { n: num(q) }))}</div></div>`;
    const d = chkDist();
    if (has('ui.checkDist')) ids.push('ui.checkDist');
    html += groupHead(T('chkChooseDist'), 'ui.checkDist') + chips('cdist', d, false);
    if (d) {
      html += mapBox('check');
      const list = listed().filter((f) => f.district === d).sort(byRank);
      html += list.length ? list.map(checkCard).join('') : `<p class="muted center">${esc(T('noFacilitiesHere'))}</p>`;
      // places whose district nobody knows yet: asked in every district
      const unk = listed().filter((f) => f.district === 'unknown').sort(byRank);
      if (unk.length) html += `<h3 class="dsub">${esc(distName('unknown'))}</h3>` + unk.map(checkCard).join('');
    }
    ids.push('ui.checkMissing'); html += missingCard();
    if (has('ui.checkSend')) { ids.push('ui.checkSend'); html += sayBlk('ui.checkSend', 'blk tip'); }
    html += sendBtn();
    return { html, nav: openerTab('home') };
  }
  // one card drawn again in its place (the answer buttons, the position, the voice note), without redrawing the page
  function repaint(id) {
    const el = document.getElementById('chk-' + id); if (!el) return;
    const f = listed().find((x) => x.id === id);
    const html = id === 'new' ? missingCard() : f ? checkCard(f) : '';
    if (!html) return;
    const open = !!el.querySelector('.chknote');
    el.outerHTML = html;
    if (open && id !== 'new') { const n = document.getElementById('chk-' + id); const b = n && n.querySelector('.notebtn'); if (b) b.outerHTML = noteBox(id, true); }
    const s = document.getElementById('chksend'); if (s) s.outerHTML = sendBtn();
  }
  // the typed notes are kept as they are typed (the page is not drawn again while typing)
  function typed(e) {
    const t = e.target; if (!t || !t.dataset || !t.dataset.chktext) return;
    setA(t.dataset.chktext, { text: t.value.slice(0, 1000) });
    const card2 = document.getElementById('chk-' + t.dataset.chktext); if (card2) card2.classList.toggle('done', answered(C.a[t.dataset.chktext]));
    const s = document.getElementById('chksend'); if (s) { const n = nAnswered(); s.disabled = !n; s.textContent = n ? T('chkSendN', { n: num(n) }) : T('chkSend'); }
  }
  // "I am at this place now": a fresh position (never one the phone kept from before), the most exact of the tries
  function here(id) {
    if (!navigator.geolocation) { toast(T('locFail')); return; }
    if (has('ui.checkHere') && !store.get('hereTold', false)) { store.set('hereTold', true); play(['ui.checkHere'], { quiet: true }); }
    C.busy = id; repaint(id);
    navigator.geolocation.getCurrentPosition((p) => {
      const h = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.max(1, Math.round(p.coords.accuracy || 0)) };
      const old = (C.a[id] || {}).here;
      if (!old || h.acc <= old.acc) setA(id, { here: h });
      C.busy = ''; repaint(id); track('check-here');
    }, () => { C.busy = ''; toast(T('locFail')); repaint(id); }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  }
  // a voice note about one place (at most a minute); asked first, like the feedback voice note
  async function rec(id) {
    if (C.rec && C.rec.state !== 'inactive') { const same = C.recFac === id; C.rec.stop(); if (same) return; }
    if (!C.asked) { if (!(await askVoice())) return; C.asked = true; }
    try { C.stream = C.stream || (await navigator.mediaDevices.getUserMedia({ audio: true })); } catch (e) { toast(T('micDenied')); return; }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', ''].find((t) => !t || (window.MediaRecorder && MediaRecorder.isTypeSupported(t)));
    const r = new MediaRecorder(C.stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined), chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      if (C.rec === r) { C.rec = null; C.recFac = ''; }
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      if (blob.size) { await REC.put('chkv/' + id, { blob }); setA(id, { voice: true }); }
      repaint(id);
    };
    C.rec = r; C.recFac = id; r.start(); setTimeout(() => { if (r.state === 'recording') r.stop(); }, 60000); repaint(id);
  }
  // Send: each answered place becomes one message, kept on the phone until the server has it
  async function send() {
    if (C.sending) return;
    const ids = Object.keys(C.a).filter((k) => answered(C.a[k])); if (!ids.length) return;
    C.sending = true;
    if (C.rec && C.rec.state !== 'inactive') C.rec.stop();
    let n = 0;
    for (const id of ids) {
      const v = C.a[id], vo = v.voice ? await REC.get('chkv/' + id) : null, blob = vo && vo.blob ? vo.blob : null;
      await REC.put('chkq/' + Date.now() + '-' + (n++) + '-' + id, { lang: S.lang, fac: id, d: v.d || '', open: v.open || '', pin: v.pin || '', here: v.here || null, text: (v.text || '').trim(), blob, type: blob ? blob.type : '' });
      if (v.voice) await REC.del('chkv/' + id);
    }
    C.a = {}; store.set('chk', C.a); track('check', { n: ids.length });
    const ok = await flush();
    C.sending = false; render(); scrollTo(0, 0);
    toast(T(ok ? 'chkSent' : 'chkSaved'));
    if (has('ui.checkThanks')) setTimeout(() => play(['ui.checkThanks'], { quiet: true }), 300);
  }
  // the waiting messages go when there is internet (also when the app opens and when the phone comes online)
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      const url = S.book.config && S.book.config.checkUrl; if (!url || !navigator.onLine) return false;
      let all = true;
      for (const k of [...REC.keys].filter((x) => x.startsWith('chkq/')).sort()) {
        const it = await REC.get(k); if (!it) continue;
        let audio = '';
        if (it.blob) { const buf = new Uint8Array(await it.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); audio = btoa(s); }
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ v: S.book.version, lang: it.lang, fac: it.fac, d: it.d, open: it.open, pin: it.pin, here: it.here, text: it.text, type: it.type, audio }) });
          if (r.ok || r.status === 400) await REC.del(k); // 400: the server cannot use it, so it is not kept
          else all = false;
        } catch (e) { return false; }
      }
      return all;
    })().then((ok) => { flushing = null; return ok; }, () => { flushing = null; return false; });
    return flushing;
  }

  /* ---------- drawing the map ---------- */
  // the roads and rivers as one SVG (line widths stay the same on screen at every zoom)
  function baseSvg() {
    const m = M.map, roads = (M.detail && M.detail.roads) || m.roads, water = (M.detail && M.detail.water) || m.water;
    const w = water.map(([c, d]) => `<path class="w${c}" d="${d}"/>`).join('');
    const r = [4, 3, 2, 1].map((c) => roads.filter((x) => x[0] === c).map((x) => x[1]).join(''));
    // each road class twice: a darker edge, then the road (village roads and tracks as one thin line)
    const rd = `<path class="r4" d="${r[0]}"/><path class="e3" d="${r[1]}"/><path class="r3" d="${r[1]}"/><path class="e2" d="${r[2]}"/><path class="r2" d="${r[2]}"/><path class="e1" d="${r[3]}"/><path class="r1" d="${r[3]}"/>`;
    return `<svg class="cm-base" preserveAspectRatio="none" aria-hidden="true"><rect class="cm-land" x="-2000" y="-2000" width="${m.w + 4000}" height="${m.h + 4000}"/>${M.relief ? `<image href="${M.relief}" x="0" y="0" width="${m.w}" height="${m.h}" preserveAspectRatio="none"/>` : ''}<g class="cm-w">${w}</g><g class="cm-r">${rd}</g></svg>`;
  }
  const mapPins = (mode) => listed().filter((f) => placed(f) && (mode === 'check' || M.priv || KIND(f) !== 'p'));
  function overlays(mode) {
    const m = M.map, me = mode === 'near' ? M.pos : null, d = mode === 'check' ? chkDist() : nearDist();
    const near = me ? listed().filter((f) => placed(f) && (!d || f.district === d) && (M.priv || KIND(f) !== 'p')).map((f) => [f.id, distKm(me, f)]).sort((a, b) => a[1] - b[1]).slice(0, 20).map((x) => x[0]) : [];
    const nm = (x) => (S.lang === 'en' ? x[4] || x[3] : (S.lang === 'ps' ? x[6] : x[5]) || x[3]);
    const vil = M.detail && M.detail.places ? M.detail.places.map((x) => `<span class="cm-lab v${x[2]}" data-x="${x[0]}" data-y="${x[1]}"><i></i><b>${esc(nm(x))}</b></span>`).join('') : '';
    const labels = (m.labels || []).map((x) => `<span class="cm-lab ${x.k}" data-x="${x.x}" data-y="${x.y}">${x.k === 'area' ? '' : '<i></i>'}<b>${esc(L(x.n))}</b></span>`).join('');
    // the far-away places first, so the near ones and the chosen one are drawn on top
    const over = (f) => (f.id === M.sel ? 3 : KIND(f) === 'p' ? 0 : f.where === 'building' ? 2 : 1);
    const list = mapPins(mode).sort((a, b) => over(a) - over(b));
    const pins = list.map((f) => { const [x, y] = xy(f.lon, f.lat), k = KIND(f), n = near.indexOf(f.id) + 1;
      return `<button class="pin k-${k}${f.where === 'building' ? '' : ' approx'}${M.sel === f.id ? ' sel' : ''}${d && f.district !== d && !f.outside ? ' dim' : ''}" data-fac="${esc(f.id)}" data-x="${Math.round(x)}" data-y="${Math.round(y)}" aria-label="${esc(L(f.name))}">${n ? `<b>${num(n)}</b>` : GLYPH[k]}</button>`; }).join('');
    let mine = '';
    if (me) { const [x, y] = xy(me.lon, me.lat); mine = `<span class="cm-me" data-x="${Math.round(x)}" data-y="${Math.round(y)}"><i></i></span>`; }
    return `<div class="cm-labs">${vil}${labels}</div><div class="cm-pins">${pins}${mine}</div>`;
  }
  // the box's size in CSS pixels, and the zoom limits: from all of the map down to 20 m a pixel
  const size = (el) => [el.clientWidth || 320, el.clientHeight || 360];
  function limits(el) { const [w, h] = size(el); return { min: 2, max: Math.max(M.map.w / w, M.map.h / h) * 1.02 }; }
  function fitBox(el, x0, y0, x1, y1, pad = 40, bot = 0) { // bot: room at the bottom for the place's card
    const [w, h] = size(el), lim = limits(el), ctl = 58; // the zoom buttons on the right
    const s = Math.min(lim.max, Math.max(lim.min, Math.max((x1 - x0) / Math.max(40, w - pad * 2 - ctl), (y1 - y0) / Math.max(40, h - pad * 2 - bot))));
    return { cx: (x0 + x1) / 2 + (ctl / 2) * s, cy: (y0 + y1) / 2 + (bot / 2) * s, s };
  }
  const box = (pts, m) => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
  // what the map shows first: you and the nearest places, or the chosen district, or Samangan
  function startView(el, mode) {
    const list = mapPins(mode), d = mode === 'check' ? chkDist() : nearDist();
    if (mode === 'near' && M.pos) {
      const me = xy(M.pos.lon, M.pos.lat);
      const near = list.filter((f) => !d || f.district === d).map((f) => [xy(f.lon, f.lat), distKm(M.pos, f)]).sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
      const c = el.querySelector('.cm-card'), bot = c && !c.hidden ? Math.min(c.offsetHeight + 12, size(el)[1] * 0.55) : 0; // room above the place's card
      const [x0, y0, x1, y1] = box([me, ...near], 600); return fitBox(el, x0, y0, x1, y1, 34, bot);
    }
    const inD = d ? list.filter((f) => f.district === d).map((f) => xy(f.lon, f.lat)) : [];
    if (d && inD.length) { const [x0, y0, x1, y1] = box(inD, inD.length > 1 ? 800 : 2500); return fitBox(el, x0, y0, x1, y1, 30); }
    // all of Samangan: its district towns and every place in it
    const sam = M.map.labels.filter((x) => x.k === 'district' || x.k === 'area').map((x) => [x.x, x.y]).concat(list.filter((f) => !f.outside).map((f) => xy(f.lon, f.lat)));
    const [x0, y0, x1, y1] = box(sam, 1200); return fitBox(el, x0, y0, x1, y1, 12);
  }
  // live: while a finger moves the map, the drawing is only moved and stretched (fast on slow phones); when the finger
  // lifts, it is drawn again sharp at the new place
  function setView(el, v, live) {
    const [w, h] = size(el), lim = limits(el), m = M.map;
    const s = Math.min(lim.max, Math.max(lim.min, v.s));
    const cx = Math.min(m.w, Math.max(0, v.cx)), cy = Math.min(m.h, Math.max(0, v.cy)); // keep some of the map in the box
    const x0 = cx - (w * s) / 2, y0 = cy - (h * s) / 2, svg = el.querySelector('.cm-base');
    if (live && M.view) {
      const c = M.view, cx0 = c.cx - (w * c.s) / 2, cy0 = c.cy - (h * c.s) / 2;
      if (svg) svg.style.transform = `translate(${((cx0 - x0) / s).toFixed(1)}px,${((cy0 - y0) / s).toFixed(1)}px) scale(${(c.s / s).toFixed(4)})`;
      M.live = { cx, cy, s };
    } else {
      M.view = { cx, cy, s }; M.live = null;
      if (svg) { svg.setAttribute('viewBox', `${x0} ${y0} ${w * s} ${h * s}`); svg.style.transform = ''; }
      // zoom steps: small roads close in, village names closer still, the area names only from far out, and the
      // small town names hidden only when the whole province is in view
      el.classList.toggle('z-xfar', s > 60); el.classList.toggle('z-far', s > 25); el.classList.toggle('z-mid', s <= 25 && s > 12); el.classList.toggle('z-near', s <= 12); el.classList.toggle('z-vil', s <= 5.5);
      spread(el, x0, y0, s);
    }
    el.querySelectorAll('[data-x]').forEach((p) => { const px = (p.dataset.x - x0) / s + (+p.dataset.ox || 0), py = (p.dataset.y - y0) / s + (+p.dataset.oy || 0); const out = px < -60 || py < -40 || px > w + 60 || py > h + 40; p.hidden = out; if (!out) p.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`; });
    if (!live) declutter(el);
  }
  // pins that would sit on each other at this zoom move apart in a small ring round their middle (the most important
  // place first), so each one can be pressed; closer in, they come apart by themselves and go back to their own place
  // (not the small private ones: there can be dozens in one town, so they stay on their own spot, under the others)
  function spread(el, x0, y0, s) {
    el.querySelectorAll('.pin.k-p').forEach((p) => { p.dataset.ox = 0; p.dataset.oy = 0; });
    const ps = [...el.querySelectorAll('.pin:not(.k-p)')].map((p) => ({ p, x: (p.dataset.x - x0) / s, y: (p.dataset.y - y0) / s, r: 16, g: null })).reverse(); // drawn last = most important
    for (const a of ps) {
      if (a.g) continue;
      a.g = [a];
      for (const b of ps) if (!b.g && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 2) { b.g = a.g; a.g.push(b); }
    }
    for (const a of ps) {
      if (a.g[0] !== a) continue;
      const n = a.g.length, mx = a.g.reduce((t, q) => t + q.x, 0) / n, my = a.g.reduce((t, q) => t + q.y, 0) / n, R = Math.max(20, (n * 38) / (2 * Math.PI));
      a.g.forEach((q, i) => {
        const t = (i / n) * 2 * Math.PI - Math.PI / 2;
        q.p.dataset.ox = n > 1 ? Math.round(mx + Math.cos(t) * R - q.x) : 0; q.p.dataset.oy = n > 1 ? Math.round(my + Math.sin(t) * R - q.y) : 0;
      });
    }
  }
  // a town's name under a pin goes above its dot, or to its side; village names that would sit on top of each other
  // or on a pin: the town or the bigger village keeps its name. One measuring pass, then the choices (fast on slow phones)
  function declutter(el) {
    const R = (q) => q.getBoundingClientRect(), hit = (r, t) => r.left < t.right + 2 && r.right > t.left - 2 && r.top < t.bottom && r.bottom > t.top;
    const main = [...el.querySelectorAll('.cm-lab.district:not([hidden]), .cm-lab.city:not([hidden]), .cm-lab.town:not([hidden])')].sort((a, b) => a.classList.contains('town') - b.classList.contains('town')); // district towns first
    const vil = el.classList.contains('z-vil') ? [...el.querySelectorAll('.cm-lab.v1:not([hidden]), .cm-lab.v2:not([hidden]), .cm-lab.v3:not([hidden])')] : [];
    main.forEach((p) => { p.classList.remove('off'); p.querySelector('b').style.transform = ''; }); vil.forEach((p) => p.classList.remove('off'));
    const pins = [...el.querySelectorAll('.pin:not([hidden])')].map(R), mr = main.map((p) => R(p.querySelector('b'))), vr = vil.map((p) => R(p.querySelector('b')));
    const bx = el.getBoundingClientRect(), dots = main.map((p) => R(p.querySelector('i'))).map((d) => ({ left: d.left - 2, right: d.right + 2, top: d.top - 2, bottom: d.bottom + 2 }));
    const taken = pins.concat(dots.filter((d) => d.right > d.left + 4)); // the pins and every town's dot: a name never sits on another town's dot
    main.forEach((p, i) => {
      const r = mr[i]; if (!r.width) return; // not shown at this zoom
      const w = r.width, h = r.height, mid = -(11 + h / 2); // the name sits 11px under its dot
      // under, over, right, left of the dot; a little further out; and round a ring of pins only when a pin covers the dot
      const ring = pins.some((t) => hit(dots[i], t)), gaps = ring ? [0, 14, 33] : [0, 14];
      const at = [].concat(...gaps.map((g) => [[0, g], [0, -(11 + h + 8 + g)], [w / 2 + 9 + g, mid], [-(w / 2 + 9 + g), mid]]));
      const fits = (q, j) => !j || (q.left >= bx.left + 2 && q.right <= bx.right - 2 && q.top >= bx.top + 2); // moved names stay in the box
      const k = at.find(([dx, dy], j) => { const q = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }; return fits(q, j) && !taken.some((t) => hit(q, t)); });
      if (!k && p.classList.contains('town')) { p.classList.add('off'); return; } // no room for a small town's name here
      if (!k) { taken.push(r); return; }
      if (k[0] || k[1]) p.querySelector('b').style.transform = `translateX(-50%) translate(${Math.round(k[0])}px,${Math.round(k[1])}px)`;
      taken.push({ left: r.left + k[0], right: r.right + k[0], top: r.top + k[1], bottom: r.bottom + k[1] });
    });
    vil.forEach((p, i) => { if (taken.some((t) => hit(vr[i], t))) p.classList.add('off'); else taken.push(vr[i]); });
  }
  function zoomAt(el, px, py, f) {
    const [w, h] = size(el), v = M.view, lim = limits(el), s2 = Math.min(lim.max, Math.max(lim.min, v.s * f));
    const ux = v.cx + (px - w / 2) * v.s, uy = v.cy + (py - h / 2) * v.s; // the point under the finger stays put
    setView(el, { cx: ux - (px - w / 2) * s2, cy: uy - (py - h / 2) * s2, s: s2 });
  }
  // the card over the map for the chosen place
  function selCard(el) {
    const b = el.querySelector('.cm-card'); if (!b) return;
    const f = listed().find((x) => x.id === M.sel); if (!f || !placed(f)) { b.hidden = true; return; }
    const d = M.pos && el.dataset.mode === 'near' ? distKm(M.pos, f) : null, sid = 'ui.fac.' + f.id;
    b.hidden = false;
    b.innerHTML = `<div class="fh">${pinBadge(f, 0)}<b class="fname">${esc(L(f.name).replace(/\s*\([^)]*\)\s*$/, ''))}</b>${has(sid) ? spk(sid) : ''}<button class="cm-x" data-cl="unsel" aria-label="${esc(T('close'))}">×</button></div><div class="fsub">${d != null ? `<span class="dist">${ARROW(bearing(M.pos, f))}${kmText(f, d)}</span>` : ''}<span class="muted">${esc(kindText(f))}${whereText(f) ? ' · ' + esc(whereText(f)) : ''}</span></div>${approxLine(f)}<div class="row2">${wayBtn(f)}<button class="sbtn ghost" data-cl="more" data-fac="${esc(f.id)}">${esc(T('more'))}</button></div>`;
  }
  function select(el, id, speak) {
    M.sel = id;
    el.querySelectorAll('.pin').forEach((p) => p.classList.toggle('sel', p.dataset.fac === id));
    document.querySelectorAll('.fac.sel').forEach((c) => c.classList.remove('sel'));
    const c = document.getElementById('fac-' + id) || document.getElementById('chk-' + id); if (c && id) c.classList.add('sel');
    selCard(el);
    if (speak && id && has('ui.fac.' + id)) play(['ui.fac.' + id], { quiet: true, stay: true });
  }
  // one finger moves the map, two fingers zoom; a tap on a place chooses it; the mouse wheel zooms on a computer
  function wire(el) {
    const pts = new Map(); let g = null, tapPin = null;
    const rect = () => el.getBoundingClientRect();
    const snap = () => { const p = [...pts.values()], r = rect(); const mx = p.reduce((a, q) => a + q[0], 0) / p.length - r.left, my = p.reduce((a, q) => a + q[1], 0) / p.length - r.top; const dd = p.length > 1 ? Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) : 0; return { mx, my, dd, v: { ...(M.live || M.view) }, moved: g ? g.moved : 0 }; };
    el.addEventListener('pointerdown', (e) => {
      if (!M.view || e.target.closest('.cm-ctl, .cm-card')) return;
      tapPin = pts.size ? null : e.target.closest('.pin');
      pts.set(e.pointerId, [e.clientX, e.clientY]); g = snap();
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* old browser */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const now = snap(), [w, h] = size(el);
      g.moved = Math.max(g.moved, Math.hypot(now.mx - g.mx, now.my - g.my), Math.abs(now.dd - g.dd));
      if (g.moved < 6) return;
      const f = pts.size > 1 && g.dd > 0 && now.dd > 0 ? g.dd / now.dd : 1, s2 = g.v.s * f;
      const ux = g.v.cx + (g.mx - w / 2) * g.v.s, uy = g.v.cy + (g.my - h / 2) * g.v.s;
      setView(el, { cx: ux - (now.mx - w / 2) * s2, cy: uy - (now.my - h / 2) * s2, s: s2 }, true);
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!pts.size) { if (M.live) setView(el, M.live); else if (g && g.moved < 6) { if (tapPin) select(el, tapPin.dataset.fac, true); else if (M.sel) select(el, null, false); } g = null; tapPin = null; } // a tap on the map itself closes the card
      else g = snap(); // a finger lifted in a pinch: carry on with the other one
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { if (!M.view) return; e.preventDefault(); const r = rect(); zoomAt(el, e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 1.3 : 1 / 1.3); }, { passive: false });
    el.addEventListener('dblclick', (e) => { if (!M.view) return; const r = rect(); zoomAt(el, e.clientX - r.left, e.clientY - r.top, 0.5); });
  }
  function draw(el) {
    const mode = el.dataset.mode;
    el.innerHTML = baseSvg() + overlays(mode) + `<div class="cm-ctl"><button data-cl="zin" aria-label="${esc(T('zoomIn'))}">+</button><button data-cl="zout" aria-label="${esc(T('zoomOut'))}">−</button><button data-cl="zall" aria-label="${esc(T('mapAll'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div class="cm-card" hidden></div>`;
    selCard(el); // first: the view leaves room for it
    const want = mode + '|' + (mode === 'near' && M.pos ? M.pos.lat + ',' + M.pos.lon : '') + '|' + (mode === 'check' ? chkDist() : nearDist());
    if (!M.view || M.fit !== want) { M.view = startView(el, mode); M.fit = want; } // the same place and zoom when the page is drawn again
    setView(el, M.view);
  }
  // after render(): draws the map in its box (the box is in the page's HTML; the map needs its size)
  function mount() {
    if (!C.typed) { C.typed = true; document.addEventListener('input', typed); addEventListener('resize', () => { const el = document.getElementById('cmap'); if (el && M.view && M.map) setView(el, M.view); }); }
    const el = document.getElementById('cmap'); if (!el) return;
    loadMap().then((m) => {
      if (!el.isConnected) return;
      if (!m) { el.innerHTML = `<div class="cm-msg">${esc(T('mapFail'))}</div>`; return; }
      draw(el); wire(el);
      const had = !!(M.relief && M.detail);
      if (!had) extras().then(() => { if ((M.relief || M.detail) && el.isConnected) draw(el); });
    });
  }

  /* ---------- where am I ---------- */
  function locate() {
    if (!navigator.geolocation) { toast(T('locFail')); return; }
    // the phone asks first; the voice says what to press and that the place stays on the phone
    if (has('ui.nearGps') && !store.get('gpsTold', false)) { store.set('gpsTold', true); play(['ui.nearGps'], { quiet: true }); }
    M.busy = true; render();
    navigator.geolocation.getCurrentPosition((p) => {
      M.pos = { lat: p.coords.latitude, lon: p.coords.longitude }; store.set('lastPos', M.pos); M.busy = false; M.dist = ''; store.set('nearDist', '');
      // the nearest place is chosen on the map (its card has the way there), and the map comes into view
      const near = listed().filter((f) => placed(f) && KIND(f) !== 'p').map((f) => [f, distKm(M.pos, f)]).sort((a, b) => a[1] - b[1])[0];
      M.sel = near ? near[0].id : null;
      track('near'); render();
      const el = document.getElementById('cmap'); if (el) { const r = el.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 70) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (near && has('ui.fac.' + near[0].id)) setTimeout(() => play(['ui.nearHere', 'ui.fac.' + near[0].id].filter(has), { quiet: true, stay: true }), 400);
    }, () => { M.busy = false; toast(T('locFail')); render(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 600000 });
  }

  /* ---------- buttons on these pages (data-cl) ---------- */
  function act(t) {
    const d = t.dataset, el = document.getElementById('cmap');
    switch (d.cl) {
      case 'locate': locate(); return true;
      case 'dist': M.dist = d.d || ''; store.set('nearDist', M.dist); M.sel = null; render(); return true;
      case 'cdist': C.dist = d.d || ''; store.set('chkDist', C.dist); M.sel = null; render(); return true;
      case 'priv': M.priv = !M.priv; render(); return true;
      case 'zin': if (el && M.view) { const [w, h] = size(el); zoomAt(el, w / 2, h / 2, 0.5); } return true;
      case 'zout': if (el && M.view) { const [w, h] = size(el); zoomAt(el, w / 2, h / 2, 2); } return true;
      case 'zall': if (el && M.map) { M.view = null; M.fit = ''; M.sel = null; draw(el); } return true;
      case 'unsel': if (el) select(el, null, false); return true;
      case 'show': { // a card's "On the map": the map comes into view, close in on the place
        const f = listed().find((x) => x.id === d.fac); if (!f || !placed(f) || !el || !M.view) return true;
        select(el, f.id, false); // its card first: the place goes in the middle of the map above the card
        const c = el.querySelector('.cm-card'), up = c && !c.hidden ? c.offsetHeight / 2 : 0, s2 = Math.min(M.view.s, f.where === 'building' ? 4 : 10);
        const [x, y] = xy(f.lon, f.lat); setView(el, { cx: x, cy: y + up * s2, s: s2 });
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true;
      }
      case 'more': { const c = document.getElementById('fac-' + d.fac) || document.getElementById('chk-' + d.fac); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
      case 'way': track('near-way'); return false; // the link opens Google Maps
      case 'ans': { const v = (C.a[d.fac] || {})[d.q]; setA(d.fac, { [d.q]: v === d.a ? '' : d.a }); repaint(d.fac); return true; }
      case 'here': here(d.fac); return true;
      case 'note': { t.outerHTML = noteBox(d.fac, true); const ta = document.querySelector(`[data-chktext="${CSS.escape(d.fac)}"]`); if (ta) ta.focus(); return true; }
      case 'rec': rec(d.fac); return true;
      case 'send': send(); return true;
    }
    return false;
  }
  return { screen, check, mount, act, locate, flush, M, C };
}
