// Reading a child's typed answer (۳/۴, 3/4, ۰٫۷۵, "1 1/2") and comparing it by value, as a fraction.

const DIGITS = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9,
  '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };

export function latin(text) {
  return String(text ?? '').replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d]).replace(/٫/g, '.').replace(/[÷⁄∕]/g, '/')
    .replace(/[−–]/g, '-');
}

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };

// {n, d} in lowest terms with d > 0, or null if the text is not a number
export function parse(text) {
  const t = latin(text).trim().replace(/\s+/g, ' ');
  let m;
  if ((m = t.match(/^(-?)(\d+) (\d+) ?\/ ?(\d+)$/))) {          // mixed number: 1 1/2
    const d = +m[4];
    if (!d) return null;
    return reduce((m[1] ? -1 : 1) * (+m[2] * d + +m[3]), d);
  }
  if ((m = t.match(/^(-?\d+) ?\/ ?(-?\d+)$/))) {
    const d = +m[2];
    return d ? reduce(+m[1], d) : null;
  }
  if ((m = t.match(/^(-?)(\d*)\.(\d+)$/)) || (m = t.match(/^(-?)(\d+)$/))) {
    const whole = m[2] || '0', frac = m[3] || '';
    const d = 10 ** frac.length;
    return reduce((m[1] ? -1 : 1) * (+whole * d + (+frac || 0)), d);
  }
  return null;
}

function reduce(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function same(a, b) {
  const x = typeof a === 'string' ? parse(a) : a, y = typeof b === 'string' ? parse(b) : b;
  return !!x && !!y && x.n * y.d === y.n * x.d;
}

// true if the text is a fraction that could be smaller (2/4 rather than 1/2)
export function notSimplest(text) {
  const m = latin(text).trim().match(/^(-?\d+) ?\/ ?(\d+)$/);
  return !!m && gcd(+m[1], +m[2]) > 1;
}

export function show({ n, d }) {
  return d === 1 ? String(n) : `${n}/${d}`;
}
