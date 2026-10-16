// Check my sheet (app/js/screens/check.js) sends one `check.done` through the phone's events queue each time a
// sheet is marked, with the percent right, whether the key came from printing or from the hub.
// Run with: node --test app/tests/*.test.js   (no browser: a few lines of stand-in DOM below)

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { protocol: 'http:', origin: 'http://10.42.0.1', hash: '' };
globalThis.fetch = async () => { throw new TypeError('network down'); };       // the phone is at home

// just enough of a DOM for the screen's building blocks
class Node {
  constructor(tag = '#text', text = '') {
    this.tag = tag; this.kids = []; this.attrs = {}; this.on = {}; this.style = {}; this.className = ''; this.text = text;
    this.value = '';
    const cls = () => new Set(this.className.split(/\s+/).filter(Boolean));
    const put = (set) => { this.className = [...set].join(' '); };
    this.classList = {
      add: (c) => put(cls().add(c)),
      remove: (c) => { const x = cls(); x.delete(c); put(x); },
      toggle: (c, on) => { const x = cls(); if (on ?? !x.has(c)) x.add(c); else x.delete(c); put(x); },
      contains: (c) => cls().has(c),
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(type, fn) { (this.on[type] ||= []).push(fn); }
  append(...kids) {
    for (let k of kids) {
      if (typeof k === 'string') k = new Node('#text', k);
      if (k.tag === '#fragment') this.append(...k.kids); else { k.parent = this; this.kids.push(k); }
    }
  }
  replaceChildren(...kids) { this.kids = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this); }
  replaceWith(...kids) { if (this.parent) { const p = this.parent; const i = p.kids.indexOf(this); p.kids.splice(i, 1); for (const k of kids.reverse()) { const n = typeof k === 'string' ? new Node('#text', k) : k; n.parent = p; p.kids.splice(i, 0, n); } } }
  scrollIntoView() {}
  set innerHTML(_) { this.content = { firstChild: new Node('svg') }; }
  set textContent(t) { this.kids = [new Node('#text', t)]; }
  get textContent() { return this.tag === '#text' ? this.text : this.kids.map((k) => k.textContent).join(''); }
  click() { for (const fn of this.on.click || []) fn({ preventDefault() {} }); }
  all(test) { return [...(test(this) ? [this] : []), ...this.kids.flatMap((k) => k.all(test))]; }
}
globalThis.Node = Node;
globalThis.document = {
  createElement: (tag) => new Node(tag),
  createTextNode: (t) => new Node('#text', t),
  createDocumentFragment: () => new Node('#fragment'),
  getElementById: () => null,
  body: new Node('body'),
};

const state = await import('../js/state.js');
const events = await import('../js/events.js');
const { default: check } = await import('../js/screens/check.js');

const LESSON = 'maths-7-fractions-add';
const KEY = { code: 'M7-03', items: [
  { n: 1, check: 'value', q: '1/2 + 1/4', a: '3/4' },
  { n: 2, check: 'value', q: '1/3 + 1/3', a: '2/3' },
  { n: 3, check: 'value', q: '1/5 + 2/5', a: '3/5' },
  { n: 4, check: 'self', prompt: 'Draw a half', a: 'half of the circle' },
  { n: 5, check: 'none', prompt: 'Trace' },
] };
const SELF_ONLY = { code: 'D1-01', items: [
  { n: 1, check: 'self', prompt: 'Write sheen', a: 'ش' },
  { n: 2, check: 'self', prompt: 'Write seen', a: 'س' },
] };

const checks = () => events.pending().filter((e) => e.verb === 'check.done').map((e) => [e.object, e.value]);
const button = (el, cls) => el.all((n) => n.tag === 'button' && n.className.split(' ').includes(cls));

const AGREED = { kind: 'guardian-on-phone', version: 'hub-2026-10', at: '2026-10-16T09:41', sent: true };

beforeEach(() => {
  store.clear();
  events.reset();
  const c = state.addChild({ name: 'Maryam', year: 7, lang: 'prs' });
  state.updateChild(c.id, { consent: AGREED });          // no event is kept without a grown-up's yes
});

test('without consent a marked sheet queues no event', async () => {
  state.updateChild(state.child().id, { consent: null });
  state.cache(`key.${LESSON}.4821`, KEY);
  const { el } = await check([LESSON, '4821']);
  el.all((n) => n.tag === 'input').forEach((i) => { i.value = '3/4'; });
  button(el, 'main')[0].click();
  assert.deepEqual(events.pending(), []);
});

test('pressing Check queues one check.done with the percent right, and no name', async () => {
  state.cache(`key.${LESSON}.4821`, KEY);              // kept when the sheet was printed: no key fetch at all
  const { el } = await check([LESSON, '4821']);
  const inputs = el.all((n) => n.tag === 'input');
  assert.equal(inputs.length, 3);
  inputs[0].value = '۳/۴';                              // right
  inputs[1].value = '4/6';                              // right, not in simplest form
  inputs[2].value = '1/5';                              // wrong
  assert.deepEqual(checks(), []);
  button(el, 'main')[0].click();
  assert.deepEqual(checks(), [[LESSON, 67]]);
  assert.ok(!JSON.stringify(events.pending()).includes('Maryam'));
});

test('each marking is one more event; a self-checked row counts once it is judged', async () => {
  state.cache(`key.${LESSON}.4821`, KEY);
  const { el } = await check([LESSON, '4821']);
  const inputs = el.all((n) => n.tag === 'input');
  inputs.forEach((i, k) => { i.value = ['3/4', '2/3', '3/5'][k]; });
  const main = button(el, 'main')[0];
  main.click();
  el.all((n) => n.tag === 'button' && n.className === 'link')[0].click();     // show the answer to row 4
  button(el, 'good')[0].click();                                               // "yes": no event by itself
  assert.deepEqual(checks(), [[LESSON, 100]]);
  inputs[2].value = '';                                                        // emptied rows no longer count
  main.click();
  assert.deepEqual(checks(), [[LESSON, 100], [LESSON, 100]]);
  inputs[0].value = '1';
  main.click();
  assert.deepEqual(checks(), [[LESSON, 100], [LESSON, 100], [LESSON, 67]]);
});

test('nothing typed, nothing sent', async () => {
  state.cache(`key.${LESSON}.0`, KEY);
  const { el } = await check([LESSON, '0']);
  button(el, 'main')[0].click();
  assert.deepEqual(checks(), []);
});

test('a sheet with nothing to type is marked when every row is judged', async () => {
  state.cache('key.dari-1-sheen.0', SELF_ONLY);
  const { el } = await check(['dari-1-sheen', '0']);
  for (const l of el.all((n) => n.tag === 'button' && n.className === 'link')) l.click();
  const nos = el.all((n) => n.tag === 'button' && n.className === 'btn');
  button(el, 'good')[0].click();
  assert.deepEqual(checks(), []);                      // one of two judged: not marked yet
  nos[1].click();
  assert.deepEqual(checks(), [['dari-1-sheen', 50]]);
});

test('a wrong value shows no answer: she looks again (C2.3, hints never answers)', async () => {
  state.cache(`key.${LESSON}.4821`, KEY);
  const { el } = await check([LESSON, '4821']);
  const inputs = el.all((n) => n.tag === 'input');
  inputs[0].value = '2/6';                               // wrong
  button(el, 'main')[0].click();
  const shown = el.textContent;
  assert.ok(!shown.includes('3/4') && !shown.includes('۳/۴'), shown);
  assert.equal(el.all((n) => n.className === 'fix').length, 1);
});

test('"Do it on screen" shows the intro and example, and trace items as "on paper"', async () => {
  state.cache(`key.${LESSON}.4821`, { ...KEY, intro: 'Add the tops', example: { text: 'Like this:', math: '1/4+2/4=3/4' } });
  const { el, tab } = await check([LESSON, '4821', 'screen']);
  assert.equal(tab, 'sheets');
  assert.equal(el.all((n) => n.className.includes('sheet-intro')).length, 1);
  assert.equal(el.all((n) => n.className === 'check-row paper').length, 1);   // row 5, the trace
  const plain = await check([LESSON, '4821']);
  assert.equal(plain.el.all((n) => n.className.includes('sheet-intro')).length, 0);
  assert.equal(plain.el.all((n) => n.className === 'check-row paper').length, 0);
});

test('readings from a photo are typed in for her and marked on the phone', async () => {
  state.cache(`key.${LESSON}.4821`, KEY);
  const { el, fill } = await check([LESSON, '4821']);
  fill([{ n: 1, read: '3/4' }, { n: 2, read: '?' }, { n: 3, read: '2/5' }]);
  const inputs = el.all((n) => n.tag === 'input');
  assert.deepEqual(inputs.map((i) => i.value), ['3/4', '', '2/5']);
  assert.deepEqual(checks(), [[LESSON, 50]]);
});
