// The lesson player: one step per screen, a speaker on every text, answers checked at once with the reason.
// Young children (look C) hear each page read aloud when the phone has a voice for their language.
// The end of every lesson points to its worksheet (the print module's lesson.end offer): pen and paper is where
// the practice happens.

import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { notSimplest, parse, same, show } from '../numbers.js';
import { canRecord, hasVoice, recorder, speak, stop } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, speakerBtn, star, toast, topbar } from '../ui.js';

const QUESTION = new Set(['choice', 'number']);

export default async function lesson([id]) {
  const c = state.child();
  const L = id ? await hub.lesson(id) : null;
  if (!L || !Array.isArray(L.steps)) {
    return { el: h('div', { class: 'screen' }, topbar({ back: '#/home' }),
      h('div', { class: 'empty' }, hub.online() ? s('no_lessons') : s('offline'))), tab: 'lessons' };
  }
  const lang = getLang();
  const steps = L.steps;
  const young = state.mode(c) === 'small';
  const results = state.firstTries(id);   // step number -> right on the first try (kept if the child leaves)
  let i = Math.min(Math.max(c.step[id] || 0, 0), steps.length - 1);

  const say = (text, l = lang) => speak(text, l);
  const segs = h('div', { class: 'segs grow', style: { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` } },
    steps.map(() => h('span')));
  const header = h('header', { class: 'top' },
    h('a', { class: 'round', href: '#/home', 'aria-label': s('close') }, icon('x', 24, 2.6)),
    segs,
    speakerBtn(() => pageSpeak(), { size: 'sm', label: s('hear_page') }));
  const body = h('div', { class: 'step' });
  const fb = h('div', { class: 'feedback hidden', role: 'status', 'aria-live': 'polite' });
  const prev = h('button', { class: 'btn', type: 'button', onClick: () => go(i - 1) }, icon('back'), s('back'));
  const next = h('button', { class: 'btn primary main', type: 'button', onClick: () => go(i + 1) });
  const actions = h('div', { class: 'actions' }, prev, next);
  const band = L.draft ? h('div', { class: 'draft' }, s('draft_note')) : null;
  const root = h('div', { class: 'screen player' }, header, band, body, fb, actions);

  function mainText(st) {
    if (st.kind === 'letter') return [plain(st.text), pick(st.word)].filter(Boolean).join('. ');
    if (st.kind === 'say') return st.english || plain(st.text);
    return plain(st.prompt || st.text);
  }
  function pageSpeak() {
    const st = steps[i];
    say(mainText(st), st.kind === 'say' && st.english ? 'en' : lang);
  }

  function pics(st) {
    if (!st.picture) return null;
    const n = st.picture_count || 1;
    return h('div', { class: 'pics' + (n > 3 ? ' many' : '') },
      Array.from({ length: n }, () => h('img', { src: hub.url(st.picture), alt: '' })));
  }
  const promptRow = (t) => h('div', { class: 'listen-row' },
    speakerBtn(() => say(plain(t))), h('p', { class: 'prompt grow' }, rich(t)));
  const englishRow = (t) => h('div', { class: 'row center' },
    h('span', { class: 'english', dir: 'ltr', lang: 'en' }, t), speakerBtn(() => say(t, 'en')));

  function feedback(ok, why, answer, note) {
    next.disabled = false;
    fb.className = 'feedback ' + (ok ? 'right' : 'wrong');
    const msg = note || (ok ? s('right') : s('wrong'));
    fill(fb,
      h('div', { class: 'msg' }, icon(ok ? 'check' : 'x', 26, 3), msg),
      !ok && answer ? h('div', { class: 'why' }, s('answer_is', { a: '' }), rich(answer)) : null,
      why ? h('div', { class: 'listen-row' }, speakerBtn(() => say(plain(why)), { size: 'sm' }),
        h('div', { class: 'why grow' }, rich(why))) : null);
    if (young && hasVoice(lang)) say([msg, why ? plain(why) : ''].filter(Boolean).join('. '));
  }

  const KINDS = {
    letter: (st) => [
      h('div', { class: 'letter' }, st.letter),
      st.forms ? h('div', { class: 'forms' }, st.forms) : null,
      pics(st),
      h('div', { class: 'row center' }, h('span', { class: 'word' }, pick(st.word)), speakerBtn(() => say(pick(st.word)))),
      st.text ? h('p', { class: 'read' }, rich(st.text)) : null,
    ],
    read: (st) => [
      pics(st),
      st.english ? englishRow(st.english) : null,
      h('div', { class: 'listen-row' }, speakerBtn(() => say(plain(st.text))), h('p', { class: 'read grow' }, rich(st.text))),
    ],
    choice: (st) => {
      let solved = false;
      const optBody = (o) => (o && typeof o === 'object' && ('picture' in o || 'text' in o)
        ? [o.picture ? h('img', { src: hub.url(o.picture), alt: '' }) : null, o.text ? h('span', { class: 'naskh' }, pick(o.text)) : null]
        : rich(o));
      const optText = (o) => (o && typeof o === 'object' && 'text' in o ? pick(o.text) : pick(o));
      const opts = st.options.map((o, k) => h('button', { type: 'button', class: 'opt', onClick: () => choose(k) }, optBody(o)));
      function choose(k) {
        if (solved) return;
        solved = true;
        const ok = k === st.answer;
        if (results[i] === undefined) { results[i] = ok; state.firstTry(id, i, ok); }
        opts[k].classList.add(ok ? 'right' : 'wrong');
        opts[st.answer].classList.add('right');
        feedback(ok, st.why, optText(st.options[st.answer]));
      }
      return [pics(st), promptRow(st.prompt), h('div', { class: 'options' + (opts.length === 3 ? ' three' : '') }, opts)];
    },
    number: (st) => {
      const right = parse(st.answer);
      const inp = h('input', { autocomplete: 'off', dir: 'ltr', 'aria-label': s('your_answer'), placeholder: s('your_answer') });
      function check() {
        const v = parse(inp.value);
        if (!v) { toast(s('your_answer')); inp.focus(); return; }
        const ok = same(v, right);
        if (results[i] === undefined) { results[i] = ok; state.firstTry(id, i, ok); }
        inp.className = ok ? 'right' : 'wrong';
        feedback(ok, st.why, `$${show(right)}$`, ok && notSimplest(inp.value) ? s('simplify', { a: show(right) }) : null);
      }
      return [pics(st), promptRow(st.prompt),
        h('form', { class: 'answer-in', onSubmit: (e) => { e.preventDefault(); check(); } },
          inp, h('button', { class: 'btn primary', type: 'submit' }, s('check_answer')))];
    },
    say: (st) => {
      const en = !!st.english;
      const word = en ? st.english : plain(st.text);
      const out = [
        en ? h('div', { class: 'english', dir: 'ltr', lang: 'en' }, word) : h('div', { class: 'word' }, word),
        en && st.text ? h('p', { class: 'read' }, rich(st.text)) : null,
        speakerBtn(() => say(word, en ? 'en' : lang), { size: 'lg', label: s('hear') }),
      ];
      if (canRecord()) {
        const note = h('small', {}, s('say_note'));
        const mic = h('button', { class: 'mic', type: 'button', 'aria-label': s('your_turn') }, icon('mic', 44, 2.4));
        mic.addEventListener('click', recorder((on) => {
          mic.classList.toggle('rec', on);
          note.textContent = on ? s('recording') : s('say_note');
        }));
        out.push(h('div', { class: 'say-row' }, mic, h('div', {}, h('b', {}, s('your_turn')), note)));
      } else {
        out.push(h('p', { class: 'prompt' }, s('your_turn')));
      }
      return out;
    },
  };

  function draw() {
    stop();
    state.setStep(id, i);
    const st = steps[i];
    [...segs.children].forEach((sp, k) => sp.classList.toggle('on', k <= i));
    fill(body, (KINDS[st.kind] || KINDS.read)(st));
    fb.className = 'feedback hidden';
    fb.replaceChildren();
    prev.classList.toggle('hidden', !i);
    next.disabled = QUESTION.has(st.kind) && results[i] === undefined;
    next.replaceChildren(i === steps.length - 1 ? s('done') : s('next'), icon('next'));
    if (young && hasVoice(st.kind === 'say' && st.english ? 'en' : lang)) setTimeout(pageSpeak, 300);
    window.scrollTo(0, 0);
  }

  function finish() {
    stop();
    const answers = Object.values(results);
    const right = answers.filter(Boolean).length;
    const stars = !answers.length || right === answers.length ? 3 : right * 2 >= answers.length ? 2 : 1;
    state.markDone(id, stars);
    const summary = library.get(id);
    const after = summary ? library.after(state.child(), summary) : null;
    [...segs.children].forEach((sp) => sp.classList.add('on'));
    fill(root, header, band, h('div', { class: 'finish' },
      h('div', { class: 'stars' }, [0, 1, 2].map((k) => star(48, k < stars))),
      h('h1', {}, s('lesson_done')),
      answers.length ? h('p', { class: 'muted' }, s('of', { a: right, b: answers.length })) : null,
      summary ? modules.lessonEnd({ child: state.child(), lesson: summary, look: state.mode() }) : null,
      after && after.id !== id ? h('a', { class: 'btn primary big', href: '#/lesson/' + encodeURIComponent(after.id) },
        s('next_lesson'), icon('next')) : null,
      h('a', { class: 'link', href: '#/home' }, s('back')),
      sourceNote(L)));
    if (young && hasVoice(lang)) say(s('lesson_done'));
  }

  function go(k) {
    if (k < 0) return;
    if (k >= steps.length) { finish(); return; }
    i = k;
    draw();
  }

  draw();
  return { el: root, tab: null, cleanup: stop };
}

// the one-line source note at the end of a lesson that uses outside material (BUILD-PLAN 4.2); how it looks is
// for the design committee (C2), so it is plain text with a speaker for now
function sourceNote(L) {
  const lines = (L.credits || []).map((c) => [c.line, pick(c.changes)].filter(Boolean).join(' '));
  if (!lines.length) return null;
  return h('div', { class: 'source-note' }, lines.map((t) => h('p', { class: 'row' },
    h('span', { class: 'grow', dir: 'auto' }, t), speakerBtn(() => speak(t, 'en'), { size: 'sm' }))),
    h('a', { class: 'link', href: '#/credits' }, s('credits')));
}
