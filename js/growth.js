// Sehat growth tracker: per-child weight, length/height and arm-tape (MUAC) colour, the WHO growth charts, a spoken
// plain-words result after each measurement, and "How to measure at home". Plain ES module, works offline.
// Screens: #/growth (charts and the list), #/growth/add, #/growth/result (the last saved or tapped measurement),
// #/growth/measure. Measurements live with the child in My family (localStorage "fhb.kids", child.weights: the
// old weight-only entries {d, kg} are read as they are; new ones are {id, d, kg?, cm?, pos?, muac?}). Nothing leaves the phone.
// The arithmetic and the medical defaults are in js/growth-calc.js; the WHO tables in content/who-growth.json.
import { assess, curves, lengthFor, ageDays, implausible, lms, FINDINGS } from './growth-calc.js';

export function initGrowth(ctx) {
  const { S, $, $$, esc, T, L, num, ic, I, spk, play, hasAudio, ttsVoice, track, listenBar, disclaimer, top, toast, dateSelects, readDate, fmtDate, todayISO, saveKids } = ctx;
  const say = (id) => L(S.book.narration[id]);
  const sayRow = (id, cls = 'trow') => `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(say(id))}</div>${spk(id)}</div>`;
  const autoplay = (ids) => { ids = ids.filter((id) => S.book.narration[id]); if (ids.length && (ids.some((id) => hasAudio(id)) || ttsVoice())) play(ids, { quiet: true }); };
  const dec = (s) => (S.lang === 'en' ? s : s.replace('.', '٫'));
  const fmt = (x, d = 1) => dec(num(String(Math.round(x * Math.pow(10, d)) / Math.pow(10, d))));
  const G = { who: null, loading: null, failed: false, tab: 'wfa', last: ctx.store.get('grLast', null), speak: false, form: null };

  /* ---------- the WHO tables (precached by the service worker, in the APK too) ---------- */
  function loadWho() {
    if (G.who || G.loading) return G.loading;
    G.loading = fetch('content/who-growth.json').then((r) => r.json()).then((d) => { G.who = d; G.loading = null; ctx.render(); })
      .catch(() => { G.loading = null; G.failed = true; });
    return G.loading;
  }
  const kidNow = () => S.kids.find((x) => x.id === S.kid) || S.kids[0] || null;
  // every entry gets an id once (older weight-only entries had none)
  function entriesOf(k) {
    k.weights = k.weights || [];
    let changed = false;
    k.weights.forEach((e, i) => { if (!e.id) { e.id = 'm' + Date.parse(e.d + 'T12:00:00Z').toString(36) + i; changed = true; } });
    if (changed) saveKids();
    return k.weights.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }
  const parseNum = (s) => {
    const t = String(s || '').trim().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,،]/g, '.');
    if (!t) return null;
    const x = parseFloat(t); return isFinite(x) ? x : NaN;
  };

  /* ---------- levels ---------- */
  const LV = { today: ['today', 'lvToday', 'clinic'], soon: ['soon', 'lvSoon', 'calendar'], month: ['watch', 'lvMonth', 'calendar'], check: ['check', 'lvCheck', 'warning'], ok: ['ok', 'lvGood', 'check'] };
  function verdictHtml(res) {
    // one coloured card per finding, worst first; each line has its own speaker
    return res.keys.map((k) => {
      const f = FINDINGS[k], [cls, label, icon] = LV[f.lv];
      return `<div class="verdict ${cls} grv"><div class="vh">${ic(icon)}<span>${esc(T(label))}</span></div><div class="vb">${f.say.map((id, i) => sayRow(id, i ? 'trow why' : 'trow')).join('')}</div></div>`;
    }).join('');
  }
  function hospitalBox() {
    const t = S.book.topics.growth, b = t && (t.blocks || []).find((x) => x.id === 'growth.urgent');
    if (!b) return '';
    return `<div class="alert urgent"><div class="ah" data-block="${esc(b.id)}">${I.warn.replace('<svg', '<svg class="ic" style="background:none;-webkit-mask:none;mask:none"')}<div style="flex:1">${esc(L(b.title))}</div>${spk(b.id)}</div>${b.items.map((it) => `<div class="item" data-block="${esc(it.id)}"><div class="pic">${ic(it.icon)}</div><div class="x">${esc(L(it.text))}</div>${spk(it.id)}</div>`).join('')}</div>`;
  }
  // a short status word for one chart: good / low / very low / too heavy
  function status(ind, z) {
    if (z == null) return null;
    if (implausible(ind === 'lfa' ? 'lhfa' : ind, z)) return ['check', '?'];
    if (z < -3) return ['vlow', T('legendVeryLow')];
    if (z < -2) return ['low', T('legendLow')];
    if (ind === 'wfl' && z > 2) return ['high', T('legendHeavy')];
    return ['good', T('legendGood')];
  }

  /* ---------- the chart ---------- */
  const W = 320, H = 250, PL = 38, PR = 10, PT = 10, PB = 30;
  const MONTH = 30.4375;
  function niceStep(span, want) { const raw = span / want, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw; }
  function chartSvg(kind, k, list) {
    const who = G.who, sex = k.sex === 'f' ? 'f' : 'm', ageNow = ageDays(k.dob, todayISO());
    const pts = []; // [x, y, isLast]
    let ind, x0, x1, xLabel;
    if (kind === 'wfl') {
      ind = ageNow < 731 ? 'wfl' : 'wfh';
      for (const e of list) {
        if (!(e.kg > 0 && e.cm > 0)) continue;
        const a = ageDays(k.dob, e.d), Lg = lengthFor(a, e.cm, e.pos); if (!Lg || a < 0 || a > 1826) continue;
        let v = Lg.v; if (ind === 'wfh' && a < 731) v -= 0.7; // a length measured before 2 years, shown on the height chart
        pts.push([v, e.kg]);
      }
      const [lo, hi] = ind === 'wfl' ? [45, 110] : [65, 120];
      if (pts.length) { x0 = Math.min(...pts.map((p) => p[0])) - 6; x1 = Math.max(...pts.map((p) => p[0])) + 6; }
      else { const m = (lms(who.lhfa[sex], Math.min(ageNow, 1826)) || { M: 75 }).M; x0 = m - 12; x1 = m + 12; }
      if (x1 - x0 < 24) { const c = (x0 + x1) / 2; x0 = c - 12; x1 = c + 12; }
      x0 = Math.max(lo, Math.floor(x0)); x1 = Math.min(hi, Math.ceil(x1));
      xLabel = T('axisCm');
    } else {
      ind = kind === 'wfa' ? 'wfa' : 'lhfa';
      for (const e of list) {
        const a = ageDays(k.dob, e.d); if (a < 0 || a > 1826) continue;
        if (ind === 'wfa' && e.kg > 0) pts.push([a, e.kg]);
        if (ind === 'lhfa') { const Lg = lengthFor(a, e.cm, e.pos); if (Lg) pts.push([a, Lg.v]); }
      }
      const maxA = Math.max(ageNow, ...pts.map((p) => p[0])) / MONTH;
      const span = maxA <= 11.5 ? 12 : maxA <= 23.5 ? 24 : 60;
      x0 = 0; x1 = Math.min(span * MONTH, 1826);
      xLabel = T('axisMonths');
    }
    // the SD lines, sampled finely (and on both sides of 2 years, where length becomes height)
    const n = 90, xs = [];
    for (let i = 0; i <= n; i++) xs.push(x0 + ((x1 - x0) * i) / n);
    if (ind === 'lhfa' && x0 < 731 && x1 > 731) xs.push(730, 731);
    xs.sort((a, b) => a - b);
    const C = curves(who, ind, sex, xs);
    const line = (z) => C.find((c) => c.z === z).pts;
    const all = C.flatMap((c) => c.pts.map((p) => p[1])).concat(pts.map((p) => p[1]));
    let y0 = Math.min(...all), y1 = Math.max(...all);
    const pad = (y1 - y0) * 0.06; y0 = Math.max(0, y0 - pad); y1 += pad;
    const X = (x) => PL + ((x - x0) / (x1 - x0)) * (W - PL - PR), Y = (y) => PT + (1 - (y - y0) / (y1 - y0)) * (H - PT - PB);
    const path = (p) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
    const band = (lo, hi) => { const a = lo ? lo : [[x0, y0], [x1, y0]], b = hi; return path(a) + b.slice().reverse().map(([x, y]) => `L${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('') + 'Z'; };
    let s = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T(kind === 'wfa' ? 'chartWfa' : kind === 'lfa' ? 'chartLfa' : 'chartWfl'))}">`;
    s += `<rect x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="#fff"/>`;
    s += `<path d="${band(null, line(-3))}" fill="#F3C6C1"/><path d="${band(line(-3), line(-2))}" fill="#F8E39A"/><path d="${band(line(-2), line(2))}" fill="#CFE9D6"/>`;
    // grid and ticks
    const xStep = ind === 'wfa' || ind === 'lhfa' ? ((x1 / MONTH) <= 12 ? 2 : (x1 / MONTH) <= 24 ? 3 : 12) * MONTH : niceStep(x1 - x0, 5);
    const yStep = niceStep(y1 - y0, 5);
    for (let x = Math.ceil(x0 / xStep - 1e-9) * xStep; x <= x1 + 1e-6; x += xStep) {
      const lab = ind === 'wfa' || ind === 'lhfa' ? Math.round(x / MONTH) : Math.round(x);
      s += `<line x1="${X(x).toFixed(1)}" y1="${PT}" x2="${X(x).toFixed(1)}" y2="${H - PB}" stroke="#22201D" stroke-opacity=".08"/><text x="${X(x).toFixed(1)}" y="${H - PB + 17}" text-anchor="middle" class="tk">${esc(num(lab))}</text>`;
    }
    for (let y = Math.ceil(y0 / yStep) * yStep; y <= y1 + 1e-6; y += yStep) {
      s += `<line x1="${PL}" y1="${Y(y).toFixed(1)}" x2="${W - PR}" y2="${Y(y).toFixed(1)}" stroke="#22201D" stroke-opacity=".08"/><text x="${PL - 5}" y="${(Y(y) + 4.5).toFixed(1)}" text-anchor="end" class="tk">${esc(num(Math.round(y * 10) / 10))}</text>`;
    }
    s += `<path d="${path(line(-2))}" fill="none" stroke="#B8860B" stroke-width="1.4"/><path d="${path(line(-3))}" fill="none" stroke="#B6322D" stroke-width="1.4"/><path d="${path(line(0))}" fill="none" stroke="#2E7D4F" stroke-width="1.6"/><path d="${path(line(2))}" fill="none" stroke="#2E7D4F" stroke-width="1" stroke-opacity=".6"/>`;
    if (kind === 'wfl') s += `<path d="${path(line(2))}" fill="none" stroke="#B8860B" stroke-width="2" stroke-dasharray="6 4"/><path d="${path(line(3))}" fill="none" stroke="#B6322D" stroke-width="2" stroke-dasharray="6 4"/>`;
    s += `<text x="${PL + 4}" y="${PT + 14}" class="un">${esc(kind === 'lfa' ? T('cm') : T('kg'))}</text>`;
    // the child: a line through the points in order of x, the last measurement bigger
    pts.sort((a, b) => a[0] - b[0]);
    if (pts.length > 1) s += `<path d="${path(pts)}" fill="none" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/>`;
    pts.forEach(([x, y], i) => { s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${i === pts.length - 1 ? 7 : 5}" fill="#22201D" stroke="#fff" stroke-width="2"/>`; });
    s += `</svg>`;
    return `<div class="gchart" dir="ltr">${s}</div><div class="gaxis">${esc(xLabel)}</div>`;
  }
  function legend(kind) {
    const it = (cls, label) => `<span class="lg"><i class="${cls}"></i>${esc(label)}</span>`;
    return `<div class="glegend">${it('good', T('legendGood'))}${it('low', T('legendLow'))}${it('vlow', T('legendVeryLow'))}${kind === 'wfl' ? it('heavy', T('legendHeavy')) : ''}${it('kid', T('legendChild'))}</div>`;
  }

  /* ---------- screens ---------- */
  function noKid() {
    return { html: top(T('growth')) + sayRow('ui.growth', 'blk lead trow') + `<p class="muted center">${esc(T('noChildren'))}</p><button class="btn" data-action="addkid">${I.plus.replace('<svg', '<svg style="width:22px;height:22px"')} ${esc(T('addChild'))}</button>`, nav: 'family' };
  }
  function kidChips(k) {
    if (S.kids.length < 2) return '';
    return `<div class="chips">${S.kids.map((x) => `<button class="chip" data-kid="${esc(x.id)}" aria-pressed="${x.id === k.id}">${esc(x.name)}</button>`).join('')}</div>`;
  }
  function entryRow(k, e) {
    const parts = [];
    if (e.kg > 0) parts.push(`${fmt(e.kg)} ${T('kg')}`);
    if (e.cm > 0) parts.push(`${fmt(e.cm)} ${T('cm')}${e.pos ? ' · ' + T(e.pos) : ''}`);
    const mu = e.muac ? `<i class="swatch ${{ g: 'green', y: 'yellow', r: 'red' }[e.muac]}" aria-label="${esc(T({ g: 'green', y: 'yellow', r: 'red' }[e.muac]))}"></i>` : '';
    return `<div class="grow-row"><button class="gr-open" data-gr-open="${esc(e.id)}"><span class="d">${esc(fmtDate(e.d))}</span><span class="v">${esc(parts.join(' · '))} ${mu}</span></button><button class="gr-del" data-gr-del="${esc(e.id)}" aria-label="${esc(T('delete'))}">×</button></div>`;
  }
  function screenGrowth() {
    const k = kidNow(); if (!k) return noKid();
    loadWho();
    const list = entriesOf(k), age = ageDays(k.dob, todayISO());
    const ids = ['ui.growth'];
    let html = top(T('growth') + ' · ' + k.name, { back: '#/family' }) + listenBar(ids) + kidChips(k) + sayRow('ui.growth', 'blk lead trow');
    html += `<a class="btn big" href="#/growth/add">${I.plus.replace('<svg', '<svg style="width:26px;height:26px"')} ${esc(T('addMeasure'))}</a>`;
    if (age > 1826) { ids.push('ui.gr.over5'); html += sayRow('ui.gr.over5', 'blk tip trow'); }
    else if (G.who) {
      const tabs = [['wfa', 'chartWfa'], ['lfa', 'chartLfa'], ['wfl', 'chartWfl']];
      html += `<div class="gtabs" role="tablist">${tabs.map(([t, key]) => `<button role="tab" data-gr-tab="${t}" aria-selected="${G.tab === t}">${esc(T(key))}</button>`).join('')}</div>`;
      html += `<div class="gcard">${chartSvg(G.tab, k, list)}${legend(G.tab)}${sayRow('ui.gr.charts', 'trow gnote')}${G.tab === 'wfl' ? sayRow('ui.gr.wfl-lines', 'trow gnote') : ''}</div>`;
      ids.push('ui.gr.charts'); if (G.tab === 'wfl') ids.push('ui.gr.wfl-lines');
    } else html += `<div class="gcard"><p class="muted center">…</p></div>`;
    html += `<div class="panel"><h2>${esc(T('measurements'))}</h2>${list.length ? list.slice().reverse().map((e) => entryRow(k, e)).join('') : `<p class="muted">${esc(T('noMeasures'))}</p>`}</div>`;
    if (list.length) { ids.push('ui.gr.show'); html += sayRow('ui.gr.show', 'blk tip trow'); }
    html += measureLink();
    html += disclaimer();
    return { html, nav: 'family' };
  }
  function measureLink() {
    return `<div class="blk link" data-block="ui.gr.m.lead"><a class="pic" href="#/growth/measure">${ic('growth')}</a><a class="body" href="#/growth/measure"><div class="h">${esc(T('howMeasure'))}</div><div class="x">${esc(T('howMeasureSub'))}</div></a>${spk('ui.gr.m.lead')}<a class="go" href="#/growth/measure" aria-label="${esc(T('howMeasure'))}">${I.fwd}</a></div>`;
  }

  function screenAdd() {
    const k = kidNow(); if (!k) return noKid();
    loadWho();
    const age = ageDays(k.dob, todayISO());
    const f = G.form && G.form.kid === k.id ? G.form : (G.form = { kid: k.id, pos: age < 731 ? 'lying' : 'standing', muac: null });
    const ids = ['ui.gr.add', 'ui.gr.pos'];
    let html = top(T('addMeasure'), { back: '#/growth' }) + listenBar(ids);
    html += `<div class="agechip">${ic('baby')}<span>${esc(k.name)} · ${esc(ctx.ageText(k.dob))}</span></div>`;
    html += sayRow('ui.gr.add', 'blk lead trow');
    html += `<div class="form" id="grform"><label>${esc(T('gDate'))}</label>${dateSelects('g', todayISO())}`;
    html += `<label for="gr-kg">${esc(T('gWeight'))}</label><input id="gr-kg" name="kg" inputmode="decimal" autocomplete="off" placeholder="${esc(dec(num('7.5')))}">`;
    html += `<label for="gr-cm">${esc(T('gLength'))}</label><input id="gr-cm" name="cm" inputmode="decimal" autocomplete="off" placeholder="${esc(dec(num('68.5')))}">`;
    html += sayRow('ui.gr.pos', 'trow gpos');
    html += `<div class="seg gseg">${['lying', 'standing'].map((p) => `<button type="button" data-gr-pos="${p}" aria-pressed="${f.pos === p}">${esc(T(p))}</button>`).join('')}</div>`;
    if (age >= 183) {
      ids.push('ui.gr.muac');
      html += `<label>${esc(T('muacColour'))}</label>` + sayRow('ui.gr.muac', 'trow gpos');
      html += `<div class="gmuac">${[['', 'notMeasured'], ['g', 'green'], ['y', 'yellow'], ['r', 'red']].map(([v, key]) => `<button type="button" data-gr-muac="${v}" aria-pressed="${(f.muac || '') === v}">${v ? `<i class="swatch ${key}"></i>` : ''}<span>${esc(T(key))}</span></button>`).join('')}</div>`;
    }
    html += `<button class="btn big" type="button" data-gr="save">${I.check.replace('<svg', '<svg style="width:24px;height:24px"')} ${esc(T('save'))}</button>`;
    html += `<a class="btn ghost" href="#/growth">${esc(T('cancel'))}</a></div>`;
    html += measureLink();
    return { html, nav: 'family' };
  }
  function save() {
    const k = kidNow(), box = $('#grform'); if (!k || !box) return;
    const kg = parseNum($('#gr-kg').value), cm = parseNum($('#gr-cm').value);
    if (kg == null && cm == null) { toast(T('needOne')); return; }
    if ((kg != null && !(kg >= 0.5 && kg <= 80)) || (cm != null && !(cm >= 35 && cm <= 160))) { toast(T('badNumber')); return; }
    const sel = (n) => box.querySelector(`[name="${n}"]`);
    let d = readDate({ gd: sel('gd'), gm: sel('gm'), gy: sel('gy') }, 'g');
    if (d > todayISO()) d = todayISO();
    if (d < k.dob) { toast(say('ui.gr.baddate')); return; }
    const e = { id: 'm' + Date.now().toString(36), d };
    if (kg != null) e.kg = Math.round(kg * 100) / 100;
    if (cm != null) { e.cm = Math.round(cm * 10) / 10; e.pos = G.form.pos; }
    if (G.form.muac && ageDays(k.dob, d) >= 183) e.muac = G.form.muac;
    k.weights = k.weights || []; k.weights.push(e); saveKids();
    G.form = null; G.last = e.id; ctx.store.set('grLast', e.id); G.speak = true;
    track('tool', { p: 'growth-add' });
    location.hash = '#/growth/result';
  }

  function screenResult() {
    const k = kidNow(); if (!k) return noKid();
    loadWho();
    const list = entriesOf(k), e = list.find((x) => x.id === G.last) || list[list.length - 1];
    if (!e) { location.hash = '#/growth'; return screenGrowth(); }
    let html = top(T('result'), { back: '#/growth' });
    if (!G.who) return { html: html + `<p class="muted center">…</p>`, nav: 'family' };
    const res = assess(G.who, k, e, list), ids = res.say.concat(res.tips);
    html += listenBar(ids);
    const z = res.z, parts = [];
    if (e.kg > 0) parts.push(`<b>${esc(fmt(e.kg))}</b> ${esc(T('kg'))}`);
    if (e.cm > 0) parts.push(`<b>${esc(fmt(e.cm))}</b> ${esc(T('cm'))} <small>${esc(e.pos ? T(e.pos) : '')}</small>`);
    if (e.muac) parts.push(`<i class="swatch ${{ g: 'green', y: 'yellow', r: 'red' }[e.muac]}"></i>`);
    html += `<div class="gsum"><div class="gwho">${esc(k.name)} · ${esc(fmtDate(e.d))}</div><div class="gvals">${parts.join('<span class="sep"></span>')}</div>`;
    const st = [['wfa', 'chartWfa', z.wfa], ['lfa', 'chartLfa', z.lhfa], ['wfl', 'chartWfl', z.wfl]].map(([ind, key, v]) => [key, status(ind, v)]).filter(([, s]) => s);
    if (st.length) html += `<div class="gstat">${st.map(([key, [cls, word]]) => `<span class="gs ${cls}"><span>${esc(T(key))}</span><b>${esc(word)}</b></span>`).join('')}</div>`;
    html += `</div>`;
    html += verdictHtml(res);
    if (res.hosp) html += hospitalBox();
    html += res.tips.map((id) => sayRow(id, 'blk tip trow')).join('');
    html += `<a class="btn" href="#/growth">${ic('growth')} ${esc(T('seeCharts'))}</a>`;
    if (res.lv !== 'ok') html += `<a class="btn ghost" href="#/near">${ic('hospital')} ${esc(T('near'))}</a>`;
    html += disclaimer();
    if (G.speak) { G.speak = false; setTimeout(() => autoplay(ids), 500); }
    track('tool', { p: 'growth-result-' + res.lv });
    return { html, nav: 'family' };
  }

  const GUIDE = [['ui.gr.m.hang', 'img/topics/growth.svg'], ['ui.gr.m.hold', 'img/pics/measure-hold.svg'], ['ui.gr.m.length1', 'img/pics/measure-length.svg'],
    ['ui.gr.m.length2', null], ['ui.gr.m.height', 'img/pics/measure-height.svg'], ['ui.gr.m.muac', 'img/topics/kit-muac.svg']];
  function screenMeasure() {
    const ids = ['ui.gr.m.lead', ...GUIDE.map((g) => g[0]), 'ui.gr.m.exact'];
    let html = top(T('howMeasure'), { back: kidNow() ? '#/growth' : '#/family' }) + listenBar(ids) + sayRow('ui.gr.m.lead', 'blk lead trow');
    let n = 0;
    for (const [id, pic] of GUIDE) {
      const txt = say(id), m = /^([^:：]{2,40})[:：]\s*(.+)$/s.exec(txt), head = m ? m[1] : '', body = m ? m[2] : txt;
      if (head) n++;
      html += `<div class="blk step${pic ? ' haspic' : ''} gstep" data-block="${esc(id)}">${pic ? `<img class="fig" src="${esc(pic)}" alt="" loading="lazy">` : ''}<div class="body">${head ? `<div class="h"><span class="num">${esc(num(n))}</span><span>${esc(head)}</span></div>` : ''}<div class="x">${esc(body)}</div></div>${spk(id)}</div>`;
    }
    html += sayRow('ui.gr.m.exact', 'blk tip trow');
    if (S.book.topics['kit-muac']) html += ctx.topicCard('kit-muac');
    html += disclaimer();
    return { html, nav: 'family' };
  }

  /* ---------- pieces for other screens ---------- */
  // My family: the child's growth panel (replaces the old weight list)
  function familyPanel(k) {
    loadWho();
    const list = entriesOf(k), e = list[list.length - 1];
    let h = `<div class="panel gpanel"><h2>${esc(T('growth'))}</h2>`;
    if (e) {
      const parts = [];
      if (e.kg > 0) parts.push(`${fmt(e.kg)} ${T('kg')}`);
      if (e.cm > 0) parts.push(`${fmt(e.cm)} ${T('cm')}`);
      h += `<div class="wrow"><span>${esc(T('lastCheck'))} · ${esc(fmtDate(e.d))}</span><b>${esc(parts.join(' · '))}</b></div>`;
      if (G.who && ageDays(k.dob, e.d) <= 1826) {
        const res = assess(G.who, k, e, list), f = FINDINGS[res.keys[0]], [cls, label] = LV[f.lv];
        h += `<button class="gline ${cls}" data-gr-open="${esc(e.id)}"><b>${esc(T(label))}</b><span>${esc(say(f.say[0]))}</span></button>`;
      }
    } else h += `<p class="muted" style="margin:4px 0">${esc(T('noMeasures'))}</p>`;
    h += `<div class="row2 gbtns"><a class="btn" href="#/growth/add">${I.plus.replace('<svg', '<svg style="width:20px;height:20px"')} ${esc(T('addMeasure'))}</a><a class="btn ghost" href="#/growth">${ic('growth')} ${esc(T('seeCharts'))}</a></div></div>`;
    return h;
  }
  // a square tile for the home screen's quick tools (config.home "growth")
  function homeTile() {
    return `<div class="quick tool child" data-block="ui.growth"><a href="#/growth" style="display:contents">${ic('growth')}<span class="t">${esc(T('growth'))}</span></a>${spk('ui.growth')}</div>`;
  }

  /* ---------- taps ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-gr],[data-gr-tab],[data-gr-pos],[data-gr-muac],[data-gr-open],[data-gr-del]'); if (!t) return;
    const d = t.dataset;
    if (d.grTab) { G.tab = d.grTab; ctx.render(); return; }
    if (d.grPos) { if (G.form) G.form.pos = d.grPos; $$('[data-gr-pos]').forEach((b) => b.setAttribute('aria-pressed', b === t)); return; }
    if (d.grMuac !== undefined) { if (G.form) G.form.muac = d.grMuac || null; $$('[data-gr-muac]').forEach((b) => b.setAttribute('aria-pressed', b === t)); return; }
    if (d.grOpen) { G.last = d.grOpen; ctx.store.set('grLast', G.last); G.speak = true; if (location.hash === '#/growth/result') ctx.render(); else location.hash = '#/growth/result'; return; }
    if (d.grDel) {
      const k = kidNow(); if (!k || !confirm(T('deleteMeasureQ'))) return;
      k.weights = (k.weights || []).filter((x) => x.id !== d.grDel); saveKids(); ctx.render(); return;
    }
    if (d.gr === 'save') save();
  });
  // opening "add" from another page starts a fresh form
  addEventListener('hashchange', () => { if (location.hash !== '#/growth/add') G.form = null; });

  function screen(sub) {
    if (sub === 'add') return screenAdd();
    if (sub === 'result') return screenResult();
    if (sub === 'measure') return screenMeasure();
    return screenGrowth();
  }
  return { screen, familyPanel, homeTile };
}
