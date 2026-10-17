// Settings (DESIGN.md 5), behind "Who is learning", on this phone only and per learner, each row with a speaker:
// Bigger text, Theme (Phone, Light, Dark), Lock (set, change, remove; never for early years), Nickname ("a nickname,
// not your name"; never sent), Consent (what was agreed, and "Stop sharing", behind her PIN), the modules'
// `settings.row` offers, "Update Qalam" in the Android app when a newer one is out (P23), Credits, About (with "Get
// the Android app" in an Android phone's browser only), and "Remove this learner from this phone" (behind her PIN, with a spoken
// confirmation), and Voice (C5.6): the voice pack of her language on this phone: get it, share it, open one shared
// to her. #/settings/<action> is that confirmation, after #/lock/check/<action> (or straight away when she
// has no lock).

import * as account from '../account.js';
import * as android from '../android.js';
import * as bands from '../bands.js';
import { fa, getLang, s, setTone } from '../i18n.js';
import * as hub from '../hub.js';
import * as lock from '../lock.js';
import * as modules from '../modules.js';
import { hasVoice, speak } from '../speech.js';
import * as voicepack from '../voicepack.js';
import * as state from '../state.js';
import { fill, h, icon, said, speakerBtn, toast, topbar } from '../ui.js';
import { checked } from './lock.js';

const say = (t) => () => speak(t, getLang());

function section(title, note, ...body) {
  return h('section', { class: 'card lined set-row' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', {}, title), note ? h('small', {}, note) : null),
      speakerBtn(say([title, note].filter(Boolean).join('. ')), { size: 'sm' })),
    body);
}

// #/settings/<action>: the spoken confirmation for removing her or stopping sharing; removing the lock needs only
// her PIN
function confirm(c, action) {
  if (c.lock && lock.allowed(c.band) && !checked(action)) { location.replace('#/lock/check/' + action); return null; }
  if (action === 'unlock') {
    state.updateChild(c.id, { lock: null });
    location.replace('#/settings');
    return null;
  }
  const question = s(action === 'remove' ? 'remove_sure' : 'stop_sure');
  const yes = () => {
    if (action === 'remove') {
      account.remove(c.id);
      toast(s('removed'));
      location.hash = state.children().length ? '#/who' : '#/welcome';
    } else {
      account.stopSharing(c.id);
      toast(s('stopped'));
      location.hash = '#/settings';
    }
  };
  if (hasVoice(getLang())) setTimeout(() => speak(question, getLang()), 300);
  return { el: h('div', { class: 'screen' },
    topbar({ back: '#/settings', title: s(action === 'remove' ? 'remove_learner' : 'stop_sharing') }),
    h('div', { class: 'stack pad' },
      h('div', { class: 'row' }, h('p', { class: 'grow lead' }, question), speakerBtn(say(question), { size: 'sm' })),
      said(h('button', { type: 'button', class: 'btn danger big', onClick: yes },
        icon(action === 'remove' ? 'trash' : 'stop', 24), s(action === 'remove' ? 'remove_yes' : 'stop_sharing'))),
      said(h('a', { class: 'btn', href: '#/settings' }, s('cancel'))))), tab: null };
}

// Voice: the pack of her language on this phone (voicepack.js); the Android app carries no audio
function voiceRow(lang) {
  const note = h('small', {}, s('voice_none'));
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const share = said(h('button', { type: 'button', class: 'btn', onClick: () => voicepack.share(lang) }, icon('download', 22), s('voice_share')));
  share.classList.add('hidden');
  const pick = h('input', { type: 'file', class: 'hidden', accept: '.qvoice,application/octet-stream',
    onChange: async (e) => {
      try { const head = await voicepack.openFile(e.target.files[0]); status.textContent = s('voice_done'); if (head.lang === lang) show(head); }
      catch { status.textContent = s('voice_bad_file'); }
      e.target.value = '';
    } });
  const get = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
    get.disabled = true;
    status.textContent = s('voice_getting');
    try { show(await voicepack.download(lang, (p) => { status.textContent = `${s('voice_getting')} ${fa(Math.round(p * 100))}%`; })); status.textContent = s('voice_done'); }
    catch { status.textContent = s('voice_failed'); }
    get.disabled = false;
  } }, icon('download', 22), s('voice_download'));
  function show(head) {
    note.textContent = s('voice_kept', { mb: fa((head.bytes / 1e6).toFixed(1)) });
    share.classList.remove('hidden');
  }
  voicepack.kept(lang).then((head) => { if (head) show(head); });
  const box = h('section', { class: 'card lined set-row' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', {}, s('voice_title')), note),
      speakerBtn(() => speak([s('voice_title'), note.textContent].join('. '), getLang()), { size: 'sm' })),
    h('div', { class: 'row wrap' }, said(get), share,
      said(h('button', { type: 'button', class: 'btn', onClick: () => pick.click() }, icon('file', 22), s('voice_open'))), pick),
    status);
  return box;
}

export default function settings([action]) {
  const c = state.child();
  if (action) {
    const out = confirm(c, action);
    if (out) return out;
    return { el: h('div'), tab: null };
  }
  const root = h('div', { class: 'screen settings' });
  const relook = () => bands.apply(document.documentElement, state.child(), { setTone });

  function draw() {
    const l = state.child();
    const big = l.text === 'large';
    const consentNote = l.consent
      ? s('consent_given', { d: '\u2066' + fa(String(l.consent.at || '').slice(0, 10)) + '\u2069' })   // the date kept left to right
      : s('consent_none');
    const nick = h('input', { class: 'nick', maxlength: 20, autocomplete: 'off', value: l.nickname,
      'aria-label': s('nickname'),
      onChange: (e) => { state.updateChild(l.id, { nickname: e.target.value.trim() }); } });
    const offers = modules.pick('settings.row', modules.context(l, null)).map((o) => {
      try { return o.render(modules.context(l, null)); } catch { return null; }
    });
    const version = hub.info() && hub.info().version;
    // the Android app: /get opens in the phone's browser; only while the server is in reach (its address is known)
    const getApp = hub.online() ? hub.url('/get/') : null;
    const apk = android.apkState(hub.info() && hub.info().apk);
    fill(root,
      topbar({ back: '#/who', title: s('settings') }),
      h('div', { class: 'stack pad' },
        section(s('bigger_text'), null,
          h('button', { type: 'button', class: 'switch' + (big ? ' on' : ''), role: 'switch', 'aria-checked': String(big),
            'aria-label': s('bigger_text'), onClick: () => { state.updateChild(l.id, { text: big ? 'normal' : 'large' }); relook(); draw(); } },
          h('span', { class: 'knob' }))),
        section(s('theme'), null,
          h('div', { class: 'chips', role: 'group', 'aria-label': s('theme') }, bands.THEMES.map((t) =>
            h('button', { type: 'button', class: 'chip' + (l.theme === t ? ' on' : ''), 'aria-pressed': String(l.theme === t),
              onClick: () => { state.updateChild(l.id, { theme: t }); relook(); draw(); } }, s('theme_' + t))))),
        lock.allowed(l.band) ? section(s('lock'), s(l.lock ? 'lock_on' : 'lock_none'),
          h('div', { class: 'row wrap' },
            said(h('a', { class: 'btn', href: '#/lock/set/settings' }, icon('lock', 22), s(l.lock ? 'lock_change' : 'lock_set'))),
            l.lock ? said(h('a', { class: 'btn', href: '#/settings/unlock' }, s('lock_remove'))) : null)) : null,
        section(s('nickname'), s('nickname_hint'), nick),
        section(s('sharing'), consentNote,
          l.consent ? said(h('a', { class: 'btn', href: '#/settings/stop' }, icon('stop', 22), s('stop_sharing')))
            : said(h('a', { class: 'btn', href: '#/consent/settings' }, icon('file', 22), s('give_consent')))),
        voiceRow(l.lang),
        offers,
        apk === 'update' && getApp ? section(s('update_app'), s('update_note'),
          said(h('a', { class: 'btn primary', href: getApp }, icon('download', 22), s('download')))) : null,
        said(h('a', { class: 'btn', href: '#/credits' }, icon('file', 22), s('credits'))),
        section(s('about'), s('about_text'), version ? h('p', { class: 'muted small', dir: 'ltr' }, s('version', { v: version })) : null,
          android.appVersion() ? h('p', { class: 'muted small', dir: 'ltr' }, s('app_version', { v: android.appVersion() })) : null,
          android.androidBrowser() && getApp ? said(h('a', { class: 'btn', href: getApp }, icon('download', 22), s('get_app'))) : null),
        said(h('a', { class: 'btn danger-outline', href: '#/settings/remove' }, icon('trash', 22), s('remove_learner')))));
  }
  draw();
  return { el: root, tab: null };
}
