// Motion layer: damped-spring solver, scroll reveal, hero parallax, count-up with flash,
// spotlight tracking and the scroll progress bar. Every path has an instant fallback.

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!(mq && mq.matches);

// ---- shared integrator ----
const live = new Set();
let raf = 0;
let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  for (const s of [...live]) if (s.step(dt)) live.delete(s);
  raf = live.size ? requestAnimationFrame(frame) : 0;
}
function run(s) {
  live.add(s);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

// Damped spring: m*x'' = -k*(x - to) - c*x'. Semi-implicit Euler at a fixed 240 Hz sub-step.
export function spring({ from = 0, to = 1, stiffness = 170, damping = 22, mass = 1, precision = 0.0005, onUpdate, onDone }) {
  if (reduced()) { onUpdate && onUpdate(to); onDone && onDone(); return { stop() {} }; }
  let x = from, v = 0, stopped = false;
  const h = 1 / 240;
  const s = {
    step(dt) {
      if (stopped) return true;
      let n = Math.max(1, Math.round(dt / h));
      while (n--) {
        const a = (-stiffness * (x - to) - damping * v) / mass;
        v += a * h;
        x += v * h;
      }
      const done = Math.abs(v) < precision && Math.abs(x - to) < precision;
      if (done) x = to;
      onUpdate && onUpdate(x);
      if (done) { stopped = true; onDone && onDone(); }
      return done;
    },
  };
  run(s);
  return { stop() { stopped = true; live.delete(s); } };
}

// ---- scroll reveal with staggered springs ----
export function initReveal(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]')];
  const finish = (el) => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('revealed'); };
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(finish); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const i = Number(el.style.getPropertyValue('--i')) || 0;
      setTimeout(() => {
        spring({
          from: 0, to: 1, stiffness: 170, damping: 17,
          onUpdate: (p) => { el.style.opacity = String(Math.max(0, Math.min(1, p * 1.15))); el.style.transform = `translate3d(0, ${(1 - p) * 28}px, 0)`; },
          onDone: () => finish(el),
        });
      }, i * 70);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

// Entrance for freshly created nodes (market rows). Staggered spring, no layout reads.
export function enterStagger(nodes, step = 55) {
  nodes.forEach((el, i) => {
    if (reduced()) return;
    el.style.opacity = '0';
    el.style.transform = 'translate3d(0, 18px, 0)';
    setTimeout(() => spring({
      from: 0, to: 1, stiffness: 200, damping: 20,
      onUpdate: (p) => { el.style.opacity = String(Math.max(0, Math.min(1, p * 1.2))); el.style.transform = `translate3d(0, ${(1 - p) * 18}px, 0)`; },
      onDone: () => { el.style.opacity = ''; el.style.transform = ''; },
    }), i * step);
  });
}

// ---- parallax: pointer + scroll, each layer chases its target on a spring ----
export function initParallax(hero) {
  if (!hero || reduced()) return;
  const layers = [...hero.querySelectorAll('[data-depth]')].map((el) => ({ el, d: Number(el.dataset.depth) || 0, x: 0, y: 0, vx: 0, vy: 0 }));
  if (!layers.length) return;
  let px = 0, py = 0, sy = 0, running = false;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const driver = {
    step(dt) {
      let moving = false;
      for (const L of layers) {
        const tx = px * L.d * 90, ty = py * L.d * 60 - sy * L.d * 0.9;
        let n = Math.max(1, Math.round(dt * 240));
        while (n--) {
          L.vx += (-120 * (L.x - tx) - 18 * L.vx) / 240;
          L.vy += (-120 * (L.y - ty) - 18 * L.vy) / 240;
          L.x += L.vx / 240; L.y += L.vy / 240;
        }
        if (Math.abs(L.vx) > 0.01 || Math.abs(L.vy) > 0.01 || Math.abs(L.x - tx) > 0.05 || Math.abs(L.y - ty) > 0.05) moving = true;
        L.el.style.setProperty('--tx', `${L.x.toFixed(2)}px`);
        L.el.style.setProperty('--ty', `${L.y.toFixed(2)}px`);
      }
      if (!moving) running = false;
      return !moving;
    },
  };
  const kick = () => { if (!running) { running = true; run(driver); } };
  if (fine) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { px = 0; py = 0; kick(); }, { passive: true });
  }
  addEventListener('scroll', () => { sy = Math.min(scrollY, 900); kick(); }, { passive: true });
}

// ---- numbers: count up on first value, flash + count on change ----
export function setNumber(el, value, fmt, { onFlash } = {}) {
  const prev = el._v;
  el._v = value;
  if (el._sp) el._sp.stop();
  const ok = typeof value === 'number' && Number.isFinite(value);
  if (!ok) { el.textContent = '—'; return; }
  if (reduced()) { el.textContent = fmt(value); return; }
  const from = typeof prev === 'number' && Number.isFinite(prev) ? prev : 0;
  if (from === value) { el.textContent = fmt(value); return; }
  if (typeof prev === 'number') flash(el, value > prev ? 'up' : 'down');
  el._sp = spring({
    from, to: value, stiffness: 120, damping: 24, precision: Math.max(Math.abs(value) * 1e-6, 1e-12),
    onUpdate: (v) => { el.textContent = fmt(v); },
    onDone: () => { el.textContent = fmt(value); },
  });
  onFlash && onFlash();
}
export function flash(el, dir) {
  if (reduced()) return;
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
  el.addEventListener('animationend', () => el.classList.remove('flash-up', 'flash-down'), { once: true });
}

// ---- FLIP reorder for the board ----
export function flip(container, mutate) {
  const kids = [...container.children];
  const before = new Map(kids.map((k) => [k, k.getBoundingClientRect().top]));
  mutate();
  if (reduced() || typeof Element.prototype.animate !== 'function') return;
  for (const k of container.children) {
    const t0 = before.get(k);
    if (t0 === undefined) continue;
    const dy = t0 - k.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    k.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }
}

// ---- pointer spotlight ----
export function initSpotlight() {
  if (reduced()) return;
  let target = null, ex = 0, ey = 0, pending = false;
  addEventListener('pointermove', (e) => {
    const t = e.target.closest ? e.target.closest('.spot') : null;
    if (!t) return;
    target = t; ex = e.clientX; ey = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${ex - r.left}px`);
      target.style.setProperty('--my', `${ey - r.top}px`);
    });
  }, { passive: true });
}

// ---- scroll progress ----
export function initProgress(el) {
  if (!el) return;
  let pending = false;
  const upd = () => {
    pending = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    el.style.setProperty('--p', max > 0 ? String(Math.min(1, Math.max(0, scrollY / max))) : '0');
  };
  addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd, { passive: true });
  upd();
}
