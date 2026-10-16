// Check my sheet: the child types the answers from their paper and sees at once what is right. Sums and counts
// are checked by value (2/4 is right but "make it simpler"); written answers, circled pictures and sorting are
// shown so the child or a parent can compare with the paper. Tracing and drawing are for a grown-up to look at.
// The answers come from the hub, and are kept on the phone when a sheet is printed, so this works at home too.
// Each time a sheet is marked, one `check.done` joins the phone's events queue: the lesson and the percent right
// (only with consent: state.record).

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import { latin, notSimplest, parse, same, show } from '../numbers.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, toast, topbar } from '../ui.js';
import { rememberKey } from './print.js';

function fromCode(text) {
  // what is printed in the sheet's corner, typed any way: m7-03-4821, M7 03 4821, ۴۸۲۱ in Persian digits
  const t = latin(text).toUpperCase().trim().replace(/[\s·._–—]+/g, '-').replace(/-+/g, '-');
  let l = library.byCode(t);
  if (l) return { l, seed: 0 };
  const m = t.match(/^(.+)-(\d{1,5})$/);
  if (m && (l = library.byCode(m[1]))) return { l, seed: +m[2] };
  return null;
}

async function loadKey(id, seed, lang) {
  const k = state.cache(`key.${id}.${seed}`);
  if (k && k.items) return k;
  if (!hub.online()) return null;
  await rememberKey(id, seed, lang);
  return state.cache(`key.${id}.${seed}`);
}

function pickSheet() {
  const c = state.child();
  const printed = Object.entries(c.prints).map(([id, seed]) => ({ l: library.get(id), seed })).filter((x) => x.l);
  const input = h('input', { dir: 'ltr', autocomplete: 'off', placeholder: 'M7-03-4821', 'aria-label': s('sheet_code') });
  const open = (e) => {
    e.preventDefault();
    const f = fromCode(input.value);
    if (!f) { toast(s('sheet_code')); return; }
    location.hash = `#/check/${encodeURIComponent(f.l.id)}/${f.seed}`;
  };
  return h('div', { class: 'screen' },
    topbar({ back: '#/home', title: s('check_title'), sub: s('check_note'), child: true }),
    printed.length ? h('div', { class: 'section-head' }, h('h2', {}, s('printed_sheets'))) : null,
    h('div', { class: 'lessons' }, printed.map(({ l, seed }) => h('a', { class: 'lesson-row',
      href: `#/check/${encodeURIComponent(l.id)}/${seed}` },
    icon('file', 26), h('span', { class: 'grow' }, h('b', {}, plain(l.title)),
      h('small', { dir: 'ltr' }, l.code + (seed ? '-' + seed : ''))), icon('chev', 20)))),
    h('div', { class: 'section-head' }, h('h2', {}, s('sheet_code'))),
    h('form', { class: 'pad row', onSubmit: open }, h('div', { class: 'field grow flat' }, input),
      said(h('button', { class: 'btn primary', type: 'submit' }, s('open_code')))));
}

export default async function check([id, seedText]) {
  await library.load();
  if (!id) return { el: pickSheet(), tab: 'print' };
  const c = state.child();
  const lang = getLang();
  const L = library.get(id);
  const seed = seedText !== undefined ? +seedText || 0 : (c.prints[id] ?? 0);
  const key = await loadKey(id, seed, lang);
  const head = topbar({ back: '#/check', sub: L ? plain(L.title) : s('check_title'),
    title: s('check_title'), extra: h('span', { class: 'tag', dir: 'ltr' }, (key && key.code) || (L && L.code) || '', seed ? '-' + seed : '') });
  if (!key) return { el: h('div', { class: 'screen' }, head, h('div', { class: 'empty' }, s('no_key'))), tab: 'print' };

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
      rows.push(h('div', { class: 'check-row' }, h('span', { class: 'n' }, fa(r.n)),
        h('span', { class: 'q' }, r.q ? rich('$' + r.q + '$') : ''), inp, mark), fix);
    } else if (r.check === 'self') {
      const ans = h('div', { class: 'ans hidden' });
      const yes = h('button', { class: 'btn good', type: 'button' }, icon('check', 22, 3), s('yes'));
      const no = h('button', { class: 'btn', type: 'button' }, icon('x', 22, 3), s('no'));
      const judge = h('div', { class: 'row wrap hidden' }, h('span', { class: 'grow' }, s('was_it_right')), said(yes), said(no));
      const reveal = h('button', { class: 'link', type: 'button' }, s('show_answer'));
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
        reveal, ans, judge));
    }
  }
  const forGrownUps = key.items.filter((r) => r.check === 'none').map((r) => fa(r.n));

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
        const showIt = h('button', { class: 'link', type: 'button' }, s('show_answer'));
        showIt.addEventListener('click', () => showIt.replaceWith(s('answer_is', { a: show(parse(r.a)) })));
        fix.className = 'fix';
        fix.replaceChildren(h('span', {}, s('wrong')), showIt);
      }
    }
    drawScore();
    marked();
    score.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const el = h('div', { class: 'screen' }, head, score,
    h('div', { class: 'checks' }, rows),
    forGrownUps.length ? h('p', { class: 'pad muted small' }, forGrownUps.join('، '), ': ', s('check_with_teacher')) : null,
    h('div', { class: 'actions' },
      values.length ? said(h('button', { class: 'btn primary main', type: 'button', onClick: checkValues }, icon('check'), s('check_btn'))) : null,
      said(h('a', { class: 'btn', href: '#/print/' + encodeURIComponent(id) }, icon('printer'), s('print_new')))));
  return { el, tab: 'print' };
}
