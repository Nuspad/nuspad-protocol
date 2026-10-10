// Static page renderer. Output depends only on the register passed in.
import { byId, isStated, handleOf, hostOf, publicRecord } from './js/register.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  gh: 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z',
};
const stroke = (inner, extra = '') => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${inner}</svg>`;
export const ICON = {
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>'),
  copy: stroke('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  check: stroke('<path d="M20 6 9 17l-5-5"/>'),
  grid: stroke('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  list: stroke('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  out: stroke('<path d="M7 7h10v10M7 17 17 7"/>'),
  radio: stroke('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>'),
  compass: stroke('<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>'),
  layers: stroke('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>'),
  link: stroke('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  flag: stroke('<path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5"/>'),
  help: stroke('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>'),
  top: stroke('<path d="m5 12 7-7 7 7M12 19V5"/>'),
};
const xSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="${P.x}"/></svg>`;
const ghSvg = `<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="${P.gh}"/></svg>`;

const SOCIAL = { x: { name: 'X', svg: xSvg }, github: { name: 'GitHub', svg: ghSvg } };

// Social icon: stated record -> anchor with an href derived from the stored url; otherwise inert span, no href.
function socialIcon(rec, cls = '') {
  const meta = SOCIAL[rec.id];
  if (isStated(rec) && rec.url) {
    const h = handleOf(rec.url);
    const label = h ? `${meta.name}, ${h}` : meta.name;
    return `<a class="icon-btn press ${cls}" data-social="${rec.id}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} (external link)">${meta.svg}</a>`;
  }
  return `<span class="icon-btn is-inert ${cls}" data-social="${rec.id}" role="img" aria-label="${meta.name}, pending" title="${meta.name} · pending">${meta.svg}</span>`;
}

function inertChip(rec) {
  const meta = SOCIAL[rec.id];
  if (isStated(rec) && rec.url) {
    return `<a class="chip-link press" data-record="${rec.id}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer">${meta.svg}<span>${meta.name}</span><span class="chip-sub">@${esc(handleOf(rec.url))}</span></a>`;
  }
  return `<span class="chip-link is-inert" data-record="${rec.id}">${meta.svg}<span>${meta.name}</span><span class="pending">pending</span></span>`;
}

function skeletonRows(n) {
  return Array.from({ length: n }, (_, i) => `<div class="row skel" aria-hidden="true" style="--i:${i}"><span class="skeleton av"></span><span class="skel-lines"><span class="skeleton l1"></span><span class="skeleton l2"></span></span><span class="skeleton l3"></span><span class="skeleton l4"></span><span class="skeleton l5"></span></div>`).join('');
}

export function renderPage(reg, { cssFile = 'app.css', jsFile = 'js/main.js' } = {}) {
  const ca = byId(reg.records, 'ca');
  const x = byId(reg.records, 'x');
  const gh = byId(reg.records, 'github');
  const chain = byId(reg.records, 'chain');
  const rpc = byId(reg.records, 'rpc');
  const domain = byId(reg.records, 'domain');
  const mkt = byId(reg.records, 'market-source');

  const canonical = isStated(domain) ? domain.url.replace(/\/$/, '') + '/' : '';
  const title = 'Nuspad: Solana token radar';
  const desc = 'A fast, honest board of the busiest Solana tokens, rebuilt each minute from an open market feed.';
  const chainName = isStated(chain) ? chain.value : '';
  const rpcHost = isStated(rpc) ? hostOf(rpc.url) : '';
  const feedName = isStated(mkt) ? mkt.value : '';

  const caStated = isStated(ca) && !!ca.value;
  const caSlot = caStated
    ? `<div class="ca-main"><span class="ca-label">CA</span><code class="ca-value" id="ca-value" data-ca>${esc(ca.value)}</code></div>
        <button type="button" class="ca-copy press" id="ca-copy" aria-label="Copy contract address"><span class="ico-copy">${ICON.copy}</span><span class="ico-done">${ICON.check}</span><span class="ca-copy-text">Copy</span></button>`
    : `<div class="ca-main"><span class="ca-label">CA</span><span class="ca-pending">Contract address</span><span class="pending">pending</span></div>
        <button type="button" class="ca-copy press" id="ca-copy" disabled aria-disabled="true" aria-label="Copy contract address, pending"><span class="ico-copy">${ICON.copy}</span><span class="ca-copy-text">Copy</span></button>`;

  const reveal = (i) => `data-reveal style="--i:${i}"`;

  const navItems = [
    ['#market', 'Market'],
    ['#about', 'About'],
    ['#chain', 'Chain'],
    ['#roadmap', 'Roadmap'],
  ];

  const publicReg = { version: reg.version, records: reg.records.map(publicRecord) };

  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="__THEME__">
<meta name="color-scheme" content="dark">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="Nuspad">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(canonical)}og.jpg">` : '<meta property="og:image" content="og.jpg">'}
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preload" href="fonts/bricolage-grotesque-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-sans-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${cssFile}">
<script>document.documentElement.className='js'</script>
</head>
<body>
<a href="#main" class="skip">Jump to main</a>
<div class="progress" id="progress" aria-hidden="true"><span></span></div>
<div class="backdrop" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>

<header class="appbar" id="appbar">
  <div class="bar wrap">
    <a class="brand" href="#top" aria-label="Nuspad, top of page">
      <img src="img/logo-64.png" srcset="img/logo-64.png 1x, img/logo-128.png 2x" width="32" height="32" alt="" decoding="async">
      <span class="brand-text">Nus<span class="brand-accent">pad</span></span>
    </a>
    <nav class="pillnav" aria-label="Sections">
      <ul>${navItems.map(([h, l], i) => `<li><a href="${h}"${i === 0 ? ' aria-current="true"' : ''}>${l}</a></li>`).join('')}</ul>
    </nav>
    <div class="bar-right">
      <span class="status" id="status" data-state="loading" role="status" aria-live="polite"><span class="dot live-dot" aria-hidden="true"></span><span class="status-text" id="status-text">Syncing</span></span>
      <div class="socials" role="group" aria-label="Social links">
        ${socialIcon(x)}
        ${socialIcon(gh)}
      </div>
    </div>
  </div>
  <div class="ca ${caStated ? 'is-live' : 'is-inert'}" id="ca" data-record="ca" data-state="${esc(ca.state)}">
    <div class="wrap ca-inner">
      ${caSlot}
    </div>
    <span class="sr-only" id="ca-announce" role="status" aria-live="polite"></span>
  </div>
</header>

<div class="ticker marquee-host" id="ticker" aria-label="Market ticker" role="region">
  <div class="ticker-track marquee" id="ticker-track"><span class="tick skel-tick"><span class="skeleton"></span></span><span class="tick skel-tick"><span class="skeleton"></span></span><span class="tick skel-tick"><span class="skeleton"></span></span><span class="tick skel-tick"><span class="skeleton"></span></span><span class="tick skel-tick"><span class="skeleton"></span></span><span class="tick skel-tick"><span class="skeleton"></span></span></div>
  <span class="ticker-src">${feedName ? `Data · ${esc(feedName)}` : 'Data · pending'}</span>
</div>

<main id="main" class="wrap main">
  <section class="hero" id="top" aria-labelledby="h1">
    <div class="hero-layers" aria-hidden="true">
      <div class="layer l-banner" data-depth="0.02"></div>
      <div class="layer l-mesh" data-depth="0.05"></div>
      <svg class="layer l-lines" data-depth="0.09" viewBox="0 0 1200 400" preserveAspectRatio="none" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M0 330 H1200"/><path d="M0 360 H1200" opacity=".5"/><path d="M0 380 H1200" opacity=".3"/><path d="M600 330 L600 400"/><path d="M420 330 L260 400"/><path d="M780 330 L940 400"/><path d="M240 330 L-60 400"/><path d="M960 330 L1260 400"/><path d="M0 80 L300 0"/><path d="M1200 80 L900 0"/></g></svg>
    </div>
    <div class="titlebar" ${reveal(0)}>
      <div class="titles">
        <h1 id="h1" class="h-page">Solana, tracked at full speed</h1>
        <p class="sub">A rolling board of the busiest tokens on the chain, rebuilt every minute from an open market feed.</p>
      </div>
      <div class="vol-tile" id="vol-tile">
        <span class="tile-label">Turnover · 24h</span>
        <strong class="tile-value num" id="total-vol" data-num="0">—</strong>
      </div>
    </div>
    <div class="hero-grid">
      <article class="feature surface-feature spot" id="feature" ${reveal(1)} aria-live="polite">
        <div class="feature-eyebrow"><span class="spark"></span><span id="f-eyebrow">Heaviest flow right now</span></div>
        <div class="feature-body" id="feature-body">
          <div class="f-skel" aria-hidden="true"><span class="skeleton s1"></span><span class="skeleton s2"></span><span class="skeleton s3"></span><span class="skeleton s4"></span></div>
        </div>
      </article>
      <aside class="panel movers spot" id="movers" ${reveal(2)} aria-labelledby="movers-h">
        <header class="panel-head">
          <h2 id="movers-h" class="panel-title">${ICON.radio}<span>Biggest swings</span></h2>
          <span class="mini-live"><span class="dot live-dot" aria-hidden="true"></span>Live</span>
        </header>
        <ol class="movers-list" id="movers-list">
          ${Array.from({ length: 6 }, () => '<li class="m-skel" aria-hidden="true"><span class="skeleton av"></span><span class="skeleton l1"></span><span class="skeleton l2"></span></li>').join('')}
        </ol>
      </aside>
    </div>
  </section>

  <section class="board" id="market" aria-labelledby="board-h">
    <h2 id="board-h" class="sr-only">Token board</h2>
    <div class="board-top">
      <div class="tabs" role="tablist" aria-label="Ranking" id="tabs">
        <button class="tab press" role="tab" id="tab-flow" aria-selected="true" data-sort="flow" type="button">Flow<span class="count" data-count="flow">—</span></button>
        <button class="tab press" role="tab" id="tab-gain" aria-selected="false" data-sort="gain" type="button" tabindex="-1">Gainers<span class="count" data-count="gain">—</span></button>
        <button class="tab press" role="tab" id="tab-lose" aria-selected="false" data-sort="lose" type="button" tabindex="-1">Decliners<span class="count" data-count="lose">—</span></button>
        <button class="tab press" role="tab" id="tab-depth" aria-selected="false" data-sort="depth" type="button" tabindex="-1">Depth<span class="count" data-count="depth">—</span></button>
        <button class="tab press" role="tab" id="tab-cap" aria-selected="false" data-sort="cap" type="button" tabindex="-1">Valuation<span class="count" data-count="cap">—</span></button>
      </div>
    </div>
    <div class="tools">
      <label class="search"><span class="sr-only">Filter tokens</span>${ICON.search}<input id="q" type="search" placeholder="Name, symbol or address" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
      <div class="view" role="group" aria-label="Layout">
        <button type="button" class="vbtn press" data-view="grid" aria-pressed="false" aria-label="Card layout">${ICON.grid}</button>
        <button type="button" class="vbtn press" data-view="list" aria-pressed="true" aria-label="Row layout">${ICON.list}</button>
      </div>
    </div>
    <div class="chips" id="chips" role="group" aria-label="Quote filter"><span class="chips-label">Quote</span><button type="button" class="chip press" data-quote="" aria-pressed="true">All</button></div>
    <p class="board-note" id="board-note">Biggest 24h turnover first, pools summed.</p>
    <div class="board-body" id="board-body" data-view="list" aria-busy="true">
      <div class="head-row" aria-hidden="true"><span></span><span>Token</span><span>Price</span><span>24h</span><span>Turnover</span><span>Depth</span><span>Cap</span><span></span></div>
      <div class="rows" id="rows">${skeletonRows(10)}</div>
      <div class="board-error" id="board-error" hidden role="alert"><strong>—</strong><span id="board-error-text">The market feed did not answer.</span><button type="button" class="btn-ghost press" id="retry">Try again</button></div>
      <p class="board-empty" id="board-empty" hidden>No token matches that filter.</p>
    </div>
  </section>

  <section class="sect" id="about" aria-labelledby="about-h">
    <header class="sect-head" ${reveal(0)}><p class="eyebrow">What it does</p><h2 id="about-h" class="h-title">One board. Zero tab hopping.</h2><p class="lead">Nuspad folds scattered launch chatter into a single readable surface, so momentum is visible at a glance.</p></header>
    <div class="cards4" data-stagger>
      ${[
        [ICON.radio, 'Always on', 'Prices, swings, flow and depth for the ten hottest Solana names, rebuilt every minute while you watch.'],
        [ICON.layers, 'Quiet in the background', 'Polling stops the moment the tab leaves the screen and fires again the instant you return.'],
        [ICON.flag, 'Honest by default', 'Anything unconfirmed stays visibly pending. No dead links, no invented figures.'],
        [ICON.compass, 'Built for thumbs', 'Every control is a comfortable tap target, from a compact phone to a wide monitor.'],
      ].map(([ic, t, d], i) => `<article class="card spot" ${reveal(i)}><span class="card-ic">${ic}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}
    </div>
  </section>

  <section class="sect" id="how" aria-labelledby="how-h">
    <header class="sect-head" ${reveal(0)}><p class="eyebrow">The loop</p><h2 id="how-h" class="h-title">From raw feed to ranked board</h2></header>
    <ol class="steps" data-stagger>
      ${[
        ['Gather', 'Nuspad pulls the most promoted Solana tokens from an open market feed.'],
        ['Enrich', 'Each token is paired with its pools to get price, swing, flow and depth.'],
        ['Rank', 'The ten with the heaviest 24h flow take the board, and you can re-sort or filter them.'],
        ['Repeat', 'A fresh pass runs each minute. If the feed stumbles, earlier good numbers stay put.'],
      ].map(([t, d], i) => `<li class="step spot" ${reveal(i)}><span class="step-n">0${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}
    </ol>
  </section>

  <section class="sect" id="chain" aria-labelledby="chain-h">
    <header class="sect-head" ${reveal(0)}><p class="eyebrow">Facts on file</p><h2 id="chain-h" class="h-title">Network and contract</h2><p class="lead">Each item below is either confirmed or marked pending. Nothing in between.</p></header>
    <div class="facts panel spot" ${reveal(1)}>
      <dl class="fact-list">
        <div class="fact" data-record="chain"><dt>${esc(chain.label)}</dt><dd>${chainName ? esc(chainName) : '<span class="pending">pending</span>'}</dd></div>
        <div class="fact" data-record="rpc"><dt>${esc(rpc.label)}</dt><dd>${rpcHost ? `<code>${esc(rpcHost)}</code>` : '<span class="pending">pending</span>'}</dd></div>
        <div class="fact" data-record="market-source"><dt>${esc(mkt.label)}</dt><dd>${feedName ? esc(feedName) : '<span class="pending">pending</span>'}</dd></div>
        <div class="fact" data-record="ca" data-state="${esc(ca.state)}"><dt>${esc(ca.label)}</dt><dd>${caStated ? `<code class="break">${esc(ca.value)}</code>` : '<span class="pending">pending</span>'}</dd></div>
        <div class="fact" data-record="x" data-state="${esc(x.state)}"><dt>${esc(x.label)}</dt><dd>${isStated(x) && x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">@${esc(handleOf(x.url))}</a>` : '<span class="pending">pending</span>'}</dd></div>
        <div class="fact" data-record="github" data-state="${esc(gh.state)}"><dt>${esc(gh.label)}</dt><dd>${isStated(gh) && gh.url ? `<a href="${esc(gh.url)}" target="_blank" rel="noopener noreferrer">${esc(handleOf(gh.url))}</a>` : '<span class="pending">pending</span>'}</dd></div>
      </dl>
    </div>
  </section>

  <section class="sect" id="roadmap" aria-labelledby="road-h">
    <header class="sect-head" ${reveal(0)}><p class="eyebrow">Direction</p><h2 id="road-h" class="h-title">Four stages, one thread</h2></header>
    <ol class="road" data-stagger>
      ${[
        ['Radar', 'Live board', 'Ranked tokens, ticker, swings and depth, refreshed on a steady beat.'],
        ['Depth', 'Next', 'Per-token detail, saved watchlists and richer filters.'],
        ['Launch', 'Planned', 'Tooling for creators to put a fresh token on the board.'],
        ['Network', 'Planned', 'Community tools, shared lists and open integrations.'],
      ].map(([t, s, d], i) => `<li class="stage spot${i === 0 ? ' is-now' : ''}" ${reveal(i)}><span class="stage-badge">${s}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}
    </ol>
  </section>

  <section class="sect" id="faq" aria-labelledby="faq-h">
    <header class="sect-head" ${reveal(0)}><p class="eyebrow">Questions</p><h2 id="faq-h" class="h-title">Straight answers</h2></header>
    <div class="faq" data-stagger>
      ${[
        ['What feeds the numbers?', 'Directly from the open market feed named in the ticker. Nuspad adds nothing and rounds only for display.'],
        ['Why is the contract address pending?', 'It has not been confirmed yet. The slot at the top of the page stays inactive until a confirmed address is on file, then it lights up and copies in one tap.'],
        ['Why does a figure sometimes show a dash?', 'A dash means the feed did not answer or did not include that field. When a refresh fails, earlier good figures stay visible.'],
        ['Is this advice?', 'No. Nuspad is an information surface. Tokens are volatile, so verify everything before acting.'],
      ].map(([q, a], i) => `<details class="qa spot" ${reveal(i)}><summary><span>${q}</span><span class="qa-plus" aria-hidden="true"></span></summary><div class="qa-body"><p>${a}</p></div></details>`).join('')}
    </div>
  </section>
</main>

<footer class="foot wrap">
  <span class="foot-chain"><span class="dot live-dot" aria-hidden="true"></span><strong>${chainName ? esc(chainName) : 'Chain'}</strong>${rpcHost ? `<span class="subtle">via ${esc(rpcHost)}</span>` : ''}</span>
  <span class="foot-note subtle">Information only. Tokens swing hard and nothing here is advice.</span>
  <div class="foot-links">
    ${inertChip(x)}
    ${inertChip(gh)}
    <a class="foot-top press" href="#top">${ICON.top}<span>Back to top</span></a>
  </div>
</footer>

<nav class="tabbar" aria-label="Sections, compact">
  <ul>
    <li><a href="#about">${ICON.compass}<span>About</span></a></li>
    <li><a href="#chain">${ICON.link}<span>Chain</span></a></li>
    <li class="mid"><a class="btn-brand press" href="#market" aria-label="Market board">${ICON.radio}</a></li>
    <li><a href="#roadmap">${ICON.flag}<span>Roadmap</span></a></li>
    <li><a href="#faq">${ICON.help}<span>FAQ</span></a></li>
  </ul>
</nav>
<div class="toast-host" id="toasts" role="status" aria-live="polite"></div>

<script type="application/json" id="register-data">${JSON.stringify(publicReg).replace(/</g, '\\u003c')}</script>
<script type="module" src="${jsFile}"></script>
</body>
</html>
`;
}
