// Check my sheet: the child types the answers from their paper and sees at once what is right. Sums and counts
// are checked by value (2/4 is right but "can you write it simpler?"); written answers, circled pictures and sorting
// are shown so the child or a parent can compare with the paper. Tracing and drawing are for a grown-up to look at.
// The answers come from the hub, and are kept on the phone when a sheet is printed or got, so this works at home.
// "Do it on screen" (#/check/<id>/<seed>/screen, where there is no printer, C2.1) shows the sheet's intro and
// example first, each question beside its answer box, and trace and draw items as "Do this one on paper".
//
// Results and the hint ladder (C2.3, P15): one renderer for typed answers and for a photo's readings. A wrong
// value shows no answer, ever: "Look again", then "Hint" and "Try again". The three hints come with the key (made
// and leak-checked by the hub, hints.py), so they work offline: the lesson step that teaches it ("Open that step"
// opens the lesson there; Back returns here, with what she typed and the hints she opened), a worked example with
// other numbers, then the first move. After the third hint and another wrong try: "You're close. Try it again on
// paper", "More like this" (a fresh sheet) and, where her class has a teacher, "Ask my teacher". Right after hints
// is still right. "Something looks wrong?" lets her name an item for a teacher to look at.
//
// Events (only with consent: state.record): each marking queues `check.done` (the lesson, the percent right); each
// value item `check.item` (lesson:n; 0 wrong, 1 right first time, 2 right later) when first judged and again when
// a wrong one comes right; each hint opened `hint.rung` (lesson:n, the rung); a disputed item `check.dispute`.
// Photos (C2.2, P14): the sheet she got last is offered first, "This sheet?", with "Take a photo" where the `photo`
// module is on for her, the phone is online, she joined with consent and the reader knows her language; offline
// that button is "Photos need the internet". The photo screen (modules/photo.js) hands back what she confirmed she
// wrote, which is typed in here and marked like typed answers: the server never learns right or wrong from it.

import * as android from '../android.js';
import { readsOnOpen } from '../bands.js';
import { fa, getLang, getTone, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { notSimplest, parse, same } from '../numbers.js';
import * as sheetcode from '../sheetcode.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, speakerBtn, star, toast, topbar } from '../ui.js';
import { addAgain } from '../modules/plan.js';
import { rememberKey } from './print.js';

// what is printed at the sheet's foot, typed any way: m7-03-48217, M7 03 48217, ۴۸۲۱۷ in Persian digits;
// a wrong check digit is refused (null)
export function fromCode(text) {
  const p = sheetcode.parse(text);
  const l = p && library.byCode(p.code);
  return l ? { l, seed: p.seed } : null;
}

export async function loadKey(id, seed, lang) {
  const k = state.cache(`key.${id}.${seed}`);
  // a key kept before the hints came with keys (P15) is fetched again when the hub is in reach
  if (k && k.items && (!hub.online() || k.items.every((r) => r.check !== 'value' || r.hints))) return k;
  if (!hub.online()) return null;
  await rememberKey(id, seed, lang);
  return state.cache(`key.${id}.${seed}`);
}

export const codeOf = (l, seed) => sheetcode.make(l.code, seed);

// "Take a photo" for her: 'on', 'offline' (say "Photos need the internet"), or null (not offered at all)
export function photoOffer(c = state.child()) {
  if (!c || !modules.listed('photo') || !modules.allows('photo', c.band)) return null;
  if (!hub.online()) return 'offline';
  const ai = (hub.info() && hub.info().ai) || {};
  if (!modules.on('photo') || !c.token || !c.consent || !ai.on || !(ai.langs || []).includes(getLang())) return null;
  return 'on';
}

// the camera was refused on this visit: Check my sheet says how to allow it (memory only)
let cameraRefused = false;
export function cameraOff(v = true) { cameraRefused = v; }

// readings she confirmed on "What I read", for the next opening of that sheet's check (memory only, never stored)
let handed = null;
export function handoff(id, seed, readings) { handed = { id, seed: +seed || 0, readings }; }

// what she typed and the hints she opened, per sheet, while the app is open, so "Open that step" and Back return
// to the same results (memory only: nothing about her answers is stored)
const kept = new Map();
export function forget() { kept.clear(); }

// The ladder (C2.3): "Hint 1 of 3", one rung at a time, each with its speaker; rung 1 (and a rung that fell back to
// "listen to this step again") opens the lesson at that step. Shared by Check my sheet and Ask. `onRung(rung)`
// hears each rung as it opens; `reads` reads each aloud as it appears (p2, adult literacy); `told` adds, once ever,
// the line that says why there is no answer.
export function ladder(rungs, { onRung = () => {}, reads = false, told = () => {} } = {}) {
  const list = Array.isArray(rungs) ? rungs.filter((r) => r && typeof r.text === 'string') : [];
  const cards = h('div', { class: 'ladder' });
  let shown = 0;
  const label = h('span', {}, s('hint'));
  const btn = h('button', { type: 'button', class: 'btn hint' }, icon('bulb', 22), label);
  const card = (r, k) => {
    const link = r.lesson && r.step ? h('a', { class: 'link', href: `#/lesson/${encodeURIComponent(r.lesson)}/${r.step}` },
      icon('book', 20), s('open_step')) : null;
    const say = () => speak(plain(r.text), getLang());
    return h('div', { class: 'hint-card', role: 'status' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, s('hint_n', { a: k, b: list.length })), speakerBtn(say, { size: 'sm' })),
      h('p', { class: 'hint-text' }, rich(r.text)), link);
  };
  function open(quiet = false) {
    if (shown >= list.length) return;
    const r = list[shown];
    shown += 1;
    cards.append(card(r, shown));
    if (!quiet) {
      onRung(shown);
      if (reads) speak(plain(r.text), getLang());
      if (shown === 3) { const line = told(); if (line) cards.append(line); }
    }
    label.textContent = s('another_hint');
    btn.classList.toggle('hidden', shown >= list.length);
  }
  btn.addEventListener('click', () => open());
  return { cards, button: said(btn), open, count: () => shown, size: list.length };
}

// the first time ever she reaches a third hint, one line, spoken, says why there is no answer (C2.3)
export function toldLine() {
  const me = state.child();
  if (!me || me.told) return null;
  state.updateChild(me.id, { told: true });
  const line = s('no_answers');
  speak(line, getLang());
  return h('p', { class: 'told' }, line);
}

// "This sheet?" (C2.2): the sheet she got last, its title and code, "Take a photo" and "Type my answers"
function thisSheet({ l, seed }) {
  const offer = photoOffer();
  const at = `${encodeURIComponent(l.id)}/${seed}`;
  return h('div', { class: 'card pad-card stack this-sheet' },
    h('div', { class: 'row' }, icon('file', 30), h('div', { class: 'grow' }, h('small', { class: 'muted' }, s('this_sheet')),
      h('b', {}, plain(l.title)), h('small', {}, h('bdi', { dir: 'ltr' }, codeOf(l, seed))))),
    offer === 'on' ? said(h('a', { class: 'btn primary main', href: '#/photo/' + at }, icon('camera'), s('take_photo'))) : null,
    said(h('a', { class: offer === 'on' ? 'btn outline' : 'btn primary main', href: '#/check/' + at }, icon('pencil'), s('type_answers'))),
    offer === 'offline' ? h('p', { class: 'muted small' }, s('photo_offline')) : null,
    offer === 'on' && cameraRefused ? h('p', { class: 'muted small' }, s('camera_off')) : null,
    offer === 'on' && cameraRefused && android.isApp()              // the Android app: straight to Qalam's settings (P23)
      ? h('button', { type: 'button', class: 'link', onClick: android.openSettings }, s('open_settings')) : null);
}

function pickSheet() {
  const c = state.child();
  const all = Object.entries(c.prints).map(([id, seed]) => ({ l: library.get(id), seed })).filter((x) => x.l);
  const last = all.at(-1);
  const printed = all.slice(0, -1).reverse();
  const input = h('input', { dir: 'ltr', autocomplete: 'off', placeholder: 'M7-03-48217', 'aria-label': s('sheet_code') });
  const open = (e) => {
    e.preventDefault();
    const f = fromCode(input.value);
    if (!f) { toast(s('code_wrong')); return; }
    location.hash = `#/check/${encodeURIComponent(f.l.id)}/${f.seed}`;
  };
  return h('div', { class: 'screen' },
    topbar({ back: '#/home', title: s('check_title'), sub: s('check_note'), child: true }),
    last ? thisSheet(last) : null,
    printed.length ? h('div', { class: 'section-head' }, h('h2', {}, s('printed_sheets'))) : null,
    h('div', { class: 'lessons' }, printed.map(({ l, seed }) => said(h('a', { class: 'lesson-row',
      href: `#/check/${encodeURIComponent(l.id)}/${seed}` },
    icon('file', 26), h('span', { class: 'grow' }, h('b', {}, plain(l.title)),
      h('small', { dir: 'ltr' }, codeOf(l, seed))), icon('chev', 20))))),
    h('div', { class: 'section-head' }, h('h2', {}, s('sheet_code'))),
    h('form', { class: 'pad row', onSubmit: open }, h('div', { class: 'field grow flat' }, input),
      said(h('button', { class: 'btn primary', type: 'submit' }, s('open_code')))));
}

// the objects a count item shows, drawn on screen ("Do it on screen")
function countPictures(r) {
  const n = +r.a || 0;
  return h('span', { class: 'objs' }, Array.from({ length: n }, () => h('img', { src: hub.url(r.picture), alt: '' })));
}

// the score (C2.3): stars for children (90% or more right first time: three; 60% or more: two; else one) and
// "6 right!"; a check mark and "Correct: 6 of 8" for adults
function scoreOf(right, total, firstRight, judged) {
  if (getTone() === 'adult') return [h('span', { class: 'done-mark', 'aria-hidden': 'true' }, icon('check', 26, 3)),
    h('b', {}, s('n_right', { a: right, b: total }))];
  const share = judged ? firstRight / judged : 0;
  const stars = share >= 0.9 ? 3 : share >= 0.6 ? 2 : 1;
  return [h('span', { class: 'stars small', 'aria-hidden': 'true' }, [0, 1, 2].map((k) => star(26, k < stars))),
    h('b', {}, s('n_right', { a: right, b: total }))];
}

export default async function check([id, seedText, mode]) {
  await library.load();
  if (!id) return { el: pickSheet(), tab: 'sheets' };
  const c = state.child();
  const lang = getLang();
  const L = library.get(id);
  const seed = seedText !== undefined ? +seedText || 0 : (c.prints[id] ?? 0);
  const onScreen = mode === 'screen';
  const key = await loadKey(id, seed, lang);
  const head = topbar({ back: onScreen ? '#/print/' + encodeURIComponent(id) : '#/check', sub: L ? plain(L.title) : s('check_title'),
    title: s(onScreen ? 'on_screen' : 'check_title'),
    extra: h('span', { class: 'tag', dir: 'ltr' }, (key && key.code) || (L ? codeOf(L, seed) : '')) });
  if (!key) return { el: h('div', { class: 'screen' }, head, h('div', { class: 'empty' }, s('no_key'))), tab: 'sheets' };
  if (L) state.rememberPrint(id, seed);           // opened or checked: "This sheet?" offers it next time

  const was = kept.get(`${id}/${seed}`) || { typed: {}, rows: {}, judged: {}, marked: false, disputed: [] };
  kept.set(`${id}/${seed}`, was);
  const code = key.code || (L ? codeOf(L, seed) : id);
  const reads = readsOnOpen(c.band, c.track, 'step');
  const results = {};
  const score = h('div', { class: 'score hidden', role: 'status', 'aria-live': 'polite' });
  const rows = [];
  const values = [];
  const selfRows = key.items.filter((r) => r.check === 'self').length;
  const item = (n) => `${id}:${n}`;

  // the sheet was marked: the Check button, or, on a sheet with nothing to type, every row judged
  function marked() {
    const vals = Object.values(results);
    if (!vals.length) return;
    const pct = Math.round((100 * vals.filter(Boolean).length) / vals.length);
    state.setMark(id, pct);                  // her latest mark, for the skills graph's "mastered" (P25a)
    state.record('check.done', id, pct);
  }

  function drawScore() {
    const vals = Object.values(results);
    if (!vals.length) { score.classList.add('hidden'); return; }
    const right = vals.filter(Boolean).length;
    const wrong = vals.length - right;
    const firsts = values.map((v) => was.rows[v.r.n]).filter((st) => st && st.first !== undefined);
    const selfs = Object.entries(results).filter(([k]) => k[0] === 's').map(([, v]) => v);
    score.classList.remove('hidden');
    score.classList.toggle('some-wrong', wrong > 0);
    // wrong items put the lesson behind them in her plan (P22, item 3), where plans are on for her
    const added = wrong > 0 && L && addAgain(state.child(), id) ? s('plan_added', { t: plain(L.title) }) : null;
    fill(score, h('div', { class: 'row wrap' }, scoreOf(right, vals.length,
      firsts.filter((st) => st.first).length + selfs.filter(Boolean).length, firsts.length + selfs.length)),
    h('div', { class: 'note' }, wrong ? s('look_again', { n: wrong }) : s('all_right')),
    added ? h('div', { class: 'row plan-added' }, icon('book', 20), h('span', { class: 'grow' }, added),
      speakerBtn(() => speak(added, lang), { size: 'sm' })) : null);
  }

  // "Ask my teacher" (C2.3): the sheet's code, the item and what she wrote, as a question the teacher answers
  async function askTeacher(r, typed, btn) {
    if (!hub.online()) { toast(s('offline')); return; }
    btn.disabled = true;
    const text = s('teacher_q', { c: code, n: r.n, a: typed });
    try {
      const a = await hub.ask({ text, lang, year: c.year, lesson: id, teacher: true }, state.child().token);
      state.addAsk({ id: a.id, q: text, at: Date.now(), lang, a: a.text, source: a.source, waiting: true, sent: true });
      toast(s('sent_teacher'));
    } catch { btn.disabled = false; toast(s('error')); }
  }

  function teacherBtn(r, typed) {
    const b = h('button', { type: 'button', class: 'btn' }, icon('users', 20), s('ask_my_teacher'));
    b.addEventListener('click', () => askTeacher(r, typed, b));
    return b;
  }

  for (const r of key.items) {
    if (r.check === 'value') {
      const st = (was.rows[r.n] ||= { first: undefined, later: false, wrong: 0, rungs: 0 });
      const inp = h('input', { dir: 'ltr', autocomplete: 'off', 'aria-label': fa(r.n) });
      if (was.typed[r.n]) inp.value = was.typed[r.n];
      inp.addEventListener('input', () => { was.typed[r.n] = inp.value; });
      const mark = h('span', { class: 'mark hidden' });
      const fix = h('div', { class: 'fix hidden' });
      const lad = ladder(r.hints, { reads,
        onRung: (k) => { st.rungs = k; state.record('hint.rung', item(r.n), k); },
        told: toldLine });
      for (let k = 0; k < st.rungs; k += 1) lad.open(true);
      const tryAgain = said(h('button', { type: 'button', class: 'btn', onClick: () => {
        inp.value = ''; was.typed[r.n] = ''; inp.className = ''; mark.className = 'mark hidden';
        if (inp.focus) inp.focus();
      } }, icon('refresh', 20), s('try_again')));
      const close = h('div', { class: 'so-close hidden stack' });
      values.push({ r, st, inp, mark, fix, lad, tryAgain, close, keep: (x) => { was.typed[r.n] = x; } });
      const q = r.q ? rich('$' + r.q + '$') : (onScreen && r.kind === 'count' && r.picture ? countPictures(r) : '');
      rows.push(h('div', { class: 'check-row' }, h('span', { class: 'n' }, fa(r.n)),
        h('span', { class: 'q' }, onScreen && r.prompt ? h('small', { class: 'muted' }, r.prompt, ' ') : null, q), inp, mark),
      fix, lad.cards, close);
    } else if (r.check === 'self') {
      const ans = h('div', { class: 'ans hidden' });
      const yes = h('button', { class: 'btn good', type: 'button' }, icon('check', 22, 3), s('yes'));
      const no = h('button', { class: 'btn', type: 'button' }, icon('x', 22, 3), s('no'));
      const judge = h('div', { class: 'row wrap hidden' }, h('span', { class: 'grow' }, s('was_it_right')), said(yes), said(no));
      // "Done it on paper? Compare" (C2.3): there is nothing to hint at in a circled picture
      const reveal = h('button', { class: 'link', type: 'button' }, s('compare'));
      if (Array.isArray(r.a) && r.a.length && Array.isArray(r.a[0])) {
        ans.append(...r.a.map(([w, g]) => h('div', {}, h('b', {}, w), ' ← ', g)));
      } else if (Array.isArray(r.a)) {
        ans.append(h('div', { class: 'pics' }, r.a.map((u) => h('img', { src: hub.url(u), alt: '' }))));
      } else {
        ans.append(rich(r.a || ''));
      }
      reveal.addEventListener('click', () => { ans.classList.remove('hidden'); judge.classList.remove('hidden'); reveal.remove(); });
      const set = (ok) => () => {
        results['s' + r.n] = ok;
        was.judged[r.n] = ok;
        yes.classList.toggle('primary', ok);
        no.classList.toggle('warm', !ok);
        drawScore();
        drawDispute();
        if (!values.length && Object.keys(results).length === selfRows) marked();
      };
      yes.addEventListener('click', set(true));
      no.addEventListener('click', set(false));
      rows.push(h('div', { class: 'selfcheck' },
        h('div', { class: 'row' }, h('span', { class: 'n' }, fa(r.n)), h('span', { class: 'grow' }, rich(r.prompt || ''))),
        said(reveal, s('compare')), ans, judge));
    } else if (onScreen) {
      rows.push(h('div', { class: 'check-row paper' }, h('span', { class: 'n' }, fa(r.n)),
        h('span', { class: 'q grow' }, r.prompt ? rich(r.prompt) : null), h('small', { class: 'muted' }, s('on_paper'))));
    }
  }
  const forGrownUps = onScreen ? [] : key.items.filter((r) => r.check === 'none').map((r) => fa(r.n));

  // one row judged: its mark, and under it "Look again" with Hint and Try again (never the answer)
  function judgeRow(v, quiet) {
    const { r, st, inp, mark, fix, lad, tryAgain, close } = v;
    v.keep(inp.value);                       // what was marked comes back with the results
    if (!inp.value.trim()) {                 // emptied or never typed: it does not count; "Not done"
      delete results['v' + r.n];
      inp.className = '';
      mark.className = 'mark hidden';
      fill(fix, h('span', { class: 'grow' }, s('not_done')),
        said(h('button', { type: 'button', class: 'btn', onClick: () => inp.focus && inp.focus() }, icon('pencil', 20), s('type_it'))));
      fix.className = 'fix muted-fix';
      close.classList.add('hidden');
      return;
    }
    const val = parse(inp.value);
    const ok = !!val && same(val, parse(r.a));
    results['v' + r.n] = ok;
    if (!quiet) {
      if (st.first === undefined) { st.first = ok; state.record('check.item', item(r.n), ok ? 1 : 0); }
      else if (ok && !st.first && !st.later) { st.later = true; state.record('check.item', item(r.n), 2); }
      if (!ok) st.wrong += 1;
      if (!ok && lad.count() >= 3) st.close = true;
    }
    inp.className = ok ? 'right' : 'wrong';
    mark.className = 'mark ' + (ok ? 'right' : 'wrong');
    mark.replaceChildren(icon(ok ? 'check' : 'x', 18, 3));
    lad.cards.classList.toggle('hidden', ok);
    close.classList.add('hidden');
    if (ok && notSimplest(inp.value)) {
      fix.className = 'fix hint';
      fill(fix, s('simplify'));
    } else if (ok) {
      fix.className = 'fix hidden';
    } else {
      fix.className = 'fix';
      fill(fix, h('span', { class: 'grow' }, s('look_again_row')), lad.size ? lad.button : null, tryAgain);
      if (st.close) {
        close.classList.remove('hidden');
        fill(close, h('p', {}, s('so_close')), h('div', { class: 'row wrap' },
          said(h('a', { class: 'btn outline', href: '#/print/' + encodeURIComponent(id) }, icon('file', 20), s('more_like_this'))),
          modules.on('teacher') ? said(teacherBtn(r, inp.value.trim())) : null));
      }
    }
  }

  function checkValues(quiet = false) {
    for (const v of values) judgeRow(v, quiet);
    was.marked = true;
    drawScore();
    drawDispute();
    if (!quiet) {
      marked();
      if (score.scrollIntoView) score.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // "Something looks wrong?" (C2.3): she names an item; a teacher looks at it. No text is sent, only lesson:n.
  const dispute = h('div', { class: 'dispute pad hidden' });
  function drawDispute() {
    const judged = key.items.filter((r) => (r.check === 'value' && results['v' + r.n] !== undefined) || (r.check === 'self' && results['s' + r.n] !== undefined));
    dispute.classList.toggle('hidden', !judged.length);
    const items = h('div', { class: 'row wrap hidden' }, h('span', { class: 'muted small' }, s('which_item')),
      judged.map((r) => {
        const b = h('button', { type: 'button', class: 'btn chip', disabled: was.disputed.includes(r.n) || null }, fa(r.n));
        b.addEventListener('click', () => {
          if (was.disputed.includes(r.n)) return;
          state.record('check.dispute', item(r.n));
          was.disputed.push(r.n);
          b.disabled = true;
          toast(s('dispute_thanks'));
        });
        return b;
      }));
    fill(dispute, h('button', { type: 'button', class: 'link muted', onClick: () => items.classList.toggle('hidden') }, s('something_wrong')), items);
  }

  const intro = onScreen && (key.intro || key.example)
    ? h('div', { class: 'card pad-card stack sheet-intro' },
      key.intro ? h('p', {}, rich(key.intro)) : null,
      key.example ? h('div', { class: 'example' }, rich(key.example.text || ''), ' ', key.example.math ? rich('$' + key.example.math + '$') : null) : null)
    : null;
  const el = h('div', { class: 'screen' }, head, intro, score,
    h('div', { class: 'checks' }, rows),
    forGrownUps.length ? h('p', { class: 'pad muted small' }, forGrownUps.join('، '), ': ', s('check_with_teacher')) : null,
    h('div', { class: 'actions' },
      values.length ? said(h('button', { class: 'btn primary main', type: 'button', onClick: () => checkValues() }, icon('check'), s('check_btn'))) : null,
      said(h('a', { class: 'btn', href: '#/print/' + encodeURIComponent(id) }, icon(onScreen ? 'file' : 'printer'), s('more_like_this')))),
    dispute);
  if (handed && handed.id === id && handed.seed === seed) {        // back from "What I read": mark what she confirmed
    const r = handed.readings;
    handed = null;
    fillIn(values, r, checkValues);
  } else if (was.marked) {
    checkValues(true);                                              // back from a lesson step: the same results
  }
  return { el, tab: 'sheets', fill: (readings) => fillIn(values, readings, checkValues) };
}

// readings from a photo (P14), after she has confirmed or fixed them: typed in for her, then marked on the phone
function fillIn(values, readings, checkValues) {
  for (const { r, inp, keep } of values) {
    const got = readings.find((x) => x.n === r.n);
    if (!got) continue;
    inp.value = got.read && got.read !== '?' ? got.read : '';      // an empty or unreadable box is not done
    keep(inp.value);
  }
  checkValues();
}
