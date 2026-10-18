// What she sent that waits for the server (P11; DESIGN-C2C3-SPECS.md item 5): questions and teacher requests made
// offline, the class join and the consent record. These are counted and shown ("Waiting to send", the net chip's
// "· 2 waiting"); events never are. Everything waits in qalam.v2, so it survives a restart:
// - questions: up to 7 days, then "Not sent" with "Send again"; a refusal (4xx) shows "Couldn't send" and "Try again";
// - the join and the consent: until sent (account.js);
// - events: their own queue (events.js), up to 500 or 14 days, never shown;
// - goals from "I want to learn this" that found no lesson offline (P22): five at most, 7 days, sent without her
//   token for the wishlist, and only with her consent; not counted, since nothing comes back to wait for.
// flush() sends what waits whenever the server is in reach: the joins and consents first, since online a question
// needs her token.

import * as account from './account.js';
import { s } from './i18n.js';
import * as hub from './hub.js';
import * as state from './state.js';

export const QUESTION_DAYS = 7;
const DAY = 24 * 3600e3;

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => listeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

// what waits for the learner using the phone, as the keys of the words that name them
export function waiting(c = state.child()) {
  if (!c) return [];
  const out = [];
  if (account.needsJoin(c)) out.push('wait_join');
  else if (c.token && c.consent && !c.consent.sent) out.push('wait_consent');
  for (const a of c.asks) {
    if (a.queued && state.mine(a)) out.push('wait_question');     // one queued on her other phone waits there (W7)
    else if (a.teacherQueued) out.push('wait_teacher');
  }
  return out;
}

// a question waiting longer than 7 days is not sent any more: she sees "Not sent" and can send it again
export const stale = (a, now = Date.now()) => !!a.queued && now - (a.at || 0) > QUESTION_DAYS * DAY;

let sendingNow = false;
export const sending = () => sendingNow;

let running = null;
export function flush() {
  if (running) return running;
  if (!hub.online()) return Promise.resolve();
  running = (async () => {
    await null;                  // so `running` is set before the finally below can clear it
    try {
      const had = state.learners().some((l) => waiting(l).length);
      if (had) { sendingNow = true; changed(); }
      await account.sync();
      for (const l of state.learners()) await sendAsks(l.id);
      for (const l of state.learners()) await sendWishes(l.id);
    } finally {
      running = null;
      if (sendingNow) { sendingNow = false; }
      changed();
    }
  })();
  return running;
}

async function sendAsks(id) {
  for (const a of [...(state.byId(id) || {}).asks || []]) {
    const l = state.byId(id);
    if (!l || !hub.online()) return;
    if (!state.mine(a)) continue;                    // queued on her other phone (her bag, W5): sent from there only
    if (a.queued && stale(a)) { state.updateAskOf(id, a.k, { queued: false, notSent: true }); continue; }
    if (a.queued) {
      if (!l.consent || (hub.home() === 'online' && !l.token)) continue;      // her join goes first
      try {
        const r = await hub.ask({ text: a.q, lang: a.lang || l.lang, year: l.year, lesson: a.lesson || null }, l.token);
        state.updateAskOf(id, a.k, { queued: false, id: r.id, a: r.text, source: r.source, mc: r.maths_checked,
          waiting: r.waiting });
        sent(id);
      } catch (e) {
        if (e.status === 401 || e.status === 403 || e.status === 429 || !e.status || e.status >= 500) return;
        state.updateAskOf(id, a.k, { queued: false, failed: true });             // refused: "Couldn't send"
      }
    } else if (a.teacherQueued && a.id) {
      try {
        await hub.toTeacher(a.id, l.token);
        state.updateAskOf(id, a.k, { teacherQueued: false, sent: true });
      } catch (e) {
        if (!e.status || e.status >= 500 || e.status === 429) return;
        state.updateAskOf(id, a.k, { teacherQueued: false });
      }
    }
  }
}

// a goal no lesson matched while offline: kept for the wishlist until the server is in reach
export function queueWish(id, q, lang, now = Date.now()) {
  const l = state.byId(id);
  if (!l) return;
  state.updateChild(id, { wishes: [...(l.wishes || []), { q, lang, at: now }] });
  flush();
}

async function sendWishes(id, now = Date.now()) {
  for (;;) {
    const l = state.byId(id);
    const w = l && (l.wishes || [])[0];
    if (!w || !hub.online()) return;
    const rest = () => state.updateChild(id, { wishes: (state.byId(id).wishes || []).slice(1) });
    if (!l.consent || now - w.at > QUESTION_DAYS * DAY) { rest(); continue; }   // not agreed (any more), or too old
    try {
      await hub.plan({ goal: w.q, lang: w.lang, band: l.band }, l.token);   // her class's; the wish is kept without it
      rest();
    } catch (e) {
      if (!e.status || e.status >= 500 || e.status === 429) return;           // later
      rest();                                                                 // refused (the module off): dropped
    }
  }
}

// "Your question was sent", for the learner using the phone
const sentListeners = new Set();
export function onSent(fn) { sentListeners.add(fn); return () => sentListeners.delete(fn); }
function sent(id) {
  const c = state.child();
  if (c && c.id === id) sentListeners.forEach((f) => f(s('q_sent')));
}

// "Send again" and "Try again": back in the queue, as if asked now
export function again(id, k) {
  state.updateAskOf(id, k, { queued: true, notSent: false, failed: false, at: Date.now(), dev: state.device() });
  changed();
  return flush();
}

// a question to send when the server is in reach
export function queue(entry) {
  const e = state.addAsk({ ...entry, queued: true });
  changed();
  flush();
  return e;
}

// for tests
export function reset() { running = null; sendingNow = false; }
