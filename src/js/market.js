// Market data layer. Follows the market-source register record only; knows nothing about the CA.
// Polls every 60s, pauses while the tab is hidden, backs off exponentially on failure and keeps
// the last good data when a refresh fails.

export const POLL_MS = 60000;
export const BACKOFF = { base: 2000, max: 60000, factor: 2, jitter: 0.2 };
const CHUNK = 30;
const TOP_N = 10;

export function backoffDelay(failures, rnd = Math.random) {
  const raw = Math.min(BACKOFF.max, BACKOFF.base * BACKOFF.factor ** Math.max(0, failures - 1));
  const j = 1 + (rnd() * 2 - 1) * BACKOFF.jitter;
  return Math.round(raw * j);
}

export function safeImage(u) {
  if (typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (x.hostname === 'dexscreener.com' || x.hostname.endsWith('.dexscreener.com')) ? x.href : null;
  } catch {
    return null;
  }
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function pickSolana(boosts) {
  if (!Array.isArray(boosts)) return [];
  const seen = new Set();
  const out = [];
  for (const b of boosts) {
    if (!b || b.chainId !== 'solana' || typeof b.tokenAddress !== 'string' || seen.has(b.tokenAddress)) continue;
    seen.add(b.tokenAddress);
    out.push(b);
  }
  return out;
}

// Group pairs by base token. Volume and liquidity are summed over every pool of the token;
// price, change and cap come from its deepest pool.
export function normalize(pairs, boosts) {
  const meta = new Map(boosts.map((b) => [b.tokenAddress, b]));
  const by = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const a = p && p.baseToken && p.baseToken.address;
    if (!a || !meta.has(a) || p.chainId !== 'solana') continue;
    if (!by.has(a)) by.set(a, []);
    by.get(a).push(p);
  }
  const items = [];
  for (const [address, list] of by) {
    const deepest = list.reduce((m, p) => ((num(p.liquidity && p.liquidity.usd) || 0) > (num(m.liquidity && m.liquidity.usd) || 0) ? p : m), list[0]);
    const b = meta.get(address);
    const sum = (f) => list.reduce((s, p) => s + (num(f(p)) || 0), 0);
    let img = safeImage(list.map((p) => p.info && p.info.imageUrl).find(Boolean));
    if (!img && b.icon) img = safeImage(/^https?:/.test(b.icon) ? b.icon : `https://cdn.dexscreener.com/cms/images/${encodeURIComponent(b.icon)}?width=256&height=256&quality=90&format=auto`);
    const pairUrl = typeof deepest.url === 'string' && /^https:\/\/dexscreener\.com\//.test(deepest.url) ? deepest.url : null;
    items.push({
      address,
      name: String(deepest.baseToken.name || deepest.baseToken.symbol || address).slice(0, 48),
      symbol: String(deepest.baseToken.symbol || '').slice(0, 16),
      img,
      price: num(deepest.priceUsd),
      change: num(deepest.priceChange && deepest.priceChange.h24),
      vol: sum((p) => p.volume && p.volume.h24),
      liq: sum((p) => p.liquidity && p.liquidity.usd),
      cap: num(deepest.marketCap) ?? num(deepest.fdv),
      quote: deepest.quoteToken && deepest.quoteToken.symbol ? String(deepest.quoteToken.symbol).slice(0, 12) : '',
      pairUrl,
    });
  }
  return items.sort((a, b) => b.vol - a.vol).slice(0, TOP_N);
}

async function getJson(fetchFn, url, signal, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetchFn(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function loadOnce(endpoints, fetchFn, signal) {
  const boosts = pickSolana(await getJson(fetchFn, endpoints.boosts, signal));
  if (!boosts.length) throw new Error('no solana entries');
  const addrs = boosts.map((b) => b.tokenAddress);
  const chunks = [];
  for (let i = 0; i < addrs.length; i += CHUNK) chunks.push(addrs.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => getJson(fetchFn, endpoints.pairs + c.map(encodeURIComponent).join(','), signal)));
  const items = normalize(results.flat(), boosts);
  if (!items.length) throw new Error('no pairs');
  return items;
}

// Scheduler. `onStatus(state, {hasData})` with state in loading|ok|stale|error.
export function createMarket({ endpoints, fetchFn = (u, o) => fetch(u, o), onData, onStatus, doc = typeof document !== 'undefined' ? document : null }) {
  let timer = 0, ctl = null, failures = 0, hasData = false, started = false, inflight = false;

  const clear = () => { clearTimeout(timer); timer = 0; };
  const schedule = (ms) => { clear(); timer = setTimeout(tick, ms); };

  async function tick() {
    if (inflight) return;
    if (doc && doc.hidden) return;
    inflight = true;
    ctl = new AbortController();
    onStatus && onStatus('loading', { hasData });
    try {
      const items = await loadOnce(endpoints, fetchFn, ctl.signal);
      failures = 0; hasData = true;
      onData(items);
      onStatus && onStatus('ok', { hasData });
      inflight = false;
      schedule(POLL_MS);
    } catch (err) {
      inflight = false;
      if (ctl && ctl.signal.aborted && doc && doc.hidden) return; // paused on purpose
      failures += 1;
      onStatus && onStatus(hasData ? 'stale' : 'error', { hasData, error: err });
      schedule(backoffDelay(failures));
    }
  }

  function onVisibility() {
    if (!started) return;
    if (doc.hidden) {
      clear();
      if (ctl) ctl.abort();
      inflight = false;
      onStatus && onStatus('paused', { hasData });
    } else {
      failures = 0;
      clear();
      tick();
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      if (doc) doc.addEventListener('visibilitychange', onVisibility);
      if (!doc || !doc.hidden) tick();
      else onStatus && onStatus('paused', { hasData });
    },
    refresh() { failures = 0; clear(); inflight = false; tick(); },
    stop() { started = false; clear(); if (ctl) ctl.abort(); if (doc) doc.removeEventListener('visibilitychange', onVisibility); },
    get failures() { return failures; },
  };
}
