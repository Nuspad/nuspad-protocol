// Asset pipeline: premultiplied logo resizes, banner, favicon traced from the real pixel grid.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const LOGO = 'brand/LOGO NUSPAD PNG...png'; // colourtype 6, 86% pure-black transparent
export const BANNER = 'reference/SAMPUL NUSPAD JPG.jpg.jpeg';

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export function readTokens(root) {
  const css = fs.readFileSync(path.join(root, 'src/tokens.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

export async function loadLogo(root) {
  const { data, info } = await sharp(path.join(root, LOGO)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const pad = Math.round(side * 0.06);
  const S = side + pad * 2;
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  const left = Math.max(0, Math.min(W - S, cx - Math.floor(S / 2)));
  const top = Math.max(0, Math.min(H - S, cy - Math.floor(S / 2)));
  const crop = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) data.copy(crop, y * S * 4, ((top + y) * W + left) * 4, ((top + y) * W + left + S) * 4);
  return { crop, S, bbox: { x0, y0, x1, y1 }, left, top };
}

// Premultiplied resize: colour planes are multiplied by alpha, resized as plain 3-band and 1-band
// images, then divided by the resized alpha. Pure-black RGB under alpha 0 can never bleed into edges.
export async function premulResize(crop, S, size) {
  const n = S * S;
  const rgb = Buffer.alloc(n * 3), a = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const al = crop[i * 4 + 3];
    a[i] = al;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round((crop[i * 4 + c] * al) / 255);
  }
  const k = { kernel: 'linear' };
  // sharp expands a 1-band raw plane to 3 bands on output, so read through the reported channel count
  const R = await sharp(rgb, { raw: { width: S, height: S, channels: 3 } }).resize(size, size, k).raw().toBuffer({ resolveWithObject: true });
  const A = await sharp(a, { raw: { width: S, height: S, channels: 1 } }).resize(size, size, k).raw().toBuffer({ resolveWithObject: true });
  const rr = R.data, ra = A.data, rc = R.info.channels, ac = A.info.channels;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const al = ra[i * ac];
    out[i * 4 + 3] = al;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = al ? Math.min(255, Math.round((rr[i * rc + c] * 255) / al)) : 0;
  }
  return out;
}



function traceFavicon(crop, S) {
  const N = 32, B = S / N;
  const cells = [];
  for (let cy = 0; cy < N; cy++) {
    cells.push([]);
    for (let cx = 0; cx < N; cx++) {
      const xs = Math.floor(cx * B), xe = Math.floor((cx + 1) * B), ys = Math.floor(cy * B), ye = Math.floor((cy + 1) * B);
      let sa = 0, sr = 0, sg = 0, sb = 0, cnt = 0;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
        const i = (y * S + x) * 4, al = crop[i + 3];
        sa += al; sr += crop[i] * al; sg += crop[i + 1] * al; sb += crop[i + 2] * al; cnt++;
      }
      const cov = sa / (255 * cnt);
      if (cov < 0.3 || sa === 0) { cells[cy].push(null); continue; }
      const avg = [sr / sa, sg / sa, sb / sa];
      let best = null, bd = 1e12;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
        const i = (y * S + x) * 4;
        if (crop[i + 3] < 250) continue;
        const d = (crop[i] - avg[0]) ** 2 + (crop[i + 1] - avg[1]) ** 2 + (crop[i + 2] - avg[2]) ** 2;
        if (d < bd) { bd = d; best = hex(crop[i], crop[i + 1], crop[i + 2]); }
      }
      if (!best) { cells[cy].push(null); continue; }
      cells[cy].push({ hex: best, op: cov >= 0.9 ? 1 : Math.round(cov * 20) / 20 });
    }
  }
  const groups = new Map();
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = cells[y][x];
      if (!c) { x++; continue; }
      let e = x + 1;
      while (e < N && cells[y][e] && cells[y][e].hex === c.hex && cells[y][e].op === c.op) e++;
      const key = c.hex + '|' + c.op;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(`M${x} ${y}h${e - x}v1H${x}z`);
      x = e;
    }
  }
  let body = '';
  for (const [key, segs] of groups) {
    const [h, op] = key.split('|');
    body += `<path fill="${h}"${op === '1' ? '' : ` fill-opacity="${op}"`} d="${segs.join('')}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">${body}</svg>\n`;
}

export async function buildAssets(root, dist, log = console.log) {
  const tokens = readTokens(root);
  const { crop, S, bbox } = await loadLogo(root);
  fs.mkdirSync(path.join(dist, 'img'), { recursive: true });

  log(`  logo: glyph bbox ${bbox.x0},${bbox.y0}-${bbox.x1},${bbox.y1} cropped to ${S}px square; resized with colour planes premultiplied by alpha (source has pure-black transparent regions)`);

  const sizes = { 'logo-64.png': 64, 'logo-128.png': 128, 'logo-256.png': 256, 'logo-512.png': 512 };
  for (const [name, size] of Object.entries(sizes)) {
    const buf = await premulResize(crop, S, size);
    await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(dist, 'img', name));
  }
  // icons on the brand background
  const bg = tokens['c-bg'];
  const bgRGB = { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16) };
  for (const [name, size, inner] of [['apple-touch-icon.png', 180, 140], ['icon-192.png', 192, 150], ['icon-512.png', 512, 400]]) {
    const buf = await premulResize(crop, S, inner);
    const fg = await sharp(buf, { raw: { width: inner, height: inner, channels: 4 } }).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 3, background: bgRGB } })
      .composite([{ input: fg, gravity: 'centre' }]).png({ compressionLevel: 9 }).toFile(path.join(dist, name));
  }
  // banner
  // the banner's two outer ribbons only; the centre holds a wordmark we do not want behind the hero copy
  await sharp(path.join(root, BANNER)).extract({ left: 0, top: 0, width: 520, height: 500 }).webp({ quality: 78 }).toFile(path.join(dist, 'img/ribbon-left.webp'));
  await sharp(path.join(root, BANNER)).extract({ left: 980, top: 0, width: 520, height: 500 }).webp({ quality: 78 }).toFile(path.join(dist, 'img/ribbon-right.webp'));
  // social card 1200x630: banner on brand background
  const ban = await sharp(path.join(root, BANNER)).resize(1200, 400).jpeg({ quality: 88 }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: bgRGB } })
    .composite([{ input: ban, top: 115, left: 0 }]).jpeg({ quality: 86 }).toFile(path.join(dist, 'og.jpg'));
  // favicon traced from the real pixel grid
  const svg = traceFavicon(crop, S);
  if (/--/.test(svg)) throw new Error('favicon contains a double hyphen');
  fs.writeFileSync(path.join(dist, 'favicon.svg'), svg);
  log(`  favicon.svg: ${svg.length} bytes, 32x32 grid, ${(svg.match(/<path/g) || []).length} colour groups`);
}
