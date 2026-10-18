// The floor (P30b, DESIGN-C6-SPECS.md C6.4): an adult in an adult-only class, given the floor by her teacher, speaks
// to her teacher and the class for at most 90 seconds. This is the one file of the learner's app that opens a
// microphone, and modules/live.js loads it only for an adult, outside the APK, in a secure page (the web app over
// HTTPS; never the hub's plain http). The server refuses anyone else whatever the phone does (mods/live.py).
// - Offered when the class's state says the floor is hers: "You have the floor", the explainer the first time
//   ("Your voice goes live to your teacher and the class. Nothing is recorded."), "Speak" and "Not now".
// - Speak opens the microphone, publishes it to the relay as the track `voice` and shows "You have the floor · 1:30"
//   counting down with "Done". The track is stopped (track.stop()) the moment the floor ends: Done, the 90 seconds,
//   the teacher taking it back, the class ending or her leaving the screen.
// - Nothing is recorded or kept: no recorder, no event; the phone keeps only `floorSeen` (she read the
//   explainer once).

import * as hub from './hub.js';
import { getLang, s } from './i18n.js';
import { speak } from './speech.js';
import * as state from './state.js';
import { fill, h, icon, said, speakerBtn } from './ui.js';

// whether this phone may offer Speak at all: an adult, not the APK, a secure page with a microphone and WebRTC
export function canSpeak(c) {
  if (!c || c.band !== 'ad' || globalThis.QalamAndroid || globalThis.isSecureContext !== true) return false;
  const md = globalThis.navigator && navigator.mediaDevices;
  return !!(md && typeof md.getUserMedia === 'function' && typeof globalThis.RTCPeerConnection === 'function');
}

// "1:30" in her digits
export const clock = (ms) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// the floor's panel: {el, stop}. `until` is the server's end of the floor (ISO); `ended` runs once the floor is over
// on this phone (Done, the time, Not now)
export function floorPanel({ id, c, until, ended }) {
  const el = h('section', { class: 'card lined pad-card stack live-floor', role: 'region', 'aria-label': s('live_floor') });
  let stream = null;
  let track = null;
  let pc = null;
  let timer = null;
  let done = false;
  const end = Date.parse(until);

  // the microphone off and the connection closed: nothing of her voice leaves the phone from here
  function stop() {
    clearInterval(timer);
    timer = null;
    if (track) track.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (pc) { try { pc.close(); } catch { /* closed already */ } }
    track = null;
    stream = null;
    pc = null;
  }

  // she gives the floor back (Done or Not now), or it ended on its own
  function finish(tell) {
    if (done) return;
    done = true;
    stop();
    fill(el);
    if (tell) hub.liveSpeak(id, { done: true }, c.token).catch(() => {});
    if (ended) ended();
  }

  function offer() {
    const first = !c.floorSeen;
    const words = first ? `${s('live_floor')}. ${s('live_explain')}` : s('live_floor');
    fill(el, h('div', { class: 'row' }, h('h2', { class: 'live-floor-title grow' }, icon('live', 26, 2.2), s('live_floor')),
      speakerBtn(() => speak(words, getLang()), { size: 'sm' })),
      first ? h('p', { class: 'live-explain' }, s('live_explain')) : null,
      h('div', { class: 'row wrap' },
        said(h('button', { type: 'button', class: 'btn primary live-speak', onClick: go }, s('live_speak'))),
        said(h('button', { type: 'button', class: 'btn outline', onClick: () => finish(true) }, s('not_now')))));
  }

  function speaking() {
    const left = h('b', { role: 'timer', 'data-silent': '' });
    const tick = () => {
      const ms = end - Date.now();
      left.textContent = s('live_floor_left', { t: clock(ms) });
      if (ms <= 0) finish(false);
    };
    fill(el, h('h2', { class: 'live-floor-title live-floor-left' }, icon('live', 26, 2.2), left),
      said(h('button', { type: 'button', class: 'btn primary', onClick: () => finish(true) }, s('live_done'))));
    tick();
    timer = setInterval(tick, 1000);
  }

  async function go() {
    if (done) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (done) { stop(); return; }
      track = stream.getAudioTracks()[0];
      const j = await hub.liveJoin(id, c.token);
      pc = new RTCPeerConnection({ iceServers: Array.isArray(j.ice) ? j.ice : [] });
      const tr = pc.addTransceiver(track, { direction: 'sendonly' });
      await pc.setLocalDescription(await pc.createOffer());
      const r = await hub.liveSpeak(id, { ticket: j.ticket, sdp: pc.localDescription.sdp, mid: tr.mid || '0' }, c.token);
      if (done) { stop(); return; }
      await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
      if (!c.floorSeen) { state.updateChild(c.id, { floorSeen: true }); c = state.byId(c.id) || c; }
      speaking();
    } catch {
      finish(true);                     // no microphone, or the floor fell meanwhile: give it back
    }
  }

  offer();
  return { el, stop: () => finish(false) };
}
