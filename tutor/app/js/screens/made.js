// My questions (P32, C4.8; modules/made.js): #/made lists the questions she made, each with what became of it;
// #/made/new and #/made/new/<lesson> make one. A question, its answer and an optional why, each at most 300
// characters, text only; a web address, an email, seven digits or "my name is ..." stops Save as she types. They stay
// on this phone and come back in her warm-ups. Where her teacher reads To do, "Ask my teacher to check" sends one; the
// verdict ("Checked by your teacher", or a change asked for, with the teacher's chips and short reply) shows here.

import { fa, getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as made from '../modules/made.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, speakerBtn, topbar } from '../ui.js';

const say = (text) => speakerBtn(() => speak(text, getLang()), { size: 'sm' });

function notHere() {
  return h('div', { class: 'screen', 'data-speaks': '' }, topbar({ back: '#/home', title: s('made_title'), child: true }),
    h('div', { class: 'empty' }, s('made_off')));
}

function statusLine(x) {
  if (!x.sent) return null;
  if (x.status === 'ok') return h('p', { class: 'made-status ok' }, icon('check', 20), s('made_ok'));
  if (x.status === 'change') {
    return h('div', { class: 'made-status change' },
      h('p', {}, icon('pencil', 20), s('made_change')),
      x.chips && x.chips.length ? h('p', { class: 'small' }, x.chips.map((c) => s('made_chip_' + c)).join(' · ')) : null,
      x.reply ? h('p', { class: 'reply', dir: 'auto' }, x.reply) : null);
  }
  return h('p', { class: 'made-status muted' }, icon('clock', 20), s('made_waiting'));
}

function list(c) {
  const el = h('div', { class: 'screen made', 'data-speaks': '' });
  const out = h('p', { class: 'muted pad', role: 'status', 'aria-live': 'polite' });
  const items = h('div', { class: 'stack pad' });

  async function send(x) {
    const cur = state.child();
    fill(out, s('loading'));
    try {
      const r = await hub.madeSend({ kind: 'question', body: { q: x.q, a: x.a, why: x.why }, lang: x.lang }, cur.token);
      if (r.care) { fill(out, r.message || ''); return; }               // distress: the teacher hears, kindly
      made.patch(cur, x.id, { sent: r.id, status: 'waiting' });
      fill(out, s('made_sent'));
    } catch (e) {
      fill(out, e.status === 422 && e.message ? e.message : e.status === 0 ? s('made_offline') : s('made_not_sent'));
    }
    draw();
  }

  function card(x) {
    const cur = state.child();
    const lesson = x.lesson ? library.get(x.lesson) : null;
    return h('div', { class: 'card lined made-card stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow', dir: 'auto' }, x.q), say(x.q)),
      h('p', { class: 'small', dir: 'auto' }, h('span', { class: 'muted' }, s('made_answer_is')), ' ', x.a),
      x.why ? h('p', { class: 'small', dir: 'auto' }, h('span', { class: 'muted' }, s('made_why_is')), ' ', x.why) : null,
      lesson ? h('p', { class: 'muted small', dir: 'auto' }, pick(lesson.title)) : null,
      statusLine(x),
      h('div', { class: 'row wrap' },
        made.canSend(cur) && !x.sent ? h('button', { type: 'button', class: 'btn outline', onClick: () => send(x) },
          icon('send', 20), s('made_ask_teacher')) : null,
        h('button', { type: 'button', class: 'btn', onClick: (e) => {          // a second tap deletes
          const b = e.currentTarget;
          if (b.dataset.sure) { made.remove(state.child(), x.id); draw(); return; }
          b.dataset.sure = '1';
          fill(b, icon('trash', 20), s('made_delete_q'));
        } }, icon('trash', 20), s('made_delete'))));
  }

  function draw() {
    const cur = state.child();
    const mine = [...(cur.made || [])].reverse();
    fill(items, mine.length ? mine.map(card) : h('p', { class: 'empty' }, s('made_empty')));
  }

  fill(el,
    topbar({ back: '#/home', title: s('made_title'), child: true }),
    h('div', { class: 'row pad' }, h('p', { class: 'muted grow' }, s('made_about')), say(s('made_about'))),
    h('div', { class: 'pad' }, (c.made || []).length < state.MADE_MAX
      ? h('a', { class: 'btn primary', href: '#/made/new' }, icon('plus', 22), s('made_new'))
      : h('p', { class: 'muted' }, s('made_full', { n: fa(state.MADE_MAX) }))),
    out, items);
  draw();
  // verdicts on what she sent: fetched when she opens the list and the hub is near
  if ((c.made || []).some((x) => x.sent && (x.status || 'waiting') === 'waiting') && c.token && hub.online()) {
    hub.madeMine(c.token).then((r) => {
      const by = new Map((r.items || []).map((x) => [x.id, x]));
      const cur = state.child();
      for (const x of cur.made || []) {
        const v = x.sent && by.get(x.sent);
        if (v && v.status !== x.status) made.patch(state.child(), x.id, { status: v.status, chips: v.chips || [], reply: v.reply || '' });
      }
      draw();
    }).catch(() => {});
  }
  return el;
}

function form(c, lessonId) {
  const lesson = lessonId ? library.get(lessonId) : null;
  const box = (key) => h('textarea', { class: 'field', rows: 3, maxlength: state.MADE_CHARS, dir: 'auto',
    'aria-label': s(key) });
  const q = box('made_q');
  const a = box('made_a');
  const why = box('made_why');
  const warn = h('p', { class: 'made-warn hidden', role: 'alert' }, s('made_no_ids'));
  const save = h('button', { type: 'submit', class: 'btn primary', disabled: true }, s('made_save'));
  const check = () => {
    const bad = [q, a, why].some((x) => made.identifierIn(x.value));
    warn.classList.toggle('hidden', !bad);
    save.disabled = bad || !q.value.trim() || !a.value.trim();
  };
  for (const x of [q, a, why]) x.addEventListener('input', check);
  const field = (key, el) => h('label', { class: 'stack made-field' }, h('span', { class: 'row' }, h('b', { class: 'grow' }, s(key)), say(s(key))), el);
  return h('div', { class: 'screen made', 'data-speaks': '' },
    topbar({ back: '#/made', title: s('made_new_title'), child: true }),
    lesson ? h('p', { class: 'muted pad', dir: 'auto' }, s('made_about_lesson', { t: pick(lesson.title) })) : null,
    h('form', { class: 'stack pad', onSubmit: (e) => {
      e.preventDefault();
      check();
      if (save.disabled) return;
      made.add(state.child(), { q: q.value, a: a.value, why: why.value, lesson: lessonId || null });
      location.hash = '#/made';
    } },
    field('made_q', q), field('made_a', a), field('made_why', why),
    h('p', { class: 'muted small' }, s('made_rules')), warn, save));
}

export default async function madeScreen(args) {
  const c = state.child();
  if (!made.canMake(c)) return { el: notHere(), tab: 'lessons' };
  await library.load();
  if (args[0] === 'new') {
    const lid = /^[a-z0-9][a-z0-9-]{0,63}$/.test(args[1] || '') ? args[1] : null;
    return { el: form(c, lid), tab: 'lessons' };
  }
  return { el: list(c), tab: 'lessons' };
}
