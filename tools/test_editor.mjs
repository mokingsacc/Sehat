// Tests for the book editor on the server (server/worker.js, server/editor-core.js, js/overlay.js):
// 1. the stale-draft case of 7 October 2026, rebuilt with the real older servers from git: a draft imported before
//    save times existed, then "Bring in app changes" after content merge 2, gave 73 errors ("The safety list names
//    "home-safety", but there is no such topic"); the editor now moves such a draft over without losing the app's pages;
// 2. the app updated while the editor is open; changes saved part by part; a stale window;
// 3. the computer time each editor request takes on the whole book (the free plan allows about 10 ms a request).
// Run: node tools/test_editor.mjs        (needs the git history for part 1; it is skipped without it)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import * as OV from '../js/overlay.js';
import { editorCore } from '../server/editor-core.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CORE = editorCore();
const W = (await import(ROOT + 'server/worker.js')).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const NEW = JSON.parse(readFileSync(ROOT + 'content/book.json', 'utf8'));

// D1 stand-in on node:sqlite; the time spent in the database is counted apart (D1 runs it, not the Worker)
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(ROOT + 'server/schema.sql', 'utf8'));
  const t = { db: 0 };
  const timed = (f) => { const c = process.cpuUsage(); try { return f(); } finally { const d = process.cpuUsage(c); t.db += d.user + d.system; } };
  const wrap = (sql) => ({ _sql: sql, _a: [], bind(...a) { return { ...wrap(sql), _a: a }; },
    async first() { return timed(() => db.prepare(this._sql).get(...this._a)); },
    async all() { return timed(() => ({ results: db.prepare(this._sql).all(...this._a) })); },
    async run() { return timed(() => { const r = db.prepare(this._sql).run(...this._a); return { meta: { changes: Number(r.changes) } }; }); } });
  return { db, t, DB: { prepare: wrap, async batch(st) { const out = []; for (const s of st) out.push(await s.run()); return out; } } };
}
// the app's address: serves whichever book is "live"
let LIVE = NEW;
globalThis.fetch = async (u) => {
  const s = String(u);
  if (/\/content\/book\.json/.test(s)) return new Response(JSON.stringify(LIVE), { headers: { 'Content-Type': 'application/json' } });
  if (/\/content\/version\.json/.test(s)) return Response.json({ version: LIVE.version, built: LIVE.built });
  return new Response('', { status: 404 });
};
const mkEnv = (D) => ({ DASH_KEY: 'k', APP_URL: 'https://app.example', DB: D.DB });
async function call(W, env, op, body, D) {
  const req = new Request(`https://w.example/admin/api/${op}${op.includes('?') ? '&' : '?'}key=k`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (D) D.t.db = 0;
  const c = process.cpuUsage();
  const r = await W.fetch(req, env);
  const buf = await r.arrayBuffer(); // the Worker turns its answer into bytes; reading them is the browser's work
  const d = process.cpuUsage(c), ms = (d.user + d.system - (D ? D.t.db : 0)) / 1000;
  const txt = Buffer.from(buf).toString('utf8');
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, body: j, text: txt, ms };
}
// what the editor page does when it opens (server/worker.js adminClient): the app's book with the changes laid over it
const draftOf = (app, st) => CORE.draftOf(app, Object.fromEntries(st.units.map((u) => [u.k, u])), OV, st.retired);
async function pageMovesOld(env, st, app) { // the page's moveOld(): dated changes move over, the rest are listed
  const old = (await call(W, env, 'legacy?doc=draft')).body;
  const base = st.legacy.base ? (await call(W, env, 'legacy?doc=base')).body : null;
  const c = CORE.oldChanges(old, base, app, OV);
  const r = await call(W, env, 'migrate', { units: c.dated, done: true, from: old.version, undated: c.undated, retire: old.retired || [] });
  return { c, r };
}

/* ---------- 1. the stale draft of 7 October, with the real older servers ---------- */
let git = null;
try { git = (rev, path) => execSync(`git -C "${ROOT}" show ${rev}:${path}`, { maxBuffer: 64 << 20 }).toString(); git('1882cce', 'content/book.json'); } catch { git = null; }
if (!git) console.log('SKIP part 1: no git history');
else {
  const tmp = mkdtempSync(tmpdir() + '/sehat-old-');
  try {
    // the server before save times (18:11, the draft was imported with it) and the one live when content merge 2 went out
    for (const rev of ['1882cce', '2f2f888']) execSync(`mkdir -p "${tmp}/${rev}" && git -C "${ROOT}" archive ${rev} server js | tar -x -C "${tmp}/${rev}"`);
    const W1 = (await import(`${tmp}/1882cce/server/worker.js`)).default, W2 = (await import(`${tmp}/2f2f888/server/worker.js`)).default;
    const OLDAPP = JSON.parse(git('1882cce', 'content/book.json')); // app version 2026.10.07-f4ed63, 25 topics
    const D = d1(), env = mkEnv(D);
    LIVE = OLDAPP;
    let x = await call(W1, env, 'import', {});
    ok(x.status === 200 && OLDAPP.version === '2026.10.07-f4ed63', 'old server: draft imported from app 2026.10.07-f4ed63', x.body);
    // an edit made back then: no save time was kept
    let st = (await call(W1, env, 'state')).body;
    const uiKey = Object.keys(st.draft.ui).find((k) => st.draft.ui[k].en && !/\{/.test(st.draft.ui[k].en));
    x = await call(W1, env, 'save', { part: 'ui', text: { [uiKey]: { ...st.draft.ui[uiKey], en: 'MO OLD EDIT' } }, say: {} });
    ok(x.status === 200, 'old server: an edit without a save time');
    // the audit server: an edit with a save time, then content merge 2 goes live
    st = (await call(W2, env, 'state')).body;
    const fever = clone(st.draft.topics.fever); fever.blocks[0].text.en = 'MO DATED EDIT';
    x = await call(W2, env, 'save', { part: 'topic', value: fever, rev: st.rev });
    ok(x.status === 200, 'audit server: an edit with a save time', x.body);
    LIVE = NEW;
    st = (await call(W2, env, 'state')).body;
    ok(st.appNewer && !st.base, 'the editor offered "Bring in app changes" (a draft without a base)', { appNewer: st.appNewer, base: st.base });
    x = await call(W2, env, 'rebase', { rev: st.rev });
    ok(x.status === 200 && x.body.knownBase === false, 'Mo brings in the app changes', x.body && { kept: x.body.kept && x.body.kept.length });
    x = await call(W2, env, 'check', {});
    const errs = x.body.errors.map((e) => e.msg);
    ok(errs.length >= 73 && errs.includes('The safety list names "home-safety", but there is no such topic.'), 'reproduced: the check showed 73 or more errors like Mo saw (more now that the Emergency cards name more pages)', { n: errs.length, first: errs.slice(0, 2) });
    // why: the no-base merge took every part that differed from the app as an editor change, so the app's 77 new topics
    // (missing from the old draft) were deleted, while the new lists (safety, hospital, food, wellbeing) and the Emergency
    // screen, which were not editor units, came from the new app and still named them
    const broken = (await call(W2, env, 'state')).body.draft;
    ok(!broken.topics['home-safety'] && broken.sections.safety.includes('home-safety'), 'cause: the topic was deleted, the list kept it');

    // now this version of the server, on the same database
    st = (await call(W, env, 'state')).body;
    ok(st.legacy && st.legacy.version === NEW.version && st.units.length === 0, 'new server: the old draft is waiting to be moved over', st.legacy);
    const mv = await pageMovesOld(env, st, NEW);
    ok(mv.r.status === 200 && mv.c.dated.map((u) => u.k).join() === 'topic:fever', 'only the change with a save time moves over', mv.c.dated.map((u) => u.k));
    ok(mv.c.undated.includes('ui:' + uiKey) && !mv.c.undated.some((k) => k === 'topic:home-safety'), 'the undated edit is listed for Mo; the app\'s new pages are not', mv.c.undated.length);
    st = (await call(W, env, 'state')).body;
    ok(!st.legacy && st.old && st.old.undated.length === mv.c.undated.length, 'moved once; the undated list is kept for the Publish page');
    let draft = draftOf(NEW, st).book;
    let chk = CORE.checkBook(draft);
    ok(chk.errors.length === 0, 'the editor\'s draft (the new app with Mo\'s change) has no errors', chk.errors.slice(0, 3));
    ok(draft.topics.fever.blocks[0].text.en === 'MO DATED EDIT' && draft.topics['home-safety'] && Object.keys(draft.topics).length === Object.keys(NEW.topics).length, 'Mo\'s change is there, and all of the app\'s pages');
    x = await call(W, env, 'publish', { app: { version: NEW.version, built: NEW.built }, audio: {} });
    ok(x.status === 200 && x.body.units === 1, 'publish works', x.body);
    const ov = JSON.parse((await W.fetch(new Request('https://w.example/content/overlay.json'), env).then((r) => r.text())));
    const phone = OV.applyOverlay(NEW, ov).book;
    ok(phone.topics.fever.blocks[0].text.en === 'MO DATED EDIT' && CORE.checkBook(phone).errors.length === 0, 'a phone on the new app gets Mo\'s change and no broken lists');
    ok(ov.say['fever.lead'] && /MO DATED EDIT/.test(ov.say['fever.lead'].en), 'the changed topic\'s spoken lines go with it');
    // "Keep them as my changes" for the undated parts: they are added, but never remove the app's pages
    const old = (await call(W, env, 'legacy?doc=draft')).body;
    x = await call(W, env, 'migrate', { units: st.old.undated.map((k) => ({ k, v: OV.getUnit(old, k) === undefined ? null : OV.getUnit(old, k), base: OV.fp(OV.getUnit(NEW, k)), ts: Date.now() })), replace: true, done: true, from: st.old.from, undated: [] });
    st = (await call(W, env, 'state')).body;
    draft = draftOf(NEW, st).book;
    ok(x.status === 200 && draft.ui[uiKey].en === 'MO OLD EDIT' && draft.topics['home-safety'] && st.old.undated.length === 0, 'keeping the undated parts brings back the old edit', x.body);
    ok(draft.topics.fever.blocks[0].text.en === 'MO DATED EDIT', 'and does not undo the dated change');
    chk = CORE.checkBook(draft);
    ok(!chk.errors.some((e) => /no such topic/.test(e.msg)), 'no list names a missing topic, even after keeping all old parts', chk.errors.filter((e) => /no such topic/.test(e.msg)).slice(0, 3));

    // the same old draft, if Mo had not pressed "Bring in app changes" (no base at all, the plain old draft)
    const D2 = d1(), env2 = mkEnv(D2);
    LIVE = OLDAPP; await call(W1, env2, 'import', {}); LIVE = NEW;
    st = (await call(W, env2, 'state')).body;
    const mv2 = await pageMovesOld(env2, st, NEW);
    draft = draftOf(NEW, (await call(W, env2, 'state')).body).book;
    ok(mv2.r.status === 200 && mv2.c.dated.length === 0 && CORE.checkBook(draft).errors.length === 0 && draft.topics['home-safety'], 'a plain old draft also moves over with no errors');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/* ---------- 2. the app updated while the editor is open; part-by-part saves ---------- */
{
  const D = d1(), env = mkEnv(D);
  const A1 = clone(NEW); A1.version = '2026.10.08-aaaaaa'; A1.built = '2026-10-08T00:00:00Z';
  LIVE = A1;
  let st = (await call(W, env, 'state')).body;
  ok(st.units.length === 0 && !st.legacy && !st.dirty, 'a new editor: no changes yet');
  let draft = draftOf(A1, st).book;
  ok(JSON.stringify(draft.narration) === JSON.stringify(A1.narration) && JSON.stringify(draft.order) === JSON.stringify(A1.order) && JSON.stringify(draft.packs.ids) === JSON.stringify(A1.packs.ids), 'with no changes the draft is the app\'s book (narration, order and packs made like build.py)');
  // the editor changes topic X and the safety list (moves a page up)
  const X = 'diarrhoea', t = clone(draft.topics[X]); t.blocks[0].text.en = 'EDITOR X';
  const safety = clone(draft.sections.safety); [safety[0], safety[1]] = [safety[1], safety[0]];
  let x = await call(W, env, 'save', { units: { ['topic:' + X]: t, 'list:safety': safety }, prev: {}, base: { ['topic:' + X]: OV.fp(A1.topics[X]), 'list:safety': OV.fp(A1.sections.safety) } });
  ok(x.status === 200 && x.body.ts['topic:' + X] > 0, 'save: a topic and a list together', x.body);
  const ts1 = x.body.ts['topic:' + X];
  // a second window that loaded before this save tries to save the same topic: refused; another part is fine
  x = await call(W, env, 'save', { units: { ['topic:' + X]: t }, prev: { ['topic:' + X]: 0 }, base: {} });
  ok(x.status === 409 && x.body.conflict && /NOT saved/.test(x.body.error), 'a stale window cannot overwrite a newer save', x.body);
  x = await call(W, env, 'save', { units: { home: ['emergency', 'firstAid', 'children', 'adults'] }, prev: {}, base: { home: OV.fp(A1.config.home) } });
  ok(x.status === 200, 'another part saves fine from the other window');
  x = await call(W, env, 'save', { part: 'topic', value: t });
  ok(x.status === 409 && /Reload/.test(x.body.error), 'an editor page from before this version is asked to reload');
  for (const [units, re] of [[{ 'topic:vaccines': {} }, /vaccine/], [{ 'topic:x': { id: 'y' } }, /not sent whole/], [{ 'list:nope': [] }, /no topic list/], [{ 'config:emergency': [] }, /not a part/], [{ 'say:fever.lead': { en: 'x' } }, /not a part|spoken interface/]]) {
    x = await call(W, env, 'save', { units, prev: {}, base: {} });
    ok(x.status === 400 && re.test(x.body.error), 'save refuses ' + Object.keys(units)[0], x.body);
  }
  st = (await call(W, env, 'state')).body;
  ok(st.dirty && st.units.length === 3, 'three parts changed, not yet published', st.units.map((u) => u.k));
  // a part made the same as the app again is dropped (it follows the app from then on)
  x = await call(W, env, 'save', { units: {}, drop: ['home'], prev: { home: st.units.find((u) => u.k === 'home').ts } });
  st = (await call(W, env, 'state')).body;
  ok(x.status === 200 && st.units.length === 2, 'drop: back to the app\'s own version');

  // the app is updated: A2 changes topic X too (a fix), changes topic Y, and adds a page to the safety list
  const A2 = clone(A1); A2.version = '2026.10.09-bbbbbb'; A2.built = '2026-10-09T00:00:00Z';
  const Y = 'fever'; A2.topics[Y].blocks[0].text.en = 'APP FIX Y';
  const newId = 'app-new-page'; A2.topics[newId] = { ...clone(A2.topics[A2.sections.safety[0]]), id: newId }; A2.topics[newId].blocks.forEach((b) => { b.id = b.id.replace(/^[^.]+/, newId); (b.items || []).forEach((it) => { it.id = it.id.replace(/^[^.]+/, newId); }); });
  A2.sections.safety.push(newId);
  // phones and the editor: the editor's X was saved after A1 was built and A2 did not touch it -> the editor's X
  let r = CORE.draftOf(A2, Object.fromEntries(st.units.map((u) => [u.k, u])), OV, []);
  ok(r.book.topics[X].blocks[0].text.en === 'EDITOR X' && r.book.topics[Y].blocks[0].text.en === 'APP FIX Y', 'on the new app: the editor\'s change stays, the app\'s other fix comes in');
  // the safety list changed in the app after the editor changed it: the app's list wins (its new page is there)
  ok(r.book.sections.safety.includes(newId) && r.superseded.includes('list:safety') && CORE.checkBook(r.book).errors.length === 0, 'a list the app changed later: the app\'s version, listed for the editor, no errors', r.superseded);
  // publishing with a page that still has the older app: refused once, with the new version, then fine
  LIVE = A2;
  x = await call(W, env, 'publish', { app: { version: A1.version, built: A1.built }, audio: {} });
  ok(x.status === 409 && x.body.appChanged && x.body.appChanged.version === A2.version, 'publish from a page with the older app: told the app was updated', x.body);
  x = await call(W, env, 'publish', { app: { version: A2.version, built: A2.built }, audio: {} });
  ok(x.status === 200 && x.body.units === 2, 'publish on the new app', x.body);
  const ov = JSON.parse(await (await W.fetch(new Request('https://w.example/content/overlay.json'), env)).text());
  const v = (await (await W.fetch(new Request('https://w.example/content/version.json'), env)).json());
  ok(ov.format === OV.FORMAT && ov.app === A2.version && v.version === ov.version && ov.units.every((u) => /^[0-9a-f]{8}$/.test(u.base) && u.ts > 0), 'the overlay and version.json', { app: ov.app, v });
  // phones: on A1 both changes; on A2 the editor's X and the app's list (with the editor-added pages kept, none here)
  const p1 = OV.applyOverlay(A1, ov).book, p2 = OV.applyOverlay(A2, ov).book;
  ok(p1.topics[X].blocks[0].text.en === 'EDITOR X' && p1.sections.safety[0] === safety[0], 'phone on the older app: both changes');
  ok(p2.topics[X].blocks[0].text.en === 'EDITOR X' && p2.sections.safety.includes(newId), 'phone on the newer app: the editor\'s topic and the app\'s list');
  st = (await call(W, env, 'state')).body;
  ok(!st.dirty && st.published && st.published.version === ov.version, 'after publish: nothing new');
  // an editor-added topic stays in a list the app changed later (js/overlay.js)
  const nt = clone(A2.topics[A2.sections.children.find((x) => x !== 'vaccines')]); nt.id = 'editor-new'; nt.blocks.forEach((b) => { b.id = b.id.replace(/^[^.]+/, 'editor-new'); (b.items || []).forEach((it) => { it.id = it.id.replace(/^[^.]+/, 'editor-new'); }); });
  const kids = [...A2.sections.children, 'editor-new'];
  x = await call(W, env, 'save', { units: { 'topic:editor-new': nt, 'list:children': kids }, prev: {}, base: { 'topic:editor-new': OV.fp(undefined), 'list:children': OV.fp(A2.sections.children) } });
  st = (await call(W, env, 'state')).body;
  const A3 = clone(A2); A3.version = '2026.10.10-cccccc'; A3.built = new Date(Date.now() + 60000).toISOString(); A3.sections.children.reverse();
  r = CORE.draftOf(A3, Object.fromEntries(st.units.map((u) => [u.k, u])), OV, []);
  ok(x.status === 200 && r.superseded.includes('list:children') && r.book.sections.children.includes('editor-new') && r.book.sections.children[0] === A3.sections.children[0], 'an editor-added page stays in a list the app reordered later');
  // revert: back to what was published
  x = await call(W, env, 'revert', {});
  st = (await call(W, env, 'state')).body;
  ok(x.status === 200 && st.units.length === 2 && !st.units.some((u) => u.k === 'topic:editor-new') && !st.dirty, 'revert: back to the published changes', st.units.map((u) => u.k));
  // start again from the app
  x = await call(W, env, 'import', {});
  st = (await call(W, env, 'state')).body;
  ok(x.status === 200 && st.units.length === 0 && !st.legacy, 'start again: no changes left');
  // the server's own check stops broken changes even if a page skipped its check
  const bad = clone(A2.topics[X]); bad.blocks[0].text.ps = '';
  await call(W, env, 'save', { units: { ['topic:' + X]: bad }, prev: {}, base: {} });
  x = await call(W, env, 'publish', { app: { version: A2.version }, audio: {} });
  ok(x.status === 422 && x.body.errors.some((e) => /Pashto text is empty/.test(e.msg)), 'publish refuses a change with an empty Pashto text', x.body.errors);
  LIVE = NEW;
}

/* ---------- 3. computer time per request, on the whole 2.2 MB book ---------- */
{
  const D = d1(), env = mkEnv(D);
  LIVE = NEW;
  const runs = 15, T = {};
  const add = (k, x) => { (T[k] = T[k] || []).push(x.ms); if (x.status !== 200) console.log('  ', k, x.status, x.text.slice(0, 200)); };
  const st0 = (await call(W, env, 'state')).body, topics = Object.keys(NEW.topics).filter((t) => t !== 'vaccines');
  for (let i = 0; i < runs; i++) {
    const st = (await call(W, env, 'state', undefined, D)); add('state', st);
    const prev = Object.fromEntries(st.body.units.map((u) => [u.k, u.ts]));
    const tid = topics[i % topics.length], t = clone(NEW.topics[tid]); t.blocks[0].text.en += ' ' + i;
    add('save (one topic)', await call(W, env, 'save', { units: { ['topic:' + tid]: t }, prev: { ['topic:' + tid]: prev['topic:' + tid] || 0 }, base: { ['topic:' + tid]: OV.fp(NEW.topics[tid]) } }, D));
    add('check', await call(W, env, 'check', {}, D));
    add('publish', await call(W, env, 'publish', { app: { version: NEW.version }, audio: {} }, D));
  }
  // "Start again from the app" (was "Import from app"), and "Bring in app changes" which is now done by the page
  for (let i = 0; i < runs; i++) add('import (start again)', await call(W, env, 'import', {}, D));
  // a big draft: every topic changed (the whole book's topics as changes)
  const all = {}, base = {};
  for (const tid of topics) { const t = clone(NEW.topics[tid]); t.blocks[0].text.en += ' all'; all['topic:' + tid] = t; base['topic:' + tid] = OV.fp(NEW.topics[tid]); }
  await call(W, env, 'save', { units: all, prev: {}, base });
  const T2 = {};
  // moving an old draft over: the page sends about 25,000 characters a request (adminClient chunks)
  const some = []; let size = 0;
  for (const k of Object.keys(all)) { const u = { k, v: all[k], base: base[k], ts: Date.now() }; size += JSON.stringify(u).length; if (size > 25000) break; some.push(u); }
  for (let i = 0; i < 5; i++) (T2.migrate = T2.migrate || []).push((await call(W, env, 'migrate', { units: some, replace: true }, D)).ms);
  for (let i = 0; i < 5; i++) { (T2.state = T2.state || []).push((await call(W, env, 'state', undefined, D)).ms); (T2.publish = T2.publish || []).push((await call(W, env, 'publish', { app: { version: NEW.version }, audio: {} }, D)).ms); }
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  console.log('Computer time per request (median of ' + runs + ', ms, without database time), book ' + (JSON.stringify(NEW).length / 1e6).toFixed(2) + ' M characters:');
  for (const [k, v] of Object.entries(T)) console.log('  ' + k.padEnd(22) + med(v).toFixed(2));
  console.log(`  with all ${topics.length} topics changed: state ${med(T2.state).toFixed(2)}, publish ${med(T2.publish).toFixed(2)}; moving an old draft over (${some.length} topics a request) ${med(T2.migrate).toFixed(2)}`);
  ok(med(T2.migrate) < 10, 'moving an old draft over stays under 10 ms a request', med(T2.migrate));
  for (const k of ['state', 'save (one topic)', 'check', 'publish', 'import (start again)']) ok(med(T[k]) < 10, `${k} stays under 10 ms of computer time`, med(T[k]));
  ok(st0 && true, 'measured');
}

console.log(`editor tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
