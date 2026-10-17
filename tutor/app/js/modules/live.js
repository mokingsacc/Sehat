// Live audio classes (the `live` module, P30a; DESIGN-C6-SPECS.md C6.2). She listens to her teacher and raises her
// hand with one of three reasons. This screen never asks for the phone's microphone and records nothing (a test
// reads this file for the names that would); only an adult given the floor speaks, through floor.js (P30b).
// - Entry: the timetable's Now card in a live block ("Live class: Maths · Join"), or, outside a block, Home's
//   secondary card "Live class: Maths" with Join (priority 25). Early years never see it.
// - The screen #/live/<id>: the title and "Listening to your teacher", one <audio> playing the teacher's track as the
//   relay sends it, a line drawing that pulses while the sound flows ("Your teacher is coming" while it is off), the
//   board (a lesson step the teacher shows, read-only), "Raise my hand" with three voiced reasons, then "Your hand is
//   up · Lower my hand", and "Leave the class". When the class ends: "The class is over" and Home.
// - The class's state is polled every 5 seconds (`v` unchanged: 204); the sound is pulled through the browser's
//   RTCPeerConnection from Cloudflare's relay while the teacher's audio is on (two learners or more, C6.A7), and
//   dropped when it goes off. A dropped connection joins again with a fresh ticket, silently, five times at most.
// - Kept on the phone: only `liveSeen`, the class she saw end, so a stale hello never offers it again. The data line
//   ("A class uses about 10 MB...") shows until her first class has ended.
// - The floor (P30b, C6.4): when the state says her teacher gave her the floor, an adult in the web app over HTTPS
//   gets floor.js (loaded only then: the one file that opens a microphone) with Speak and Not now; any other phone
//   gives the floor straight back, so the APK never shows Speak. A child is never given it (the server refuses).
// - Inside a timetable's live block the phone asks /api/m/live every 20 seconds (liveclass.js), so Join appears on
//   the Now card the moment the teacher starts; outside one, hello's `live` (read every minute) is the only source.

import * as day from '../day.js';
import { getLang, pick, s } from '../i18n.js';
import * as hub from '../hub.js';
import * as liveclass from '../liveclass.js';
import { hasVoice, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, rich, said, speakerBtn, topbar } from '../ui.js';

const POLL_MS = 5000;
const BLOCK_POLL_MS = 20000;
const DROP_MS = 10000;               // a connection "disconnected" this long is joined again
const TRIES = 5;
const REASONS = [1, 2, 3];
const EVENT = 'qalam-day';           // Home redraws on it (the timetable's own event)

const { titleFor } = liveclass;

// she is inside a live block of her school day now (the Now card then carries Join)
export function inLiveBlock(c, now = new Date()) {
  if (!day.dayOn(c)) return false;
  const d = day.dayOf(day.cached(c), now, c.shift || 0);
  const w = day.where(d, day.minuteOf(now));
  return !!(w.block && w.block.kind === 'live');
}

// Home's card outside a live block: the class's title and Join; the data line until her first class has ended
function offerCard(ctx) {
  const live = liveclass.current(ctx.child);
  const title = titleFor(live.subject);
  return h('section', { class: 'card lined pad-card stack live-offer' },
    h('div', { class: 'row' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }, icon('live', 28, 2.2)),
      h('h2', { class: 'grow' }, title), speakerBtn(() => speak(title, getLang()), { size: 'sm' })),
    said(h('a', { class: 'btn primary big', href: '#/live/' + live.id }, icon('live', 24, 2.2), s('live_join'))),
    ctx.child.liveSeen ? null : h('small', { class: 'muted' }, s('live_data')));
}

// inside a live block: ask the server every 20 seconds whether the class has started
function watchBlock() {
  let last = '';
  setInterval(async () => {
    const c = state.child();
    if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !c || !c.token) return;
    if (!liveclass.can(c) || !hub.online() || !inLiveBlock(c)) return;
    try {
      const j = await hub.liveNow(c.token);
      liveclass.heard(j);
      const key = j && j.id ? j.id : '';
      if (key !== last) { last = key; window.dispatchEvent(new Event(EVENT)); }
    } catch { /* the next round asks again */ }
  }, BLOCK_POLL_MS);
}

export function register(shell) {
  shell.offer('home.action', { id: 'live-now', role: 'secondary', priority: 25,
    when: (ctx) => !!liveclass.current(ctx.child) && !inLiveBlock(ctx.child), render: offerCard });
  watchBlock();
}

// --- the board: a lesson step drawn read-only, from the lesson the phone has or fetches ---

async function boardStep(board) {
  const L = await hub.lesson(board.lesson);
  const st = L && Array.isArray(L.steps) ? L.steps[board.step] : null;
  if (!st) return null;
  const pics = st.picture ? h('div', { class: 'pics' }, Array.from({ length: st.picture_count || 1 },
    () => h('img', { src: hub.url(st.picture), alt: '' }))) : null;
  const text = st.prompt || st.text || null;
  const opts = st.kind === 'choice' && Array.isArray(st.options)
    ? h('div', { class: 'options' + (st.options.length === 3 ? ' three' : '') }, st.options.map((o) => h('div', { class: 'opt' },
      o && typeof o === 'object' && ('picture' in o || 'text' in o)
        ? [o.picture ? h('img', { src: hub.url(o.picture), alt: '' }) : null, o.text ? h('span', { class: 'naskh' }, pick(o.text)) : null]
        : rich(o)))) : null;
  return [
    st.kind === 'letter' ? h('div', { class: 'letter' }, st.letter) : null,
    pics,
    text ? h('div', { class: 'listen-row' }, speakerBtn(() => speak(plain(text), getLang()), { size: 'sm' }),
      h('p', { class: 'read grow' }, rich(text))) : null,
    opts,
  ];
}

// --- the screen ---

export default async function liveScreen(args) {
  const [id] = args;
  const c = state.child();
  const known = liveclass.current(c);
  const subject = known && known.id === id ? known.subject : null;
  const root = h('div', { class: 'screen live' });
  if (!liveclass.can(c) || !liveclass.ID.test(id || '') || !c.token) {
    fill(root, topbar({ back: '#/home', title: s('live_title'), child: true }), h('div', { class: 'empty' }, s('live_over')));
    return { el: root, tab: 'lessons' };
  }
  const audio = h('audio', { autoplay: '', class: 'hidden' });
  const sound = h('div', { class: 'live-sound', 'aria-hidden': 'true' }, icon('live', 120, 1.4));
  const status = h('p', { class: 'lead live-status', role: 'status', 'aria-live': 'polite' }, s('live_coming'));
  const board = h('section', { class: 'card lined pad-card stack live-board hidden' });
  const hand = h('div', { class: 'stack live-hand' });
  const floorBox = h('div', { class: 'live-floor-box' });
  const leave = said(h('button', { type: 'button', class: 'btn outline', onClick: () => { location.hash = '#/home'; } },
    s('live_leave')));
  const data = c.liveSeen ? null : h('small', { class: 'muted live-data' }, s('live_data'));
  const body = h('div', { class: 'pad stack' }, sound, status, board, floorBox, hand, data, leave);
  fill(root, topbar({ back: '#/home', title: titleFor(subject), lead: s('live_listening'), child: true }), body, audio);

  let pc = null;
  let v = 0;
  let pub = -1;
  let tries = 0;
  let timer = null;
  let dropTimer = null;
  let over = false;
  let gone = false;
  let boardKey = '';
  let myHand = null;
  let picking = false;
  let mine = false;                    // the floor is hers (the state's floor_mine)
  let floorP = null;                   // floor.js's panel while it shows

  // while the sound flows the drawing pulses and the header's lead says it; while it is off, "Your teacher is coming"
  const flowing = (on) => {
    sound.classList.toggle('on', on);
    status.textContent = on ? '' : s('live_coming');
    status.classList.toggle('hidden', on);
  };

  function drop() {
    clearTimeout(dropTimer);
    dropTimer = null;
    if (pc) { try { pc.close(); } catch { /* closed already */ } }
    pc = null;
    audio.srcObject = null;
    flowing(false);
  }

  // join again with a fresh ticket and pull the teacher's track through the relay
  async function pull() {
    drop();
    const j = await hub.liveJoin(id, c.token);
    if (gone) return;
    const conn = new RTCPeerConnection({ iceServers: Array.isArray(j.ice) ? j.ice : [] });
    pc = conn;
    conn.ontrack = (e) => {
      audio.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
      flowing(true);
    };
    conn.oniceconnectionstatechange = () => {
      const st = conn.iceConnectionState;
      if (conn !== pc) return;
      if (st === 'connected' || st === 'completed') { tries = 0; clearTimeout(dropTimer); dropTimer = null; }
      if (st === 'failed') again();
      if (st === 'disconnected' && !dropTimer) dropTimer = setTimeout(again, DROP_MS);
    };
    const r = await hub.liveSdp(id, { ticket: j.ticket }, c.token);
    if (gone || conn !== pc) return;
    if (r.answer) await conn.setRemoteDescription({ type: 'answer', sdp: r.answer });
    if (r.renegotiate && r.sdp) {
      await conn.setRemoteDescription({ type: 'offer', sdp: r.sdp });
      await conn.setLocalDescription(await conn.createAnswer());
      await hub.liveAnswer(id, conn.localDescription.sdp, c.token);
    }
  }

  function again() {
    clearTimeout(dropTimer);
    dropTimer = null;
    if (gone || over) return;
    if (++tries > TRIES) { drop(); lost(); return; }
    status.textContent = s('live_lost');
    pull().catch(() => setTimeout(again, 2000));
  }

  // five tries spent: the error screen's shape (C5.4), "Try again" joins once more
  function lost() {
    fill(body, h('p', { class: 'lead' }, s('error_title')),
      said(h('button', { type: 'button', class: 'btn primary', onClick: () => { tries = 0; fill(body, sound, status, board, floorBox, hand, data, leave); again(); } },
        s('try_again'))),
      leave);
  }

  function drawHand() {
    if (over) { fill(hand); return; }
    if (myHand) {
      fill(hand, h('p', { class: 'live-up' }, icon('hand', 28, 2.2), h('b', {}, s('live_hand_up'))),
        said(h('button', { type: 'button', class: 'btn', onClick: () => send(null) }, s('live_lower'))));
      return;
    }
    if (picking) {
      fill(hand, h('div', { class: 'stack live-reasons', role: 'group', 'aria-label': s('live_hand') },
        REASONS.map((r) => said(h('button', { type: 'button', class: 'btn outline', onClick: () => send(r) }, s('live_r' + r))))));
      return;
    }
    fill(hand, said(h('button', { type: 'button', class: 'btn primary big live-raise', onClick: () => { picking = true; drawHand(); } },
      icon('hand', 30, 2.2), s('live_hand'))));
  }

  async function send(reason) {
    try {
      await hub.liveHand(id, reason, c.token);
      myHand = reason;
      picking = false;
      drawHand();
    } catch { /* the button stays; she can tap again */ }
  }

  async function drawBoard(b) {
    const key = b ? `${b.lesson}:${b.step}` : '';
    if (key === boardKey) return;
    boardKey = key;
    if (!b) { board.classList.add('hidden'); fill(board); return; }
    const step = await boardStep(b);
    if (boardKey !== key) return;
    if (!step) { board.classList.add('hidden'); return; }
    fill(board, h('div', { class: 'kicker' }, s('live_board')), step);
    board.classList.remove('hidden');
  }

  // the floor given to her, or taken back: only an adult outside the APK in a secure page loads floor.js
  async function floorChanged(f) {
    if (floorP) { floorP.stop(); floorP = null; }
    fill(floorBox);
    if (!mine || !f) return;
    const giveBack = () => hub.liveSpeak(id, { done: true }, c.token).catch(() => {});
    if (c.band !== 'ad' || globalThis.QalamAndroid || globalThis.isSecureContext !== true) { giveBack(); return; }
    const floor = await import('../floor.js');
    if (!mine || gone || floorP) return;
    if (!floor.canSpeak(c)) { giveBack(); return; }
    floorP = floor.floorPanel({ id, c, until: f.until, ended: () => { floorP = null; fill(floorBox); } });
    fill(floorBox, floorP.el);
  }

  function end() {
    over = true;
    gone = true;
    clearInterval(timer);
    if (floorP) { floorP.stop(); floorP = null; }
    drop();
    state.updateChild(c.id, { liveSeen: id });
    fill(body, h('div', { class: 'live-sound', 'aria-hidden': 'true' }, icon('live', 120, 1.4)),
      h('p', { class: 'lead' }, s('live_over')),
      said(h('a', { class: 'btn primary', href: '#/home' }, s('go_home'))));
    if (hasVoice(getLang())) speak(s('live_over'), getLang());
  }

  async function apply(st) {
    if (!st || typeof st.v !== 'number') return;           // 204: nothing changed
    v = st.v;
    if (st.over) { end(); return; }
    if ((st.hand ?? null) !== myHand && !picking) { myHand = st.hand ?? null; drawHand(); }
    drawBoard(st.board);
    if (!!st.floor_mine !== mine) { mine = !!st.floor_mine; floorChanged(st.floor); }
    const on = st.audio === 'on';
    if (on && (!pc || st.pub !== pub)) {
      pub = st.pub;
      tries = 0;
      pull().catch(() => again());
    } else if (!on && pc) {
      drop();
    }
  }

  async function poll() {
    if (gone || document.visibilityState !== 'visible') return;
    try { await apply(await hub.liveState(id, v, c.token)); } catch (e) {
      if (e.status === 410 || e.status === 404) end();
    }
  }

  drawHand();
  try {
    const j = await hub.liveJoin(id, c.token);
    await apply(j.state);
  } catch (e) {
    if (e.status === 410 || e.status === 404) end();
  }
  if (!over) timer = setInterval(poll, POLL_MS);
  return { el: root, tab: 'lessons', cleanup: () => {
    const wasOver = over;
    gone = true;
    clearInterval(timer);
    if (floorP) { floorP.stop(); floorP = null; }
    drop();
    if (!wasOver) hub.liveLeave(id, c.token).catch(() => {});
  } };
}
