// Sehat family records (#/family): a card for each person (baby, child, woman, man) with the name said in their own
// voice; vaccines (the child schedule, or the women's tetanus vaccine), growth or weight, medicines with reminders,
// what the doctor said, and saved blood pressure and sugar readings. Voice first: every line has a big speaker,
// numbers come from the big number pad (js/numpad.js), typing is always optional. Recordings and photos are kept in
// IndexedDB ("sehat-family"), the rest with the people in localStorage ("fhb.kids"). "Copy records to another phone"
// makes one zip file. Nothing leaves the phone unless the person sends that file. The data rules: js/family-data.js.
import { PICS, isAdult, isChild, migrate, tdPlan, TD, adultAdvice, BMI_LV, numIds, sizeOf, TIMES, dueMeds, markTaken, snooze, medActive, daysLeft,
  mediaIds, makeBundle, readBundle, mergePeople, BUNDLE, MEDIA_RE, newId, localDay, dayDiff } from './family-data.js';
import { makeZip, readZip } from './zip.js';
import { APPS } from './share.js';

export function initFamily(ctx) {
  const { S, $, $$, esc, T, L, num, ic, I, spk, play, stopAudio, track, listenBar, disclaimer, top, toast, store, dialog, dateSelects, readDate, fmtDate, todayISO, ageText, saveKids, NP } = ctx;
  const say = (id) => L(S.book.narration[id]);
  const big = (id) => spk(id).replace('class="spk', 'class="spk big');
  const sayRow = (id, cls = 'trow') => `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(say(id))}</div>${big(id)}</div>`;
  const rerender = () => { ctx.render(); scrollTo(0, 0); };
  const go = (h) => { if (location.hash === h) rerender(); else location.hash = h; };
  const PIC_KEY = { baby: 'picBaby', child: 'picChild', woman: 'picWoman', man: 'picMan' };
  const picSrc = (p) => `img/pics/person-${PICS.includes(p && p.pic) ? p.pic : 'child'}.svg`;
  const F = { draft: null, med: null, rec: null, shown: {}, remind: null, urls: {} };

  /* ---------- people ---------- */
  const m0 = migrate(S.kids); S.kids = m0.list; if (m0.changed) saveKids();
  const person = () => S.kids.find((x) => x.id === S.kid) || null;
  function nameOf(p) {
    if (!p) return '';
    if (p.name) return p.name;
    const same = S.kids.filter((x) => x.pic === p.pic), i = same.indexOf(p);
    return T(PIC_KEY[p.pic] || 'picChild') + (same.length > 1 ? ' ' + num(i + 1) : '');
  }
  const touch = (p) => { p.u = Date.now(); saveKids(); };
  const children = () => S.kids.filter(isChild);

  /* ---------- recordings and photos: IndexedDB ---------- */
  const MS = {
    db: null, opening: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      if (this.opening) return this.opening;
      this.opening = new Promise((res) => {
        try {
          const r = indexedDB.open('sehat-family', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('media');
          r.onsuccess = () => { this.db = r.result; res(this.db); };
          r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return this.opening;
    },
    async tx(mode, fn) {
      const db = await this.open(); if (!db) return null;
      return new Promise((res) => { try { const t = db.transaction('media', mode); const q = fn(t.objectStore('media')); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } });
    },
    get(id) { return this.tx('readonly', (s) => s.get(id)); },
    put(id, v) { return this.tx('readwrite', (s) => s.put(v, id)); },
    del(id) { return this.tx('readwrite', (s) => s.delete(id)); },
    keys() { return this.tx('readonly', (s) => s.getAllKeys()); },
    all() { return this.tx('readonly', (s) => s.getAll()); },
  };
  async function saveBlob(blob, prefix) {
    const id = newId(prefix);
    await MS.put(id, { blob, type: blob.type || 'application/octet-stream', bytes: blob.size, d: Date.now() });
    return id;
  }
  // delete recordings and photos that no person refers to any more (not while a form is open)
  async function gc() {
    if (F.draft) return;
    const used = new Set(); S.kids.forEach((p) => mediaIds(p).forEach((x) => used.add(x)));
    const keys = (await MS.keys()) || [];
    for (const k of keys) if (!used.has(k)) await MS.del(k);
  }
  async function storageBytes() {
    const all = (await MS.all()) || [];
    return all.reduce((s, x) => s + ((x && x.bytes) || 0), 0) + JSON.stringify(S.kids).length * 2;
  }
  async function showStorage() {
    const el = $('#fam-storage'); if (!el) return;
    const z = sizeOf(await storageBytes());
    el.querySelector('b').textContent = `${num(String(z.v)).replace('.', S.lang === 'en' ? '.' : '٫')} ${z.unit === 'mb' ? 'MB' : 'KB'}`;
    el.dataset.ids = ['ui.fam.storage'].concat(z.ids).join(',');
  }

  /* ---------- playing a recording ---------- */
  const A = new Audio(); let aBtn = null;
  A.addEventListener('ended', () => { if (aBtn) aBtn.classList.remove('on'); aBtn = null; });
  async function playRec(id, btn) {
    stopAudio(); A.pause(); if (aBtn) aBtn.classList.remove('on');
    if (aBtn === btn && btn) { aBtn = null; return; }
    const r = id ? await MS.get(id) : null; if (!r || !r.blob) { toast(T('recNone')); return; }
    if (F.urls.a) URL.revokeObjectURL(F.urls.a);
    F.urls.a = URL.createObjectURL(r.blob); A.src = F.urls.a; aBtn = btn || null; if (btn) btn.classList.add('on');
    try { await A.play(); } catch (e) { if (btn) btn.classList.remove('on'); }
  }
  const playBtn = (id, cls = '') => `<button type="button" class="recplay ${cls}" data-fam-play="${esc(id)}" aria-label="${esc(T('recPlay'))}">${I.play}</button>`;
  // pictures from IndexedDB, filled in after the page is drawn
  async function fillImages() {
    for (const img of $$('img[data-fam-img]')) {
      const id = img.dataset.famImg; if (img.src && img.dataset.done) continue;
      let u = F.urls['i' + id];
      if (!u) { const r = await MS.get(id); if (!r || !r.blob) continue; u = F.urls['i' + id] = URL.createObjectURL(r.blob); }
      img.src = u; img.dataset.done = '1';
    }
  }

  /* ---------- recording (the existing voice-note way: webm/opus, low bit rate) ---------- */
  function recBox(field, sayId, max) {
    const d = F.draft || {}, id = d[field], on = F.rec && F.rec.field === field;
    let h = `<div class="recbox${on ? ' on' : ''}" id="rec-${esc(field)}">` + sayRow(sayId, 'trow rq');
    h += `<div class="recrow"><button type="button" class="recbig${on ? ' stop' : ''}" data-fam-rec="${esc(field)}" data-max="${max || 120}">${on ? I.stop : I.mic}<span>${esc(on ? T('recStop') : id ? T('recAgain') : T('recTap'))}</span>${on ? '<b class="rectime" id="rec-time">0:00</b>' : ''}</button>`;
    if (id && !on) h += playBtn(id, 'big');
    h += `</div></div>`;
    return h;
  }
  function redrawRec(field, sayId) { const el = $('#rec-' + field); if (el) el.outerHTML = recBox(field, sayId, el.querySelector('[data-max]') && el.querySelector('[data-max]').dataset.max); }
  async function startRec(field, max, sayId) {
    if (F.rec) { stopRec(); return; }
    stopAudio(); A.pause();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { toast(T('micDenied')); return; }
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', ''].find((t) => !t || (window.MediaRecorder && MediaRecorder.isTypeSupported(t)));
    let rec;
    try { rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 16000 } : undefined); } catch (e) { stream.getTracks().forEach((t) => t.stop()); toast(T('micDenied')); return; }
    const chunks = [];
    F.rec = { field, rec, stream, t0: Date.now(), sayId, timer: 0 };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      F.rec = null;
      if (blob.size > 200 && F.draft) { F.draft[field] = await saveBlob(blob, 'a'); }
      redrawRec(field, sayId);
    };
    rec.start(1000);
    redrawRec(field, sayId);
    F.rec.timer = setInterval(() => {
      if (!F.rec) return;
      const s = Math.floor((Date.now() - F.rec.t0) / 1000), el = $('#rec-time');
      if (el) el.textContent = `${num(Math.floor(s / 60))}:${num(String(s % 60).padStart(2, '0'))}`;
      if (s >= max) stopRec();
    }, 250);
  }
  function stopRec() { if (!F.rec) return; clearInterval(F.rec.timer); try { F.rec.rec.stop(); } catch (e) { F.rec = null; } }
  addEventListener('hashchange', () => { stopRec(); A.pause(); });

  /* ---------- a photo: made smaller on the phone (longest side 1024 px, JPEG) ---------- */
  function shrink(file) {
    return new Promise((res) => {
      const u = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1024 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob((b) => res(b), 'image/jpeg', 0.7);
      };
      img.onerror = () => { URL.revokeObjectURL(u); res(null); };
      img.src = u;
    });
  }

  /* ---------- pieces ---------- */
  const bigRow = (href, icon, title, sub, sayId, cls = '', attr = '') => `<div class="srowbig fam ${cls}">${href ? `<a class="sbig" href="${href}"${attr}>` : `<button type="button" class="sbig"${attr}>`}${icon}<span class="tx"><span class="t">${esc(title)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>${href ? '</a>' : '</button>'}${big(sayId)}</div>`;
  const picImg = (p, cls = 'ppic') => `<img class="${cls}" src="${esc(picSrc(p))}" alt="">`;
  function personHead(p) {
    const age = isChild(p) && p.dob ? ageText(p.dob) : T('adultAge');
    return `<div class="phead">${picImg(p)}<div class="pt"><div class="pn">${esc(nameOf(p))}</div><div class="pm">${esc(p.name ? T(PIC_KEY[p.pic]) + ' · ' + age : age)}</div></div>${nameBtn(p)}</div>`;
  }
  // the person's name in their own voice (or the picture's word when nothing was recorded)
  const nameBtn = (p) => (p.nameRec ? playBtn(p.nameRec, 'big name') : big('ui.fam.pic.' + p.pic));
  function nextVisit(p) {
    const v = S.book.topics.vaccines; if (!v || !p.dob || isAdult(p)) return null;
    for (const vis of v.visits) if (!(p.given && p.given[vis.id])) return { vis, due: Date.parse(p.dob + 'T12:00:00') + vis.ageDays * 864e5 };
    return { done: true };
  }
  // whole calendar days from today to the due day (as on the home screen)
  function whenText(dueMs) {
    const days = dayDiff(localDay(), localDay(new Date(dueMs)));
    return days < 0 ? T('overdue') : days === 0 ? T('dueToday') : days === 1 && S.book.ui.dueTomorrow ? T('dueTomorrow') : T('dueIn', { n: num(days) });
  }
  function personSub(p) {
    const parts = [isChild(p) && p.dob ? ageText(p.dob) : T(PIC_KEY[p.pic])];
    const n = nextVisit(p);
    if (n && !n.done) parts.push(`${T('nextVaccine')}: ${L(n.vis.age)} · ${whenText(n.due)}`);
    if (p.pic === 'woman') { const t = tdPlan(p.td); if (t.next >= 0) parts.push(`${T('rowTd')}: ${T('tdDose', { n: num(t.next + 1) })}`); }
    const due = dueMeds([p]).length; if (due) parts.push(T('medTime'));
    return parts.join(' · ');
  }

  /* ---------- #/family: everyone ---------- */
  function screenList() {
    const ids = ['ui.fam.lead'];
    let html = top(T('myFamily')) + listenBar(ids) + sayRow('ui.fam.lead', 'blk lead trow');
    const due = dueMeds(S.kids);
    if (due.length) html += due.map(remCard).join('');
    if (!S.kids.length) { ids.push('ui.fam.none'); html += sayRow('ui.fam.none', 'blk tip trow'); }
    for (const p of S.kids) {
      html += `<div class="pcard" data-block="pc-${esc(p.id)}"><button type="button" class="pgo" data-fam-open="${esc(p.id)}">${picImg(p)}<span class="pt"><span class="pn">${esc(nameOf(p))}</span><span class="pm">${esc(personSub(p))}</span></span></button>${nameBtn(p)}</div>`;
    }
    ids.push('ui.fam.add', 'ui.fam.copy');
    html += bigRow('#/family/add', I.plus, T('addPerson'), '', 'ui.fam.add', 'add');
    if (S.kids.length) html += bigRow('#/family/copy', ic('phone'), T('copyRecords'), T('copyRecordsSub'), 'ui.fam.copy', 'copy');
    else html += bigRow('', ic('phone'), T('getRecords'), '', 'ui.fam.x.import', 'copy', ' data-fam="import"');
    html += storageLine();
    html += disclaimer();
    setTimeout(() => { showStorage(); gc(); }, 0);
    return { html, nav: 'family' };
  }
  const storageLine = () => `<div class="fstore" id="fam-storage" data-ids="ui.fam.storage"><span>${esc(T('storageUse', { n: '' }))}</span><b>…</b><button type="button" class="spk big" data-fam-ids="#fam-storage" aria-label="${esc(T('listen'))}">${I.spk}</button></div>`;

  /* ---------- add or change a person ---------- */
  function screenForm(isNew) {
    const p = isNew ? null : person();
    if (!isNew && !p) return screenList();
    if (!F.draft || F.draft.for !== (isNew ? '_new' : p.id)) {
      F.draft = isNew ? { for: '_new', pic: null, sex: 'm', name: '', nameRec: null, dob: todayISO() } : { for: p.id, pic: p.pic, sex: p.sex, name: p.name || '', nameRec: p.nameRec || null, dob: p.dob || todayISO() };
    }
    const d = F.draft, ids = ['ui.fam.who', ...PICS.map((x) => 'ui.fam.pic.' + x)];
    let html = top(isNew ? T('addPerson') : T('editPerson'), { back: isNew ? '#/family' : '#/family/person' }) + listenBar(ids);
    html += sayRow('ui.fam.who', 'trow dq');
    html += `<div class="ppick">${PICS.map((x) => `<div class="ppk"><button type="button" class="pbtn" data-fam-pic="${x}" aria-pressed="${d.pic === x}"><img src="img/pics/person-${x}.svg" alt=""><span>${esc(T(PIC_KEY[x]))}</span></button>${big('ui.fam.pic.' + x)}</div>`).join('')}</div>`;
    if (d.pic === 'baby' || d.pic === 'child') {
      ids.push('ui.fam.sex', 'ui.fam.dob');
      html += sayRow('ui.fam.sex', 'trow dq');
      html += `<div class="row2 sexrow">${[['m', 'boy', 'ui.fam.boy'], ['f', 'girl', 'ui.fam.girl']].map(([v, key, sid]) => `<div class="srowbig"><button type="button" class="chip big" data-fam-sex="${v}" aria-pressed="${d.sex === v}">${esc(T(key))}</button>${big(sid)}</div>`).join('')}</div>`;
    }
    ids.push('ui.fam.name', 'ui.fam.name-type');
    html += recBox('nameRec', 'ui.fam.name', 20);
    html += `<div class="ftext">${sayRow('ui.fam.name-type', 'trow small')}<input class="small" data-fam-in="name" maxlength="40" autocomplete="off" value="${esc(d.name)}" aria-label="${esc(T('writeName'))}" placeholder="${esc(T('writeName'))}"></div>`;
    if (d.pic === 'baby' || d.pic === 'child') html += `<form class="form fdate" id="fam-dob" onsubmit="return false">${sayRow('ui.fam.dob', 'trow')}${dateSelects('b', d.dob)}</form>`;
    html += bigRow('', I.check, T('save'), '', 'ui.fam.save', 'save', ' data-fam="save-person"');
    if (!isNew) html += bigRow('', ic('no'), T('delete'), '', 'ui.fam.delete', 'danger', ' data-fam="del-person"');
    return { html, nav: 'family' };
  }
  function readDob() {
    const f = $('#fam-dob'); if (!f) return F.draft.dob;
    let d = readDate(f, 'b'); if (d > todayISO()) d = todayISO(); return d;
  }
  function savePerson() {
    const d = F.draft; if (!d) return;
    const inp = $('[data-fam-in="name"]'); if (inp) d.name = inp.value.trim().slice(0, 40);
    if (!d.pic) { toast(T('needPic')); play(['ui.fam.need-pic'], { quiet: true }); return; }
    if (!d.name && !d.nameRec) { toast(T('needNameRec')); play(['ui.fam.need-name'], { quiet: true }); return; }
    if (d.pic === 'baby' || d.pic === 'child') d.dob = readDob();
    let p = d.for === '_new' ? null : S.kids.find((x) => x.id === d.for);
    const isNew = !p;
    if (!p) { p = { id: newId('k'), v: 2, given: {}, td: {}, weights: [], meds: [], notes: [], readings: [] }; S.kids.push(p); }
    p.pic = d.pic; p.sex = d.pic === 'woman' ? 'f' : d.pic === 'man' ? 'm' : d.sex; p.name = d.name; p.nameRec = d.nameRec || null;
    if (isChild(p)) p.dob = d.dob; else delete p.dob;
    S.kid = p.id; F.draft = null; touch(p);
    if (isNew) { track('kid', { n: S.kids.length }); track('tool', { p: 'family-add-' + p.pic }); }
    toast(T('savedOk')); go('#/family/person'); gc();
  }

  /* ---------- #/family/person: one person's record ---------- */
  function screenPerson() {
    const p = person(); if (!p) return screenList();
    const ids = [];
    let html = top(nameOf(p), { back: '#/family' });
    html += personHead(p);
    const rows = [];
    if (isChild(p)) {
      const n = nextVisit(p);
      rows.push(['#/family/vacc', ic('syringe'), T('rowVaccines'), n ? (n.done ? T('allDone') : `${T('nextVaccine')}: ${L(n.vis.age)} · ${whenText(n.due)}`) : '', 'ui.fam.row.vacc', 'vac']);
      rows.push(['#/growth', ic('growth'), T('rowGrowth'), lastWeight(p), 'ui.fam.row.growth', 'grw']);
    } else {
      if (p.pic === 'woman') { const t = tdPlan(p.td); rows.push(['#/family/vacc', ic('syringe'), T('rowTd'), t.next < 0 ? T('tdDone') : T('nextDose', { x: T('tdDose', { n: num(t.next + 1) }) }) + (t.from ? ' · ' + T('tdFrom', { d: fmtDate(t.from) }) : ''), 'ui.fam.row.td', 'vac']); }
      rows.push(['#/family/weight', ic('weight-loss'), T('rowWeight'), lastWeight(p), 'ui.fam.row.weight', 'grw']);
    }
    const act = (p.meds || []).filter((m) => medActive(m)).length;
    rows.push(['#/family/meds', ic('pill'), T('rowMeds'), act ? num(act) : '', 'ui.fam.row.meds', 'med']);
    rows.push(['#/family/notes', ic('talk'), T('rowNotes'), (p.notes || []).length ? num(p.notes.length) : '', 'ui.fam.row.notes', 'note']);
    rows.push(['#/family/readings', ic('bp'), T('rowReadings'), (p.readings || []).length ? num(p.readings.length) : '', 'ui.fam.row.readings', 'rd']);
    rows.push(['#/family/edit', ic('card'), T('editPerson'), '', 'ui.fam.row.edit', 'edit']);
    for (const r of rows) { ids.push(r[4]); html += bigRow(r[0], r[1], r[2], r[3], r[4], r[5]); }
    html = html.replace('<div class="phead">', listenBar(ids) + '<div class="phead">');
    const due = dueMeds([p]); if (due.length) html = html.replace('<div class="srowbig', due.map(remCard).join('') + '<div class="srowbig');
    return { html, nav: 'family' };
  }
  function lastWeight(p) {
    const ws = (p.weights || []).filter((e) => e.kg > 0 || e.cm > 0).sort((a, b) => (a.d < b.d ? 1 : -1)); const e = ws[0];
    if (!e) return '';
    const parts = [fmtDate(e.d)]; if (e.kg > 0) parts.push(`${dec(num(String(e.kg)))} ${T('kg')}`); if (e.cm > 0) parts.push(`${dec(num(String(e.cm)))} ${T('cm')}`);
    return parts.join(' · ');
  }
  const dec = (s) => (S.lang === 'en' ? s : s.replace('.', '٫'));

  /* ---------- vaccines: the child schedule, or the women's tetanus vaccine ---------- */
  function screenVacc() {
    const p = person(); if (!p) return screenList();
    const v = S.book.topics.vaccines;
    let html = top(isChild(p) ? T('rowVaccines') : T('rowTd'), { back: '#/family/person' });
    const ids = [];
    if (isChild(p) && v) {
      ids.push('ui.fam.vacc');
      html += `<div class="agechip">${picImg(p, 'mini')}<span>${esc(nameOf(p))} · ${esc(p.dob ? ageText(p.dob) : '')}</span></div>` + sayRow('ui.fam.vacc', 'blk lead trow');
      const n = nextVisit(p), dob = Date.parse(p.dob + 'T12:00:00');
      for (const vis of v.visits) {
        const g = p.given && p.given[vis.id], due = localDay(new Date(dob + vis.ageDays * 864e5)), isNext = n && !n.done && n.vis.id === vis.id;
        ids.push(vis.id);
        html += `<div class="vline" data-block="${esc(vis.id)}"><button type="button" class="vrow ${g ? 'done' : isNext ? 'due' : ''}" data-fam-visit="${esc(vis.id)}"><span class="ck">${g ? I.check : ''}</span><span style="flex:1"><div class="a">${esc(L(vis.age))}</div><div class="d">${g ? esc(T('given')) + ' · ' + esc(fmtDate(g)) : esc(fmtDate(due))} · ${esc(vis.doses.map((x) => L(x.name)).join('، '))}</div></span></button>${big(vis.id)}</div>`;
      }
    } else if (p.pic === 'woman') {
      ids.push('vaccines.td', 'ui.fam.td.tap');
      if (S.book.narration['vaccines.td']) html += sayRow('vaccines.td', 'blk lead trow');
      html += sayRow('ui.fam.td.tap', 'blk tip trow');
      const t = tdPlan(p.td);
      TD.forEach((k, i) => {
        const g = p.td && p.td[k], isNext = t.next === i;
        ids.push('ui.fam.' + k);
        html += `<div class="vline" data-block="ui.fam.${k}"><button type="button" class="vrow ${g ? 'done' : isNext ? 'due' : ''}" data-fam-td="${k}"><span class="ck">${g ? I.check : ''}</span><span style="flex:1"><div class="a">${esc(T('tdDose', { n: num(i + 1) }))}</div><div class="d">${g ? esc(T('given')) + ' · ' + esc(fmtDate(g)) : esc(say('ui.fam.' + k))}${!g && isNext && t.from ? ' · ' + esc(T('tdFrom', { d: fmtDate(t.from) })) : ''}</div></span></button>${big('ui.fam.' + k)}</div>`;
      });
      if (t.next < 0) { ids.push('ui.fam.td.done'); html += sayRow('ui.fam.td.done', 'blk tip trow'); }
    } else return screenPerson();
    html = html.replace(/(<div class="(?:agechip|blk))/, listenBar(ids) + '$1');
    html += disclaimer();
    return { html, nav: 'family' };
  }
  function doseDialog(title, sub, given, onGive, onUngive) {
    dialog(`<form class="form" id="fam-vform" onsubmit="return false"><h2>${esc(title)}</h2><p class="muted">${esc(sub)}</p>
      <label>${esc(T('given'))}</label>${dateSelects('g', given || todayISO())}
      <button class="btn" type="button" data-v="give">${I.check.replace('<svg', '<svg style="width:22px;height:22px"')} ${esc(T('given'))}</button>
      ${given ? `<button class="btn danger" type="button" data-v="ungive">${esc(T('notGiven'))}</button>` : ''}
      <button class="btn ghost" type="button" data-close>${esc(T('cancel'))}</button></form>`, (w) => {
      w.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        if (b.dataset.v === 'give') { let d = readDate($('#fam-vform', w), 'g'); if (d > todayISO()) d = todayISO(); onGive(d); } else onUngive();
        w.remove(); ctx.render();
      });
    });
  }

  /* ---------- adults: weight and weight for height ---------- */
  function screenWeight() {
    const p = person(); if (!p) return screenList();
    if (isChild(p)) { go('#/growth'); return { html: '', nav: 'family' }; }
    const ids = ['ui.fam.w.lead', 'ui.fam.w.height'];
    let html = top(T('rowWeight') + ' · ' + nameOf(p), { back: '#/family/person' }) + listenBar(ids) + sayRow('ui.fam.w.lead', 'blk lead trow');
    html += NP.field('hcm', { label: T('heightCm'), say: 'ui.fam.w.height', unit: 'cm', dec: 1, min: 100, max: 230, value: p.hcm || null, onDone: (v) => { p.hcm = v; touch(p); ctx.render(); } });
    if (p.pic === 'woman') { ids.push('ui.fam.w.preg'); html += `<div class="srowbig"><button type="button" class="chip big preg" data-fam="preg" aria-pressed="${!!p.preg}">${ic('pregnant')} ${esc(T('pregnantNow'))}</button>${big('ui.fam.w.preg')}</div>`; }
    const adv = adultAdvice(p);
    if (adv) {
      const parts = [];
      if (adv.bmi) parts.push(`${esc(T('bmiWord'))}: <b dir="ltr">${esc(dec(num(String(adv.bmi))))}</b>`);
      const cls = adv.loss ? 'soon' : adv.lv ? { soon: 'soon', watch: 'watch', ok: 'ok' }[BMI_LV[adv.lv]] : 'ok';
      if (adv.say.length) { ids.push(...adv.say); html += `<div class="verdict ${cls} grv">${parts.length ? `<div class="vh">${parts.join('')}</div>` : ''}<div class="vb">${adv.say.map((id) => sayRow(id)).join('')}</div></div>`; }
    }
    html += `<form class="form fweight" id="fam-w" onsubmit="return false"><h2>${esc(T('addWeight'))}</h2>${sayRow('ui.fam.w.weight', 'trow')}`;
    html += NP.field('wkg', { label: T('weightKg'), say: 'ui.fam.w.weight', unit: 'kg', dec: 1, min: 20, max: 250, value: null });
    html += `<label>${esc(T('gDate'))}</label>${dateSelects('w', todayISO())}</form>`;
    html += bigRow('', I.check, T('save'), '', 'ui.fam.save', 'save', ' data-fam="save-weight"');
    const ws = (p.weights || []).filter((e) => e.kg > 0).sort((a, b) => (a.d < b.d ? 1 : -1));
    if (ws.length > 1) html += weightChart(ws.slice().reverse());
    html += `<div class="panel"><h2>${esc(T('weights'))}</h2>${ws.length ? ws.map((e) => `<div class="grow-row"><div class="gr-open"><span class="d">${esc(fmtDate(e.d))}</span><span class="v">${esc(dec(num(String(e.kg))))} ${esc(T('kg'))}</span></div><button type="button" class="gr-del" data-fam-delw="${esc(e.id)}" aria-label="${esc(T('delete'))}">×</button></div>`).join('') : `<p class="muted">${esc(T('noWeights'))}</p>`}</div>`;
    html += disclaimer();
    return { html, nav: 'family', adult: true };
  }
  function weightChart(ws) {
    const W = 320, H = 150, P = 30, t0 = Date.parse(ws[0].d), t1 = Math.max(Date.parse(ws[ws.length - 1].d), t0 + 864e5);
    const lo = Math.floor(Math.min(...ws.map((e) => e.kg)) - 2), hi = Math.ceil(Math.max(...ws.map((e) => e.kg)) + 2);
    const x = (d) => P + ((Date.parse(d) - t0) / (t1 - t0)) * (W - P - 10), y = (kg) => 10 + (1 - (kg - lo) / (hi - lo)) * (H - 40);
    const pts = ws.map((e) => `${x(e.d).toFixed(1)},${y(e.kg).toFixed(1)}`).join(' ');
    return `<div class="gcard"><svg class="gsvg" viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${esc(T('weights'))}"><rect x="${P}" y="10" width="${W - P - 10}" height="${H - 40}" fill="#F4F1EA"/>`
      + `<text class="tk" x="${P - 4}" y="${y(hi) + 4}" text-anchor="end">${esc(num(hi))}</text><text class="tk" x="${P - 4}" y="${y(lo) + 4}" text-anchor="end">${esc(num(lo))}</text>`
      + `<polyline points="${pts}" fill="none" stroke="#2F6F7E" stroke-width="3"/>${ws.map((e) => `<circle cx="${x(e.d).toFixed(1)}" cy="${y(e.kg).toFixed(1)}" r="5" fill="#2F6F7E"/>`).join('')}`
      + `<text class="un" x="${W / 2}" y="${H - 8}" text-anchor="middle">${esc(T('kg'))}</text></svg></div>`;
  }
  function saveWeight() {
    const p = person(); if (!p) return;
    const kg = NP.get('wkg'); if (kg == null) { toast(T('needOne')); return; }
    let d = readDate($('#fam-w'), 'w'); if (d > todayISO()) d = todayISO();
    p.weights = p.weights || []; p.weights.push({ id: newId('m'), d, kg }); touch(p); NP.set('wkg', null);
    track('tool', { p: 'family-weight' });
    rerender();
    const adv = adultAdvice(p); if (adv && adv.say.length) setTimeout(() => play(adv.say, { quiet: true }), 300);
  }

  /* ---------- medicines ---------- */
  const SLOT_KEY = { morning: 'tMorning', noon: 'tNoon', evening: 'tEvening', night: 'tNight' };
  function medCard(p, m) {
    const day = localDay(), taken = (m.taken && m.taken[day]) || [], left = daysLeft(m), active = medActive(m);
    let h = `<div class="medcard${active ? '' : ' off'}">`;
    h += `<div class="mtop">${m.photo ? `<img class="mphoto" data-fam-img="${esc(m.photo)}" alt="">` : `<span class="mphoto none">${ic('pill')}</span>`}<div class="mtx">${m.text ? `<div class="mt">${esc(m.text)}</div>` : ''}<div class="mm">${esc(fmtDate(m.d))}${left != null ? ' · ' + esc(active ? T('daysLeft', { n: num(left) }) : T('medDone')) : ''}</div></div>${m.rec ? playBtn(m.rec, 'big') : ''}</div>`;
    if ((m.times || []).length) h += `<div class="mtimes">${m.times.map((s) => `<span class="mtime${taken.includes(s) ? ' ok' : ''}">${taken.includes(s) ? I.check : ''}${esc(T(SLOT_KEY[s]))}</span>`).join('')}</div>`;
    h += `<div class="mbtns"><button type="button" class="sbtn" data-fam-delmed="${esc(m.id)}">${esc(T('delete'))}</button></div></div>`;
    return h;
  }
  function screenMeds() {
    const p = person(); if (!p) return screenList();
    const ids = ['ui.fam.med.lead', 'ui.fam.med.safe'];
    let html = top(T('rowMeds') + ' · ' + nameOf(p), { back: '#/family/person' }) + listenBar(ids) + sayRow('ui.fam.med.lead', 'blk lead trow') + sayRow('ui.fam.med.safe', 'blk tip trow');
    const due = dueMeds([p]); if (due.length) html += due.map(remCard).join('');
    html += bigRow('#/family/med-add', I.plus, T('addMed'), '', 'ui.fam.row.meds', 'add');
    const list = (p.meds || []).slice().sort((a, b) => (medActive(b) - medActive(a)) || (a.d < b.d ? 1 : -1));
    html += list.length ? list.map((m) => medCard(p, m)).join('') : `<p class="muted center">${esc(T('noMeds'))}</p>`;
    html += disclaimer();
    setTimeout(fillImages, 0);
    return { html, nav: 'family' };
  }
  function screenMedAdd() {
    const p = person(); if (!p) return screenList();
    if (!F.draft || F.draft.for !== 'med:' + p.id) F.draft = { for: 'med:' + p.id, rec: null, photo: null, text: '', times: [] };
    const d = F.draft, ids = ['ui.fam.med.rec', 'ui.fam.med.photo', 'ui.fam.med.text', 'ui.fam.med.times', 'ui.fam.med.days'];
    let html = top(T('addMed'), { back: '#/family/meds' }) + listenBar(ids) + sayRow('ui.fam.med.safe', 'blk tip trow');
    html += recBox('rec', 'ui.fam.med.rec', 120);
    html += `<div class="fphoto">${sayRow('ui.fam.med.photo', 'trow')}<div class="recrow">${d.photo ? `<img class="mphoto big" data-fam-img="${esc(d.photo)}" alt="">` : ''}<label class="recbig photo">${ic('eye')}<span>${esc(T('takePhoto'))}</span><input type="file" accept="image/*" capture="environment" data-fam-photo hidden></label></div></div>`;
    html += `<div class="ftext">${sayRow('ui.fam.med.text', 'trow small')}<textarea class="small" data-fam-in="text" maxlength="300" rows="2" aria-label="${esc(T('medWrite'))}" placeholder="${esc(T('medWrite'))}">${esc(d.text)}</textarea></div>`;
    html += sayRow('ui.fam.med.times', 'trow dq');
    html += `<div class="slots">${Object.keys(TIMES).map((s) => `<div class="srowbig"><button type="button" class="chip big slot" data-fam-slot="${s}" aria-pressed="${d.times.includes(s)}">${ic(s === 'night' ? 'moon' : 'clock')} ${esc(T(SLOT_KEY[s]))}</button>${big('ui.fam.t.' + s)}</div>`).join('')}</div>`;
    html += NP.field('mdays', { label: T('medDays'), say: 'ui.fam.med.days', unit: 'days', dec: 0, digits: 3, min: 1, max: 365, value: d.days == null ? null : d.days, onDone: (v) => { d.days = v; } });
    html += bigRow('', I.check, T('save'), '', 'ui.fam.save', 'save', ' data-fam="save-med"');
    setTimeout(fillImages, 0);
    return { html, nav: 'family' };
  }
  function saveMed() {
    const p = person(), d = F.draft; if (!p || !d) return;
    const t = $('[data-fam-in="text"]'); if (t) d.text = t.value.trim().slice(0, 300);
    if (F.rec) { toast(T('recording')); return; }
    if (!d.rec && !d.text && !d.photo) { toast(T('needRec')); return; }
    const days = NP.get('mdays');
    const m = { id: newId('d'), d: todayISO(), rec: d.rec || null, photo: d.photo || null, text: d.text || '', times: d.times.slice(), on: true };
    if (days) m.days = days;
    p.meds = p.meds || []; p.meds.push(m); F.draft = null; NP.set('mdays', null); touch(p);
    track('tool', { p: 'family-med' });
    toast(T('savedOk')); go('#/family/meds'); gc();
  }
  // a dose that is due: on the family pages, and as a pop-up when the app is open at that time
  function remCard(x) {
    const p = x.p, m = x.m;
    return `<div class="remcard" data-block="ui.fam.rem"><div class="rh">${ic('clock')}<span>${esc(T('medTime'))} · ${esc(T(SLOT_KEY[x.slot]))}</span>${big('ui.fam.rem')}</div>`
      + `<div class="mtop">${picImg(p, 'mini')}<div class="mtx"><div class="mt">${esc(nameOf(p))}</div>${m.text ? `<div class="mm">${esc(m.text)}</div>` : ''}</div>${m.photo ? `<img class="mphoto" data-fam-img="${esc(m.photo)}" alt="">` : ''}${m.rec ? playBtn(m.rec, 'big') : ''}</div>`
      + `<div class="srowbig"><button type="button" class="sbig ok" data-fam-taken="${esc(p.id)}|${esc(m.id)}|${x.slot}">${I.check}<span class="tx"><span class="t">${esc(T('taken'))}</span></span></button>${big('ui.fam.b.taken')}</div>`
      + `<div class="srowbig"><button type="button" class="sbig later" data-fam-later="${esc(p.id)}|${esc(m.id)}|${x.slot}">${ic('clock')}<span class="tx"><span class="t">${esc(T('later'))}</span></span></button>${big('ui.fam.b.later')}</div></div>`;
  }
  function findMed(key) { const [pid, mid, slot] = key.split('|'); const p = S.kids.find((x) => x.id === pid); const m = p && (p.meds || []).find((x) => x.id === mid); return { p, m, slot }; }
  function checkReminders() {
    if (document.visibilityState !== 'visible' || !S.book || $('.dialog-wrap')) return;
    const due = dueMeds(S.kids); if (!due.length) return;
    const x = due.find((y) => !F.shown[localDay() + '|' + y.m.id + '|' + y.slot]); if (!x) return;
    F.shown[localDay() + '|' + x.m.id + '|' + x.slot] = 1;
    const w = dialog(remCard(x), () => {});
    w.classList.add('remind');
    setTimeout(fillImages, 0);
    const p = play(['ui.fam.rem'], { quiet: true });
    if (p && x.m.rec) p.then((r) => { if (r === 'ended' && document.body.contains(w)) playRec(x.m.rec, w.querySelector('[data-fam-play]')); });
  }
  setInterval(checkReminders, 30000);
  setTimeout(checkReminders, 4000);

  /* ---------- what the doctor said ---------- */
  function screenNotes() {
    const p = person(); if (!p) return screenList();
    const ids = ['ui.fam.note.lead'];
    let html = top(T('rowNotes') + ' · ' + nameOf(p), { back: '#/family/person' }) + listenBar(ids) + sayRow('ui.fam.note.lead', 'blk lead trow');
    html += bigRow('#/family/note-add', ic('talk'), T('addNote'), '', 'ui.fam.row.notes', 'add');
    const list = (p.notes || []).slice().sort((a, b) => (a.d < b.d ? 1 : -1));
    html += list.length ? list.map((n) => `<div class="medcard"><div class="mtop"><span class="mphoto none">${ic('talk')}</span><div class="mtx"><div class="mm">${esc(fmtDate(n.d))}</div>${n.text ? `<div class="mt">${esc(n.text)}</div>` : ''}</div>${n.rec ? playBtn(n.rec, 'big') : ''}</div><div class="mbtns"><button type="button" class="sbtn" data-fam-delnote="${esc(n.id)}">${esc(T('delete'))}</button></div></div>`).join('') : `<p class="muted center">${esc(T('noNotes'))}</p>`;
    return { html, nav: 'family' };
  }
  function screenNoteAdd() {
    const p = person(); if (!p) return screenList();
    if (!F.draft || F.draft.for !== 'note:' + p.id) F.draft = { for: 'note:' + p.id, rec: null, text: '' };
    const d = F.draft, ids = ['ui.fam.note.ask', 'ui.fam.note.rec', 'ui.fam.note.text', 'ui.fam.note.date'];
    let html = top(T('addNote'), { back: '#/family/notes' }) + listenBar(ids);
    html += `<div class="askfirst">${ic('talk')}${sayRow('ui.fam.note.ask', 'trow')}</div>`;
    html += recBox('rec', 'ui.fam.note.rec', 300);
    html += `<div class="ftext">${sayRow('ui.fam.note.text', 'trow small')}<textarea class="small" data-fam-in="text" maxlength="500" rows="3" aria-label="${esc(T('noteWrite'))}" placeholder="${esc(T('noteWrite'))}">${esc(d.text)}</textarea></div>`;
    html += `<form class="form fdate" id="fam-nd" onsubmit="return false">${sayRow('ui.fam.note.date', 'trow')}${dateSelects('n', todayISO())}</form>`;
    html += bigRow('', I.check, T('save'), '', 'ui.fam.save', 'save', ' data-fam="save-note"');
    // the reminder to ask first is said when the page opens
    setTimeout(() => { if (location.hash === '#/family/note-add' && !F.rec) play(['ui.fam.note.ask'], { quiet: true }); }, 400);
    return { html, nav: 'family' };
  }
  function saveNote() {
    const p = person(), d = F.draft; if (!p || !d) return;
    const t = $('[data-fam-in="text"]'); if (t) d.text = t.value.trim().slice(0, 500);
    if (F.rec) { toast(T('recording')); return; }
    if (!d.rec && !d.text) { toast(T('needRec')); return; }
    let day = readDate($('#fam-nd'), 'n'); if (day > todayISO()) day = todayISO();
    p.notes = p.notes || []; p.notes.push({ id: newId('n'), d: day, rec: d.rec || null, text: d.text || '' }); F.draft = null; touch(p);
    track('tool', { p: 'family-note' });
    toast(T('savedOk')); go('#/family/notes'); gc();
  }

  /* ---------- blood pressure and sugar readings (saved from "What does the number mean?") ---------- */
  const LVW = { urgent: 'lvUrgent', today: 'lvToday', soon: 'lvSoon', watch: 'lvWatch', ok: 'lvOk', check: 'lvCheck' };
  function readingText(r) {
    if (r.k === 'bp') return `${num(r.s)} / ${num(r.dia)}`;
    if (r.v === 'HI' || r.v === 'LO') return r.v;
    return `${dec(num(String(r.v)))} ${r.unit === 'mmol' ? 'mmol/L' : 'mg/dL'}`;
  }
  function screenReadings() {
    const p = person(); if (!p) return screenList();
    const ids = ['ui.fam.rd.lead', 'ui.fam.rd.open'];
    let html = top(T('rowReadings') + ' · ' + nameOf(p), { back: '#/family/person' }) + listenBar(ids) + sayRow('ui.fam.rd.lead', 'blk lead trow');
    html += bigRow('#/tool/reading', ic('bp'), T('checkReading'), '', 'ui.fam.rd.open', 'add');
    const list = (p.readings || []).slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.t || 0) - (a.t || 0)));
    html += list.length ? `<div class="panel">${list.map((r) => `<div class="grow-row rdrow"><div class="gr-open"><span class="d">${esc(fmtDate(r.d))} · ${ic(r.k === 'bp' ? 'bp' : 'sugar')}</span><span class="v" dir="ltr">${esc(readingText(r))}</span>${r.lv ? `<span class="lvchip ${esc(r.lv)}">${esc(T(LVW[r.lv] || 'lvCheck'))}</span>` : ''}</div><button type="button" class="gr-del" data-fam-delrd="${esc(r.id)}" aria-label="${esc(T('delete'))}">×</button></div>`).join('')}</div>` : `<p class="muted center">${esc(T('noReadings'))}</p>`;
    return { html, nav: 'family', adult: true };
  }
  // called by js/tools.js on a blood pressure or sugar result: {k: 'bp', s, dia} or {k: 'sugar', v, unit}, and lv
  async function saveReading(r) {
    const pick = await choosePerson();
    if (!pick) return;
    const p = S.kids.find((x) => x.id === pick); if (!p) return;
    p.readings = p.readings || []; p.readings.push(Object.assign({ id: newId('r'), d: todayISO(), t: Date.now() }, r)); touch(p);
    track('tool', { p: 'family-reading-' + r.k });
    toast(T('savedOk')); play(['ui.fam.saved'], { quiet: true });
  }
  function choosePerson() {
    return new Promise((res) => {
      if (!S.kids.length) { toast(T('noPeople')); res(null); return; }
      const w = dialog(`<h2>${esc(T('whoseReading'))}</h2>${sayRow('ui.fam.rd.who', 'trow dq')}<div class="pchoose">${S.kids.map((p) => `<div class="pcard"><button type="button" class="pgo" data-pick="${esc(p.id)}">${picImg(p)}<span class="pt"><span class="pn">${esc(nameOf(p))}</span></span></button>${nameBtn(p)}</div>`).join('')}</div><button class="btn ghost" data-close>${esc(T('cancel'))}</button>`, (wrap) => {
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pick]');
          if (b) { wrap.remove(); res(b.dataset.pick); } else if (e.target === wrap || e.target.closest('[data-close]')) res(null);
        });
      });
      play(['ui.fam.rd.who'], { quiet: true });
      return w;
    });
  }

  /* ---------- copy the records to another phone ---------- */
  const B = () => window.FHBAndroid || null;
  function screenCopy() {
    const ids = ['ui.fam.copy.lead', 'ui.fam.copy.private'];
    let html = top(T('copyRecords'), { back: '#/family' }) + listenBar(ids) + sayRow('ui.fam.copy.lead', 'blk lead trow') + sayRow('ui.fam.copy.private', 'blk tip trow');
    const b = B();
    if (b) {
      html += bigRow('', ic('phone'), T('nearby'), T('nearbySub'), 'ui.fam.x.nearby', 'x', ' data-fam-x="sheet"');
      for (const a of APPS) {
        const pkg = a.pkgs.find((x) => { try { return b.isInstalled && b.isInstalled(x); } catch (e) { return false; } });
        html += bigRow('', ic('phone'), T(a.label), pkg ? '' : T('notOnPhone'), 'ui.fam.x.' + a.id, 'x app' + (pkg ? '' : ' off'), (pkg ? ` data-fam-x="app" data-pkg="${esc(pkg)}"` : ' aria-disabled="true" data-fam-x="none"') + ` style="--c:${a.color}"`);
      }
      html += bigRow('', ic('people'), T('otherApps'), '', 'ui.fam.x.other', 'x', ' data-fam-x="sheet"');
    } else {
      html += bigRow('', ic('phone'), T('sendFileTo'), '', 'ui.fam.x.other', 'x', ' data-fam-x="web"');
      html += bigRow('', ic('card'), T('saveFile'), '', 'ui.fam.x.save', 'x', ' data-fam-x="save"');
    }
    html += `<div class="sep"></div>` + bigRow('', ic('card'), T('getRecords'), '', 'ui.fam.x.import', 'imp', ' data-fam="import"');
    html += storageLine();
    setTimeout(showStorage, 0);
    return { html, nav: 'family' };
  }
  async function buildZip() {
    const files = [], media = [];
    const ids = new Set(); S.kids.forEach((p) => mediaIds(p).forEach((x) => ids.add(x)));
    for (const id of ids) {
      const r = await MS.get(id); if (!r || !r.blob) continue;
      files.push({ name: 'media/' + id, data: new Uint8Array(await r.blob.arrayBuffer()) });
      media.push({ id, type: r.type || r.blob.type });
    }
    const json = JSON.stringify(makeBundle(S.kids, media));
    files.unshift({ name: BUNDLE, data: new TextEncoder().encode(json) });
    return makeZip(files);
  }
  const fileName = () => `sehat-family-${localDay()}.zip`;
  async function b64(blob) {
    const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function doExport(way, pkg) {
    if (way === 'none') { toast(T('notOnPhone')); return; }
    const zip = await buildZip(), name = fileName();
    track('tool', { p: 'family-copy-' + (way === 'app' ? 'app' : way) });
    const b = B();
    if (b && way === 'app' && b.shareFileTo) { const ok = b.shareFileTo(await b64(zip), name, 'application/zip', pkg); if (ok) return; }
    if (b && (way === 'sheet' || way === 'app')) { b.shareFile(await b64(zip), name, 'application/zip'); return; }
    const file = new File([zip], name, { type: 'application/zip' });
    if (way === 'web' && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: T('copyRecords') }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function doImport(file) {
    const bad = () => { toast(T('importBad')); play(['ui.fam.x.bad'], { quiet: true }); };
    let files = null;
    try { files = await readZip(new Uint8Array(await file.arrayBuffer())); } catch (e) { files = null; }
    const j = files && files.find((f) => f.name === BUNDLE);
    let bundle = null;
    try { bundle = j && readBundle(JSON.parse(new TextDecoder().decode(j.data))); } catch (e) { bundle = null; }
    if (!bundle) { bad(); return; }
    for (const m of bundle.media) {
      const f = files.find((x) => x.name === 'media/' + m.id); if (!f) continue;
      if (await MS.get(m.id)) continue;
      const blob = new Blob([f.data], { type: m.type });
      await MS.put(m.id, { blob, type: m.type, bytes: blob.size, d: Date.now() });
    }
    const res = mergePeople(S.kids, bundle.people);
    S.kids = res.list; if (!S.kid && S.kids[0]) S.kid = S.kids[0].id; saveKids();
    track('tool', { p: 'family-import' });
    toast(T('importDone', { n: num(res.added + res.updated) })); play(['ui.fam.x.done'], { quiet: true });
    go('#/family');
  }
  function pickFile() {
    const inp = document.createElement('input'); inp.type = 'file'; // any file: the phone may not know the zip type; readZip checks it
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) doImport(f); });
    inp.click();
  }

  /* ---------- taps ---------- */
  document.addEventListener('input', (e) => { const t = e.target.closest('[data-fam-in]'); if (t && F.draft) F.draft[t.dataset.famIn] = t.value; });
  document.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-fam-photo]'); if (!t || !F.draft) return;
    const f = t.files && t.files[0]; if (!f) return;
    const small = await shrink(f); if (!small) { toast(T('badNumber')); return; }
    F.draft.photo = await saveBlob(small, 'p'); ctx.render();
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-fam],[data-fam-open],[data-fam-play],[data-fam-rec],[data-fam-pic],[data-fam-sex],[data-fam-visit],[data-fam-td],[data-fam-slot],[data-fam-delw],[data-fam-delmed],[data-fam-delnote],[data-fam-delrd],[data-fam-taken],[data-fam-later],[data-fam-x],[data-fam-ids]');
    if (!t) return;
    const d = t.dataset;
    if (t.tagName === 'A' && !d.famOpen) return;
    e.preventDefault();
    if (d.famOpen) { S.kid = d.famOpen; saveKids(); go('#/family/person'); return; }
    if (d.famPlay !== undefined) { playRec(d.famPlay, t); return; }
    if (d.famIds) { const el = $(d.famIds); if (el) play((el.dataset.ids || '').split(',').filter(Boolean)); return; }
    if (d.famRec) { const box = t.closest('.recbox'), sid = box && box.querySelector('[data-say]') ? box.querySelector('[data-say]').dataset.say : ''; if (F.rec) stopRec(); else startRec(d.famRec, +(d.max || 120), sid); return; }
    if (d.famPic) { if (F.draft) { const inp = $('[data-fam-in="name"]'); if (inp) F.draft.name = inp.value; const f = $('#fam-dob'); if (f) F.draft.dob = readDob(); F.draft.pic = d.famPic; } ctx.render(); return; }
    if (d.famSex) { if (F.draft) F.draft.sex = d.famSex; $$('[data-fam-sex]').forEach((b) => b.setAttribute('aria-pressed', b === t)); return; }
    if (d.famSlot) { const dr = F.draft; if (!dr) return; const i = dr.times.indexOf(d.famSlot); if (i < 0) dr.times.push(d.famSlot); else dr.times.splice(i, 1); t.setAttribute('aria-pressed', i < 0); return; }
    const p = person();
    if (d.famVisit && p) { const vis = S.book.topics.vaccines.visits.find((x) => x.id === d.famVisit); if (!vis) return; doseDialog(L(vis.age), vis.doses.map((x) => L(x.name)).join('، '), p.given[vis.id], (day) => { p.given[vis.id] = day; touch(p); track('dose', { v: vis.id }); }, () => { delete p.given[vis.id]; touch(p); }); return; }
    if (d.famTd && p) { const i = TD.indexOf(d.famTd); doseDialog(T('tdDose', { n: num(i + 1) }), say('ui.fam.' + d.famTd), p.td[d.famTd], (day) => { p.td[d.famTd] = day; touch(p); track('dose', { v: d.famTd }); }, () => { for (const k of TD.slice(i)) delete p.td[k]; touch(p); }); return; }
    if (d.famDelw && p) { if (!confirm(T('deleteThisQ'))) return; p.weights = p.weights.filter((x) => x.id !== d.famDelw); touch(p); ctx.render(); return; }
    if (d.famDelmed && p) { if (!confirm(T('deleteThisQ'))) return; p.meds = p.meds.filter((x) => x.id !== d.famDelmed); touch(p); ctx.render(); gc(); return; }
    if (d.famDelnote && p) { if (!confirm(T('deleteThisQ'))) return; p.notes = p.notes.filter((x) => x.id !== d.famDelnote); touch(p); ctx.render(); gc(); return; }
    if (d.famDelrd && p) { if (!confirm(T('deleteThisQ'))) return; p.readings = p.readings.filter((x) => x.id !== d.famDelrd); touch(p); ctx.render(); return; }
    if (d.famTaken || d.famLater) {
      const x = findMed(d.famTaken || d.famLater); if (!x.m) return;
      if (d.famTaken) markTaken(x.m, localDay(), x.slot); else snooze(x.m, localDay(), x.slot);
      touch(x.p); stopAudio(); A.pause();
      const w = t.closest('.dialog-wrap'); if (w) w.remove();
      ctx.render(); return;
    }
    if (d.famX) { doExport(d.famX, d.pkg); return; }
    switch (d.fam) {
      case 'save-person': savePerson(); return;
      case 'del-person': {
        if (!p || !confirm(T('deletePersonQ'))) return;
        S.kids = S.kids.filter((x) => x.id !== p.id); S.kid = S.kids[0] ? S.kids[0].id : null; F.draft = null; saveKids(); go('#/family'); gc(); return;
      }
      case 'save-weight': saveWeight(); return;
      case 'preg': if (p) { p.preg = !p.preg; touch(p); ctx.render(); } return;
      case 'save-med': saveMed(); return;
      case 'save-note': saveNote(); return;
      case 'import': pickFile(); return;
    }
  });
  // leaving a form drops its draft (and the recordings nobody kept)
  addEventListener('hashchange', () => {
    const h = location.hash;
    if (!F.draft) return;
    const f = F.draft.for, keep = (f === '_new' && h === '#/family/add') || (f.startsWith('med:') && h === '#/family/med-add') || (f.startsWith('note:') && h === '#/family/note-add') || (!/^(_new|med:|note:)/.test(f) && h === '#/family/edit');
    if (!keep) { F.draft = null; setTimeout(gc, 500); }
  });

  function screen(sub) {
    track('view', { p: 'family' });
    const r = {
      add: () => screenForm(true), edit: () => screenForm(false), person: screenPerson, vacc: screenVacc, weight: screenWeight,
      meds: screenMeds, 'med-add': screenMedAdd, notes: screenNotes, 'note-add': screenNoteAdd, readings: screenReadings, copy: screenCopy,
    }[sub];
    const out = r ? r() : screenList();
    setTimeout(fillImages, 0);
    return out;
  }
  return { screen, nameOf, children, saveReading, isAdult, person };
}
