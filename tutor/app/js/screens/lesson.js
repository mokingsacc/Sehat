// The lesson player: one step per screen, a speaker on every text, answers checked at once.
// Hints, never answers (C2.3): a wrong pick or number says "No, look again" and she tries again; the right option is
// never marked for her and the reason ("why", which holds the answer) shows only once she has it right. Next opens
// after her first try, so nobody is stuck. #/lesson/<id>/<n> opens step n from a hint ("Open that step"): it does
// not move her place in the lesson, and the close button goes back to where she came from.
// The bands that read lesson steps on open (bands.js: early years, years 1 to 6, adult literacy) hear each step
// read aloud, from its recorded clip or the phone's voice. Children get stars at the end, adults a check mark.
// The end of every lesson points to its worksheet (the sheets module's lesson.end offer): pen and paper is where
// the practice happens.
// Spaced review (P25a, modules/recall.js): opened as #/lesson/<id>?warm=1 (the big button, the Now card, a plan's
// card), up to three due items from earlier lessons play first, each drawn as in its own lesson, under three warm
// segments and "Do you remember? 1 of 3" ("Quick practice" for adults). Finishing a lesson adds its items.

import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { notSimplest, parse, same } from '../numbers.js';
import { praise, readsOnOpen } from '../bands.js';
import * as recall from '../modules/recall.js';
import { canRecord, hasVoice, packClip, recorder, speak, stop } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, speakerBtn, star, toast, topbar } from '../ui.js';

const QUESTION = new Set(['choice', 'number']);

export default async function lesson(args) {
  const [id, stepText] = args;
  const c = state.child();
  const L = id ? await hub.lesson(id) : null;
  if (!L || !Array.isArray(L.steps)) {
    return { el: h('div', { class: 'screen' }, topbar({ back: '#/home', child: true }),
      h('div', { class: 'empty' }, hub.online() ? s('no_lessons') : hub.home() === 'online' ? s('lesson_not_here') : s('offline'))),
    tab: 'lessons' };
  }
  const lang = getLang();
  const steps = L.steps;
  const band = state.band(c);
  const young = readsOnOpen(band, c.track, 'step');          // read each step aloud when it opens
  const adult = praise(band) === 'check';
  const results = state.firstTries(id);   // step number -> right on the first try (kept if the child leaves)
  const peek = stepText !== undefined && /^[0-9]+$/.test(stepText);     // opened from a hint, at that step
  let i = Math.min(Math.max(peek ? +stepText - 1 : c.step[id] || 0, 0), steps.length - 1);
  // the warm-up: never from a hint, never in early years (recall.canRecall), only items whose lesson is on the phone
  const warm = !peek && args.query && args.query.get('warm') === '1' ? recall.due(c, id) : [];
  let w = warm.length ? 0 : -1;                 // the warm-up item shown, or -1 once the lesson's own steps play
  const cur = () => (w >= 0 ? warm[w].step : steps[i]);
  // her first try on a question: the lesson's own steps keep it for the stars; a warm-up item moves its box
  const first = (ok) => {
    if (w >= 0) {
      if (warm[w].ok === undefined) { warm[w].ok = ok; recall.answer(state.child(), warm[w].key, ok); }
      return;
    }
    if (results[i] === undefined) { results[i] = ok; state.firstTry(id, i, ok); }
  };

  const say = (text, l = lang) => speak(text, l);
  const segs = h('div', { class: 'segs grow', style: { gridTemplateColumns: `repeat(${warm.length + steps.length}, minmax(0, 1fr))` } },
    warm.map(() => h('span', { class: 'w' })), steps.map(() => h('span')));
  const header = h('header', { class: 'top' },
    h('a', { class: 'round', href: '#/home', 'aria-label': s('close'),
      onClick: peek ? (e) => { e.preventDefault(); history.back(); } : null }, icon('x', 24, 2.6)),
    segs,
    speakerBtn(() => pageSpeak(), { size: 'sm', label: s('hear_page'), page: true }));
  const body = h('div', { class: 'step' });
  const fb = h('div', { class: 'feedback hidden', role: 'status', 'aria-live': 'polite' });
  const prev = h('button', { class: 'btn', type: 'button', onClick: () => go(i - 1) }, icon('back'), s('back'));
  const next = h('button', { class: 'btn primary main', type: 'button', onClick: () => go(i + 1) });
  // in the bands with a speaker per button (bands.speakerPerButton) each button carries its own
  const prevBox = said(prev);
  const nextBox = said(next);
  if (nextBox !== next) nextBox.classList.add('main');
  const actions = h('div', { class: 'actions' }, prevBox, nextBox);
  const draftBand = L.draft ? h('div', { class: 'draft', 'data-silent': '' }, s('draft_note')) : null;
  const warmHead = h('div', { class: 'listen-row warm-kicker hidden' });         // "Do you remember? 1 of 3"
  const root = h('div', { class: 'screen player' }, header, draftBand, warmHead, body, fb, actions);

  function mainText(st) {
    if (st.kind === 'letter') return [plain(st.text), pick(st.word)].filter(Boolean).join('. ');
    if (st.kind === 'say') return st.english || plain(st.text);
    return plain(st.prompt || st.text);
  }
  const stepLang = (st) => (st.kind === 'say' && st.english ? 'en' : lang);
  // the step's recorded clip, when the pack has one (placeholders only for testers)
  const stepClip = (st) => { const u = packClip((st.audio || {})[stepLang(st)]); return u ? hub.url(u) : null; };
  const canSay = (st) => !!stepClip(st) || hasVoice(stepLang(st));
  function pageSpeak() {
    const st = cur();
    speak(mainText(st), stepLang(st), stepClip(st));
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

  // right: the reason; wrong: "No, look again", never the answer, and she tries again
  function feedback(ok, why, note) {
    next.disabled = false;
    fb.className = 'feedback ' + (ok ? 'right' : 'wrong');
    const msg = note || (ok ? s('right') : s('wrong'));
    const shown = ok ? why : null;
    fill(fb,
      h('div', { class: 'msg' }, icon(ok ? 'check' : 'x', 26, 3), msg),
      shown ? h('div', { class: 'listen-row' }, speakerBtn(() => say(plain(shown)), { size: 'sm' }),
        h('div', { class: 'why grow' }, rich(shown))) : null);
    if (young && hasVoice(lang)) say([msg, shown ? plain(shown) : ''].filter(Boolean).join('. '));
  }

  const KINDS = {
    letter: (st) => [
      h('div', { class: 'letter' }, st.letter),
      st.forms ? h('div', { class: 'forms' }, st.forms) : null,
      pics(st),
      h('div', { class: 'row center' }, h('span', { class: 'word' }, pick(st.word)), speakerBtn(pageSpeak)),
      st.text ? h('p', { class: 'read' }, rich(st.text)) : null,
    ],
    read: (st) => [
      pics(st),
      st.english ? englishRow(st.english) : null,
      h('div', { class: 'listen-row' }, speakerBtn(pageSpeak), h('p', { class: 'read grow' }, rich(st.text))),
    ],
    choice: (st) => {
      let solved = false;
      const optBody = (o) => (o && typeof o === 'object' && ('picture' in o || 'text' in o)
        ? [o.picture ? h('img', { src: hub.url(o.picture), alt: '' }) : null, o.text ? h('span', { class: 'naskh' }, pick(o.text)) : null]
        : rich(o));
      const opts = st.options.map((o, k) => h('button', { type: 'button', class: 'opt', onClick: () => choose(k) }, optBody(o)));
      function choose(k) {
        if (solved || opts[k].disabled) return;
        const ok = k === st.answer;
        first(ok);
        opts[k].classList.add(ok ? 'right' : 'wrong');
        if (ok) solved = true; else opts[k].disabled = true;      // that one is out: she picks again
        feedback(ok, st.why);
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
        first(ok);
        inp.className = ok ? 'right' : 'wrong';
        feedback(ok, st.why, ok && notSimplest(inp.value) ? s('simplify') : null);
      }
      return [pics(st), promptRow(st.prompt),
        h('form', { class: 'answer-in', onSubmit: (e) => { e.preventDefault(); check(); } },
          inp, said(h('button', { class: 'btn primary', type: 'submit' }, s('check_answer'))))];
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

  // a warm-up item: its kicker, then the step as in its own lesson; Next opens after her first try
  function drawWarm() {
    stop();
    const it = warm[w];
    [...segs.children].forEach((sp, k) => sp.classList.toggle('on', k <= w));
    const kicker = s('recall_kicker', { n: w + 1, b: warm.length });
    warmHead.classList.remove('hidden');
    fill(warmHead, h('p', { class: 'kicker grow' }, kicker), speakerBtn(() => say(kicker), { size: 'sm' }));
    fill(body, (KINDS[it.step.kind] || KINDS.read)(it.step));
    fb.className = 'feedback hidden';
    fb.replaceChildren();
    prevBox.classList.add('hidden');
    next.disabled = it.ok === undefined;
    next.replaceChildren(s('next'), icon('next'));
    if (young && canSay(it.step)) setTimeout(() => say(kicker), 300);
    window.scrollTo(0, 0);
  }

  function draw() {
    stop();
    if (!peek) state.setStep(id, i);
    const st = steps[i];
    warmHead.classList.add('hidden');
    [...segs.children].forEach((sp, k) => sp.classList.toggle('on', k < warm.length || k - warm.length <= i));
    fill(body, (KINDS[st.kind] || KINDS.read)(st));
    fb.className = 'feedback hidden';
    fb.replaceChildren();
    prevBox.classList.toggle('hidden', !i);
    next.disabled = QUESTION.has(st.kind) && results[i] === undefined;
    next.replaceChildren(i === steps.length - 1 ? s('done') : s('next'), icon('next'));
    if (young && canSay(st)) setTimeout(pageSpeak, 300);
    window.scrollTo(0, 0);
  }

  function finish() {
    stop();
    const answers = Object.values(results);
    const right = answers.filter(Boolean).length;
    const stars = !answers.length || right === answers.length ? 3 : right * 2 >= answers.length ? 2 : 1;
    state.markDone(id, stars);
    recall.add(state.child(), L);                  // its review items, due tomorrow (none in ey, Quran or seerah)
    const summary = library.get(id);
    const after = summary ? library.after(state.child(), summary) : null;
    [...segs.children].forEach((sp) => sp.classList.add('on'));
    fill(root, header, draftBand, h('div', { class: 'finish' },
      adult ? h('div', { class: 'done-big', 'aria-hidden': 'true' }, icon('check', 56, 3))
        : h('div', { class: 'stars' }, [0, 1, 2].map((k) => star(48, k < stars))),
      h('h1', {}, s('lesson_done')),
      answers.length ? h('p', { class: 'muted' }, adult ? s('correct_of', { a: right, b: answers.length })
        : s('of', { a: right, b: answers.length })) : null,
      summary ? modules.lessonEnd(modules.context(state.child(), summary)) : null,
      after && after.id !== id ? said(h('a', { class: 'btn primary big', href: '#/lesson/' + encodeURIComponent(after.id) },
        s('next_lesson'), icon('next'))) : null,
      h('a', { class: 'link', href: '#/home' }, s('back')),
      sourceNote(L)));
    if (young) speak(s('lesson_done'), lang, { key: 'lesson_done' });
  }

  function go(k) {
    if (w >= 0) {                                  // the warm-up: its next item, then the lesson where she was
      w = w + 1 < warm.length ? w + 1 : -1;
      if (w >= 0) drawWarm(); else draw();
      return;
    }
    if (k < 0) return;
    if (k >= steps.length) { finish(); return; }
    i = k;
    draw();
  }

  if (w >= 0) drawWarm(); else draw();
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
