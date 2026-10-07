// "Share Sehat": one sharing feature for the whole app (home card, Settings row, #/share screen). Plain ES module.
// Inside the Android app (window.FHBAndroid, android/app/src/main/java/org/sehat/app/MainActivity.java) it sends the
// installed app's own APK: "Nearby phones" opens Android's share sheet (Quick Share / Nearby Share, Bluetooth: Android
// lets an app send a file over Bluetooth only through that sheet), and the WhatsApp, Telegram, IMO and Messenger
// buttons hand the file straight to that app when it is on the phone (greyed out when it is not).
// In a browser (the website, iPhones) it shares the link with the Web Share API or copies it, and shows a QR code
// of the link (js/qr.js, made on the phone, works offline). Counts: "sendapp" for the file, "share" for the link,
// and which way was used as tool-share-<way> (js/stats.js; counts only, nothing personal).
import { qrSvg } from './qr.js';

export const SITE = 'https://mokingsacc.github.io/Sehat/';
export const APK_URL = 'https://github.com/mokingsacc/Sehat/releases/latest/download/sehat.apk';
// the messaging apps most used in Afghanistan; the first package found on the phone gets the file
// (the Android side only accepts these packages, and lists them under <queries> in AndroidManifest.xml)
export const APPS = [
  { id: 'whatsapp', label: 'appWhatsApp', color: '#1FA855', pkgs: ['com.whatsapp', 'com.whatsapp.w4b'] },
  { id: 'telegram', label: 'appTelegram', color: '#229ED9', pkgs: ['org.telegram.messenger', 'org.telegram.messenger.web', 'org.thunderdog.challegram'] },
  { id: 'imo', label: 'appImo', color: '#1C6FD1', pkgs: ['com.imo.android.imoim', 'com.imo.android.imoimbeta', 'com.imo.android.imoimlite'] },
  { id: 'messenger', label: 'appMessenger', color: '#7B4DFF', pkgs: ['com.facebook.orca', 'com.facebook.mlite'] },
];
// the Android app's bridge, when it can send the APK to one app; null in a browser
export function bridge() {
  const B = typeof window !== 'undefined' ? window.FHBAndroid : null;
  return B && typeof B.shareApp === 'function' ? B : null;
}
// which package of an app to send to: the first one installed, or null (unknown bridge = not offered)
export function installedPkg(B, app) {
  if (!B || typeof B.isInstalled !== 'function' || typeof B.shareAppTo !== 'function') return null;
  for (const p of app.pkgs) { try { if (B.isInstalled(p)) return p; } catch (e) { /* old bridge */ } }
  return null;
}
export const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
export const tgLink = (url, text) => 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);

// two phones passing a heart: the picture on the home card (no people)
const PHONES = '<svg viewBox="0 0 120 80" aria-hidden="true"><rect x="8" y="10" width="34" height="60" rx="7" fill="#22201D"/><rect x="12" y="16" width="26" height="46" rx="3" fill="#FBFAF7"/><rect x="78" y="10" width="34" height="60" rx="7" fill="#22201D"/><rect x="82" y="16" width="26" height="46" rx="3" fill="#FBFAF7"/><path d="M25 32c-3-5-10-3-9 2 1 4 9 9 9 9s8-5 9-9c1-5-6-7-9-2z" fill="#B6322D"/><path d="M95 32c-3-5-10-3-9 2 1 4 9 9 9 9s8-5 9-9c1-5-6-7-9-2z" fill="#B6322D"/><path d="M48 34q12-12 24 0" fill="none" stroke="#9A6F00" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"/><path d="M48 46q12 12 24 0" fill="none" stroke="#9A6F00" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"/><path d="M66 30l6 4-7 3" fill="none" stroke="#9A6F00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 3 6.6 3 11c0 2.2.9 4.1 2.4 5.5L4.5 21l4.4-2.1c1 .3 2 .4 3.1.4 5.5 0 9-3.6 9-8.1S17.5 3 12 3z" fill="currentColor"/></svg>';
const NEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="15" rx="2"/><path d="M12 15h.01"/><path d="M4 8a9 9 0 0 0 0 8M20 8a9 9 0 0 1 0 8M1.5 6a13 13 0 0 0 0 12M22.5 6a13 13 0 0 1 0 12"/></svg>';
const LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

export function initShare(ctx) {
  const { S, esc, T, L, num, ic, I, spk, track, listenBar, disclaimer, top, toast, platform, mbText } = ctx;
  const say = (id) => L(S.book.narration[id]);
  const sayRow = (id, cls = 'trow') => `<div class="${cls}" data-block="${esc(id)}"><div class="body">${esc(say(id))}</div>${spk(id)}</div>`;
  const url = () => String((S.book.config && S.book.config.appUrl) || SITE);
  const text = () => T('shareText') + ' ' + url();

  // the home card (config.home "share"; the older name "sendApp" shows the same card)
  function homeCard() {
    const B = bridge(), id = B ? 'ui.share-app' : 'ui.share-web';
    return `<div class="sharecard" data-block="${id}"><a href="#/share" class="grow"><span class="spic">${PHONES}</span><span class="tx"><span class="t">${esc(T('shareApp'))}</span><span class="s">${esc(T(B ? 'shareAppSub' : 'shareWebSub'))}</span></span></a>${spk(id)}</div>`;
  }
  const homeSay = () => (bridge() ? 'ui.share-app' : 'ui.share-web');
  // the row in Settings
  function settingsRow() {
    return `<a class="srow" href="#/share" data-block="${homeSay()}">${ic('people')}<div class="grow"><div class="t">${esc(T('shareApp'))}</div><div class="s">${esc(T(bridge() ? 'shareAppSub' : 'shareWebSub'))}</div></div>${spk(homeSay())}</a>`;
  }

  function installHelp(ids) {
    ids.push('ui.sh.i1', 'ui.sh.i2', 'ui.sh.i3', 'ui.sh.i4', 'ui.sh.iphone');
    let h = `<div class="group-h"><span class="t">${esc(T('installHelp'))}</span><span class="ln"></span></div>`;
    h += `<img class="toolpic" src="img/pics/share-install.svg" alt="">`;
    h += ['ui.sh.i1', 'ui.sh.i2', 'ui.sh.i3', 'ui.sh.i4'].map((id, i) => `<div class="blk step" data-block="${id}"><div class="body"><div class="h"><span class="num">${esc(num(i + 1))}</span></div><div class="x">${esc(say(id))}</div></div>${spk(id)}</div>`).join('');
    return h + sayRow('ui.sh.iphone', 'blk tip trow');
  }
  function qrBlock(ids) {
    ids.push('ui.sh.qr');
    return `<div class="qrcard"><h2>${esc(T('qrTitle'))}</h2><div class="qrbox" dir="ltr">${qrSvg(url())}</div><div class="qrurl" dir="ltr">${esc(url().replace(/^https:\/\//, ''))}</div>${sayRow('ui.sh.qr')}</div>`;
  }

  // one big button with its own big speaker (56 px) beside it: many people cannot read
  const bigSpk = (id) => spk(id).replace('class="spk', 'class="spk big');
  const row = (id, inner, tag = 'button', attrs = '') => `<div class="srowbig" data-block="${esc(id)}"><${tag} class="sbig" ${attrs}>${inner}</${tag}>${bigSpk(id)}</div>`;
  const label = (icon, t, s2) => `${icon}<span class="tx"><span class="t">${esc(t)}</span>${s2 ? `<span class="s">${esc(s2)}</span>` : ''}</span>`;

  function screen() {
    const B = bridge(), ids = [];
    let body = '';
    if (B) {
      ids.push('ui.share-app', 'ui.sh.nearby', 'ui.sh.b.nearby', 'ui.sh.apps');
      body += sayRow('ui.share-app', 'blk lead trow');
      let size = 0; try { size = typeof B.apkSize === 'function' ? Number(B.apkSize()) || 0 : 0; } catch (e) { size = 0; }
      body += row('ui.sh.b.nearby', label(NEAR, T('nearby'), T('nearbySub')), 'button', 'data-share="nearby" style="--c:#1F6F7A"');
      body += sayRow('ui.sh.nearby', 'blk tip trow');
      body += `<div class="group-h"><span class="t">${esc(T('sendFile'))}</span><span class="ln"></span></div>`;
      body += sayRow('ui.sh.apps', 'blk tip trow');
      for (const a of APPS) {
        const p = installedPkg(B, a); ids.push('ui.sh.b.' + a.id);
        body += row('ui.sh.b.' + a.id, label(BUBBLE, T(a.label), p ? '' : T('notOnPhone')), 'button', `data-share="app" data-app="${a.id}" style="--c:${a.color}"${p ? '' : ' aria-disabled="true"'}`).replace('class="srowbig"', `class="srowbig${p ? '' : ' off'}"`);
      }
      ids.push('ui.sh.b.other');
      body += row('ui.sh.b.other', label(I.plus, T('otherApps')), 'button', 'data-share="other" style="--c:#6B655E"');
      if (size > 0) body += `<p class="muted center">${esc(T('fileSize', { n: mbText(size) }))}</p>`;
      body += qrBlock(ids) + installHelp(ids);
    } else {
      ids.push('ui.sh.web', 'ui.sh.b.link', 'ui.sh.b.whatsapp', 'ui.sh.b.telegram', 'ui.sh.b.copy');
      body += sayRow('ui.sh.web', 'blk lead trow');
      body += row('ui.sh.b.link', label(LINK, T('shareLink'), url().replace(/^https:\/\//, '')), 'button', 'data-share="link" style="--c:#1F6F7A"');
      body += row('ui.sh.b.whatsapp', label(BUBBLE, T('appWhatsApp')), 'a', `data-share="wa" href="${esc(waLink(text()))}" target="_blank" rel="noopener" style="--c:${APPS[0].color}"`);
      body += row('ui.sh.b.telegram', label(BUBBLE, T('appTelegram')), 'a', `data-share="tg" href="${esc(tgLink(url(), T('shareText')))}" target="_blank" rel="noopener" style="--c:${APPS[1].color}"`);
      body += row('ui.sh.b.copy', label(LINK, T('copyLink')), 'button', 'data-share="copy" style="--c:#6B655E"');
      body += qrBlock(ids);
      if (platform() === 'android') {
        ids.push('ui.sh.apk', 'ui.sh.b.apk');
        body += sayRow('ui.sh.apk', 'blk tip trow');
        body += row('ui.sh.b.apk', label(ic('phone'), T('getApk')), 'a', `data-share="apk" href="${esc(APK_URL)}" rel="noopener" style="--c:#B6322D"`);
        body += installHelp(ids);
      }
    }
    return { html: top(T('shareApp')) + listenBar(ids) + body + disclaimer(), nav: 'home' };
  }

  async function shareLink() {
    track('share'); track('tool', { p: 'share-link' });
    if (navigator.share) { try { await navigator.share({ title: T('appName'), text: T('shareText'), url: url() }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copy();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text()); toast(T('copied')); }
    catch (e) { try { prompt('', url()); } catch (e2) { /* nothing more to try */ } }
  }
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-share]'); if (!t) return;
    const how = t.dataset.share, B = bridge();
    if (how === 'nearby' || how === 'other') {
      if (!B) return;
      track('sendapp'); track('tool', { p: 'share-' + how });
      try { B.shareApp(); } catch (e) { toast(T('cantSend')); }
      return;
    }
    if (how === 'app') {
      const a = APPS.find((x) => x.id === t.dataset.app), p = installedPkg(B, a);
      if (!p) { toast(T('notOnPhone')); return; }
      track('sendapp'); track('tool', { p: 'share-' + a.id });
      let ok = false; try { ok = !!B.shareAppTo(p); } catch (e) { ok = false; }
      if (!ok) { toast(T('cantSend')); try { B.shareApp(); } catch (e) { /* no share sheet */ } }
      return;
    }
    if (how === 'link') { shareLink(); return; }
    if (how === 'copy') { track('share'); track('tool', { p: 'share-copy' }); copy(); return; }
    if (how === 'wa' || how === 'tg') { track('share'); track('tool', { p: 'share-' + how }); return; } // the link opens the app
    if (how === 'apk') { track('tool', { p: 'share-getapk' }); }
  });

  return { screen, homeCard, homeSay, settingsRow, shareLink };
}
