// The contest screens (P31, DESIGN-C6-SPECS.md C6.6), loaded when opened; modules/contest.js has the rules.
// - #/contest[?subject=]: the contests she can see (open, soon, and the ones she joined), with her result in each.
// - #/contest/<id>: the card: the title, "10 questions in 20 minutes", "Opens 3 Aqrab, 08:00" or "Until 5 Aqrab,
//   10:00" in her calendar and digits, her alias picture and number beside "You", and one button: nothing before the
//   window (the row stays on Home), "Join the contest" inside it (her consent first; the questions come, without
//   their answers), then "Start". Under it her best in that subject. Away from the hub and the internet: "Contests
//   need the hub or the internet". Once sent: "Sent. You took part!" and "7 of 10 right"; "The answers show when the
//   contest closes", then "See the answers"; "My certificate" where the contest gives one. No place, no class list.
// - #/contest/<id>/run: one question a screen in the lesson's look, without "Why?", a hint or "Check my answer": she
//   answers and goes on, Back changes an earlier answer until she sends; "{m} minutes left" in the header (never read
//   aloud); at zero the phone sends what she has. "Send" asks once, with the focus on Cancel.
// - #/contest/<id>/answers: after the close, each question with her answer and the right one, and why, marked here
//   against the key (the hub kept only her percent).

import * as account from '../account.js';
import * as cal from '../calendar.js';
import * as hub from '../hub.js';
import { fa, getLang, pick, s } from '../i18n.js';
import * as certs from '../modules/cert.js';
import * as C from '../modules/contest.js';
import { notSimplest, parse, same } from '../numbers.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { confirmSheet, fill, h, icon, plain, rich, said, speakerBtn, toast, topbar } from '../ui.js';
import { saidNotNow } from './signup.js';
import { aliasLabel, aliasPic } from './who.js';

const TICK_MS = 1000;
const minute = (t) => new Date(t).toISOString().slice(0, 16);
const line = (text, cls = '') => h('div', { class: 'row top' }, h('p', { class: 'grow ' + cls, dir: 'auto' }, text),
  speakerBtn(() => speak(text, getLang()), { size: 'sm' }));

// when her time is up: her start plus the contest's minutes, never after the close
export const deadline = (rec, x) => Math.min(rec.joined + x.minutes * 60e3, C.ms(x.closes_at));

// an answer as the phone shows it: a choice's option, a typed number as she typed it
function shown(q, a) {
  if (a === null || a === undefined || a === '') return s('contest_blank');
  if (q.kind === 'choice') {
    const o = (q.options || [])[a];
    return o && typeof o === 'object' && ('text' in o || 'picture' in o) ? plain(o.text || '') || fa(a + 1) : plain(o);
  }
  return String(a);
}

// the key's answer is right for hers (as the hub marks: a choice by index, a number by value; 2/4 counts as 1/2)
export function rightFor(q, a, key) {
  if (q.kind === 'choice') return Number.isInteger(a) && a === key.answer;
  const v = parse(String(a ?? ''));
  const want = parse(String(key.answer));
  return !!v && !!want && same(v, want);
}

export default async function contestScreen(args) {
  const [id, what] = args;
  if (!id) return listScreen(args.query ? args.query.get('subject') : null);
  const c = state.child();
  if (!C.canContest(c)) return gone('#/home');
  await C.refresh(c, true);
  const x = C.find(state.child(), id);
  if (!x) return gone('#/home');
  if (what === 'run') return runScreen(x);
  if (what === 'answers') return answersScreen(x);
  return cardScreen(x);
}

function gone(back) {
  return { el: h('div', { class: 'screen' }, topbar({ back, title: s('contest'), child: true }),
    h('div', { class: 'empty' }, hub.online() ? s('contest_none') : s('contest_offline'))), tab: 'lessons' };
}

// --- the list ---

function listScreen(subject) {
  const c = state.child();
  const el = h('div', { class: 'screen', 'data-speaks': '' });
  const back = subject ? '#/subject/' + encodeURIComponent(subject) : '#/home';
  const draw = () => {
    const all = C.known(state.child(), subject);
    fill(el, topbar({ back, title: s('contests'), sub: subject ? s(subject) : null, child: true }),
      all.length ? h('nav', { class: 'subjects contest-list' }, all.map((x) => said(row(x))))
        : h('div', { class: 'empty' }, hub.online() ? s('contest_none') : s('contest_offline')));
  };
  const row = (x) => {
    const r = C.recordOf(state.child(), x.id);
    const ph = C.phase(x);
    const sub = C.isSent(r) ? s('contest_result', { a: r.right, b: r.n })
      : ph === 'soon' ? s('contest_opens', { d: cal.moment(x.opens_at, getLang()) })
        : ph === 'open' ? s('contest_until', { d: cal.moment(x.closes_at, getLang()) }) : s('contest_closed');
    return h('a', { href: '#/contest/' + encodeURIComponent(x.id) },
      h('span', { class: 'sbadge s-' + x.subject, style: { width: '42px', height: '42px' } }, icon('flag', 24)),
      h('span', { class: 'grow' }, h('b', { dir: 'auto' }, C.title(x)), h('small', { class: 'muted' }, sub)), icon('chev', 22));
  };
  draw();
  if (c) C.refresh(c, true).then(() => { if (el.isConnected) draw(); });
  return { el, tab: 'lessons', onHub: draw };
}

// --- the card, and the result once sent ---

function cardScreen(x) {
  const el = h('div', { class: 'screen contest-screen', 'data-speaks': '' });
  const body = h('div', { class: 'card lined pad-card stack' });
  const back = '#/contest?subject=' + encodeURIComponent(x.subject);
  fill(el, topbar({ back, title: s('contest'), child: true }), body);

  const draw = () => {
    const c = state.child();
    const rec = C.recordOf(c, x.id);
    const ph = C.phase(x);
    const t = C.title(x);
    const shape = s('contest_shape', { n: x.n, m: x.minutes });
    const when = ph === 'soon' ? s('contest_opens', { d: cal.moment(x.opens_at, getLang()) })
      : ph === 'open' ? s('contest_until', { d: cal.moment(x.closes_at, getLang()) }) : s('contest_closed');
    const head = [
      h('div', { class: 'row' }, h('h2', { class: 'grow', dir: 'auto' }, t),
        speakerBtn(() => speak([t, shape, when].join('. '), getLang()), { size: 'sm' })),
      h('p', { class: 'muted' }, shape),
      h('p', { class: 'contest-when' }, when),
      h('div', { class: 'row contest-you' }, aliasPic(c, 26), h('span', { class: 'grow' }, h('b', {}, s('contest_you')), ' ',
        h('span', { class: 'muted' }, aliasLabel(c)))),
    ];
    const b = C.best(c, x.subject);
    const bestLine = b ? h('p', { class: 'muted small' }, s('contest_best', { s: s(x.subject), a: b.right, b: b.n })) : null;
    if (C.isSent(rec)) { fill(body, head, result(x, rec), bestLine); return; }
    fill(body, head, action(x, rec, ph), bestLine);
  };

  function action(xx, rec, ph) {
    if (ph === 'soon' || ph === 'later') return null;                    // "Remind me" is not built: the row stays
    if (!hub.online()) return line(s('contest_offline'));
    if (rec && ph !== 'closed') {                                        // started: go on (or send what she has)
      return said(h('a', { class: 'btn primary big', href: `#/contest/${encodeURIComponent(xx.id)}/run` },
        icon('next', 24), s('contest_start')));
    }
    if (ph !== 'open') return line(s('contest_closed'));
    const k = C.kept(xx.id);
    if (k && Array.isArray(k.questions)) {
      return said(h('button', { type: 'button', class: 'btn primary big', onClick: () => start(xx) }, icon('next', 24),
        s('contest_start')));
    }
    return said(h('button', { type: 'button', class: 'btn primary big', onClick: () => join(xx) }, icon('flag', 24),
      s('contest_join')));
  }

  async function join(xx) {
    const cur = state.child();
    if (!cur.consent) {
      if (hub.online() && !saidNotNow(cur.id)) { location.replace('#/consent/contest.' + xx.id); return; }
      fill(body, line(s('contest_consent'), 'lead'));
      return;
    }
    try {
      await account.sync();                              // her token, and her waiting events
      const me = state.child();
      if (!me.token) { toast(s('contest_offline')); return; }
      const q = await hub.contestQuestions(xx.id, me.token);
      state.cache('contest.' + xx.id, { title: xx.title, subject: xx.subject, opens_at: xx.opens_at,
        closes_at: q.closes_at || xx.closes_at, minutes: q.minutes || xx.minutes, certificate: !!xx.certificate,
        questions: Array.isArray(q.questions) ? q.questions : [] });
      draw();
    } catch (e) {
      if (e.code === 'contest_sent') { await C.refresh(state.child(), true); markFromList(xx); draw(); return; }
      toast(e.status === 429 ? s('cert_wait') : e.status === 410 ? s('contest_closed') : e.status === 0 ? s('contest_offline')
        : s('cert_failed'));
      draw();
    }
  }

  function start(xx) {
    const cur = state.child();
    const k = C.kept(xx.id);
    C.keep(cur, xx.id, { subject: xx.subject, joined: Date.now(), closes: k.closes_at || xx.closes_at,
      answers: k.questions.map(() => null) });
    location.hash = `#/contest/${encodeURIComponent(xx.id)}/run`;
  }

  draw();
  return { el, tab: 'lessons', onHub: draw };
}

// the list's `mine` (sent from this token before) as her record, when the phone did not keep the result
function markFromList(x) {
  const c = state.child();
  const y = C.listed(c).find((z) => z.id === x.id);
  if (!y || !y.mine || !Number.isInteger(y.mine.percent)) return;
  const n = x.n || 1;
  C.keep(c, x.id, { subject: x.subject, joined: (C.recordOf(c, x.id) || {}).joined || Date.now(), closes: x.closes_at,
    answers: (C.recordOf(c, x.id) || {}).answers || [], n, right: Math.round((y.mine.percent * n) / 100),
    percent: y.mine.percent, at: Date.now() });
}

function result(x, rec) {
  const c = state.child();
  const sent = s('contest_sent');
  const score = s('contest_result', { a: rec.right, b: rec.n });
  const closed = Date.now() >= C.ms(x.closes_at);
  return [
    h('div', { class: 'contest-result stack', role: 'status' },
      h('div', { class: 'row' }, h('p', { class: 'grow lead' }, icon('check', 26, 3), ' ', sent),
        speakerBtn(() => speak(`${sent} ${score}`, getLang()), { size: 'sm' })),
      h('p', { class: 'contest-score' }, score)),
    closed ? said(h('a', { class: 'btn outline', href: `#/contest/${encodeURIComponent(x.id)}/answers` }, s('contest_answers')))
      : line(s('contest_after'), 'muted'),
    x.certificate && certs.canCert(c) ? said(h('a', { class: 'btn outline', href: '#/cert/contest:' + encodeURIComponent(x.id) },
      icon('printer', 22), s(certs.certOf(c, 'contest:' + x.id) ? 'cert_mine' : 'cert_get'))) : null,
  ];
}

// --- the run ---

function runScreen(x) {
  const c = state.child();
  const rec = C.recordOf(c, x.id);
  const k = C.kept(x.id);
  const card = `#/contest/${encodeURIComponent(x.id)}`;
  if (!rec || C.isSent(rec) || !k || !Array.isArray(k.questions) || !k.questions.length) {
    location.replace(card);
    return { el: h('div'), tab: 'lessons' };
  }
  const qs = k.questions;
  const answers = qs.map((_, n) => (rec.answers || [])[n] ?? null);
  const lang = getLang();
  let i = Math.max(0, answers.findIndex((a) => a === null));
  if (i < 0 || i >= qs.length) i = 0;
  let sending = false;
  let timer = null;

  const left = h('span', { class: 'chip contest-left', 'data-silent': '', role: 'timer' });
  const kicker = h('div', { class: 'kicker' });
  const header = h('header', { class: 'top' },
    h('a', { class: 'round', href: card, 'aria-label': s('close') }, icon('x', 24, 2.6)),
    h('div', { class: 'grow' }, kicker, h('h1', { dir: 'auto' }, C.title(x))),
    speakerBtn(() => say(qs[i].prompt), { size: 'sm', label: s('hear_page'), page: true }), left);
  const body = h('div', { class: 'step' });
  const prev = h('button', { class: 'btn', type: 'button', onClick: () => go(i - 1) }, icon('back'), s('back'));
  const next = h('button', { class: 'btn primary main', type: 'button', onClick: () => (i === qs.length - 1 ? ask() : go(i + 1)) });
  const prevBox = said(prev);
  const nextBox = said(next);
  if (nextBox !== next) nextBox.classList.add('main');
  const root = h('div', { class: 'screen player contest-run', 'data-speaks': '' }, header, body,
    h('div', { class: 'actions' }, prevBox, nextBox));

  const save = () => C.keep(state.child(), x.id, { answers });
  const say = (t) => speak(plain(t), lang);

  function pics(st) {
    if (!st.picture) return null;
    const n = st.picture_count || 1;
    return h('div', { class: 'pics' + (n > 3 ? ' many' : '') }, Array.from({ length: n }, () => h('img', { src: hub.url(st.picture), alt: '' })));
  }
  const promptRow = (t) => h('div', { class: 'listen-row' }, speakerBtn(() => say(t)), h('p', { class: 'prompt grow' }, rich(t)));
  const word = (st) => (st.english ? h('span', { class: 'english', dir: 'ltr', lang: 'en' }, st.english)
    : st.zh ? h('span', { class: 'zh', lang: 'zh-Hans', dir: 'ltr' }, st.zh) : null);

  function question(st) {
    if (st.kind === 'choice') {
      const optBody = (o) => (o && typeof o === 'object' && ('picture' in o || 'text' in o)
        ? [o.picture ? h('img', { src: hub.url(o.picture), alt: '' }) : null, o.text ? h('span', { class: 'naskh' }, pick(o.text)) : null]
        : rich(o));
      const opts = st.options.map((o, n) => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(answers[i] === n),
        onClick: () => {
          answers[i] = n;
          save();
          opts.forEach((b, m) => b.setAttribute('aria-pressed', String(m === n)));
        } }, optBody(o)));
      return [pics(st), word(st), promptRow(st.prompt), h('div', { class: 'options' + (opts.length === 3 ? ' three' : '') }, opts)];
    }
    const inp = h('input', { autocomplete: 'off', dir: 'ltr', inputmode: 'text', maxlength: 40, 'aria-label': s('your_answer'),
      placeholder: s('your_answer'), value: answers[i] ?? '',
      onInput: (e) => { const v = e.target.value.trim().slice(0, 40); answers[i] = v || null; save(); } });
    return [pics(st), promptRow(st.prompt), h('form', { class: 'answer-in', onSubmit: (e) => { e.preventDefault(); next.click(); } }, inp)];
  }

  function tick() {
    const ms = deadline(state.child() ? C.recordOf(state.child(), x.id) || rec : rec, x) - Date.now();
    if (ms <= 0) { left.textContent = s('contest_left', { m: 0 }); send(); return; }
    left.textContent = s('contest_left', { m: Math.ceil(ms / 60e3) });
  }

  function go(n) {
    if (n < 0 || n >= qs.length) return;
    i = n;
    kicker.textContent = s('contest_q', { n: i + 1, b: qs.length });
    fill(body, question(qs[i]));
    prevBox.classList.toggle('hidden', i === 0);
    fill(next, i === qs.length - 1 ? [icon('send', 22), s('contest_send')] : [s('next'), icon('next')]);
  }

  async function ask() {
    if (await confirmSheet(s('contest_send_q'), s('contest_send'), s('cancel'), { safe: true })) send();
  }

  async function send() {
    if (sending) return;
    sending = true;
    clearInterval(timer);
    const cur = state.child();
    const r = C.recordOf(cur, x.id) || rec;
    try {
      const out = await hub.contestSend(x.id, { answers, started: minute(r.joined) }, cur.token);
      C.keep(cur, x.id, { answers, right: out.right, n: out.n, percent: out.percent, at: Date.now() });
    } catch (e) {
      if (e.code === 'contest_sent') { await C.refresh(cur, true); markFromList(x); }
      else if (e.status === 410) toast(s('contest_closed'));
      else { toast(s(e.status === 0 ? 'contest_offline' : 'cert_failed')); sending = false; timer = setInterval(tick, TICK_MS); return; }
    }
    location.replace(`#/contest/${encodeURIComponent(x.id)}`);
  }

  go(i);
  tick();
  if (!sending) timer = setInterval(tick, TICK_MS);
  return { el: root, tab: 'lessons', cleanup: () => clearInterval(timer) };
}

// --- the answers, after the close ---

function answersScreen(x) {
  const el = h('div', { class: 'screen contest-answers', 'data-speaks': '' });
  const card = `#/contest/${encodeURIComponent(x.id)}`;
  const body = h('div', { class: 'stack pad' }, h('p', { class: 'empty' }, s('loading')));
  fill(el, topbar({ back: card, title: s('contest_answers'), sub: C.title(x), child: true }), body);
  (async () => {
    const c = state.child();
    const rec = C.recordOf(c, x.id);
    const k = C.kept(x.id);
    if (!rec || !k || !Array.isArray(k.questions) || Date.now() < C.ms(x.closes_at)) { location.replace(card); return; }
    let key = Array.isArray(k.key) ? k.key : null;
    if (!key) {
      try {
        key = (await hub.contestKey(x.id, c.token)).key;
        state.cache('contest.' + x.id, { ...k, key });
      } catch (e) {
        fill(body, line(e.status === 0 ? s('contest_offline') : s('cert_failed')));
        return;
      }
    }
    fill(body, k.questions.map((q, n) => {
      const a = (rec.answers || [])[n];
      const kk = key[n] || {};
      const ok = a !== null && a !== undefined && rightFor(q, a, kk);
      const right = shown(q, kk.answer);
      const mine = shown(q, a);
      const said1 = [plain(q.prompt), s('contest_yours', { a: mine }), s('contest_key', { a: right })].join('. ');
      return h('section', { class: 'card lined pad-card stack contest-review ' + (ok ? 'right' : 'wrong') },
        h('div', { class: 'row top' }, h('div', { class: 'grow' }, h('div', { class: 'kicker' }, s('contest_q', { n: n + 1, b: k.questions.length })),
          h('p', { class: 'prompt' }, rich(q.prompt))), speakerBtn(() => speak(said1, getLang()), { size: 'sm' })),
        h('p', {}, icon(ok ? 'check' : 'x', 20, 3), ' ', s('contest_yours', { a: mine }),
          ok && q.kind === 'number' && notSimplest(String(a)) ? h('small', { class: 'muted' }, ' · ', s('simplify')) : null),
        ok ? null : h('p', { class: 'contest-key' }, s('contest_key', { a: right })),
        kk.why ? h('div', { class: 'why' }, rich(kk.why)) : null);
    }));
  })();
  return { el, tab: 'lessons' };
}
