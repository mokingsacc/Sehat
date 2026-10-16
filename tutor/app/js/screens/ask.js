// Ask: a child's question goes to the hub, which answers from checked sources first (docs/ARCHITECTURE.md).
// Every answer carries a badge saying where it came from. Away from the hub, the closest answer from a lesson
// already on this phone is shown and marked as such; nothing is made up on the phone.
// Consent (DESIGN.md 6 and 7): the first question she sends opens the consent screen; "Not now" keeps Ask on the
// phone for this visit (the ready answers of lessons here, nothing sent), and it is asked again on a later visit.
// Offline (C2.5): when no answer on the phone fits, one button, "Send when I'm online", queues the question
// (outbox.js); it shows "Waiting to send" until it goes, "Not sent" after 7 days, "Couldn't send" if refused.

import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as outbox from '../outbox.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, speakerBtn, toast, topbar } from '../ui.js';
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

export default async function ask() {
  const c = state.child();
  const lang = getLang();
  await library.load();
  const context = library.next(c);
  const full = context ? await hub.lesson(context.id) : null;
  const ready = ((full && full.bank) || []).slice(0, 3).map((b) => pick(b.q, lang)).filter(Boolean);
  let pending = null;
  let offer = null;          // a question with no answer on the phone, while offline: "Send when I'm online"
  const offerBox = h('div', { class: 'offer' });

  const thread = h('div', { class: 'thread', 'aria-live': 'polite' });
  const readyBox = h('div', { class: 'ready' });
  const input = h('input', { placeholder: s('ask_placeholder'), 'aria-label': s('ask_placeholder'), maxlength: 400,
    autocomplete: 'off', enterkeyhint: 'send' });
  const composer = h('form', { class: 'composer', onSubmit: (e) => { e.preventDefault(); send(input.value); } },
    input, h('button', { type: 'submit', 'aria-label': s('send') }, icon('send', 26, 2.3)));

  const answerBubble = (text, badgeEl, extra) => h('div', { class: 'bubble-a' },
    h('div', { class: 'text' }, rich(text)),
    h('div', { class: 'meta' }, badgeEl,
      h('span', { class: 'row' }, extra || null, speakerBtn(() => speak(plain(text), lang), { size: 'sm' }))));

  function drawThread() {
    const asks = state.child().asks;
    fill(thread, asks.map((a) => {
      const out = [h('div', { class: 'bubble-q' }, a.q)];
      if (a.queued) out.push(h('div', { class: 'note' }, h('span', { class: 'badge wait' }, icon('clock', 16), s('wait_badge'))));
      if (a.notSent || a.failed) {
        out.push(h('div', { class: 'note row wrap' }, h('span', { class: 'badge wait' }, s(a.notSent ? 'not_sent' : 'cant_send')),
          h('button', { type: 'button', class: 'link', onClick: () => { outbox.again(c.id, a.k); drawThread(); } },
            s(a.notSent ? 'send_again' : 'try_again'))));
      }
      if (a.note) out.push(h('div', { class: 'note' }, s(a.note)));
      if (a.a) {
        const canSend = a.id && !a.sent && !a.done && (a.source === 'ai' || a.source === 'lesson');
        const extra = a.teacherQueued ? h('span', { class: 'badge wait' }, icon('clock', 16), s('wait_badge'))
          : canSend ? h('button', { class: 'link', type: 'button', onClick: () => toTeacher(a) }, s('send_teacher'))
            : (a.sent || (a.waiting && a.source === 'rules')) && !a.done ? h('span', { class: 'badge wait' }, s('sent_teacher')) : null;
        out.push(answerBubble(a.a, badge(a.source, a.mc), extra));
      }
      if (a.teacher) out.push(answerBubble(a.teacher, badge('teacher')));
      return out;
    }), pending ? [h('div', { class: 'bubble-q' }, pending), h('div', { class: 'bubble-a' }, h('div', { class: 'text muted' }, s('thinking')))] : null);
    fill(offerBox, offer ? said(h('button', { type: 'button', class: 'btn outline', onClick: () => {
      outbox.queue({ id: null, q: offer, at: Date.now(), lang, lesson: context ? context.id : null });
      offer = null;
      drawThread();
    } }, icon('clock', 22), s('send_online'))) : null);
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
      const r = await hub.ask({ text, lang, year: c.year, lesson: context ? context.id : null }, state.child().token);
      state.addAsk({ ...entry, id: r.id, a: r.text, source: r.source, mc: r.maths_checked, waiting: r.waiting });
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
      await hub.toTeacher(a.id);
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
        if (r.status === 'reviewed' && r.teacher_answer) {
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
  const el = h('div', { class: 'screen' },
    topbar({ back: '#/home', title: s('ask_title'), sub: s('ask_scope'), child: true }),
    thread, readyBox, composer, offerBox);
  return { el, tab: 'ask', cleanup: () => { clearInterval(timer); unwatch(); }, onHub: poll };
}
