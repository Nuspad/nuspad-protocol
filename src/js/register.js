// Register helpers, shared by the build (node) and the page (browser).
// Rule: a record is stated, absent or unconfirmed. Only a stated record may carry a value or url.

export const STATES = ['stated', 'absent', 'unconfirmed'];

export const isStated = (r) => !!r && r.state === 'stated';

export const byId = (records, id) => records.find((r) => r.id === id) || null;

// Link rule: the URL is the stored fact, the handle is derived from it.
export function handleOf(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg || '';
  } catch {
    return '';
  }
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// Dates stay in register.json as data. The page never receives them.
export function publicRecord(r) {
  const rest = { ...r };
  for (const k of Object.keys(rest)) if (/At$/.test(k)) delete rest[k];
  if (rest.state !== 'stated') {
    delete rest.value;
    delete rest.url;
    delete rest.endpoints;
  }
  return rest;
}

export function shortAddr(a) {
  return a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '';
}

export function readRegisterFromDom(doc = document) {
  const el = doc.getElementById('register-data');
  if (!el) return [];
  try {
    return JSON.parse(el.textContent).records || [];
  } catch {
    return [];
  }
}
