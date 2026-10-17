// Certificates on the phone (P25b, C4.2; app/js/modules/cert.js): who may have one, when a finished pathway offers
// it, what the phone keeps (the id and the month, never a name), the way back after consent, and the check page's id.
// Run with: node --test app/tests/*.test.js   (no browser)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const i18n = await import('../js/i18n.js');
const library = await import('../js/library.js');
const modules = await import('../js/modules.js');
const certs = await import('../js/modules/cert.js');
const state = await import('../js/state.js');
const signup = await import('../js/screens/signup.js');
const check = await import('../js/certcheck.js');

const L = (id, subject, order = 1) => ({ id, year: 0, subject, order, title: { prs: id, en: id }, unit: null, steps: 4, sheet: true });
const PACKS = [{ id: 'adult-maths-1', audience: 'adult', tracks: ['literacy', 'reader'],
  lessons: [L('ad-numbers', 'maths', 1), L('ad-change', 'maths', 2)] }];
const GRAPHS = [{ subject: 'maths', version: '2026.10.17', nodes: [
  { id: 'num', needs: [], lessons: ['ad-numbers'], title: { en: 'Numbers' } },
  { id: 'money', needs: ['num'], lessons: ['ad-change'], title: { en: 'Money' } }],
pathways: [{ id: 'ad-money', goal: ['money'], bands: ['ad'], final: 'ad-change', certificate: true, title: { en: 'Money' } },
  { id: 'ad-nocert', goal: ['num'], bands: ['ad'], final: null, certificate: false, title: { en: 'Numbers' } }] }];
const MODS = [{ id: 'lessons', slots: ['home.action'], needs: [] }, { id: 'plan', bands: ['s1', 's2', 'ad'], slots: ['home.action'], needs: [] },
  { id: 'cert', bands: ['p1', 'p2', 's1', 's2', 'ad'], slots: [], needs: [] }];
const ID = 'QC-7K3M9-TQX2A';

let c;
beforeEach(async () => {
  store.clear();
  store.set('qalam.cache.packs', JSON.stringify(PACKS));
  store.set('qalam.cache.graphs', JSON.stringify(GRAPHS));
  state.reload();
  await library.load(true);
  modules.reset();
  modules.sync(MODS);
  i18n.setLang('en');
  c = state.addChild({ band: 'ad', track: 'reader', lang: 'prs' });
});
const me = () => state.byId(c.id);
const money = () => ({ g: GRAPHS[0], p: GRAPHS[0].pathways[0] });

test('p1 to adults where the module is on; never early years', () => {
  assert.ok(certs.canCert(me()));
  assert.equal(certs.canCert({ ...me(), band: 'ey' }), false);
  modules.sync(MODS.slice(0, 2));
  assert.equal(certs.canCert(me()), false);
});

test('a pathway offers its certificate once every lesson of it is finished here', () => {
  assert.equal(certs.ready(me(), money()), false);
  state.markDone('ad-numbers', 3);
  assert.equal(certs.ready(me(), money()), false);
  state.markDone('ad-change', 2);
  assert.equal(certs.ready(me(), money()), true);
  assert.equal(certs.ready(me(), { g: GRAPHS[0], p: GRAPHS[0].pathways[1] }), false);    // no certificate there
  assert.equal(certs.ready({ ...me(), band: 'ey' }, money()), false);
});

test('the phone keeps the id, the pathway and the month, nothing else, and no name', () => {
  state.updateChild(c.id, { certs: [{ path: 'ad-money', id: ID, month: '2027-10', name: 'Sentinel Name' },
    { path: 'Bad Path', id: ID, month: '2027-10' }, { path: 'ad-x', id: 'QC-1', month: '2027-10' }] });
  state.reload();
  assert.deepEqual(me().certs, [{ path: 'ad-money', id: ID, month: '2027-10' }]);
  assert.deepEqual(certs.certOf(me(), 'ad-money'), { path: 'ad-money', id: ID, month: '2027-10' });
  assert.equal(certs.certOf(me(), 'ad-other'), null);
  assert.ok(!JSON.stringify([...store.values()]).includes('Sentinel'));
  assert.equal(certs.ready(me(), money()), true);                    // one she has prints again
});

test('after consent the certificate screen comes back; the check page reads its id from the address', () => {
  assert.equal(signup.thenHash('cert.ad-money'), '#/cert/ad-money');
  assert.equal(signup.thenHash('cert.../x'), '#/home');
  assert.equal(signup.thenHash('plan'), '#/plan');
  assert.equal(check.idOf('/v/qc-7k3m9-tqx2a'), ID);
  assert.equal(check.idOf('/v/QC-7K3M9-TQX2A/extra?x=1'), ID);
  assert.equal(check.idOf('/v/'), '');
});
