import { readRegisterFromDom, byId, isStated } from './register.js';
import { initReveal, initParallax, initSpotlight, initProgress } from './motion.js';
import { createBoard, copyText, toast } from './board.js';
import { createMarket } from './market.js';

const $ = (s, r = document) => r.querySelector(s);
const records = readRegisterFromDom();

// ---- status pill (no clocks, no timestamps) ----
const STATUS = { loading: 'Syncing', ok: 'Live', stale: 'Delayed', error: 'Offline', idle: 'Pending', paused: 'Paused' };
function setStatus(state) {
  const s = $('#status');
  s.dataset.state = state;
  $('#status-text').textContent = STATUS[state] || STATUS.idle;
}

// ---- contract slot: read the record at click time, never a cached copy ----
function initCA() {
  const btn = $('#ca-copy');
  if (!btn) return;
  let t = 0;
  btn.addEventListener('click', async () => {
    const rec = byId(readRegisterFromDom(), 'ca');
    if (!isStated(rec) || !rec.value) return;
    const ok = await copyText(rec.value);
    const slot = $('#ca');
    if (!ok) { toast('Copy was blocked'); return; }
    slot.classList.add('is-copied');
    btn.querySelector('.ca-copy-text').textContent = 'Copied';
    $('#ca-announce').textContent = 'Contract address copied';
    clearTimeout(t);
    t = setTimeout(() => {
      slot.classList.remove('is-copied');
      btn.querySelector('.ca-copy-text').textContent = 'Copy';
      $('#ca-announce').textContent = '';
    }, 1600);
  });
}

// ---- active section in the pill nav ----
function initNavSpy() {
  const links = [...document.querySelectorAll('.pillnav a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const a = map.get(e.target.id);
      if (!a) continue;
      links.forEach((l) => l.removeAttribute('aria-current'));
      a.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  for (const id of map.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}

function initMarket() {
  const rec = byId(records, 'market-source');
  const board = createBoard();
  if (!isStated(rec) || !rec.endpoints) {
    setStatus('idle');
    board.showError('The market feed is pending.');
    return;
  }
  const market = createMarket({
    endpoints: rec.endpoints,
    onData: (items) => { board.clearError(); board.update(items); },
    onStatus: (state, info) => {
      setStatus(state === 'loading' && info.hasData ? 'ok' : state);
      if (state === 'error') board.showError('The market feed did not answer. Retrying shortly.');
    },
  });
  $('#retry').addEventListener('click', () => { board.clearError(); setStatus('loading'); market.refresh(); });
  market.start();
}

initProgress($('#progress'));
initReveal();
initParallax($('.hero'));
initSpotlight();
initCA();
initNavSpy();
initMarket();
