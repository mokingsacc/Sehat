// Getting ready for university (P28, C4.6), the `university` module, for s2 and adult readers: #/university is one
// screen. First the checklist, the pack's own steps, which she ticks alone: the ticks stay on this phone (state
// `uni`, step numbers) and are never sent, since what she is preparing for says more about her than her year does.
// A step may open a subject (its pathways). Then link cards to courses, tests, scholarships and advice: our words
// about a page elsewhere, what it costs, who may apply, and when a person checked it; a card past its review_by date
// is not drawn, by the phone's own date, offline too. The cards need the internet. Nothing here promises a place or
// a scholarship (the hub's lint refuses such words), the scam warning ends the screen, and no event is written for
// a tick or an opened card.

import { fa, getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, speakerBtn, topbar } from '../ui.js';

const KINDS = [['course', 'uni_courses'], ['test', 'uni_tests'], ['scholarship', 'uni_scholarships'], ['guide', 'uni_guides']];

const pick = (v, lang = getLang()) => (v && typeof v === 'object' ? v[lang] || v.prs || v.en || '' : v || '');

// the phone's own date, YYYY-MM-DD
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// the cards still within their review_by date (C4.6: six months after a person checked the page)
export const current = (cards, day = today()) => (cards || []).filter((c) => c && (!c.review_by || c.review_by >= day));

// "October 2026" in her language (the Gregorian month, as the card's checked date is)
export function monthOf(day, lang = getLang()) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(day || '');
  if (!m) return '';
  const names = s('uni_months').split('|');
  return `${names[+m[2] - 1] || m[2]} ${lang === 'en' ? m[1] : fa(m[1])}`;
}

// what a card costs, in words: a scholarship's "free" is free to apply
export const costKey = (c) => (c.cost === 'free' ? (c.kind === 'scholarship' ? 'uni_cost_free_apply' : 'uni_cost_free')
  : c.cost === 'audit' ? 'uni_cost_audit' : c.cost === 'fees' ? 'uni_cost_fees' : null);

const say = (text) => speakerBtn(() => speak(text, getLang()), { size: 'sm' });

function head(key) {
  return h('div', { class: 'section-head row' }, h('h2', { class: 'grow' }, s(key)), say(s(key)));
}

function card(c) {
  const lang = getLang();
  const about = pick(c.about, lang);
  const who = pick(c.who, lang);
  const cost = costKey(c) ? s(costKey(c)) : '';
  return h('div', { class: 'card lined linkcard uni-card' },
    h('div', { class: 'row' },
      h('span', { class: 'grow' }, h('b', { dir: 'auto' }, pick(c.title, lang)), c.owner ? h('small', { class: 'muted', dir: 'auto' }, c.owner) : null),
      say([pick(c.title, lang), about, who ? s('uni_who', { x: who }) : '', cost].filter(Boolean).join('. '))),
    h('p', { class: 'about' }, about),
    who ? h('p', { class: 'uni-who' }, s('uni_who', { x: who })) : null,
    h('p', { class: 'facts' }, cost ? h('span', { class: 'cost' }, cost) : null,
      c.checked ? h('span', { class: 'muted' }, s('uni_checked', { m: monthOf(c.checked, lang) })) : null),
    h('a', { class: 'btn outline', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, s('open_link')));
}

function checklist(c, steps) {
  const done = new Set(c.uni || []);
  const count = h('p', { class: 'uni-count' });
  const setCount = () => fill(count, s('uni_count', { a: fa(done.size), b: fa(steps.length) }));
  setCount();
  const rows = steps.map((st, i) => {
    const n = i + 1;
    const text = pick(st.text);
    const box = h('input', { type: 'checkbox', checked: done.has(n) || null, 'aria-label': text });
    box.addEventListener('change', () => {
      if (box.checked) done.add(n); else done.delete(n);
      state.updateChild(c.id, { uni: [...done] });          // on this phone only: no event, nothing sent
      setCount();
    });
    const open = /^subject:([a-z]+)$/.exec(st.open || '');
    return h('li', { class: 'uni-step' },
      h('label', { class: 'grow row' }, box, h('span', { class: 'grow' }, text)),
      open ? h('a', { class: 'round uni-open', href: '#/subject/' + open[1], 'aria-label': s(open[1]) }, icon('chev', 20)) : null,
      say(text));
  });
  return [h('div', { class: 'row pad' }, count, speakerBtn(() => speak(count.textContent, getLang()), { size: 'sm' })),
    h('ol', { class: 'uni-steps' }, rows),
    h('p', { class: 'muted small pad' }, s('uni_kept'))];
}

export default async function university() {
  const c = state.child();
  const d = await hub.university();
  const el = h('div', { class: 'screen uni', 'data-speaks': '' });
  const warning = h('div', { class: 'uni-warning row', role: 'note' }, h('p', { class: 'grow' }, s('uni_warning')), say(s('uni_warning')));
  if (!d || !d.checklist) {
    fill(el, topbar({ back: '#/home', title: s('uni_title'), child: true }), h('div', { class: 'empty' }, s('uni_not_here')), warning);
    return { el, tab: 'lessons' };
  }
  const cards = current(d.cards);
  const draft = d.checklist.draft || cards.some((x) => x.draft);
  const cardsBox = h('div', { class: 'uni-cards' });
  const drawCards = () => fill(cardsBox, !hub.online() ? h('p', { class: 'muted pad' }, s('uni_offline'))
    : !cards.length ? h('p', { class: 'muted pad' }, s('uni_none'))
      : KINDS.map(([kind, key]) => {
        const mine = cards.filter((x) => x.kind === kind);
        return mine.length ? [head(key), h('div', { class: 'stack pad' }, mine.map(card))] : null;
      }));
  drawCards();
  fill(el,
    topbar({ back: '#/home', title: s('uni_title'), child: true }),
    draft ? h('div', { class: 'draft', 'data-silent': '' }, s('uni_draft')) : null,
    h('div', { class: 'row pad' }, h('p', { class: 'muted grow' }, s('uni_no_promise')), say(s('uni_no_promise'))),
    checklist(c, d.checklist.steps),
    cardsBox,
    warning);
  return { el, tab: 'lessons', onHub: drawCards };
}
