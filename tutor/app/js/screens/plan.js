// #/plan: "I want to learn..." (P22; C3.5, DESIGN-C2C3-SPECS.md item 14). Typed only (no browser speech input:
// Chrome's sends her voice to Google). A 56 px box and a send button, "Or pick one" with up to eight unit chips of
// her band's lessons, then the answer:
// - a match: "Here's your plan: 4 lessons", the lessons in order (done ones ticked, the next marked), "Start my plan";
// - a partial match: "Closest lessons", three at most, with "Make these my plan" (C4 look question 25);
// - a miss: "We don't have lessons for this yet. We've added it to our list." The text goes to the wishlist screened
//   and without her token; offline it waits on the phone (outbox.js) and goes when the server is back;
// - distress, health or off-limits words: the rules' kind message, and nothing is kept.
// While a plan runs, the top says "Your plan: Fractions · 2 of 4" with "Stop this plan". One plan at a time.
// Free text (C2.8, C1.4): the first goal she sends opens the consent screen; "Not now" keeps the search on the phone
// and sends nothing. The chips never send anything.

import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as library from '../library.js';
import * as outbox from '../outbox.js';
import * as plans from '../modules/plan.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, said, speakerBtn, subjectBadge, toast, topbar } from '../ui.js';
import { saidNotNow } from './signup.js';

let held = null;          // what she typed before the consent screen, sent when she comes back

export default async function plan() {
  await library.load();
  const c = state.child();
  if (!plans.canPlan(c)) { location.replace('#/home'); return { el: h('div'), tab: null }; }
  const lang = getLang();
  const say = (t) => () => speak(t, lang);
  const top = h('div', { class: 'plan-top' });
  const out = h('div', { class: 'stack plan-out', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'text', maxlength: 200, dir: 'auto', autocomplete: 'off', enterkeyhint: 'send',
    placeholder: s('plan_type'), 'aria-label': s('plan_type') });
  let busy = false;

  function drawTop() {
    const w = plans.where(state.child());
    fill(top, w ? h('div', { class: 'card soft pad-card row wrap plan-now' },
      icon('book', 22),
      h('span', { class: 'grow' }, h('b', {}, s('plan_now', { label: w.label, n: Math.min(w.n, w.total), b: w.total }))),
      speakerBtn(say(s('plan_now', { label: w.label, n: Math.min(w.n, w.total), b: w.total })), { size: 'sm' }),
      said(h('button', { type: 'button', class: 'btn outline small', onClick: () => {
        plans.stop(state.child());
        toast(s('plan_stopped'));
        drawTop();
      } }, s('plan_stop')))) : null);
  }

  const row = (l, i, mark) => said(h('a', { class: 'trow', href: '#/lesson/' + encodeURIComponent(l.id) },
    h('span', { class: 'time' }, String(i + 1)), subjectBadge(l.subject, 36),
    h('span', { class: 'grow' }, h('b', {}, plain(l.title))),
    mark === 'done' ? icon('check', 22, 2.6) : mark === 'next' ? h('span', { class: 'tag' }, s('plan_next')) : null));

  function showPlan(label, ids) {
    const lessons = ids.map((id) => library.get(id)).filter(Boolean);
    const cur = state.child();
    const firstLeft = lessons.findIndex((l) => !(cur.done && cur.done[l.id]));
    const head = s('plan_here', { n: lessons.length });
    fill(out, h('div', { class: 'row' }, h('h2', { class: 'grow' }, head), speakerBtn(say(head), { size: 'sm' })),
      h('nav', { class: 'subjects today' }, lessons.map((l, i) => row(l, i,
        cur.done && cur.done[l.id] ? 'done' : i === firstLeft ? 'next' : null))),
      said(h('button', { type: 'button', class: 'btn primary', onClick: () => {
        if (plans.start(state.child(), label, ids)) { toast(s('plan_started')); location.hash = '#/home'; }
      } }, icon('next', 22), s('plan_start'))));
  }

  function showClosest(ids) {
    const lessons = ids.map((id) => library.get(id)).filter(Boolean);
    fill(out, h('div', { class: 'row' }, h('h2', { class: 'grow' }, s('plan_closest')), speakerBtn(say(s('plan_closest')), { size: 'sm' })),
      h('nav', { class: 'subjects today' }, lessons.map((l, i) => row(l, i, null))),
      said(h('button', { type: 'button', class: 'btn outline', onClick: () => {
        const first = lessons[0];
        if (first && plans.start(state.child(), plain(first.unit || first.title), lessons.map((l) => l.id))) {
          toast(s('plan_started'));
          location.hash = '#/home';
        }
      } }, icon('next', 22), s('plan_make'))));
  }

  function showLine(text, cls = '') {
    fill(out, h('div', { class: 'card pad-card row ' + cls }, h('p', { class: 'grow', dir: 'auto' }, text),
      speakerBtn(say(text), { size: 'sm' })));
  }

  function show(r) {
    if (r.kind === 'plan' && r.lessons.length) return showPlan(r.label, r.lessons);
    if (r.kind === 'closest' && r.lessons.length) return showClosest(r.lessons);
    if (r.kind === 'rules') return showLine(r.text, 'kind');
    return showLine(s(r.saved ? 'plan_miss' : r.queued ? 'plan_miss_later' : 'plan_miss_here'));
  }

  async function send(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    const cur = state.child();
    const agreed = !!cur.consent;
    if (hub.online() && !agreed && !saidNotNow(cur.id)) {
      held = { id: cur.id, text };
      location.hash = '#/consent/plan';
      return;
    }
    if (!hub.online() || !agreed || (hub.home() === 'online' && !cur.token)) {
      const r = plans.localSearch(cur, text, lang);
      if (r.kind === 'miss' && agreed) {
        outbox.queueWish(cur.id, text, lang);
        return show({ kind: 'wish', queued: true });
      }
      return show(r);
    }
    busy = true;
    try {
      show(await hub.plan({ goal: text, lang, band: cur.band }));
    } catch (e) {
      if (e.status === 429) { toast(s('slow_down')); return; }
      show(plans.localSearch(cur, text, lang));            // the server is out of reach: the phone's own search
    } finally { busy = false; }
  }

  const form = h('form', { class: 'composer plan-form', onSubmit: (e) => { e.preventDefault(); send(input.value); } },
    input, h('button', { type: 'submit', 'aria-label': s('send') }, icon('send', 26, 2.3)));
  // six chips at most in the bold sizes, eight in clean, wrapping, never cut (C4 look question 27)
  const chips = plans.units(c, document.documentElement.dataset.look === 'bold' ? plans.CHIPS_BOLD : plans.CHIPS);
  const el = h('div', { class: 'screen plan' },
    topbar({ back: '#/home', title: s('plan_title'), child: true }),
    h('div', { class: 'stack pad' }, top, form,
      chips.length ? h('div', { class: 'row' }, h('p', { class: 'grow muted' }, s('plan_pick')), speakerBtn(say(s('plan_pick')), { size: 'sm' })) : null,
      chips.length ? h('div', { class: 'chips' }, chips.map((name) => h('button', { type: 'button', class: 'chip', dir: 'auto',
        onClick: () => { const r = plans.unitPlan(state.child(), name); show(r); } }, name))) : null,
      out));
  drawTop();
  if (held && held.id === c.id) {                          // back from the consent screen: send what she typed
    const text = held.text;
    held = null;
    input.value = text;
    setTimeout(() => send(text), 0);
  }
  return { el, tab: 'lessons' };
}
