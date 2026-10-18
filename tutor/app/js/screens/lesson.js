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
// English and Chinese (P27a, C4.4): the words she learns are drawn in their own script, English left to right, Chinese
// as characters over pinyin with a small line for each tone, and play only their recording (a human English voice, a
// native Mandarin one): such a lesson takes no phone voice at all, so an unrecorded word says "not recorded yet". An
// English letter (`script: "latn"`) is drawn left to right. A `choice` with a word plays it as the question, its text
// hidden with `hide` (listening). "Say it" records only where the phone can (canRecord): in the APK and on the hub it
// is "hear it, say it", with no mic.
// Quran and seerah (P29, C4.7) take no phone voice either. An `ayah` step names a verse; its text, translation and
// recitation come from the Quran set (quran.js), never from the lesson: the verse in Amiri Quran, Listen (the
// recitation), "Repeat after" (the verse, then a pause as long as the verse for her to say it, three times, nothing
// recorded), the translation with its speaker only where a native speaker's recording exists, its notes folded and
// its exact credit. The page speaker plays the recitation.

import { fa, getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as modules from '../modules.js';
import { notSimplest, parse, same } from '../numbers.js';
import { praise, readsOnOpen } from '../bands.js';
import { TONE_PATH, words as pinyinWords } from '../pinyin.js';
import * as made from '../modules/made.js';
import * as recall from '../modules/recall.js';
import * as Q from '../quran.js';
import * as practice from '../speak.js';
import { addVoices, canRecord, hasClip, hasVoice, packClip, play, recorder, speak, stop } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, playIcon, rich, said, speakerBtn, star, toast, topbar } from '../ui.js';

const QUESTION = new Set(['choice', 'number']);
const STUDIED = new Set(['english', 'chinese']);        // their words are recordings only (P27a)
const RELIGIOUS = new Set(['quran', 'seerah']);         // recordings only too, and the verses the reciter's (P29)

// the word a step teaches: {lang, text}, or null
const target = (st) => (st.english ? { lang: 'en', text: st.english } : st.zh ? { lang: 'zh', text: st.zh } : null);

// a pinyin line with each word's tones drawn over it
function pinyinLine(pinyin) {
  return h('span', { class: 'pinyin', lang: 'zh-Latn-pinyin', dir: 'ltr' }, pinyinWords(pinyin).map(({ word, tones }) => {
    const t = document.createElement('template');
    t.innerHTML = '<span class="tones" aria-hidden="true">' + tones.map((n) => '<svg width="24" height="15" viewBox="0 0 24 15" '
      + `fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${TONE_PATH[n]}"/></svg>`).join('') + '</span>';
    return h('span', { class: 'syl', title: tones.map((n) => s('tone_' + n)).join(', ') || null }, t.content.firstChild, h('span', {}, word));
  }));
}

export default async function lesson(args) {
  const [id, stepText] = args;
  const c = state.child();
  const L = id ? await hub.lesson(id) : null;
  if (!L || !Array.isArray(L.steps)) {
    return { el: h('div', { class: 'screen' }, topbar({ back: '#/home', child: true }),
      h('div', { class: 'empty' }, hub.online() ? s('no_lessons') : hub.home() === 'online' ? s('lesson_not_here') : s('offline'))),
    tab: 'lessons' };
  }
  addVoices(L.voices, hub.url);                 // every line of the lesson in the one voice (C5.6)
  const lang = getLang();
  const steps = L.steps;
  const band = state.band(c);
  const young = readsOnOpen(band, c.track, 'step');          // read each step aloud when it opens
  const adult = praise(band) === 'check';
  const results = state.firstTries(id);   // step number -> right on the first try (kept if the child leaves)
  const peek = stepText !== undefined && /^[0-9]+$/.test(stepText);     // opened from a hint, at that step
  let i = Math.min(Math.max(peek ? +stepText - 1 : c.step[id] || 0, 0), steps.length - 1);
  // the warm-up: never from a hint, never in early years (recall.canRecall), only items whose lesson is on the phone
  const warmOn = !peek && args.query && args.query.get('warm') === '1';
  const warm = warmOn ? recall.due(c, id) : [];
  if (warmOn) warm.push(...made.due(c, id, recall.WARM - warm.length));     // P32: her own questions fill the rest
  let w = warm.length ? 0 : -1;                 // the warm-up item shown, or -1 once the lesson's own steps play
  const cur = () => (w >= 0 ? warm[w].step : steps[i]);
  // her first try on a question: the lesson's own steps keep it for the stars; a warm-up item moves its box
  const first = (ok) => {
    if (w >= 0) {
      if (warm[w].ok === undefined) {
        warm[w].ok = ok;
        if (warm[w].made) made.answer(state.child(), warm[w].made.id, ok);     // self-marked; nothing recorded
        else recall.answer(state.child(), warm[w].key, ok);
      }
      return;
    }
    if (results[i] === undefined) { results[i] = ok; state.firstTry(id, i, ok); }
  };

  const recordedOnly = STUDIED.has(L.subject) || RELIGIOUS.has(L.subject);    // no phone voice (P27a, P29)
  const say = (text, l = lang) => speak(text, l, recordedOnly ? { recorded: true } : undefined);
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
    if (st.kind === 'made') return st.q;
    return plain(st.prompt || st.text);
  }
  // a say step, and a choice that plays its word, speak the word; every other step its words in her language
  const wordFirst = (st) => !!target(st) && (st.kind === 'say' || st.kind === 'choice');
  const stepLang = (st) => (st.kind === 'say' && st.english ? 'en' : wordFirst(st) ? target(st).lang : lang);
  // the step's recorded clip, when the pack has one (placeholders only for testers)
  const clipIn = (st, l) => { const u = packClip((st.audio || {})[l]); return u ? hub.url(u) : null; };
  const stepClip = (st) => clipIn(st, stepLang(st));
  const canSay = (st) => !!stepClip(st) || hasClip(wordFirst(st) ? target(st).text : mainText(st), stepLang(st))
    || (!recordedOnly && hasVoice(stepLang(st)));
  // the taught word's recording, never the phone's voice
  const sayWord = (st) => { const t = target(st); if (t) speak(t.text, t.lang, { audio: clipIn(st, t.lang), recorded: true }); };
  function pageSpeak() {
    const st = cur();
    if (st.kind === 'ayah') { if (st._verse) Q.recite(st._verse); return; }
    if (wordFirst(st)) { sayWord(st); return; }
    speak(mainText(st), stepLang(st), { audio: stepClip(st), recorded: recordedOnly });
  }

  function pics(st) {
    if (!st.picture) return null;
    const n = st.picture_count || 1;
    return h('div', { class: 'pics' + (n > 3 ? ' many' : '') },
      Array.from({ length: n }, () => h('img', { src: hub.url(st.picture), alt: '' })));
  }
  const promptRow = (t) => h('div', { class: 'listen-row' },
    speakerBtn(() => say(plain(t))), h('p', { class: 'prompt grow' }, rich(t)));
  // the taught word: English left to right, or Chinese characters over their pinyin; its speaker plays the recording
  const wordRow = (st) => h('div', { class: 'row center' },
    st.zh ? h('div', { class: 'zh-word', dir: 'ltr' }, h('span', { class: 'zh', lang: 'zh-Hans' }, st.zh), pinyinLine(st.pinyin))
      : h('span', { class: 'english', dir: 'ltr', lang: 'en' }, st.english),
    speakerBtn(() => sayWord(st)));

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
    if (young && !recordedOnly && hasVoice(lang)) say([msg, shown ? plain(shown) : ''].filter(Boolean).join('. '));
  }

  // a verse from the Quran set (P29): drawn once its surah has come
  function ayahStep(st) {
    const box = h('div', { class: 'ayah-step stack' }, h('p', { class: 'muted' }, s('loading')));
    (async () => {
      const [idx, d] = [await Q.load(), await Q.surah(st.surah)];
      const v = d && d.verses[st.ayah - 1];
      if (!v) { fill(box, h('p', { class: 'empty' }, s('quran_not_here'))); return; }
      st._verse = v;
      const tl = Q.trLang(idx, lang);
      let stopRep = null;
      const status = h('span', {}, s('quran_repeat'));
      const rep = h('button', { type: 'button', class: 'btn outline' }, icon('repeat', 22), status);
      rep.addEventListener('click', () => {
        if (stopRep) { stopRep(); return; }
        stopRep = Q.repeatAfter(v, (n) => {
          status.textContent = n ? s('quran_repeat_n', { n: fa(n) }) : s('quran_repeat');
          if (!n) stopRep = null;
        });
      });
      fill(box, h('p', { class: 'muted small' }, h('bdi', { dir: 'ltr' }, d.tname), ' · ', s('quran_verse', { a: fa(v.a) })),
        Q.verseView(v, { lang: tl, credits: d.credits, clip: clipIn(st, tl), big: true }),
        v.audio ? [said(h('button', { type: 'button', class: 'btn primary', onClick: () => Q.recite(v) }, playIcon(20), s('quran_listen'))),
          said(rep)] : null);
    })();
    return [box];
  }

  const KINDS = {
    ayah: ayahStep,
    // P32: one of her own questions in the warm-up: the answer behind a tap, then she marks herself
    made: (st) => {
      const ans = h('div', { class: 'made-ans stack hidden' }, h('p', { class: 'read', dir: 'auto' }, st.a),
        st.why ? h('p', { class: 'muted', dir: 'auto' }, st.why) : null);
      const mark = (ok) => () => {
        first(ok);
        knew.disabled = true; notYet.disabled = true;
        (ok ? knew : notYet).classList.add('on');
        next.disabled = false;
      };
      const knew = h('button', { type: 'button', class: 'btn', onClick: mark(true) }, icon('check', 20), s('made_knew'));
      const notYet = h('button', { type: 'button', class: 'btn', onClick: mark(false) }, s('made_not_yet'));
      const marks = h('div', { class: 'btns two hidden' }, said(knew), said(notYet));
      const show = h('button', { type: 'button', class: 'btn outline', onClick: () => {
        show.classList.add('hidden'); ans.classList.remove('hidden'); marks.classList.remove('hidden');
      } }, s('made_show'));
      return [h('p', { class: 'kicker' }, s('made_yours')),
        h('div', { class: 'listen-row' }, speakerBtn(pageSpeak), h('p', { class: 'read grow', dir: 'auto' }, st.q)),
        said(show), ans, marks];
    },
    letter: (st) => (st.script === 'latn' ? [            // an English letter, its picture word and their recording
      h('div', { class: 'letter latn', dir: 'ltr', lang: 'en' }, st.letter),
      pics(st),
      wordRow(st),
      st.text ? h('div', { class: 'listen-row' }, speakerBtn(pageSpeak), h('p', { class: 'read grow' }, rich(st.text))) : null,
    ] : [
      h('div', { class: 'letter' }, st.letter),
      st.forms ? h('div', { class: 'forms' }, st.forms) : null,
      pics(st),
      h('div', { class: 'row center' }, h('span', { class: 'word' }, pick(st.word)), speakerBtn(pageSpeak)),
      st.text ? h('p', { class: 'read' }, rich(st.text)) : null,
    ]),
    read: (st) => [
      pics(st),
      target(st) ? wordRow(st) : null,
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
      // a word to listen for: its big speaker is the question, and `hide` keeps its text off the screen
      const word = target(st) ? (st.hide ? h('div', { class: 'row center' }, speakerBtn(() => sayWord(st), { size: 'lg', label: s('hear') }))
        : wordRow(st)) : null;
      return [pics(st), word, promptRow(st.prompt), h('div', { class: 'options' + (opts.length === 3 ? ' three' : '') }, opts)];
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
      const t = target(st);
      const word = t ? t.text : plain(st.text);
      const out = [
        st.zh ? h('div', { class: 'zh-word', dir: 'ltr' }, h('span', { class: 'zh', lang: 'zh-Hans' }, st.zh), pinyinLine(st.pinyin))
          : t ? h('div', { class: 'english', dir: 'ltr', lang: 'en' }, word) : h('div', { class: 'word' }, word),
        t && st.text ? h('p', { class: 'read' }, rich(st.text)) : null,
        speakerBtn(() => (t ? sayWord(st) : say(word, lang)), { size: 'lg', label: s('hear') }),
      ];
      if (canRecord() && modules.on('speak') && modules.allows('speak', c && c.band)) {
        out.splice(out.length - 1, 1, practiceRow(() => (t ? sayWord(st) : say(word, lang))));   // "Play the voice" in its place
      } else if (canRecord()) {
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

  // speech practice (C5.5, module `speak`): play the voice, record (8 s, in memory), play mine beside the voice, then
  // her own mark; three goes, then "Let's go on." Next is never blocked; the recording goes when the step closes.
  let drops = [];
  const dropAll = () => { drops.forEach((f) => f()); drops = []; };
  function practiceRow(playVoice) {
    const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
    const btn = (label, ic, onClick, cls = 'btn') => h('button', { type: 'button', class: cls, onClick }, ic, s(label));
    const recBtn = btn('speak_record', icon('mic', 22), () => rec(), 'btn primary');
    const mine = btn('speak_mine', playIcon(20), () => { const u = P.mine(); if (u) play(u, { onfail: () => {} }); });
    const yes = btn('speak_said', icon('check', 22), () => marked(true));
    const no = btn('speak_not_yet', null, () => marked(false));
    const after = h('div', { class: 'row wrap hidden' }, said(mine), said(yes), said(no));
    const P = practice.session({ onChange: (st) => {
      recBtn.replaceChildren(icon('mic', 22), s(st === 'recording' ? 'speak_stop' : 'speak_record'));
      recBtn.classList.toggle('rec', st === 'recording');
      if (st === 'recorded') { after.classList.remove('hidden'); status.textContent = ''; }
    } });
    drops.push(P.drop);
    async function rec() {
      if (practice.firstTap()) status.textContent = s('speak_mic_note');
      stop();
      try { await P.record(); } catch { status.textContent = s('error'); }
    }
    function marked(ok) {
      const r = P.mark(ok);
      after.classList.add('hidden');
      if (r === 'said' || r === 'go_on') { recBtn.classList.add('hidden'); status.textContent = r === 'go_on' ? s('speak_go_on') : ''; }
      else status.textContent = s('speak_again');
    }
    return h('div', { class: 'stack speak-row' },
      h('div', { class: 'row wrap' }, said(btn('speak_voice', playIcon(20), playVoice)), said(recBtn)), after, status);
  }

  // a warm-up item: its kicker, then the step as in its own lesson; Next opens after her first try
  function drawWarm() {
    dropAll();
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
    dropAll();
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
    dropAll();
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
  return { el: root, tab: null, cleanup: () => { dropAll(); stop(); } };
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
