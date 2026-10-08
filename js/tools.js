// Sehat tools: the breathing counter (#/tool/breaths), "What does the number mean?" (#/tool/reading[/device]),
// the home health kit screen (#/kit) and the "link" topic block. Plain ES module, works offline.
// js/app.js calls initTools(ctx) once with its own helpers (T, L, num, spk, play …) and routes to the screens below.
//
// MEDICAL THRESHOLDS live in BR_AGES and in the verdict functions (verdictTemp, verdictBp, …) below.
// Each one is listed with its source in docs/HOME_KIT.md. Change them only together with that table and
// with the topic pages that say the same thing (cough, danger-child, fever, kit-*). Nothing here diagnoses:
// every result says what to do and when to see a health worker, and is read aloud from content/src/ui.json "say".

export function initTools(ctx) {
  const { S, $, esc, T, L, num, ic, I, spk, play, stopAudio, hasAudio, ttsVoice, track, listenBar, disclaimer, topicCard } = ctx;
  const say = (id) => L(S.book.narration[id]);
  const canSay = (ids) => ids.some((id) => hasAudio(id)) || !!ttsVoice();
  const autoplay = (ids) => { ids = ids.filter((id) => S.book.narration[id]); if (ids.length && canSay(ids)) play(ids); };
  const dec = (s) => (S.lang === 'en' ? s : s.replace('.', '٫'));
  const fmt = (x, d = 1) => dec(num(Number(x).toFixed(d).replace(/\.0+$/, '')));
  // a narrated row: the text, then its speaker (tapping the text also reads it)
  const sayRow = (id, cls = 'trow') => `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(say(id))}</div>${spk(id)}</div>`;
  const rerender = () => { ctx.render(); scrollTo(0, 0); };
  // where "back" goes from the first step of a tool: the page the person came from
  let prevHash = '#/home', curHash = location.hash;
  addEventListener('hashchange', () => {
    const h = location.hash;
    if (h.split('/')[1] !== curHash.split('/')[1]) prevHash = curHash || '#/home';
    // opening a tool from another page starts it from the beginning
    if (h !== curHash && h.startsWith('#/tool/breaths')) { brStop(); BR.phase = 'age'; }
    if (h !== curHash && h.startsWith('#/tool/reading')) { const sub = h.split('/')[3]; rdReset(DEV[sub] ? sub : null); }
    if (!h.startsWith('#/tool/breaths')) brStop();
    curHash = h;
  });
  const topBar = (title, action) => `<div class="top"><button class="round" data-tool-back="${action}" aria-label="${esc(T('back'))}">${I.back}</button><h1>${esc(title)}</h1></div>`;
  const back = () => { location.hash = prevHash && !prevHash.startsWith('#/tool') ? prevHash : '#/home'; };

  // item text and icon from any topic (danger signs are reused from the topic pages, so they share one audio clip)
  // (built when first needed: the book loads after this module starts, and can be replaced by a newer one)
  let icons = null, iconsOf = null;
  const itemIcon = (id) => {
    if (iconsOf !== S.book) {
      icons = { 'ui.rd.s.faint': 'sleepy', 'ui.rd.s.blue': 'breathe', 'ui.rd.s.deep': 'breathing-fast' }; iconsOf = S.book;
      for (const t of Object.values(S.book.topics)) for (const b of t.blocks || []) for (const it of b.items || []) icons[it.id] = it.icon;
    }
    return icons[id] || 'warning';
  };
  const signChip = (id, on, attr) => `<div class="sign${on ? ' on' : ''}" data-block="${esc(id)}"><button class="sbody" ${attr}="${esc(id)}" aria-pressed="${!!on}"><span class="pic">${ic(itemIcon(id))}</span><span class="x">${esc(say(id))}</span><span class="tick">${I.check}</span></button>${spk(id)}</div>`;

  const LV = { urgent: ['lvUrgent', 'hospital'], today: ['lvToday', 'clinic'], soon: ['lvSoon', 'calendar'], watch: ['lvWatch', 'house'], ok: ['lvOk', 'check'], check: ['lvCheck', 'warning'] };
  const verdictCard = (lv, sayId) => `<div class="verdict ${lv}"><div class="vh">${ic(LV[lv][1])}<span>${esc(T(LV[lv][0]))}</span></div>${sayRow(sayId, 'trow vb')}</div>`;

  /* ======================= breathing counter ======================= */
  // WHO IMCI fast breathing: under 2 months 60 or more, 2 to 12 months 50 or more, 12 months to 5 years 40 or more.
  // Fast breathing alone: under 2 months = hospital now (IMCI young infant: severe illness, refer); 2 to 59 months = clinic
  // today (IMCI "pneumonia", yellow: amoxicillin at the clinic). Older children and adults: 30 or more = clinic today,
  // 40 or more = hospital now (judgement calls, see docs/HOME_KIT.md). "slow" = count again (newborn under 30 is a PCPNC danger sign).
  const BR_AGES = [
    { id: 'young', who: 'ui.who.young', icon: 'newborn-warm', fast: 60, slow: 30, fastLv: 'urgent', fastSay: 'ui.br.v.fast-young',
      signs: ['danger-child.young.chest', 'danger-child.young.feed', 'danger-child.young.convulsion', 'danger-child.young.move', 'danger-child.young.temperature'] },
    { id: 'infant', who: 'ui.who.infant', icon: 'baby', fast: 50, slow: 20, fastLv: 'today', fastSay: 'ui.br.v.fast',
      signs: ['danger-child.urgent.chest', 'cough.urgent.noise', 'danger-child.urgent.drink', 'danger-child.urgent.vomit', 'danger-child.urgent.convulsion', 'danger-child.urgent.sleepy'] },
    { id: 'child', who: 'ui.who.child', icon: 'milestones', fast: 40, slow: 15, fastLv: 'today', fastSay: 'ui.br.v.fast',
      signs: ['danger-child.urgent.chest', 'cough.urgent.noise', 'danger-child.urgent.drink', 'danger-child.urgent.vomit', 'danger-child.urgent.convulsion', 'danger-child.urgent.sleepy'] },
    { id: 'older', who: 'ui.who.older', icon: 'people', fast: 30, veryFast: 40, slow: 10, fastLv: 'today', fastSay: 'ui.br.v.fast-older',
      signs: ['red-flags.urgent.breathing', 'ui.rd.s.blue', 'red-flags.urgent.confused', 'red-flags.urgent.chest-pain'] },
  ];
  const BR = { age: null, phase: 'age', n: 0, t0: 0, timer: null, left: 60, danger: new Set(), told: false, ac: null, lock: null };
  const SECS = 60;
  function brVerdict(a, n) {
    if (n < a.slow) return { lv: 'check', say: 'ui.br.v.slow' };
    if (a.veryFast && n >= a.veryFast) return { lv: 'urgent', say: 'ui.br.v.veryfast' };
    if (n >= a.fast) return { lv: a.fastLv, say: a.fastSay };
    return { lv: 'ok', say: 'ui.br.v.ok' };
  }
  function brStop() {
    clearInterval(BR.timer); BR.timer = null;
    if (BR.lock) { try { BR.lock.release(); } catch {} BR.lock = null; }
    if (BR.phase === 'count') BR.phase = 'ready';
  }
  function chime() {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const ac = BR.ac || (BR.ac = new A()), t = ac.currentTime;
      [[659, 0], [880, 0.28]].forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
        o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.75);
      });
    } catch {}
  }
  function brStart() {
    stopAudio();
    try { const A = window.AudioContext || window.webkitAudioContext; if (A) { BR.ac = BR.ac || new A(); BR.ac.resume(); } } catch {}
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { BR.lock = l; }).catch(() => {}); } catch {}
    Object.assign(BR, { phase: 'count', n: 0, t0: performance.now(), left: SECS, danger: new Set() });
    rerender();
    BR.timer = setInterval(brTick, 200);
    track('tool', { p: 'breaths', a: BR.age });
  }
  function brTick() {
    const left = Math.max(0, SECS - (performance.now() - BR.t0) / 1000);
    BR.left = left;
    const s = $('#br-sec'), ring = $('#br-ring');
    if (s) s.textContent = num(Math.ceil(left));
    if (ring) ring.style.strokeDashoffset = String(289 * (1 - left / SECS));
    if (left <= 0) brDone();
  }
  function brDone() {
    clearInterval(BR.timer); BR.timer = null;
    if (BR.lock) { try { BR.lock.release(); } catch {} BR.lock = null; }
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch {}
    chime();
    BR.phase = 'result'; rerender();
    const a = BR_AGES.find((x) => x.id === BR.age), v = brVerdict(a, BR.n);
    track('tool', { p: 'breaths-result', a: a.id, lv: v.lv });
    setTimeout(() => autoplay([v.say, ...(v.lv === 'ok' || v.lv === 'check' ? [] : ['ui.br.clinic']), 'ui.br.check']), 900);
  }
  function brTap() {
    if (BR.phase !== 'count') return;
    BR.n++;
    const c = $('#br-n'); if (c) c.textContent = num(BR.n);
    const b = $('#br-tap'); if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
    try { if (navigator.vibrate) navigator.vibrate(12); } catch {}
  }

  function screenBreaths() {
    const a = BR_AGES.find((x) => x.id === BR.age);
    if (!a) BR.phase = 'age';
    let html = '', ids = [];
    if (BR.phase === 'age') {
      ids = ['ui.br.intro', ...BR_AGES.map((x) => x.who)];
      html += topBar(T('breaths'), 'exit') + listenBar(ids) + sayRow('ui.br.intro', 'blk lead');
      html += `<div class="picks">${BR_AGES.map((x) => `<div class="pick${x.id === 'older' ? ' adult' : ''}" data-block="${x.who}"><button class="pbody" data-br-age="${x.id}">${ic(x.icon)}<span class="t">${esc(say(x.who))}</span><span class="s">${esc(T('fastFrom', { n: num(x.fast) }))}</span></button>${spk(x.who)}</div>`).join('')}</div>`;
    } else if (BR.phase === 'ready') {
      ids = [a.who, 'ui.br.calm', 'ui.br.uncover', 'ui.br.watch', 'ui.br.start'];
      html += topBar(T('breaths'), 'age') + listenBar(ids);
      html += `<div class="agechip" data-block="${a.who}">${ic(a.icon)}<span>${esc(say(a.who))}</span><button class="sbtn ghost" data-br="age">${esc(T('otherAge'))}</button></div>`;
      html += `<img class="toolpic" src="img/pics/breath-watch.svg" alt="">`;
      html += [['ui.br.calm', 'sleep'], ['ui.br.uncover', 'baby'], ['ui.br.watch', 'breathing-fast'], ['ui.br.start', 'clock']].map(([id, icn], i) => `<div class="blk step" data-block="${id}"><div class="pic">${ic(icn)}</div><div class="body"><div class="h"><span class="num">${num(i + 1)}</span></div><div class="x">${esc(say(id))}</div></div>${spk(id)}</div>`).join('');
      html += `<button class="btn big" data-br="start">${I.play.replace('<svg', '<svg style="width:26px;height:26px;fill:#fff"')} ${esc(T('start'))}</button>`;
    } else if (BR.phase === 'count') {
      html += topBar(T('breaths'), 'stop');
      html += `<div class="counter"><div class="clock"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="trk"/><circle id="br-ring" cx="50" cy="50" r="46" class="arc" style="stroke-dashoffset:${289 * (1 - BR.left / SECS)}"/></svg><div><b id="br-sec">${num(Math.ceil(BR.left))}</b><span>${esc(T('seconds'))}</span></div></div>
        <button id="br-tap" class="tapbig" data-br="tap" aria-label="${esc(T('tapBreath'))}"><b id="br-n">${num(BR.n)}</b><span>${esc(T('tapBreath'))}</span></button>
        <div class="row2"><button class="btn ghost" data-br="undo">${esc(T('undo'))}</button><button class="btn ghost" data-br="stop">${esc(T('stop'))}</button></div></div>`;
    } else {
      const v = brVerdict(a, BR.n);
      ids = [v.say, ...(v.lv === 'ok' || v.lv === 'check' ? [] : ['ui.br.clinic']), 'ui.br.check', 'ui.br.indrawing', ...a.signs.filter((x) => x !== 'danger-child.urgent.chest' && x !== 'danger-child.young.chest')];
      html += topBar(T('breaths'), 'age') + listenBar(ids);
      html += `<div class="bigread"><b>${num(BR.n)}</b><span>${esc(T('breathsMin', { n: '' }).trim())}</span><small>${esc(say(a.who))} · ${esc(T('fastFrom', { n: num(a.fast) }))}</small></div>`;
      html += verdictCard(v.lv, v.say);
      if (v.lv !== 'ok' && v.lv !== 'check') html += `<div class="clinicbox">${ic('clinic')}${sayRow('ui.br.clinic')}</div>`;
      html += brDangerHtml(a);
      html += `<div class="row2"><button class="btn" data-br="again">${esc(T('countAgain'))}</button><button class="btn ghost" data-br="age">${esc(T('otherAge'))}</button></div>`;
      html += `<a class="btn ghost" href="#/near">${ic('hospital')} ${esc(T('near'))}</a>`;
    }
    html += disclaimer();
    track('view', { p: 'tool/breaths/' + BR.phase });
    // no bottom bar while counting, so a stray tap cannot leave the count
    return { html, nav: BR.phase === 'count' ? false : 'home', adult: a && a.id === 'older' };
  }
  function brDangerHtml(a) {
    const chest = a.signs[0].endsWith('.chest') ? a.signs[0] : null;
    let h = `<div class="dcheck" id="br-danger">${BR.danger.size ? verdictCard('urgent', 'ui.br.v.danger') : ''}${sayRow('ui.br.check', 'trow dq')}`;
    if (chest) h += `<div class="figcard${BR.danger.has(chest) ? ' on' : ''}" data-block="ui.br.indrawing"><img src="img/pics/chest-indrawing.svg" alt=""><div class="trow"><div class="body">${esc(say('ui.br.indrawing'))}</div>${spk('ui.br.indrawing')}</div>${signChip(chest, BR.danger.has(chest), 'data-br-sign')}</div>`;
    h += a.signs.filter((x) => x !== chest).map((x) => signChip(x, BR.danger.has(x), 'data-br-sign')).join('');
    return h + '</div>';
  }

  /* ======================= "What does the number mean?" ======================= */
  const DEV = {
    temp: { topic: 'kit-thermometer', who: ['baby2m', 'child2m', 'older', 'pregnant'], enter: 'ui.rd.enter.temp', dot: true },
    bp: { topic: 'kit-bp', who: ['adult', 'pregnant'], enter: 'ui.rd.enter.bp', two: true },
    sugar: { topic: 'kit-glucometer', who: null, enter: 'ui.rd.enter.sugar' },
    spo2: { topic: 'kit-oximeter', who: ['older', 'under5'], enter: 'ui.rd.enter.spo2' },
    muac: { topic: 'kit-muac', who: null, enter: 'ui.rd.enter.muac', colour: true },
  };
  const WHO_ICON = { baby2m: 'newborn-warm', child2m: 'milestones', older: 'people', pregnant: 'pregnant', adult: 'people', under5: 'baby' };
  // signs asked before the result: [narration id, kind]. kind u = hospital now whatever the number; other kinds change the verdict below
  const SIGNS = {
    'temp/baby2m': [['newborn.urgent.feed', 'u'], ['newborn.urgent.convulsion', 'u'], ['newborn.urgent.move', 'u'], ['newborn.urgent.breathing', 'u']],
    'temp/child2m': [['fever.urgent.convulsion', 'u'], ['fever.urgent.neck', 'u'], ['fever.urgent.sleepy', 'u'], ['fever.urgent.drink', 'u'], ['fever.urgent.vomit', 'u'], ['fever.urgent.rash', 'u']],
    'temp/older': [['red-flags.urgent.fever-neck', 'u'], ['red-flags.urgent.confused', 'u'], ['red-flags.urgent.breathing', 'u'], ['fever.urgent.convulsion', 'u']],
    'temp/pregnant': [['pregnancy-danger.urgent.fever-weak', 'u'], ['pregnancy-danger.urgent.belly-pain', 'u'], ['pregnancy-danger.urgent.bleeding', 'u'], ['pregnancy-danger.urgent.breathing', 'u'], ['pregnancy-danger.urgent.fits', 'u']],
    'bp/adult': [['blood-pressure.urgent.chest', 'u'], ['blood-pressure.urgent.face', 'u'], ['blood-pressure.urgent.weak', 'u'], ['blood-pressure.urgent.speech', 'u'], ['blood-pressure.urgent.headache', 'u'], ['red-flags.urgent.breathing', 'u'], ['red-flags.urgent.confused', 'u'], ['ui.rd.s.faint', 'faint']],
    'bp/pregnant': [['pregnancy-danger.urgent.headache', 'u'], ['pregnancy-danger.urgent.fits', 'u'], ['pregnancy-danger.urgent.belly-pain', 'u'], ['pregnancy-danger.urgent.breathing', 'u'], ['pregnancy-danger.soon.swelling', 'swell'], ['ui.rd.s.faint', 'faint']],
    sugar: [['red-flags.urgent.confused', 'conf'], ['fever.urgent.convulsion', 'conf'], ['diabetes.urgent.vomiting', 'u'], ['ui.rd.s.deep', 'u']],
    'spo2/older': [['red-flags.urgent.breathing', 'u'], ['ui.rd.s.blue', 'u'], ['red-flags.urgent.confused', 'u'], ['red-flags.urgent.chest-pain', 'u']],
    'spo2/under5': [['danger-child.urgent.chest', 'u'], ['ui.rd.s.blue', 'u'], ['danger-child.urgent.sleepy', 'u'], ['danger-child.urgent.drink', 'u']],
    muac: [['growth.urgent.feet', 'u'], ['growth.urgent.eat', 'u'], ['danger-child.urgent.sleepy', 'u'], ['danger-child.urgent.convulsion', 'u']],
  };
  const RD = { dev: null, who: null, phase: 'dev', a: '', b: '', field: 'a', unit: 'mg', colour: null, signs: new Set() };
  const signList = () => (SIGNS[RD.dev + '/' + RD.who] || SIGNS[RD.dev] || []).filter(([id]) => S.book.narration[id]);
  const has = (kind) => signList().some(([id, k]) => k === kind && RD.signs.has(id));
  const parse = (s) => { const x = parseFloat(String(s)); return isFinite(x) ? x : NaN; };

  // ---- verdicts: { lv, say, note? }  (lv: urgent | today | soon | watch | ok | check)
  function verdictTemp() {
    let t = parse(RD.a), f = null;
    if (t >= 86 && t <= 111) { f = t; t = Math.round(((t - 32) * 5) / 9 * 10) / 10; } // looks like Fahrenheit
    const out = (lv, s) => ({ lv, say: s, c: t, f });
    if (!(t >= 30 && t <= 43.5)) return out('check', 'ui.rd.check');
    if (has('u')) return out('urgent', 'ui.rd.v.sign');
    if (RD.who === 'baby2m') {                    // WHO IMCI young infant; Mo (8 Oct 2026): any fever under 2 months = hospital
      if (t >= 37.5) return out('urgent', 'ui.rd.v.temp-baby-fever');
      if (t < 35.5) return out('urgent', 'ui.rd.v.temp-baby-cold');   // IMCI: below 35.5 = very severe disease
      if (t < 36.5) return out('today', 'ui.rd.v.temp-baby-cool');    // WHO thermal protection: rewarm, recheck
      return out('ok', 'ui.rd.v.temp-baby-ok');
    }
    if (t < 35) return out('urgent', 'ui.rd.v.temp-cold');           // hypothermia
    if (t < 36) return out('watch', 'ui.rd.v.temp-low');
    if (t >= 41) return out('urgent', 'ui.rd.v.temp-very-high');     // judgement call
    if (t < 37.5) return out('ok', 'ui.rd.v.temp-ok');               // IMCI fever = 37.5 or more
    if (RD.who === 'pregnant') return out('today', 'ui.rd.v.temp-pregnant');
    if (RD.who === 'child2m') return t >= 39 ? out('today', 'ui.rd.v.temp-high') : out('watch', 'ui.rd.v.temp-child-fever');
    return t >= 39.5 ? out('today', 'ui.rd.v.temp-high') : out('watch', 'ui.rd.v.temp-fever');
  }
  function verdictBp() {
    const s = parse(RD.a), d = parse(RD.b), out = (lv, x) => ({ lv, say: x });
    if (!(s >= 50 && s <= 300 && d >= 25 && d <= 200)) return out('check', 'ui.rd.check');
    if (s <= d) return out('check', 'ui.rd.bp-order');
    if (has('u')) return out('urgent', 'ui.rd.v.sign');               // stroke, chest pain, severe headache, fits… = hospital whatever the number
    if (RD.who === 'pregnant') {                                       // NICE NG133, WHO ANC 2016
      if (s >= 160 || d >= 110) return out('urgent', 'ui.rd.v.bp-preg-severe');
      if (s >= 140 || d >= 90) return has('swell') ? out('urgent', 'ui.rd.v.bp-preg-signs') : out('today', 'ui.rd.v.bp-preg-high');
      if (s < 90) return has('faint') ? out('today', 'ui.rd.v.bp-low-faint') : out('watch', 'ui.rd.v.bp-low');
      if (has('swell') || has('faint')) return out('today', 'ui.rd.v.bp-normal-sign');
      return out('ok', 'ui.rd.v.bp-preg-ok');
    }
    if (s >= 180 || d >= 120) return out('urgent', 'ui.rd.v.bp-very-high'); // NICE NG136 / ISH 2020
    if (s < 90) return has('faint') ? out('today', 'ui.rd.v.bp-low-faint') : out('watch', 'ui.rd.v.bp-low');
    if (s >= 135 || d >= 85) return out('soon', 'ui.rd.v.bp-high');  // home BP 135/85 (ISH 2020, NICE)
    if (has('faint')) return out('today', 'ui.rd.v.bp-normal-sign');
    return out('ok', 'ui.rd.v.bp-ok');
  }
  function sugarMg() {
    if (RD.a === 'HI') return 600; if (RD.a === 'LO') return 20;
    const x = parse(RD.a); return RD.unit === 'mmol' ? x * 18 : x;
  }
  function verdictSugar() {
    const g = sugarMg(), out = (lv, x) => ({ lv, say: x, mg: g });
    if (!(g >= 10 && g <= 700)) return out('check', 'ui.rd.check');
    if (has('conf')) return out('urgent', g < 70 ? 'ui.rd.v.sugar-low-sign' : 'ui.rd.v.sign');
    if (g < 54) return out('urgent', 'ui.rd.v.sugar-very-low');       // ADA level 2 hypoglycaemia
    if (has('u')) return out('urgent', 'ui.rd.v.sign');
    if (g < 70) return out('today', 'ui.rd.v.sugar-low');            // ADA level 1 hypoglycaemia
    if (g >= 400) return out('urgent', 'ui.rd.v.sugar-danger');       // judgement call (meter HI is usually over 500 or 600)
    if (g >= 250) return out('today', 'ui.rd.v.sugar-very-high');
    if (g > 180) return out('soon', 'ui.rd.v.sugar-high');           // ADA: under 180 two hours after meals
    return out('ok', 'ui.rd.v.sugar-ok');
  }
  function verdictSpo2() {
    const p = parse(RD.a), out = (lv, x) => ({ lv, say: x });
    if (!(p >= 50 && p <= 100)) return out('check', 'ui.rd.check');
    if (has('u')) return out('urgent', 'ui.rd.v.sign');
    if (p <= 92) return out('urgent', 'ui.rd.v.spo2-low');           // NHS home oximetry; WHO oxygen under 90
    if (p <= 94) return out('today', 'ui.rd.v.spo2-lowish');
    return out('ok', 'ui.rd.v.spo2-ok');
  }
  function verdictMuac() {
    if (has('u')) return { lv: 'urgent', say: 'ui.rd.v.sign' };
    return { red: { lv: 'today', say: 'ui.rd.v.muac-red' }, yellow: { lv: 'soon', say: 'ui.rd.v.muac-yellow' }, green: { lv: 'ok', say: 'ui.rd.v.muac-green' } }[RD.colour] || { lv: 'check', say: 'ui.rd.check' };
  }
  const verdict = () => ({ temp: verdictTemp, bp: verdictBp, sugar: verdictSugar, spo2: verdictSpo2, muac: verdictMuac }[RD.dev])();

  const devTitle = (d) => L(S.book.topics[DEV[d].topic] && S.book.topics[DEV[d].topic].title);
  const devImg = (d) => (S.book.topics[DEV[d].topic] && S.book.topics[DEV[d].topic].image) || 'img/app/placeholder.svg';
  const valueOk = () => {
    if (RD.dev === 'muac') return !!RD.colour;
    if (RD.dev === 'bp') return RD.a.length >= 2 && RD.b.length >= 2;
    return RD.a.length > 0 && RD.a !== '.';
  };
  const shown = (v) => (v === 'HI' || v === 'LO' ? v : v ? dec(num(v)) : '');
  function readingText() {
    if (RD.dev === 'bp') return `${num(RD.a)} / ${num(RD.b)}`;
    if (RD.dev === 'temp') return `${shown(RD.a)} °`;
    if (RD.dev === 'sugar') return `${shown(RD.a)} ${RD.a === 'HI' || RD.a === 'LO' ? '' : RD.unit === 'mmol' ? 'mmol/L' : 'mg/dL'}`;
    if (RD.dev === 'spo2') return `${shown(RD.a)}%`;
    return '';
  }
  function keypad() {
    const dot = RD.dev === 'temp' || (RD.dev === 'sugar' && RD.unit === 'mmol');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', dot ? '.' : '', '0', 'del'];
    return `<div class="keypad" dir="ltr">${keys.map((k) => (k ? `<button data-rd-key="${k}" aria-label="${k === 'del' ? '⌫' : k}">${k === 'del' ? '⌫' : k === '.' ? dec('.') : num(k)}</button>` : '<span></span>')).join('')}</div>`;
  }
  function screenReading(dev) {
    if (dev && DEV[dev] && RD.dev !== dev) rdReset(dev);
    if (!RD.dev) RD.phase = 'dev';
    const D = DEV[RD.dev];
    let html = '', ids = [];
    if (RD.phase === 'dev') {
      ids = ['ui.rd.intro', ...Object.values(DEV).map((x) => x.topic + '.title')];
      html += topBar(T('reading'), 'exit') + listenBar(ids) + sayRow('ui.rd.intro', 'blk lead');
      html += `<div class="devs">${Object.keys(DEV).map((d) => `<div class="dev" data-block="${DEV[d].topic}.title"><button class="dbody" data-rd-dev="${d}"><img src="${esc(devImg(d))}" alt=""><span class="t">${esc(devTitle(d))}</span></button>${spk(DEV[d].topic + '.title')}</div>`).join('')}</div>`;
    } else if (RD.phase === 'who') {
      ids = ['ui.rd.who', ...D.who.map((w) => 'ui.who.' + w)];
      html += topBar(devTitle(RD.dev), 'dev') + listenBar(ids) + sayRow('ui.rd.who', 'trow dq');
      html += `<div class="picks">${D.who.map((w) => `<div class="pick" data-block="ui.who.${w}"><button class="pbody" data-rd-who="${w}">${ic(WHO_ICON[w])}<span class="t">${esc(say('ui.who.' + w))}</span></button>${spk('ui.who.' + w)}</div>`).join('')}</div>`;
    } else if (RD.phase === 'val') {
      ids = [D.enter];
      html += topBar(devTitle(RD.dev), D.who ? 'who' : 'dev') + whoLine() + sayRow(D.enter, 'trow dq');
      if (D.colour) {
        html += `<div class="tapes">${['red', 'yellow', 'green'].map((c) => `<button class="tape ${c}" data-rd-colour="${c}" aria-pressed="${RD.colour === c}"><i></i><span>${esc(T(c))}</span></button>`).join('')}</div>`;
      } else {
        if (RD.dev === 'sugar') html += `<div class="seg units" dir="ltr"><button data-rd-unit="mg" aria-pressed="${RD.unit === 'mg'}">mg/dL</button><button data-rd-unit="mmol" aria-pressed="${RD.unit === 'mmol'}">mmol/L</button></div>`;
        if (D.two) html += `<div class="vals" dir="ltr"><button class="val${RD.field === 'a' ? ' on' : ''}" data-rd-field="a"><small>${esc(T('bpTop'))}</small><b>${num(RD.a) || '–'}</b></button><span class="slash">/</span><button class="val${RD.field === 'b' ? ' on' : ''}" data-rd-field="b"><small>${esc(T('bpBottom'))}</small><b>${num(RD.b) || '–'}</b></button></div>`;
        else html += `<div class="vals" dir="ltr"><div class="val on one"><b>${shown(RD.a) || '–'}</b><small>${RD.dev === 'temp' ? '°C' : RD.dev === 'spo2' ? '%' : RD.unit === 'mmol' ? 'mmol/L' : 'mg/dL'}</small></div></div>`;
        html += keypad();
        if (RD.dev === 'sugar') html += `<div class="row2 hilo" dir="ltr"><button class="btn ghost" data-rd-key="HI">HI</button><button class="btn ghost" data-rd-key="LO">LO</button></div>`;
      }
      html += `<button class="btn big" data-rd="next"${valueOk() ? '' : ' disabled'}>${esc(T('next'))} ${I.fwd.replace('<svg', '<svg style="width:22px;height:22px"')}</button>`;
    } else if (RD.phase === 'signs') {
      const list = signList();
      ids = ['ui.rd.signs', ...list.map(([id]) => id)];
      html += topBar(devTitle(RD.dev), 'val') + listenBar(ids) + whoLine() + sayRow('ui.rd.signs', 'trow dq');
      html += list.map(([id]) => signChip(id, RD.signs.has(id), 'data-rd-sign')).join('');
      html += `<button class="btn big" data-rd="result">${esc(T('showMeaning'))}</button>`;
    } else {
      const v = verdict(), extra = [];
      html += topBar(devTitle(RD.dev), 'val');
      let read = RD.dev === 'muac' ? `<span class="swatch ${esc(RD.colour)}"></span>${esc(T(RD.colour))}` : esc(readingText());
      html += `<div class="bigread rd"><img src="${esc(devImg(RD.dev))}" alt=""><div><b dir="ltr">${read}</b><small>${RD.who ? esc(say('ui.who.' + RD.who)) : ''}</small></div></div>`;
      if (RD.dev === 'temp' && v.f) html += `<p class="muted center">${esc(T('fToC', { f: fmt(v.f), c: fmt(v.c) }))}</p>`;
      if (RD.dev === 'sugar' && isFinite(v.mg) && RD.a !== 'HI' && RD.a !== 'LO') html += `<p class="muted center" dir="ltr">${RD.unit === 'mmol' ? `≈ ${num(Math.round(v.mg))} mg/dL` : `≈ ${fmt(v.mg / 18)} mmol/L`}</p>`;
      html += verdictCard(v.lv, v.say);
      const chosen = signList().filter(([id]) => RD.signs.has(id));
      if (chosen.length) html += `<div class="chosen">${chosen.map(([id]) => `<span>${ic(itemIcon(id))}${esc(say(id))}</span>`).join('')}</div>`;
      if (RD.dev === 'spo2' && RD.who === 'under5') { html += sayRow('ui.rd.spo2-child', 'blk tip'); extra.push('ui.rd.spo2-child'); }
      if (RD.dev === 'sugar') html += `<p class="muted center">${esc(T('sugarGood', { a: RD.unit === 'mmol' ? `${dec(num('4.4'))}–${dec(num('7.2'))}` : `${num(80)}–${num(130)}`, b: RD.unit === 'mmol' ? num(10) : num(180) }))} <span dir="ltr">${RD.unit === 'mmol' ? 'mmol/L' : 'mg/dL'}</span></p>`;
      const clinic = 'ui.rd.clinic.' + RD.dev;
      html += `<div class="clinicbox">${ic('clinic')}${sayRow(clinic)}</div>`;
      html += sayRow('ui.rd.note', 'blk tip note');
      ids = [v.say, ...extra, clinic, 'ui.rd.note'];
      html = html.replace('<div class="bigread', listenBar(ids) + '<div class="bigread');
      // blood pressure and sugar can be kept on a person's family record, to show the doctor (js/family.js)
      if (ctx.saveReading && (RD.dev === 'bp' || RD.dev === 'sugar') && v.lv !== 'check' && S.book.narration['ui.fam.rd.save']) {
        html += `<div class="srowbig"><button type="button" class="sbig" data-rd="save" style="--c:#2F6F7E">${ic('family')}<span class="tx"><span class="t">${esc(T('saveToFamily'))}</span></span></button>${spk('ui.fam.rd.save').replace('class="spk', 'class="spk big')}</div>`;
        ids.push('ui.fam.rd.save');
      }
      html += `<div class="row2"><button class="btn" data-rd="again">${esc(T('anotherReading'))}</button><a class="btn ghost" href="#/topic/${DEV[RD.dev].topic}">${esc(T('howToUse'))}</a></div>`;
      if (v.lv === 'urgent' || v.lv === 'today') html += `<a class="btn ghost" href="#/near">${ic('hospital')} ${esc(T('near'))}</a>`;
    }
    track('view', { p: 'tool/reading/' + (RD.dev || '') + '/' + RD.phase });
    return { html, nav: 'home', adult: RD.dev !== 'muac' && RD.who !== 'baby2m' && RD.who !== 'child2m' && RD.who !== 'under5' };
  }
  const whoLine = () => (RD.who ? `<div class="agechip" data-block="ui.who.${RD.who}">${ic(WHO_ICON[RD.who])}<span>${esc(say('ui.who.' + RD.who))}</span></div>` : '');
  function rdReset(dev) { Object.assign(RD, { dev, who: null, phase: dev ? (DEV[dev].who ? 'who' : 'val') : 'dev', a: '', b: '', field: 'a', colour: null, signs: new Set() }); }
  function rdKey(k) {
    const f = RD.dev === 'bp' ? RD.field : 'a';
    let v = RD[f] === 'HI' || RD[f] === 'LO' ? '' : RD[f];
    if (k === 'HI' || k === 'LO') { RD.a = k; rdNext(); return; }
    if (k === 'del') v = v.slice(0, -1);
    else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; }
    else if (v.replace('.', '').length < (RD.dev === 'temp' ? 4 : 3) && !(v.includes('.') && v.split('.')[1].length >= 1)) v += k;
    RD[f] = v;
    if (RD.dev === 'bp' && f === 'a' && v.length === 3) RD.field = 'b';
    ctx.render();
  }
  function rdNext() {
    if (!valueOk()) return;
    RD.phase = signList().length ? 'signs' : 'result';
    if (RD.phase === 'result') rdResult(); else { rerender(); autoplay(['ui.rd.signs']); }
  }
  function rdResult() {
    RD.phase = 'result'; rerender();
    const v = verdict();
    track('reading', { d: RD.dev, w: RD.who || '', lv: v.lv }); // the level only, never the number
    autoplay([v.say, ...(RD.dev === 'spo2' && RD.who === 'under5' ? ['ui.rd.spo2-child'] : []), 'ui.rd.clinic.' + RD.dev]);
  }

  /* ======================= home health kit screen, home modules, link blocks ======================= */
  const kitTopics = () => (S.book.sections.kit || []).filter((t) => S.book.topics[t]);
  const isKitTopic = (tid) => kitTopics().includes(tid);
  const toolCard = (href, icon, title, sayId, cls = '') => `<div class="quick tool ${cls}"><a href="${href}" style="display:contents">${ic(icon)}<span class="t">${esc(title)}</span></a>${spk(sayId)}</div>`;
  function homeTools() {
    return `<div class="grid2">${toolCard('#/tool/breaths', 'breathing-fast', T('breaths'), 'ui.breaths')}${toolCard('#/tool/reading', 'bp', T('reading'), 'ui.reading', 'adult')}</div>`;
  }
  function homeKit() {
    const t = S.book.topics['kit-buy'];
    return `<div class="kitcard adult" data-block="ui.kit"><a href="#/kit" class="kpic"><img src="${esc(t ? t.image : 'img/app/placeholder.svg')}" alt=""></a><a href="#/kit" class="grow"><div class="t">${esc(T('kit'))}</div><div class="s">${esc(T('kitSub'))}</div></a>${spk('ui.kit')}</div>`;
  }
  function screenKit() {
    const list = kitTopics();
    const ids = ['ui.kit', 'ui.reading', 'ui.breaths', ...list.map((t) => t + '.title')];
    let html = `<div class="topic-hero"><img src="${esc((S.book.topics['kit-buy'] || {}).image || 'img/app/placeholder.svg')}" alt=""><a class="round" href="#/home" aria-label="${esc(T('back'))}">${I.back}</a></div>`;
    html += `<div class="title-row" data-block="ui.kit"><h1>${esc(T('kit'))}</h1>${spk('ui.kit')}</div>` + listenBar(ids);
    html += `<div class="grid2">${toolCard('#/tool/reading', 'check', T('reading'), 'ui.reading', 'hl')}${toolCard('#/tool/breaths', 'breathing-fast', T('breaths'), 'ui.breaths', 'child')}</div>`;
    html += `<div class="tlist">${list.map(topicCard).join('')}</div>`;
    html += disclaimer();
    track('view', { p: 'kit' });
    return { html, nav: 'home', adult: true };
  }
  function linkBlock(b) {
    const href = '#/' + b.to;
    return `<div class="blk link" data-block="${esc(b.id)}"><a class="pic" href="${esc(href)}">${ic(b.icon || 'check')}</a><a class="body" href="${esc(href)}"><div class="h">${esc(L(b.title))}</div><div class="x">${esc(L(b.text))}</div></a>${spk(b.id)}<a class="go" href="${esc(href)}" aria-label="${esc(L(b.title))}">${I.fwd}</a></div>`;
  }
  function screenTool(name, sub) {
    if (name === 'breaths') return screenBreaths();
    if (name === 'reading') return screenReading(sub);
    return null;
  }

  /* ======================= taps ======================= */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.toolBack) {
      e.preventDefault(); stopAudio();
      if (d.toolBack === 'exit') { back(); return; }
      if (location.hash.startsWith('#/tool/breaths')) { brStop(); BR.phase = d.toolBack === 'stop' ? 'ready' : d.toolBack; rerender(); return; }
      if (d.toolBack === 'dev') { if (location.hash !== '#/tool/reading') { back(); return; } rdReset(null); }
      else RD.phase = d.toolBack;
      rerender(); return;
    }
    if (d.brAge) { BR.age = d.brAge; BR.phase = 'ready'; rerender(); if (!BR.told) { BR.told = true; autoplay(['ui.br.calm', 'ui.br.uncover', 'ui.br.watch', 'ui.br.start']); } return; }
    if (d.br) {
      if (d.br === 'tap') { brTap(); return; }
      if (d.br === 'start' || d.br === 'again') { brStart(); return; }
      if (d.br === 'undo') { if (BR.n > 0) { BR.n--; const c = $('#br-n'); if (c) c.textContent = num(BR.n); } return; }
      if (d.br === 'stop') { stopAudio(); brStop(); BR.phase = 'ready'; rerender(); return; }
      if (d.br === 'age') { stopAudio(); brStop(); BR.phase = 'age'; rerender(); return; }
    }
    if (d.brSign) {
      const was = BR.danger.size; BR.danger.has(d.brSign) ? BR.danger.delete(d.brSign) : BR.danger.add(d.brSign);
      const a = BR_AGES.find((x) => x.id === BR.age), box = $('#br-danger');
      if (box && a) { box.outerHTML = brDangerHtml(a); }
      if (!was && BR.danger.size) { track('tool', { p: 'breaths-danger', a: BR.age }); autoplay(['ui.br.v.danger']); const v = $('#br-danger .verdict'); if (v) v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    if (d.rdDev) { rdReset(d.rdDev); rerender(); if (DEV[d.rdDev].who) autoplay(['ui.rd.who']); else autoplay([DEV[d.rdDev].enter]); return; }
    if (d.rdWho) { RD.who = d.rdWho; RD.phase = 'val'; RD.signs = new Set(); rerender(); autoplay([DEV[RD.dev].enter]); return; }
    if (d.rdKey) { rdKey(d.rdKey); return; }
    if (d.rdField) { RD.field = d.rdField; ctx.render(); return; }
    if (d.rdUnit) { RD.unit = d.rdUnit; RD.a = ''; ctx.render(); return; }
    if (d.rdColour) { RD.colour = d.rdColour; ctx.render(); return; }
    if (d.rdSign) { RD.signs.has(d.rdSign) ? RD.signs.delete(d.rdSign) : RD.signs.add(d.rdSign); const on = RD.signs.has(d.rdSign); t.setAttribute('aria-pressed', on); t.parentElement.classList.toggle('on', on); return; }
    if (d.rd === 'next') { rdNext(); return; }
    if (d.rd === 'result') { rdResult(); return; }
    if (d.rd === 'save') {
      const v = verdict();
      ctx.saveReading(RD.dev === 'bp' ? { k: 'bp', s: parse(RD.a), dia: parse(RD.b), who: RD.who || '', lv: v.lv } : { k: 'sugar', v: RD.a === 'HI' || RD.a === 'LO' ? RD.a : parse(RD.a), unit: RD.unit, lv: v.lv });
      return;
    }
    if (d.rd === 'again') { stopAudio(); Object.assign(RD, { phase: 'val', a: '', b: '', field: 'a', colour: null, signs: new Set() }); rerender(); return; }
  });

  return { screenKit, screenTool, homeTools, homeKit, linkBlock, isKitTopic };
}
