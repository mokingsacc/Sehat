// The keypad for "Fix" on "What I read" (C2.2): digits in her script, the fraction bar, a space for a mixed number
// (1 1/4), delete, Done. It opens over the screen and answers with what she typed (Latin digits, as numbers.js
// reads them), or null when she closes it.

import { fa, s } from './i18n.js';
import { latin } from './numbers.js';
import { h, icon, said } from './ui.js';

export function keypad(start = '') {
  return new Promise((resolve) => {
    let v = latin(start === '?' ? '' : start);
    const shown = h('output', { class: 'kp-value', dir: 'ltr', 'aria-live': 'polite' });
    const draw = () => { shown.textContent = v ? fa(v) : ' '; };
    const done = (out) => { sheet.remove(); document.removeEventListener('keydown', onKey); resolve(out); };
    const put = (k) => { if (v.length < 12) { v += k; draw(); } };
    const key = (label, k, cls = '') => h('button', { type: 'button', class: 'kp-key ' + cls, onClick: () => put(k) }, label);
    const onKey = (e) => {
      if (/^[0-9۰-۹/ ]$/.test(e.key)) put(latin(e.key));
      else if (e.key === 'Backspace') { v = v.slice(0, -1); draw(); } else if (e.key === 'Enter') done(v.trim());
      else if (e.key === 'Escape') done(null);
    };
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(fa(d), d));
    const sheet = h('div', { class: 'kp-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': s('fix'),
      onClick: (e) => { if (e.target === sheet) done(null); } },
    h('div', { class: 'kp card' },
      h('div', { class: 'row between' }, shown,
        h('button', { type: 'button', class: 'round', 'aria-label': s('close'), onClick: () => done(null) }, icon('x', 22, 2.5))),
      h('div', { class: 'kp-grid', dir: 'ltr' }, ...digits,
        key('/', '/', 'op'), key(fa('0'), '0'), key('␣', ' ', 'op'),
        h('button', { type: 'button', class: 'kp-key op', 'aria-label': s('delete'), onClick: () => { v = v.slice(0, -1); draw(); } },
          icon('erase', 24))),
      said(h('button', { type: 'button', class: 'btn primary main', onClick: () => done(v.trim()) }, icon('check'), s('done')))));
    draw();
    document.addEventListener('keydown', onKey);
    document.body.append(sheet);
    sheet.querySelector('.kp-key').focus();
  });
}
