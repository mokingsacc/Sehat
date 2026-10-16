// Check my sheet: the child types the answers from their paper and sees at once what is right. Sums and counts
// are checked by value (2/4 is right but "make it simpler"); written answers, circled pictures and sorting are
// shown so the child or a parent can compare with the paper. Tracing and drawing are for a grown-up to look at.
// A wrong value shows no answer (C2.3: hints, never answers; the hint ladder comes with P15): she looks again.
// The answers come from the hub, and are kept on the phone when a sheet is printed or got, so this works at home.
// "Do it on screen" (#/check/<id>/<seed>/screen, where there is no printer, C2.1) shows the sheet's intro and
// example first, each question beside its answer box, and trace and draw items as "Do this one on paper".
// Each time a sheet is marked, one `check.done` joins the phone's events queue: the lesson and the percent right
// (only with consent: state.record).
// Photos (C2.2, P14): the sheet she got last is offered first, "This sheet?", with "Take a photo" where the `photo`
// module is on for her, the phone is online, she joined with consent and the reader knows her language; offline
// that button is "Photos need the internet". The photo screen (modules/photo.js) hands back what she confirmed she
// wrote, which is typed in here and marked like typed answers: the server never learns right or wrong.

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { notSimplest, parse, same, show } from '../numbers.js';
import * as sheetcode from '../sheetcode.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, toast, topbar } from '../ui.js';
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
  if (k && k.items) return k;
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
    offer === 'on' && cameraRefused ? h('p', { class: 'muted small' }, s('camera_off')) : null);
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

  const results = {};
  const score = h('div', { class: 'score hidden', role: 'status', 'aria-live': 'polite' });
  const rows = [];
  const values = [];
  const selfRows = key.items.filter((r) => r.check === 'self').length;

  // the sheet was marked: the Check button, or, on a sheet with nothing to type, every row judged
  function marked() {
    const vals = Object.values(results);
    if (vals.length) state.record('check.done', id, Math.round((100 * vals.filter(Boolean).length) / vals.length));
  }

  function drawScore() {
    const vals = Object.values(results);
    if (!vals.length) { score.classList.add('hidden'); return; }
    const right = vals.filter(Boolean).length;
    const wrong = vals.length - right;
    score.classList.remove('hidden');
    score.classList.toggle('some-wrong', wrong > 0);
    fill(score, h('b', {}, s('of_right', { a: right, b: vals.length })),
      h('div', { class: 'note' }, wrong ? s('look_again', { n: wrong }) : s('all_right')));
  }

  for (const r of key.items) {
    if (r.check === 'value') {
      const inp = h('input', { dir: 'ltr', autocomplete: 'off', 'aria-label': fa(r.n) });
      const mark = h('span', { class: 'mark hidden' });
      const fix = h('div', { class: 'fix hidden' });
      values.push({ r, inp, mark, fix });
      const q = r.q ? rich('$' + r.q + '$') : (onScreen && r.kind === 'count' && r.picture ? countPictures(r) : '');
      rows.push(h('div', { class: 'check-row' }, h('span', { class: 'n' }, fa(r.n)),
        h('span', { class: 'q' }, onScreen && r.prompt ? h('small', { class: 'muted' }, r.prompt, ' ') : null, q), inp, mark), fix);
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
        yes.classList.toggle('primary', ok);
        no.classList.toggle('warm', !ok);
        drawScore();
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

  function checkValues() {
    for (const { r, inp, mark, fix } of values) {
      if (!inp.value.trim()) {                 // emptied since the last check: it no longer counts
        delete results['v' + r.n];
        inp.className = '';
        mark.className = 'mark hidden';
        fix.className = 'fix hidden';
        continue;
      }
      const v = parse(inp.value);
      const ok = !!v && same(v, parse(r.a));
      results['v' + r.n] = ok;
      inp.className = ok ? 'right' : 'wrong';
      mark.className = 'mark ' + (ok ? 'right' : 'wrong');
      mark.replaceChildren(icon(ok ? 'check' : 'x', 18, 3));
      fix.classList.toggle('hidden', ok && !notSimplest(inp.value));
      if (ok && notSimplest(inp.value)) {
        fix.className = 'fix hint';
        fix.replaceChildren(s('simplify', { a: show(parse(r.a)) }));
      } else if (!ok) {
        fix.className = 'fix';
        fix.replaceChildren(h('span', {}, s('wrong')));
      }
    }
    drawScore();
    marked();
    score.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      values.length ? said(h('button', { class: 'btn primary main', type: 'button', onClick: checkValues }, icon('check'), s('check_btn'))) : null,
      said(h('a', { class: 'btn', href: '#/print/' + encodeURIComponent(id) }, icon(onScreen ? 'file' : 'printer'), s('print_new')))));
  if (handed && handed.id === id && handed.seed === seed) {        // back from "What I read": mark what she confirmed
    const r = handed.readings;
    handed = null;
    fillIn(values, r, checkValues);
  }
  return { el, tab: 'sheets', fill: (readings) => fillIn(values, readings, checkValues) };
}

// readings from a photo (P14), after she has confirmed or fixed them: typed in for her, then marked on the phone
function fillIn(values, readings, checkValues) {
  for (const { r, inp } of values) {
    const got = readings.find((x) => x.n === r.n);
    if (got && got.read && got.read !== '?') inp.value = got.read;
  }
  checkValues();
}
