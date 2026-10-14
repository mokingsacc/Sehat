// The teacher's page (PIN): today's numbers, questions to look at (urgent first), recent printing, the hub card,
// and lesson problems. Each answer the teacher approves or writes is used for the next child who asks the
// same thing, so the hub gets better (and gathers checked Pashto answers) with every review.

import { fa, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as state from '../state.js';
import { fill, h, hubChip, icon, rich, toast, topbar } from '../ui.js';

const REFRESH_MS = 30000;
const time = (iso) => { try { return fa(new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); } catch { return ''; } };

export default async function teacher() {
  const root = h('div', { class: 'screen' });
  let pin = state.pin();
  let timer = null;
  let editing = false;

  function gate(msg) {
    const input = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12,
      'aria-label': s('teacher_pin'), placeholder: s('teacher_pin') });
    const err = h('div', { class: 'status err', role: 'status' }, msg || '');
    fill(root,
      topbar({ back: state.child() ? '#/home' : '#/welcome', title: s('teacher'), extra: hubChip() }),
      h('form', { class: 'card lined pad-card stack gate', onSubmit: (e) => { e.preventDefault(); enter(input.value.trim()); } },
        h('div', { class: 'row center' }, icon('lock', 40, 2)),
        h('div', { class: 'pin' }, input),
        h('button', { class: 'btn primary big', type: 'submit' }, s('enter')), err));
    setTimeout(() => input.focus(), 50);
  }

  async function enter(p) {
    if (!p) return;
    try {
      await hub.teacher.summary(p);
      pin = state.pin(p);
      page();
    } catch (e) {
      if (e.status === 401) pin = state.pin('');
      gate(e.status === 401 ? s('wrong_pin') : e.status === 429 ? s('wait_minute') : hub.online() ? s('error') : s('offline'));
    }
  }

  async function page() {
    if (editing) return;
    await library.load();
    let sum, queue, prints;
    try {
      [sum, queue, prints] = await Promise.all([hub.teacher.summary(pin), hub.teacher.queue(pin), hub.teacher.prints(pin)]);
    } catch (e) {
      if (e.status === 401) { state.pin(''); gate(s('wrong_pin')); }
      else toast(hub.online() ? s('error') : s('offline'));
      return;
    }
    const k = sum.counts;
    const ai = sum.hello.ai || {};
    const qs = queue.questions;
    fill(root,
      topbar({ back: state.child() ? '#/home' : '#/welcome', title: s('teacher'), extra: h('button', { class: 'round', type: 'button',
        'aria-label': s('refresh'), onClick: page }, icon('refresh', 22)) }),
      qs.some((q) => q.urgent) ? h('div', { class: 'banner urgent', role: 'alert' }, icon('users', 24), s('urgent')) : null,
      h('div', { class: 'stats' },
        [['asked_today', k.asked_today], ['checked_today', k.checked_today], ['pages_today', k.pages_today]]
          .map(([key, n]) => h('div', { class: 'stat' }, h('b', {}, fa(n)), h('small', {}, s(key))))),
      h('div', { class: 'pad muted small line' },
        `${s('ai')}: ${ai.on ? s('on') : s('off')} · ${s('printer_hub')}: ${s('printer_' + (sum.hello.printer.state || 'off'))} · ${s('approved')}: ${fa(k.approved_answers)}`),
      h('div', { class: 'section-head' }, h('h2', {}, s('questions_review')), h('span', {}, fa(qs.length))),
      qs.length ? qs.map(card) : h('div', { class: 'empty' }, s('no_questions')),
      h('div', { class: 'section-head' }, h('h2', {}, s('recent_prints'))),
      h('div', { class: 'jobs' }, prints.jobs.slice(0, 10).map((j) => {
        const l = library.get(j.lesson_id);
        const what = j.kind === 'card' ? s('hub_card') : `${(l && l.code) || j.lesson_id || ''}${j.seed ? '-' + j.seed : ''}`;
        return h('div', {}, h('span', { dir: 'ltr' }, what, j.kind === 'answers' ? ' ✓' : ''),
          h('span', {}, `${fa(j.copies)} × · ${s('job_' + j.status)} · ${time(j.created)}`));
      })),
      h('div', { class: 'pad top-gap' }, h('button', { class: 'btn outline big', type: 'button', onClick: printCard },
        icon('printer'), s('print_card'))),
      sum.pack_problems.length ? [h('div', { class: 'section-head' }, h('h2', {}, s('problems'))),
        h('ul', { class: 'problems', dir: 'ltr' }, sum.pack_problems.map((p) => h('li', {}, p)))] : null,
    );
  }

  function card(q) {
    const box = h('div', { class: 'qcard' + (q.urgent ? ' urgent' : '') });
    const meta = [s('lang_' + (q.lang || 'prs')), q.subject ? s(q.subject) : null, q.year != null ? s('year_n', { n: q.year }) : null,
      q.lesson_title, time(q.created)].filter(Boolean).join(' · ');
    const editor = (start) => {
      editing = true;
      const ta = h('textarea', { 'aria-label': s('write_answer'), dir: q.lang === 'en' ? 'ltr' : 'rtl' });
      ta.value = start || '';
      const save = h('button', { class: 'btn primary', type: 'button', onClick: () => decide(ta.value.trim(), true) }, s('save'));
      const cancel = h('button', { class: 'btn', type: 'button', onClick: () => { editing = false; draw(); } }, s('cancel'));
      fill(box, h('div', { class: 'meta' }, meta), h('div', { class: 'q' }, q.question), ta,
        h('div', { class: 'btns two' }, save, cancel));
      ta.focus();
    };
    async function decide(answer, approve) {
      if (approve && answer === '') { toast(s('write_answer')); return; }
      try {
        await hub.teacher.answer(pin, q.id, { answer: answer || null, approve });
        editing = false;
        box.remove();
        toast(s('answer_saved'));
      } catch (e) { toast(e.status === 401 ? s('wrong_pin') : s('error')); }
    }
    function draw() {
      fill(box,
        h('div', { class: 'meta' }, meta),
        h('div', { class: 'q' }, q.question),
        q.answer ? h('div', { class: 'a' }, rich(q.answer, q.lang)) : null,
        !q.answer && q.lang === 'ps' ? h('div', { class: 'meta' }, s('pashto_teacher')) : null,
        h('div', { class: 'btns' }, q.answer && q.source !== 'rules'
          ? [h('button', { class: 'btn good', type: 'button', onClick: () => decide(null, true) }, s('correct_btn')),
            h('button', { class: 'btn', type: 'button', onClick: () => editor(q.answer.replace(/\$/g, '')) }, s('fix_btn'))]
          : [h('button', { class: 'btn primary', type: 'button', onClick: () => editor('') }, s('write_answer')), h('span')],
        h('button', { class: 'btn', type: 'button', onClick: () => decide(null, false) }, s('reject_btn'))));
    }
    draw();
    return box;
  }

  async function printCard() {
    try { await hub.teacher.card(pin); toast(s('printing')); } catch { toast(s('print_failed')); }
  }

  if (pin) await enter(pin); else gate();
  timer = setInterval(() => { if (pin && !editing && document.visibilityState === 'visible') page(); }, REFRESH_MS);
  return { el: root, tab: null, cleanup: () => clearInterval(timer), onHub: () => pin && page() };
}
