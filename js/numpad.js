// The big number pad (family records, growth): big keys, each says its number; "OK" reads the whole number back,
// with its unit (ui.num.* clips: 0 to 99, the hundreds, "point", kilos, centimetres, days). No typing on the
// phone's small keyboard, no speech-to-text.
// field(name, opts) draws a number field: a big button that opens the pad, and a speaker that says the label, then
// the number. get(name) / set(name, value) read and change a field's value (null = empty).
import { numIds } from './family-data.js';

export function initNumpad(ctx) {
  const { esc, T, L, num, I, spk, play, dialog } = ctx;
  const V = {}, O = {}; // values and options per field name
  const dec = (s) => (ctx.S.lang === 'en' ? s : s.replace('.', '٫'));
  const show = (v) => (v == null || v === '' ? '–' : dec(num(String(v))));
  const unitText = (u) => (u ? T({ kg: 'kg', cm: 'cm', days: 'daysWord' }[u] || u) : '');
  const big = (id) => spk(id).replace('class="spk', 'class="spk big');
  const sayIds = (name) => { const o = O[name] || {}; return [o.say, ...(V[name] != null ? numIds(V[name], o.unit) : [])].filter(Boolean); };

  function field(name, o) {
    O[name] = o; if (o.value !== undefined) V[name] = o.value == null ? null : o.value;
    return `<div class="npf" data-block="${esc(o.say || '')}"><button type="button" class="npv" data-np="${esc(name)}"><small>${esc(o.label)}</small><span class="nv" dir="ltr"><b>${esc(show(V[name]))}</b><i>${esc(unitText(o.unit))}</i></span></button>`
      + `<button type="button" class="spk big" data-np-say="${esc(name)}" aria-label="${esc(T('listen'))}">${I.spk}</button></div>`;
  }
  const get = (name) => (V[name] == null ? null : V[name]);
  function set(name, v) {
    V[name] = v == null || v === '' ? null : v;
    const b = document.querySelector(`[data-np="${name}"] b`); if (b) b.textContent = show(V[name]);
  }
  function open(name) {
    const o = O[name] || {}; let s = V[name] == null ? '' : String(V[name]);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', o.dec ? '.' : '', '0', 'del'];
    const w = dialog(`<div class="np" role="group"><h2>${esc(o.label)}</h2>`
      + `<div class="trow npl" data-block="ui.fam.np"><div class="body">${esc(L(ctx.S.book.narration['ui.fam.np']))}</div>${big('ui.fam.np')}</div>`
      + `<div class="npshow" dir="ltr"><b id="np-v">${esc(show(s))}</b><i>${esc(unitText(o.unit))}</i></div>`
      + `<div class="npkeys" dir="ltr">${keys.map((k) => (k ? `<button type="button" data-npk="${k}" aria-label="${k === 'del' ? '⌫' : k}">${k === 'del' ? '⌫' : k === '.' ? dec('.') : num(k)}</button>` : '<span></span>')).join('')}</div>`
      + `<div class="srowbig"><button type="button" class="sbig npok" data-npk="ok">${I.check}<span class="tx"><span class="t">${esc(T('npOk'))}</span></span></button>${big('ui.fam.np.ok')}</div>`
      + `<button type="button" class="btn ghost" data-close>${esc(T('cancel'))}</button></div>`, (wrap) => {
      wrap.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-npk]'); if (!b) return;
        const k = b.dataset.npk;
        if (k === 'ok') {
          const v = s === '' || s === '.' ? null : parseFloat(s);
          if (v != null && ((o.min != null && v < o.min) || (o.max != null && v > o.max))) { ctx.toast(T('badNumber')); return; }
          set(name, v); wrap.remove();
          if (v != null) play(numIds(v, o.unit), { quiet: true });
          if (o.onDone) o.onDone(v);
          return;
        }
        if (k === 'del') s = s.slice(0, -1);
        else if (k === '.') { if (!s.includes('.')) { s = (s || '0') + '.'; play(['ui.num.point'], { quiet: true }); } }
        else {
          const [ip, dp] = s.split('.');
          if (dp !== undefined ? dp.length >= (o.dec || 0) : ip.length >= (o.digits || 3)) return;
          s = s === '0' ? k : s + k;
          play(['ui.num.' + k], { quiet: true });
        }
        const el = wrap.querySelector('#np-v'); if (el) el.textContent = show(s);
      });
    });
    return w;
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-np]'); if (f) { e.preventDefault(); open(f.dataset.np); return; }
    const s = e.target.closest('[data-np-say]'); if (s) { e.preventDefault(); play(sayIds(s.dataset.npSay)); }
  });
  return { field, get, set, open };
}
