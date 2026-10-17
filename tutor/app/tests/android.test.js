// The Android app's side of the phone app (P23): the bridge helpers (app/js/android.js), how the APK finds the
// village hub first and then the online home it was built for (hub.js), the update states from hello's `apk`, and
// the learner's `mine` and `alarms` (state.js). Nothing here needs a phone: the bridge is a stand-in.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'https:', origin: 'https://appassets.androidplatform.net' };

const asked = [];
let answering = new Set();
globalThis.fetch = async (url) => {
  asked.push(url);
  const base = url.replace(/\/api\/.*$/, '');
  if (!answering.has(base)) throw new TypeError('no answer');
  return { ok: true, status: 200, json: async () => ({ hub: base, home: base.startsWith('https') ? 'online' : 'hub', modules: [] }) };
};

const android = await import('../js/android.js');
const hub = await import('../js/hub.js');
const state = await import('../js/state.js');

const APP = (over = {}) => ({ setAlarms() {}, cancelAlarms() {}, version: () => '0.3.0', online: () => 'https://qalam.example.org',
  notifyState: () => 'ask', askNotify() {}, openSettings() {}, exactAlarms: () => true, ...over });

afterEach(() => { delete globalThis.QalamAndroid; asked.length = 0; answering = new Set(); store.clear(); });

test('in a browser the bridge is absent and every answer is a browser\'s', () => {
  assert.equal(android.isApp(), false);
  assert.equal(android.appVersion(), '');
  assert.equal(android.onlineHome(), '');
  assert.equal(android.notifyState(), 'off');
  assert.equal(android.apkState({ latest: '9.0.0', min: '9.0.0' }), 'none');
  assert.equal(android.androidBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120'), true);
  assert.equal(android.androidBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/120'), false);
});

test('in the APK: its version, its online home and its notification state, each checked', () => {
  globalThis.QalamAndroid = APP();
  assert.equal(android.isApp(), true);
  assert.equal(android.androidBrowser('Mozilla/5.0 (Linux; Android 13) QalamAndroid/0.3.0'), false);
  assert.equal(android.appVersion(), '0.3.0');
  assert.equal(android.onlineHome(), 'https://qalam.example.org');
  assert.equal(android.notifyState(), 'ask');
  globalThis.QalamAndroid = APP({ online: () => 'http://plain.example.org', version: () => 'beta', notifyState: () => 'maybe' });
  assert.equal(android.onlineHome(), '');                 // https only
  assert.equal(android.appVersion(), '');
  assert.equal(android.notifyState(), 'off');
  globalThis.QalamAndroid = APP({ online: () => { throw new Error('gone'); } });
  assert.equal(android.onlineHome(), '');                 // a bridge that throws is no bridge
});

test('hello\'s apk: Update Qalam when a newer one is out, the full-screen card below min', () => {
  globalThis.QalamAndroid = APP();                        // this phone has 0.3.0
  assert.equal(android.apkState(null), 'none');
  assert.equal(android.apkState({ latest: '0.3.0', min: null }), 'none');
  assert.equal(android.apkState({ latest: '0.10.0', min: '0.2.0' }), 'update');   // 10 > 3, not "1" < "3"
  assert.equal(android.apkState({ latest: '0.4.0', min: '0.4.0' }), 'required');
  assert.equal(android.newer('1.0', '0.9.9'), true);
  assert.equal(android.newer('1.0.0', '1.0'), false);
});

test('the APK asks the village hub\'s addresses first and the online home last, never its own page', async () => {
  globalThis.QalamAndroid = APP();
  answering = new Set(['http://10.42.0.1', 'https://qalam.example.org']);
  assert.equal(await hub.connect(), true);
  assert.equal(hub.info().hub, 'http://10.42.0.1');                          // both answered: the hub wins
  assert.ok(!asked.some((u) => u.startsWith('/api/')));                      // not the APK's own page
  assert.ok(asked.some((u) => u.startsWith('https://qalam.example.org/api/hello')));
  answering = new Set(['https://qalam.example.org']);
  store.clear();
  assert.equal(await hub.connect(), true);
  assert.equal(hub.info().hub, 'https://qalam.example.org');                // away from the hub: online
  assert.equal(hub.url('/packs/p/pictures/a.svg'), 'https://qalam.example.org/packs/p/pictures/a.svg');
  answering = new Set();
  assert.equal(await hub.connect(), false);
  assert.equal(hub.home(), 'online');                                        // built for the online home
});

test('a browser on an https site still never tries the hub\'s plain-http addresses', async () => {
  answering = new Set(['http://10.42.0.1']);
  await hub.connect();
  assert.ok(asked.every((u) => !u.startsWith('http://')));
});

test('mine and alarms are kept only in their own words', () => {
  const c = state.updateChild(state.addChild({ band: 's1', year: 7, lang: 'prs' }).id, { mine: 'yes', alarms: 'off' });
  assert.equal(c.mine, 'yes');
  assert.equal(c.alarms, 'off');
  const d = state.updateChild(c.id, { mine: 'perhaps', alarms: 'on' });
  assert.equal(d.mine, undefined);
  assert.equal(d.alarms, undefined);                       // on is the default, so nothing is kept
  assert.equal(state.updateChild(c.id, { mine: 'no' }).mine, 'no');
});

test('the manifest asks for exactly the spec\'s permissions', () => {
  const m = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const perms = [...m.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(perms, ['CAMERA', 'INTERNET', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'SCHEDULE_EXACT_ALARM',
    'USE_EXACT_ALARM', 'VIBRATE']);
  assert.match(m, /SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32"/);
  const strings = readFileSync(new URL('../../android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
  assert.match(strings, /<string name="app_name">Qalam<\/string>/);              // never a disguised name
});

test('W8: the iPhone advice is for Safari on an iPhone or iPad outside the Home Screen only', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15';
  assert.equal(android.iphoneBrowser(iphone, {}), true);
  assert.equal(android.iphoneBrowser(iphone, { standalone: true }), false);         // added to the Home Screen
  assert.equal(android.iphoneBrowser(ipad, { maxTouchPoints: 5 }), true);           // an iPad asks for the desktop site
  assert.equal(android.iphoneBrowser(ipad, { maxTouchPoints: 0 }), false);          // a Mac
  assert.equal(android.iphoneBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120', {}), false);
});
