// Ask: a child's question goes to the hub, which answers from checked sources first (docs/ARCHITECTURE.md).
// Every answer carries a badge saying where it came from. Away from the hub, the closest answer from a lesson
// already on this phone is shown and marked as such; nothing is made up on the phone.
// Consent (DESIGN.md 6 and 7): the first question she sends opens the consent screen; "Not now" keeps Ask on the
// phone for this visit (the ready answers of lessons here, nothing sent), and it is asked again on a later visit.
// Offline (C2.5): when no answer on the phone fits, one button, "Send when I'm online", queues the question
// (outbox.js); it shows "Waiting to send" until it goes, "Not sent" after 7 days, "Couldn't send" if refused.
// Hints, never answers (C2.3, P15): an exercise (a sum, "solve", "find"...) comes back as a hint ladder, "Hint 1 of
// 3" one rung at a time (check.js's ladder), never its answer. In Homework help (#/ask?hw=1, the `homework` module:
// the title, "Type the question from your book" and her band's subject chips) a ladder can also offer "Check my
// answer": she types hers and hears "Yes, that's right" or "Not yet", three tries a question; "I'm not sure about
// this one" when the model's two runs disagreed. Offline, Homework help says it needs the internet and Ask's ready
// answers on the phone work as before. Each ladder can still go to the teacher.
// No hints now (C4 look question 9): "Hints are resting for today" when the day's AI budget is spent, or "We have no
// hints for this one" where no teacher looks; either way the line offers the lessons search (#/plan where she can
// plan, else every subject). In bold English the Homework help placeholder is the short "Type the question" (look
// question 10), and on the hub "Send when I'm online" is "Send when the hub is near" (look question 5).

import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as outbox from '../outbox.js';
import { readsOnOpen } from '../bands.js';
import * as modules from '../modules.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, speakerBtn, SUBJECTS, toast, topbar } from '../ui.js';
import { canPlan } from '../modules/plan.js';
import { ladder, toldLine } from './check.js';
import { saidNotNow } from './signup.js';

let held = null;           // the question she typed before the consent screen, sent when she comes back

const BADGE = {
  rules: ['badge_rules', 'checked', 'check'], maths: ['badge_maths', 'checked', 'check'],
  bank: ['badge_checked', 'checked', 'check'], approved: ['badge_checked', 'checked', 'check'],
  teacher: ['badge_teacher', 'checked', 'check'], lesson: ['badge_lesson', 'wait', 'book'],
  offline: ['badge_lesson', 'wait', 'book'], none: ['badge_waiting', 'wait', 'users'],
};
const POLL_MS = 20000;

function badge(source, mc) {
  if (source === 'ai') return h('span', { class: 'badge ai' }, icon('chip', 16), mc ? s('badge_ai_checked') : s('badge_ai'));
  const [key, cls, ic] = BADGE[source] || BADGE.none;
  return h('span', { class: 'badge ' + cls }, icon(ic, 16), s(key));
}

// words for matching a question to a lesson's ready answers when the hub is out of reach
const words = (t) => String(t || '').toLowerCase()
  .replace(/[ً-ٰٟ]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإآ]/g, 'ا')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

function offlineAnswer(q, lang) {
  const want = new Set(words(q));
  if (!want.size) return null;
  let best = null;
  for (const l of library.all()) {
    const full = state.cache('lesson.' + l.id);
    for (const b of (full && full.bank) || []) {
      const have = new Set(words(pick(b.q, lang)));
      let n = 0;
      want.forEach((w) => { if (have.has(w)) n += 1; });
      if (!best || n / want.size > best.score) best = { score: n / want.size, a: pick(b.a, lang) };
    }
  }
  return best && best.score >= 0.5 ? best.a : null;
}

const RESULT = { right: 'its_right', not_yet: 'not_yet', unsure: 'not_sure', used_up: 'no_more_checks' };

export default async function ask(args = []) {
  const c = state.child();
  const lang = getLang();
  // Homework help's door (C2.3): only where the module is on for her band
  const hw = !!(args.query && args.query.get('hw') === '1') && modules.listed('homework') && modules.allows('homework', c.band);
  let subject = null;
  const reads = readsOnOpen(c.band, c.track, 'step');
  await library.load();
  const context = library.next(c);
  const full = context ? await hub.lesson(context.id) : null;
  const ready = ((full && full.bank) || []).slice(0, 3).map((b) => pick(b.q, lang)).filter(Boolean);
  let pending = null;
  let offer = null;          // a question with no answer on the phone, while offline: "Send when I'm online"
  const offerBox = h('div', { class: 'offer' });

  const thread = h('div', { class: 'thread', 'aria-live': 'polite' });
  const readyBox = h('div', { class: 'ready' });
  const bold = document.documentElement.dataset.look === 'bold';
  const place = s(hw ? (bold && lang === 'en' ? 'hw_placeholder_short' : 'hw_placeholder') : 'ask_placeholder');
  const input = h('input', { placeholder: place, 'aria-label': place, maxlength: 400,
    autocomplete: 'off', enterkeyhint: 'send' });
  const composer = h('form', { class: 'composer', onSubmit: (e) => { e.preventDefault(); send(input.value); } },
    input, h('button', { type: 'submit', 'aria-label': s('send') }, icon('send', 26, 2.3)));

  const findLesson = () => said(h('a', { class: 'btn outline', href: canPlan(state.child()) ? '#/plan' : '#/subjects' },
    icon('book', 22), s('find_lesson')));
  const answerBubble = (text, badgeEl, extra, search = false) => h('div', { class: 'bubble-a' },
    h('div', { class: 'text' }, rich(text)), search ? findLesson() : null,
    h('div', { class: 'meta' }, badgeEl,
      h('span', { class: 'row' }, extra || null, speakerBtn(() => speak(plain(text), lang), { size: 'sm' }))));

  // a ladder in place of an answer: the line, the hints one at a time, and in Homework help "Check my answer"
  function ladderBubble(a, extra) {
    const lad = ladder(a.ladder, { reads, told: toldLine, onRung: (k) => state.updateAsk(a.id, { rungs: k }) });
    for (let k = 0; k < (a.rungs || 0); k += 1) lad.open(true);
    const result = a.result ? h('p', { class: 'check-result ' + a.result, role: 'status' }, s(RESULT[a.result] || 'error'),
      a.result === 'not_yet' && a.left ? [' ', s('tries_left', { n: a.left })] : null) : null;
    let form = null;
    if (a.checkable && !a.unsure && a.result !== 'right' && a.left !== 0 && hub.online()) {
      const box = h('input', { dir: 'ltr', autocomplete: 'off', maxlength: 40, 'aria-label': s('your_answer'), placeholder: s('your_answer') });
      form = h('form', { class: 'answer-in', onSubmit: async (e) => {
        e.preventDefault();
        const v = box.value.trim();
        if (!v) { toast(s('your_answer')); return; }
        try {
          const r = await hub.checkAnswer(a.id, v, state.child().token);
          state.updateAsk(a.id, { result: r.result, left: r.left });
        } catch (err) { toast(err.status === 429 ? s('slow_down') : hub.online() ? s('error') : s('offline')); }
        drawThread();
      } }, box, said(h('button', { class: 'btn primary', type: 'submit' }, icon('check', 20), s('check_my_answer'))));
    }
    return h('div', { class: 'bubble-a ladder-a' },
      h('div', { class: 'text' }, rich(a.a)), lad.cards,
      lad.size ? h('div', { class: 'row wrap' }, lad.button) : null,
      a.unsure ? h('p', { class: 'muted' }, s('not_sure')) : null,
      form, result,
      h('div', { class: 'meta' }, badge(a.source, a.mc), h('span', { class: 'row' }, extra || null,
        speakerBtn(() => speak(plain(a.a), lang), { size: 'sm' }))));
  }

  function drawThread() {
    const asks = state.child().asks;
    fill(thread, asks.map((a) => {
      const out = [h('div', { class: 'bubble-q' }, a.q)];
      // W7 (3.8): a question queued on her other phone is sent from there only, unless she sends it from this one
      if (a.queued && !state.mine(a)) {
        out.push(h('div', { class: 'note row wrap' }, h('span', { class: 'badge wait' }, icon('clock', 16), s('wait_other_phone')),
          h('button', { type: 'button', class: 'link', onClick: () => { outbox.again(c.id, a.k); drawThread(); } }, s('send_here'))));
      } else if (a.queued) out.push(h('div', { class: 'note' }, h('span', { class: 'badge wait' }, icon('clock', 16), s('wait_badge'))));
      if (a.notSent || a.failed) {
        out.push(h('div', { class: 'note row wrap' }, h('span', { class: 'badge wait' }, s(a.notSent ? 'not_sent' : 'cant_send')),
          h('button', { type: 'button', class: 'link', onClick: () => { outbox.again(c.id, a.k); drawThread(); } },
            s(a.notSent ? 'send_again' : 'try_again'))));
      }
      if (a.note) out.push(h('div', { class: 'note' }, s(a.note)));
      if (a.a) {
        const canSend = a.id && !a.sent && !a.done && (a.source === 'ai' || a.source === 'lesson' || !!a.ladder);
        const extra = a.teacherQueued ? h('span', { class: 'badge wait' }, icon('clock', 16), s('wait_badge'))
          : canSend ? h('button', { class: 'link', type: 'button', onClick: () => toTeacher(a) }, s('send_teacher'))
            : (a.sent || (a.waiting && a.source === 'rules')) && !a.done ? h('span', { class: 'badge wait' }, s('sent_teacher')) : null;
        out.push(a.ladder ? ladderBubble(a, extra) : answerBubble(a.a, badge(a.source, a.mc), extra, !!a.search));
      }
      if (a.teacher) out.push(answerBubble(a.teacher, badge('teacher')));
      return out;
    }), pending ? [h('div', { class: 'bubble-q' }, pending), h('div', { class: 'bubble-a' }, h('div', { class: 'text muted' }, s('thinking')))] : null);
    fill(offerBox, offer ? said(h('button', { type: 'button', class: 'btn outline', onClick: () => {
      outbox.queue({ id: null, q: offer, at: Date.now(), lang, lesson: context ? context.id : null });
      offer = null;
      drawThread();
    } }, icon('clock', 22), s(hub.home() === 'online' ? 'send_online' : 'send_hub'))) : null);
    fill(readyBox, asks.length || pending || offer || !ready.length ? null : [
      h('div', { class: 'muted small' }, s('ready_questions')),
      ready.map((q) => said(h('button', { type: 'button', onClick: () => send(q) }, icon('ask', 22), q)))]);
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || pending) return;
    input.value = '';
    const entry = { id: null, q: text, at: Date.now(), lang };
    const agreed = !!state.child().consent;
    if (hub.online() && !agreed && !saidNotNow(c.id)) {
      held = { id: c.id, text };
      location.hash = '#/consent/ask';
      return;
    }
    if (!hub.online() || !agreed) {
      const a = offlineAnswer(text, lang);
      if (a) {
        state.addAsk({ ...entry, a, source: 'offline', note: agreed ? 'offline_ask' : 'ask_local', done: true });
      } else if (agreed) {
        offer = text;                            // "Send when I'm online"
      } else {
        toast(s('ask_local'));
        input.value = text;
      }
      drawThread();
      return;
    }
    if (hub.home() === 'online' && !state.child().token) {      // her join is on its way: the question follows it
      outbox.queue({ ...entry, lesson: context ? context.id : null });
      drawThread();
      return;
    }
    pending = text;
    drawThread();
    composer.scrollIntoView({ block: 'end', behavior: 'smooth' });
    try {
      const r = await hub.ask({ text, lang, year: c.year, subject, lesson: context ? context.id : null }, state.child().token);
      state.addAsk({ ...entry, id: r.id, a: r.text, source: r.source, mc: r.maths_checked, waiting: r.waiting,
        ...(r.search ? { search: true, done: true } : {}),
        ...(Array.isArray(r.ladder) ? { ladder: r.ladder, checkable: !!r.checkable, unsure: !!r.unsure, rungs: 0 } : {}) });
    } catch (e) {
      toast(e.status === 429 ? s('slow_down') : hub.online() ? s('error') : s('offline'));
      input.value = text;
    }
    pending = null;
    drawThread();
    composer.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  async function toTeacher(a) {
    if (!hub.online()) {                          // sent when the server is back
      state.updateAsk(a.id, { teacherQueued: true });
      drawThread();
      return;
    }
    try {
      await hub.toTeacher(a.id, state.child().token);
      state.updateAsk(a.id, { sent: true });
      toast(s('sent_teacher'));
    } catch { toast(hub.online() ? s('error') : s('offline')); }
    drawThread();
  }

  // the teacher's answers arrive on this screen; questions older than three days stop being checked
  async function poll() {
    if (!hub.online()) return;
    const open = state.child().asks.filter((a) => a.id && !a.done && (a.waiting || a.sent) && Date.now() - a.at < 3 * 864e5);
    let changed = false;
    for (const a of open) {
      try {
        const r = await hub.askStatus(a.id);
        if (r.status === 'reviewed' && Array.isArray(r.ladder)) {     // a held ladder the teacher sent (P20)
          state.updateAsk(a.id, { a: r.line || a.a, ladder: r.ladder, checkable: !!r.checkable, rungs: 0, source: 'ai',
            waiting: false, done: true });
          changed = true;
        } else if (r.status === 'reviewed' && r.teacher_answer) {
          const same = r.teacher_answer.trim() === String(a.a || '').trim();
          state.updateAsk(a.id, same ? { source: 'teacher', done: true } : { teacher: r.teacher_answer, done: true });
          changed = true;
        } else if (r.status === 'rejected') {
          state.updateAsk(a.id, { done: true });
        }
      } catch (e) { if (e.status === 404) state.updateAsk(a.id, { done: true }); }
    }
    if (changed) drawThread();
  }

  drawThread();
  poll();
  const timer = setInterval(poll, POLL_MS);
  const unwatch = outbox.onChange(drawThread);
  if (held && held.id === c.id) { const q = held.text; held = null; setTimeout(() => send(q), 0); }
  // Homework help: her band's subjects as chips (optional), and offline a line saying it needs the internet
  const chips = hw ? h('div', { class: 'chips pad row wrap' }, SUBJECTS.filter((x) => x !== 'english' || c.year >= 4).map((x) => {
    const b = h('button', { type: 'button', class: 'btn chip', 'aria-pressed': 'false' }, s(x));
    b.addEventListener('click', () => {
      subject = subject === x ? null : x;
      chips.querySelectorAll?.('button').forEach((y) => y.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', subject === x ? 'true' : 'false');
    });
    return b;
  })) : null;
  const hwOffline = hw && !hub.online() ? h('p', { class: 'empty small' }, s('hw_offline')) : null;
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/home', title: s(hw ? 'hw_title' : 'ask_title'), lead: hw ? null : s('ask_scope'), child: true }),
    hwOffline, chips, thread, readyBox, composer, offerBox);
  return { el, tab: 'ask', cleanup: () => { clearInterval(timer); unwatch(); }, onHub: poll };
}
