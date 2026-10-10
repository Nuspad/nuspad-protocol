// Board UI: rows, cards, feature, movers, ticker, tabs, filters. All market text goes in via textContent.
import { usdCompact, price, pct } from './format.js';
import { shortAddr } from './register.js';
import { setNumber, enterStagger, flip, reduced } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const ICON_COPY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_DONE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

const tileClass = (a) => ['tile-a', 'tile-b', 'tile-c', 'tile-d'][[...a].reduce((s, c) => s + c.charCodeAt(0), 0) % 4];

export function makeAvatar(item, cls = '') {
  const av = el('span', `av ${tileClass(item.address)} ${cls}`.trim());
  av.append(el('span', 'av-letter', (item.symbol || item.name || '?').trim().charAt(0) || '?'));
  if (item.img) {
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => { img.classList.add('ok'); const l = av.querySelector('.av-letter'); if (l) l.style.visibility = 'hidden'; });
    img.addEventListener('error', () => img.remove());
    img.src = item.img;
    av.append(img);
  }
  return av;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = el('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function toast(msg) {
  const host = $('#toasts');
  if (!host) return;
  const t = el('div', 'toast', msg);
  host.append(t);
  setTimeout(() => t.remove(), 1800);
}

function copyButton(item) {
  const b = el('button', 'cp press');
  b.type = 'button';
  b.setAttribute('aria-label', `Copy address for ${item.symbol || item.name}`);
  b.innerHTML = `<span class="ico-copy">${ICON_COPY}</span><span class="ico-done">${ICON_DONE}</span>`;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await copyText(item.address);
    if (!ok) { toast('Copy was blocked'); return; }
    b.classList.add('done');
    toast('Address copied');
    setTimeout(() => b.classList.remove('done'), 1400);
  });
  return b;
}

const SORTS = {
  flow: { filter: () => true, cmp: (a, b) => b.vol - a.vol },
  gain: { filter: (i) => (i.change ?? 0) > 0, cmp: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) },
  lose: { filter: (i) => (i.change ?? 0) < 0, cmp: (a, b) => (a.change ?? Infinity) - (b.change ?? Infinity) },
  depth: { filter: () => true, cmp: (a, b) => b.liq - a.liq },
  cap: { filter: () => true, cmp: (a, b) => (b.cap ?? -1) - (a.cap ?? -1) },
};

export function createBoard() {
  const body = $('#board-body'), rowsEl = $('#rows');
  const state = { items: [], sort: 'flow', q: '', quote: '', view: 'list', rows: new Map(), first: true, ticker: '' };

  // ---------- rows ----------
  function buildRow(item) {
    const row = el('article', 'row spot lift');
    row.dataset.addr = item.address;
    const head = el('div', 'r-head');
    const av = makeAvatar(item);
    const tok = el('div', 'c c-tok');
    const nm = el('b', 'nm', item.name);
    const meta = el('div', 'meta');
    meta.append(el('span', 'sy', item.symbol), el('span', 'ad', shortAddr(item.address)));
    tok.append(nm, meta);
    const cp = copyButton(item);
    head.append(av, tok, cp);
    const rp = el('div', 'r-price');
    const px = el('div', 'c c-px'); px.append(el('span', 'lbl', 'Price'), el('span', 'num-cell', '—'));
    const chg = el('div', 'c c-chg'); chg.append(el('span', 'lbl', '24h'), el('span', 'chg flat num-cell', '—'));
    rp.append(px, chg);
    const rs = el('div', 'r-stats');
    const mk = (cls, label) => { const c = el('div', `c ${cls}`); c.append(el('span', 'lbl', label), el('span', 'num-cell', '—')); return c; };
    const vol = mk('c-vol', 'Turnover'), liq = mk('c-liq', 'Depth'), cap = mk('c-cap', 'Cap');
    rs.append(vol, liq, cap);
    row.append(head, rp, rs);
    row._r = { nm, sy: meta.firstChild, px: px.lastChild, chg: chg.lastChild, vol: vol.lastChild, liq: liq.lastChild, cap: cap.lastChild };
    return row;
  }

  function paint(row, item) {
    const r = row._r;
    r.nm.textContent = item.name; r.sy.textContent = item.symbol;
    setNumber(r.px, item.price, price);
    const prevDir = r.chg.dataset.dir;
    const p = pct(item.change);
    if (prevDir !== p.dir) { r.chg.classList.remove('up', 'down', 'flat'); r.chg.classList.add(p.dir); r.chg.dataset.dir = p.dir; }
    setNumber(r.chg, item.change, (v) => pct(v).text);
    setNumber(r.vol, item.vol, usdCompact);
    setNumber(r.liq, item.liq, usdCompact);
    setNumber(r.cap, item.cap, usdCompact);
  }

  // ---------- derived views ----------
  function visible() {
    const s = SORTS[state.sort];
    const q = state.q.trim().toLowerCase();
    return state.items
      .filter(s.filter)
      .filter((i) => !state.quote || i.quote === state.quote)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q) || i.address.toLowerCase().includes(q))
      .sort(s.cmp);
  }

  function layout() {
    const list = visible();
    const order = list.map((i) => i.address);
    const empty = $('#board-empty');
    flip(rowsEl, () => {
      const keep = new Set(order);
      for (const [a, row] of state.rows) row.hidden = !keep.has(a);
      for (const a of order) rowsEl.append(state.rows.get(a));
    });
    empty.hidden = !(state.items.length && !list.length);
    $('#board-note').textContent = list.length
      ? `${list.length} ${list.length === 1 ? 'token' : 'tokens'} · ${({ flow: 'biggest 24h turnover first, pools summed', gain: 'strongest 24h climbers first', lose: 'deepest 24h drops first', depth: 'most pooled liquidity first', cap: 'highest valuation first' })[state.sort]}`
      : 'Nothing to rank for this filter.';
  }

  function counts() {
    const n = state.items.length;
    const c = {
      flow: n, depth: n,
      gain: state.items.filter(SORTS.gain.filter).length,
      lose: state.items.filter(SORTS.lose.filter).length,
      cap: state.items.filter((i) => i.cap != null).length,
    };
    for (const k in c) { const b = $(`[data-count="${k}"]`); if (b) b.textContent = String(c[k]); }
  }

  function chips() {
    const wrap = $('#chips');
    const quotes = [...new Set(state.items.map((i) => i.quote).filter(Boolean))];
    if (state.quote && !quotes.includes(state.quote)) state.quote = '';
    const sig = quotes.join('|') + '#' + state.quote;
    if (wrap.dataset.sig === sig) return;
    wrap.dataset.sig = sig;
    wrap.querySelectorAll('.chip').forEach((c) => c.remove());
    for (const q of ['', ...quotes]) {
      const b = el('button', 'chip press', q || 'All');
      b.type = 'button'; b.dataset.quote = q; b.setAttribute('aria-pressed', String(q === state.quote));
      wrap.append(b);
    }
  }

  // ---------- feature + movers + ticker ----------
  const fnum = (parent, label, key) => {
    const s = el('div', 'f-stat'); s.append(el('span', 'tile-label', label)); const v = el('strong', 'tile-value num', '—'); s.append(v); s._v = v; parent.append(s); return v;
  };
  function feature() {
    const top = [...state.items].sort((a, b) => b.vol - a.vol)[0];
    const host = $('#feature-body');
    if (!top) return;
    if (host.dataset.addr !== top.address) {
      host.dataset.addr = top.address;
      host.replaceChildren();
      const head = el('div', 'f-head');
      head.append(makeAvatar(top));
      const t = el('div'); t.style.minWidth = '0';
      t.append(el('h3', 'f-name', top.name));
      const sub = el('div', 'f-sub');
      sub.append(el('span', 'sy', top.symbol));
      const chip = el('button', 'addr-chip press'); chip.type = 'button';
      chip.setAttribute('aria-label', `Copy address for ${top.symbol || top.name}`);
      chip.append(el('span', '', shortAddr(top.address)));
      chip.insertAdjacentHTML('beforeend', ICON_COPY.replace('width="18" height="18"', 'width="14" height="14"'));
      chip.addEventListener('click', async () => { if (await copyText(top.address)) toast('Address copied'); });
      sub.append(chip); t.append(sub); head.append(t);
      const stats = el('div', 'f-stats');
      host._v = { cap: fnum(stats, 'Cap'), vol: fnum(stats, 'Turnover'), liq: fnum(stats, 'Depth') };
      host.append(head, stats);
      if (top.pairUrl) {
        const act = el('div', 'f-actions');
        const a = el('a', 'btn-brand press', 'Open pair'); a.href = top.pairUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', `Open ${top.symbol || top.name} pair, external link`);
        act.append(a); host.append(act);
      }
      if (!reduced()) enterStagger([head, stats], 80);
    }
    setNumber(host._v.cap, top.cap, usdCompact);
    setNumber(host._v.vol, top.vol, usdCompact);
    setNumber(host._v.liq, top.liq, usdCompact);
  }

  function movers() {
    const list = $('#movers-list');
    const top = [...state.items].filter((i) => i.change != null).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 6);
    const sig = top.map((i) => i.address).join('|');
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig;
      list.replaceChildren();
      const made = top.map((i) => {
        const li = el('li', 'm');
        const nm = el('div', 'm-nm'); nm.append(el('b', '', i.name), el('span', '', i.symbol));
        const c = el('span', 'chg flat num-cell', '—');
        li.append(makeAvatar(i), nm, c); li._c = c; li._a = i.address;
        list.append(li);
        return li;
      });
      if (!reduced()) enterStagger(made, 60);
    }
    for (const li of list.children) {
      const i = top.find((t) => t.address === li._a); if (!i) continue;
      const p = pct(i.change);
      li._c.classList.remove('up', 'down', 'flat'); li._c.classList.add(p.dir);
      setNumber(li._c, i.change, (v) => pct(v).text);
    }
  }

  function ticker() {
    const track = $('#ticker-track');
    const list = [...state.items].sort((a, b) => b.vol - a.vol);
    const sig = list.map((i) => i.address).join('|');
    if (state.ticker !== sig) {
      state.ticker = sig;
      track.replaceChildren();
      for (let copy = 0; copy < 2; copy++) {
        for (const i of list) {
          const t = el('span', 'tick'); t.dataset.addr = i.address;
          if (copy) t.setAttribute('aria-hidden', 'true');
          t.append(makeAvatar(i), el('span', 't-sym', i.symbol || i.name), el('span', 't-px num', '—'), el('span', 'chg flat num', '—'));
          track.append(t);
        }
      }
    }
    for (const t of track.children) {
      const i = list.find((x) => x.address === t.dataset.addr); if (!i) continue;
      t.querySelector('.t-px').textContent = price(i.price);
      const p = pct(i.change), c = t.querySelector('.chg');
      c.className = `chg ${p.dir} num`; c.textContent = p.text;
    }
  }

  function totals() {
    setNumber($('#total-vol'), state.items.reduce((s, i) => s + (i.vol || 0), 0), usdCompact);
  }

  // ---------- public ----------
  function update(items) {
    state.items = items;
    const fresh = [];
    for (const it of items) {
      let row = state.rows.get(it.address);
      if (!row) { row = buildRow(it); state.rows.set(it.address, row); rowsEl.append(row); fresh.push(row); }
      paint(row, it);
    }
    for (const [a, row] of state.rows) if (!items.some((i) => i.address === a)) { row.remove(); state.rows.delete(a); }
    chips(); counts(); layout(); feature(); movers(); ticker(); totals();
    if (state.first) {
      state.first = false;
      body.setAttribute('aria-busy', 'false');
      rowsEl.classList.add('is-ready');
      $('#board-error').hidden = true;
      setTimeout(() => rowsEl.querySelectorAll('.skel').forEach((s) => s.remove()), 260);
      enterStagger(fresh, 55);
    }
  }

  function showError(msg) {
    if (state.items.length) return;
    $('#board-error-text').textContent = msg;
    $('#board-error').hidden = false;
    rowsEl.hidden = true;
    body.setAttribute('aria-busy', 'false');
    $('#feature-body').replaceChildren(Object.assign(el('div', 'f-skel'), {}));
    const fb = $('#feature-body');
    fb.dataset.addr = '';
    const d = el('p', 'sub', '—'); fb.replaceChildren(d);
    $('#total-vol').textContent = '—';
    $('#movers-list').replaceChildren(el('li', 'm', '—'));
    $('#movers-list').dataset.sig = '';
  }
  function clearError() {
    $('#board-error').hidden = true;
    rowsEl.hidden = false;
  }

  // ---------- controls ----------
  const tabs = $('#tabs');
  const setSort = (k, focus) => {
    state.sort = k;
    tabs.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.sort === k; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    layout();
  };
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) setSort(t.dataset.sort); });
  tabs.addEventListener('keydown', (e) => {
    const all = [...tabs.querySelectorAll('.tab')];
    const i = all.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const to = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); setSort(all[to].dataset.sort, true); }
  });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; layout(); });
  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    state.quote = c.dataset.quote;
    $('#chips').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    $('#chips').dataset.sig = [...new Set(state.items.map((i) => i.quote).filter(Boolean))].join('|') + '#' + state.quote;
    layout();
  });
  document.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    body.dataset.view = state.view;
    document.querySelectorAll('.vbtn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  return { update, showError, clearError, get hasData() { return state.items.length > 0; } };
}
