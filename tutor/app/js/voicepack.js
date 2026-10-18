// The voice pack (C5.6, the owner's note of 17 Oct): every clip of one language in one file, so the Android app can
// stay small enough to share by Bluetooth. The APK carries no audio; after install the app downloads the pack for
// her language only (Settings, "Voice"), keeps it on this phone (IndexedDB, never sent anywhere), and plays from it
// before asking the hub. The same file can be saved and shared phone to phone, and opened on a phone that has no
// hub or internet. The web app plays clips from its server and can keep a pack too, for when it is away from it.
// The file (hub/tutor_hub/voicing.py voice_pack): "QVOICE1\n", the header's length (4 bytes, big end first), the
// header as JSON {lang, voice, clips: {hash: [offset, length]}, files: {...}}, then the clips' bytes.

import * as android from './android.js';
import * as hub from './hub.js';
import { addLocal } from './speech.js';

export const LANGS = ['prs', 'ps', 'en', 'zh'];
const MAGIC = 'QVOICE1\n';
const DB = 'qalam-voice';
const STORE = 'packs';
const MAX = 40 * 1024 * 1024;

// the header of a pack, with `base` where its clips start; throws if the bytes are not a whole pack
export function parse(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes.length < MAGIC.length + 4 || bytes.length > MAX) throw new Error('not a voice pack');
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error('not a voice pack');
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length, false);
  const base = MAGIC.length + 4 + n;
  if (base > bytes.length) throw new Error('not a voice pack');
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 4, base)));
  if (!head || !LANGS.includes(head.lang) || typeof head.clips !== 'object') throw new Error('not a voice pack');
  for (const table of [head.clips, head.files || {}]) {
    for (const [k, v] of Object.entries(table)) {
      const ok = Array.isArray(v) && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && v[1] > 0
        && base + v[0] + v[1] <= bytes.length;
      if (!ok) throw new Error('a clip runs past the end: ' + k);
    }
  }
  return { ...head, files: head.files || {}, base, bytes: bytes.length };
}

function open() {
  return new Promise((ok, no) => {
    if (!globalThis.indexedDB) { no(new Error('no storage')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((ok, no) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error);
    });
  } finally { db.close(); }
}

// play from a pack's bytes: each clip a slice of one Blob (nothing copied)
function use(buf, head = parse(buf)) {
  const blob = new Blob([buf]);
  const slice = ([o, l]) => blob.slice(head.base + o, head.base + o + l, 'audio/ogg');
  addLocal(head.lang, Object.fromEntries(Object.entries(head.clips).map(([h, v]) => [h, slice(v)])),
    Object.fromEntries(Object.entries(head.files).map(([p, v]) => [p, slice(v)])));
  return head;
}

// the pack kept on this phone for a language, if any: {lang, voice, clips, bytes}
export async function kept(lang) {
  try {
    const buf = await tx('readonly', (st) => st.get(lang));
    return buf ? parse(buf) : null;
  } catch { return null; }
}

// at start: play from the kept pack of her language, if there is one
export async function load(lang) {
  try {
    const buf = await tx('readonly', (st) => st.get(lang));
    return buf ? use(buf) : null;
  } catch { return null; }
}

async function keep(buf) {
  const head = parse(buf);
  await tx('readwrite', (st) => st.put(buf, head.lang));
  return use(buf, head);
}

// download her language's pack from the hub or the online home; onProgress(0..1) while it comes
export async function download(lang, onProgress) {
  const r = await fetch(hub.url(`/audio/${lang}/voice.qvoice`), { cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error('no voice pack'), { status: r.status });
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !total || !onProgress) return keep(await r.arrayBuffer());
  const reader = r.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (got > MAX) throw new Error('too big');
    onProgress(Math.min(1, got / total));
  }
  const all = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return keep(all.buffer);
}

// a pack file she picked (shared to her by Bluetooth, say): kept for its own language
export async function openFile(file) {
  if (!file || file.size > MAX) throw new Error('not a voice pack');
  return keep(await file.arrayBuffer());
}

export async function remove(lang) {
  try { await tx('readwrite', (st) => st.delete(lang)); } catch { /* nothing kept */ }
}

export const fileName = (lang) => `qalam-voice-${lang}.qvoice`;

// save or share the kept pack: the Android app's share sheet (Bluetooth, Files, a messenger), else a download
export async function share(lang) {
  const buf = await tx('readonly', (st) => st.get(lang));
  if (!buf) return false;
  const app = globalThis.QalamAndroid;
  if (android.isApp() && app && typeof app.shareFile === 'function') {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return app.shareFile(fileName(lang), btoa(bin)) === true;
  }
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName(lang) });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
