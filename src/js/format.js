// Display formatting. Pure functions, no clock reads.

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function compact(n) {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  const f = (v, s) => {
    const t = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t) + s;
  };
  if (a >= 1e12) return f(n / 1e12, 'T');
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e3) return f(n / 1e3, 'K');
  return n.toFixed(a >= 100 ? 0 : 2);
}

export const usdCompact = (n) => (isNum(n) ? `$${compact(n)}` : '—');

export function price(n) {
  if (!isNum(n) || n <= 0) return '—';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  const exp = Math.floor(Math.log10(n));
  if (exp < -10) return `$${n.toExponential(2)}`;
  const zeros = -exp - 1;
  const digits = n.toFixed(zeros + 4).slice(2);
  return `$0.${digits}`;
}

export function pct(n) {
  if (!isNum(n)) return { text: '—', dir: 'flat' };
  const dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const a = Math.abs(n);
  const body = a >= 1000 ? compact(a) : a >= 100 ? a.toFixed(0) : a.toFixed(2);
  return { text: `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''} ${body}%`.trim(), dir };
}
