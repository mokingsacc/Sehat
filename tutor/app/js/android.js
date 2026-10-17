// The Android app (P23, C3.6, DESIGN-C2C3-SPECS item 15). The APK shows this same app in a WebView and adds a bridge,
// `globalThis.QalamAndroid`: the school day's alarms (day.js syncAlarms), the notification question, the phone's
// settings page, its version and the online home it was built for. In a browser there is no bridge, and every
// function here answers as a browser would (no alarms, notifications "off", no version).
// Updates: /api/hello carries `apk {latest, min}`. A newer version adds Settings' "Update Qalam"; below `min` one
// full-screen card asks for the update (main.js). The app never installs its own updates: Download opens /get in the
// phone's browser.

const bridge = () => globalThis.QalamAndroid || null;
const call = (name, ...args) => {
  const b = bridge();
  try { return b && typeof b[name] === 'function' ? b[name](...args) : undefined; } catch { return undefined; }
};

// inside the APK
export const isApp = () => !!bridge() && typeof bridge().setAlarms === 'function';

// a phone's browser on Android, where "Get the Android app" is offered (never inside the APK, never elsewhere)
export const androidBrowser = (ua = (globalThis.navigator && navigator.userAgent) || '') =>
  !isApp() && /Android/i.test(ua) && !/QalamAndroid/.test(ua);

export function appVersion() {
  const v = isApp() ? String(call('version') || '') : '';
  return /^\d{1,4}(\.\d{1,4}){0,3}$/.test(v) ? v : '';
}

// the online home this APK was built for (https://host), or '' for a hub-only APK and in a browser
export function onlineHome() {
  const u = isApp() ? String(call('online') || '') : '';
  return /^https:\/\/[A-Za-z0-9.-]+$/.test(u) ? u : '';
}

// 'on' (notifications can show), 'ask' (Android 13+, not allowed yet), 'off' (switched off, or a browser)
export function notifyState() {
  const v = isApp() ? call('notifyState') : 'off';
  return v === 'on' || v === 'ask' ? v : 'off';
}
export const askNotify = () => { call('askNotify'); };
export const openSettings = () => { call('openSettings'); };
// false only on Android 12 without exact alarms (bells then come within 5 minutes); true in a browser
export const exactAlarms = () => (isApp() ? call('exactAlarms') !== false : true);
// P25b: the phone's own print dialog for what this page shows for print (a certificate, A4 landscape), under a title
// that names no one; an older APK without it prints nothing, and the page says so
export const canPrint = () => isApp() && typeof bridge().print === 'function';
export const print = (title) => { call('print', String(title)); };
// W7: a sealed school bag file handed to the phone's share sheet (Bluetooth, Files, a messenger), as the voice pack is
export const shareFile = (name, base64) => isApp() && call('shareFile', String(name), String(base64)) === true;
// W7 (3.10, case 18): the 16 digits the browser's "Open in the Qalam app" handed over (an intent's extra, never an
// address), once; '' when there are none
export function takeBag() {
  const d = isApp() ? String(call('takeBag') || '') : '';
  return /^\d{16}$/.test(d) ? d : '';
}

// "1.10.0" is newer than "1.9.2"
export function newer(a, b) {
  const x = String(a || '').split('.').map(Number);
  const y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

// what hello's `apk` means for this phone: 'none' (a browser, or nothing to say), 'update' or 'required'
export function apkState(apk, version = appVersion()) {
  if (!version || !apk || typeof apk !== 'object' || !apk.latest) return 'none';
  if (apk.min && newer(apk.min, version)) return 'required';
  return newer(apk.latest, version) ? 'update' : 'none';
}
