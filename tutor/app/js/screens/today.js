// "Just for today" (WEBSITE.md 3.10, W8): a learner on a borrowed phone. She chose it on "Is this you?" (move.js);
// state.js then keeps her in memory only, and every screen carries the bar "Just for today · Done" (main.js).
// #/today is Done: her questions and events go if a server is in reach (a question still waiting goes back to her
// own phones to send), her bag is pushed to the relay in reach, and the app opens again, which forgets her: the phone
// shows what it kept before. With no relay in reach she is told that today's work is not in her bag, and chooses
// "Try again" or "Done anyway".

import * as bagsync from '../bagsync.js';
import * as events from '../events.js';
import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as outbox from '../outbox.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn } from '../ui.js';

const line = (text, cls = 'grow') => h('div', { class: 'row' }, h('p', { class: cls, dir: 'auto' }, text),
  speakerBtn(() => speak(text, getLang()), { size: 'sm' }));

// the bar on every screen while she is here just for today
export function bar() {
  return h('div', { class: 'today-bar row noprint', role: 'status' },
    h('span', { class: 'grow' }, icon('clock', 18), ' ', s('today_bar')),
    h('a', { class: 'btn small', href: '#/today' }, icon('check', 18), s('today_done')));
}

// the app opened again: the borrowed phone as it was
function leave() {
  location.replace(location.pathname + location.search + '#/');
  location.reload();
}

// her work on its way: what waits is sent, and her bag pushed; 'saved' when the relay in reach has it
async function push(id) {
  if (!hub.online()) await hub.connect();
  if (!hub.online()) return null;
  await outbox.flush();
  await events.flush().catch(() => {});
  const l = state.byId(id);
  for (const a of (l && l.asks) || []) {
    if (a.queued && state.mine(a)) state.updateAskOf(id, a.k, { dev: null });     // her own phones send it, once
  }
  return hub.relays() ? bagsync.syncLearner(id, { force: true }) : null;
}

export default function today() {
  const root = h('div', { class: 'screen today' });
  const c = state.child();
  if (!state.justToday() || !c) { location.replace('#/home'); return { el: root, tab: null }; }
  async function go() {
    fill(root, h('div', { class: 'stack pad' }, line(s('today_saving'), 'grow lead')));
    const st = await push(c.id);
    if (st === 'saved') {
      const text = s('today_saved');
      fill(root, h('div', { class: 'stack pad' }, line(text, 'grow lead')));
      speak(text, getLang());
      setTimeout(leave, 2500);
      return;
    }
    const text = s('today_not_saved');
    fill(root, h('div', { class: 'stack pad' }, line(text, 'grow lead'),
      said(h('button', { type: 'button', class: 'btn primary big', onClick: go }, icon('refresh', 24), s('try_again'))),
      said(h('button', { type: 'button', class: 'btn danger-outline', onClick: leave }, s('today_anyway'))),
      said(h('a', { class: 'btn', href: '#/home' }, s('cancel')))));
    speak(text, getLang());
  }
  go();
  return { el: root, tab: null };
}
