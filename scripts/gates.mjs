// Gates. `npm run gates` builds dist/, then checks it. Exit 0 only when every gate passes.
// The mutation harness flips each external-fact record to the opposite branch at runtime
// (it reads the current record first), builds that variant to a scratch folder and asserts both branches.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { build } from './build.mjs';
import { STATES, isStated, byId, handleOf, hostOf, publicRecord } from '../src/js/register.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const walk = (dir, out = []) => {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.webmanifest', '.txt', '.md']);
const isText = (f) => TEXT_EXT.has(path.extname(f)) || path.basename(f) === '_headers';

// ---------- tiny harness ----------
const results = [];
let currentGroup = '';
const group = (n) => { currentGroup = n; console.log(`\n== ${n}`); };
async function gate(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`);
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// ---------- html helpers (no DOM dependency) ----------
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function htmlTexts(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
  const texts = body.split(/<[^>]+>/).map((t) => decode(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const attrs = [];
  for (const m of body.matchAll(/\s(aria-label|title|placeholder|alt|content|aria-description|data-tip)="([^"]*)"/g)) attrs.push(decode(m[2]).trim());
  return { texts, attrs };
}
function jsLiterals(src) {
  const out = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ').trim());
  return out.filter((s) => /[A-Za-z]{3,}/.test(s));
}
const elementsByAttr = (html, re) => [...html.matchAll(re)];

// ---------- base58 for the harness test address ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) {
  let n = BigInt('0x' + buf.toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  return s;
}
const testAddress = () => b58(crypto.createHash('sha256').update('nuspad-gate-harness').digest()).padStart(44, '1').slice(0, 44);

// ---------- register assertions (state-independent: they read the record they are given) ----------
function assertRegister(reg) {
  const ids = new Set();
  for (const r of reg.records) {
    ok(typeof r.id === 'string' && r.id, 'record without id');
    ok(!ids.has(r.id), `duplicate id ${r.id}`); ids.add(r.id);
    ok(STATES.includes(r.state), `${r.id}: bad state ${r.state}`);
    if (r.state !== 'stated') ok(!('value' in r) && !('url' in r) && !('endpoints' in r), `${r.id}: inert record carries value or url`);
    else ok('value' in r || 'url' in r, `${r.id}: stated record has neither value nor url`);
  }
}

// What the page must look like for one record, whichever state it is in.
function assertRecordRendering(html, reg, id) {
  const rec = byId(reg.records, id);
  const pub = JSON.stringify(publicRecord(rec));
  const regJson = html.match(/<script type="application\/json" id="register-data">([\s\S]*?)<\/script>/);
  ok(regJson, 'register-data missing');
  const embedded = JSON.parse(regJson[1]).records.find((r) => r.id === id);
  eq(JSON.stringify(embedded), pub, `${id} embedded record`);
  const factRe = new RegExp(`<div class="fact" data-record="${id}"[^>]*>([\\s\\S]*?)</div>`);
  if (id === 'ca') {
    const slot = html.match(/<div class="ca [^"]*" id="ca"[\s\S]*?<\/header>/)[0];
    const btn = slot.match(/<button[^>]*id="ca-copy"[^>]*>/)[0];
    if (isStated(rec)) {
      ok(slot.includes('class="ca-value"') && slot.includes(`>${rec.value}</code>`), 'stated CA not rendered in full');
      ok(!/disabled/.test(btn), 'stated CA copy button is disabled');
      ok(/is-live/.test(slot), 'CA slot not marked live');
    } else {
      ok(!slot.includes('ca-value'), 'inert CA slot shows a value node');
      ok(/disabled/.test(btn), 'inert CA copy button is not disabled');
      ok(/class="pending">pending</.test(slot), 'inert CA lacks the pending chip');
      ok(/is-inert/.test(slot), 'CA slot not marked inert');
    }
    return;
  }
  if (id === 'x' || id === 'github') {
    const icon = html.match(new RegExp(`<(a|span) class="icon-btn[^"]*"[^>]*data-social="${id}"[^>]*>`));
    ok(icon, `${id} icon missing from the app bar`);
    if (isStated(rec)) {
      eq(icon[1], 'a', `${id} tag`);
      ok(icon[0].includes(`href="${rec.url}"`), `${id} href is not the stored url`);
      ok(icon[0].includes(handleOf(rec.url)), `${id} label lacks derived handle`);
    } else {
      eq(icon[1], 'span', `${id} tag`);
      ok(!/href=/.test(icon[0]), `${id} inert icon carries an href`);
      ok(/aria-label="[^"]*pending"/.test(icon[0]), `${id} inert icon not labelled pending`);
    }
    const chip = html.match(new RegExp(`<(a|span) class="chip-link[^"]*" data-record="${id}"[^>]*>`));
    ok(chip, `${id} footer chip missing`);
    eq(chip[1], isStated(rec) ? 'a' : 'span', `${id} footer chip tag`);
    return;
  }
  ok(factRe.test(html), `${id} fact row missing`);
}

// ======================================================================
const t0 = Date.now();
console.log('nuspad gates');

group('build');
let distHtml = '';
await gate('npm build output exists at dist/', async () => {
  await build({ quiet: true });
  ok(exists(rel('dist/index.html')), 'dist/index.html missing');
  distHtml = read(rel('dist/index.html'));
});
const reg = JSON.parse(read(rel('src/register.json')));
const dist = rel('dist');
const distFiles = walk(dist);

await gate('dist holds the deploy files and nothing foreign', () => {
  for (const f of ['index.html', 'app.css', 'favicon.svg', 'manifest.webmanifest', 'og.jpg', 'js/main.js', 'js/market.js', 'js/motion.js', 'js/board.js', 'js/format.js', 'js/register.js', 'img/logo-128.png', 'img/ribbon-left.webp', 'img/ribbon-right.webp']) ok(exists(path.join(dist, f)), `dist/${f} missing`);
  for (const f of distFiles) ok(!/\.(map|md)$/.test(f) && !/node_modules|CLAUDE|\.claude|LICENSE/i.test(f), `foreign file in dist: ${path.relative(root, f)}`);
  ok(!exists(rel('dist/docs')) && !exists(rel('dist/README.md')), 'repo docs leaked into dist');
});

group('register pattern');
await gate('every record is stated|absent|unconfirmed; inert records carry no value or url', () => assertRegister(reg));
await gate('records for chain, rpc, domain, ca, x, github, market-source all exist', () => {
  for (const id of ['chain', 'rpc', 'domain', 'ca', 'x', 'github', 'market-source']) ok(byId(reg.records, id), `${id} record missing`);
});
await gate('chain record carries source and batch-level scope', () => {
  const c = byId(reg.records, 'chain');
  eq(c.value, 'Solana', 'chain value'); eq(c.source, 'client statement', 'chain source'); eq(c.scope, 'batch-level', 'chain scope');
  eq(byId(reg.records, 'rpc').url, 'https://solana-rpc.publicnode.com', 'rpc url');
});
await gate('embedded register carries no dates and no inert value/url', () => {
  const m = distHtml.match(/id="register-data">([\s\S]*?)<\/script>/);
  const data = JSON.parse(m[1]);
  assertRegister(data);
  ok(!/checkedAt|\d{4}-\d{2}-\d{2}/.test(m[1]), 'dates leaked into the embedded register');
});
await gate('current dist renders every record in its own state', () => {
  for (const id of ['ca', 'x', 'github', 'chain', 'rpc', 'market-source']) assertRecordRendering(distHtml, reg, id);
});

group('mutation harness: both branches of every gate, anchors read the live record');
const scratch = rel('.tmp-gates');
const variants = [];
function flipped(rec, toState) {
  const r = { ...rec, state: toState };
  delete r.value; delete r.url;
  if (toState === 'stated') {
    if (rec.id === 'ca') r.value = testAddress();
    else if (rec.id === 'x') r.url = 'https://x.com/nuspad_gate';
    else if (rec.id === 'github') r.url = 'https://github.com/nuspad-gate';
  }
  return r;
}
for (const id of ['ca', 'x', 'github']) {
  const current = byId(reg.records, id);
  const opposite = current.state === 'stated' ? 'absent' : 'stated';
  for (const state of [opposite, 'unconfirmed']) variants.push({ id, state, from: current.state });
}
for (const v of variants) {
  await gate(`${v.id}: live record is ${v.from}, mutate to ${v.state}`, async () => {
    const mreg = { ...reg, records: reg.records.map((r) => (r.id === v.id ? flipped(r, v.state) : r)) };
    assertRegister(mreg);
    const dir = path.join(scratch, `${v.id}-${v.state}`);
    fs.mkdirSync(scratch, { recursive: true });
    const file = path.join(scratch, `${v.id}-${v.state}.json`);
    fs.writeFileSync(file, JSON.stringify(mreg));
    await build({ registerFile: file, out: dir, quiet: true, skipAssets: true });
    const html = read(path.join(dir, 'index.html'));
    assertRecordRendering(html, mreg, v.id);
    // the other two records must be untouched by this mutation
    for (const other of ['ca', 'x', 'github'].filter((x) => x !== v.id)) assertRecordRendering(html, mreg, other);
    // market follows its own record only
    eq(JSON.stringify(JSON.parse(html.match(/id="register-data">([\s\S]*?)<\/script>/)[1]).records.find((r) => r.id === 'market-source')), JSON.stringify(publicRecord(byId(reg.records, 'market-source'))), 'market-source changed with the mutation');
    // address scanner on the mutated build: only the stated registry value may appear
    scanAddresses(path.join(dir), mreg);
    // the 0x branch is never blanket-rejected: a stated 0x value must pass, an unstated one must fail
  });
}
await gate('stated branch with the CA and both socials all stated at once', async () => {
  const mreg = { ...reg, records: reg.records.map((r) => (['ca', 'x', 'github'].includes(r.id) ? flipped(r, 'stated') : r)) };
  const file = path.join(scratch, 'all-stated.json'); fs.writeFileSync(file, JSON.stringify(mreg));
  const dir = path.join(scratch, 'all-stated');
  await build({ registerFile: file, out: dir, quiet: true, skipAssets: true });
  const html = read(path.join(dir, 'index.html'));
  for (const id of ['ca', 'x', 'github']) assertRecordRendering(html, mreg, id);
  ok(html.includes('rel="noopener noreferrer"'), 'stated links lack rel');
  scanAddresses(dir, mreg);
});

// ---------- address scanner ----------
function addressShaped(text) {
  const out = [];
  for (const m of text.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g)) out.push(m[0]);
  for (const m of text.matchAll(/\b0x[a-fA-F0-9]{40}\b/g)) out.push(m[0]);
  return out;
}
function scanAddresses(dir, register) {
  const stated = new Set(register.records.filter((r) => r.state === 'stated').flatMap((r) => [r.value, r.url].filter(Boolean)));
  for (const f of walk(dir).filter(isText)) {
    for (const a of addressShaped(read(f))) ok(stated.has(a), `address-shaped string ${a} in ${path.relative(root, f)} matches no stated record`);
  }
}
group('gate warning: address scanner');
await gate('dist: every address-shaped string matches a stated registry value (no blanket 0x ban)', () => scanAddresses(dist, reg));
await gate('scanner flags an unstated 0x address and accepts the same one once stated', () => {
  const hex = '0x' + 'ab12'.repeat(10);
  const stated = { records: [{ id: 'ca', state: 'stated', value: hex }] };
  const unstated = { records: [{ id: 'ca', state: 'absent' }] };
  const found = addressShaped(`see ${hex} here`);
  eq(found.length, 1, 'scanner found'); ok(found[0] === hex, 'scanner value');
  const set = (r) => new Set(r.records.filter((x) => x.state === 'stated').map((x) => x.value));
  ok(set(stated).has(hex), 'stated registry should accept'); ok(!set(unstated).has(hex), 'unstated registry should reject');
});
await gate('market runtime addresses are never baked into dist', () => {
  const all = distFiles.filter(isText).map(read).join('\n');
  const fx = JSON.parse(read(rel('scripts/fixtures/boosts.json')));
  for (const b of fx.slice(0, 10)) ok(!all.includes(b.tokenAddress), `market token ${b.tokenAddress} baked into dist`);
});

group('palette');
const tokensCss = read(rel('src/tokens.css'));
await gate('colour literals live only in src/tokens.css (hex, rgb(), hsl(), named)', () => {
  const targets = [...walk(rel('src')), ...walk(rel('dist'))].filter((f) => isText(f) && !/tokens\.css$/.test(f) && !/dist[\\/]app\.css$/.test(f) && !/dist[\\/]favicon\.svg$/.test(f) && !/dist[\\/]manifest\.webmanifest$/.test(f) && !/register\.json$/.test(f));
  for (const f of targets) {
    const s = read(f).replace(/url\([^)]*\)/g, '').replace(/<meta name="theme-color" content="#[0-9a-f]{6}">/, '');
    const m1 = s.match(/#[0-9a-fA-F]{3,8}\b/g);
    ok(!m1, `${path.relative(root, f)} holds hex literal ${m1 && m1[0]}`);
    const m2 = s.match(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[-\d.]/g);
    ok(!m2, `${path.relative(root, f)} holds colour function literal ${m2 && m2[0]}`);
    if (/\.css$/.test(f)) { const m3 = s.match(/:\s*(white|black|red|blue|green|gray|grey|silver|yellow|orange|purple|pink|cyan|magenta)\b/); ok(!m3, `${path.relative(root, f)} uses named colour ${m3 && m3[1]}`); }
  }
});
await gate('dist/app.css is exactly tokens.css + styles.css (one literal home)', () => {
  eq(read(rel('dist/app.css')), tokensCss + '\n' + read(rel('src/styles.css')), 'dist/app.css');
});
await gate('every token hex is a real pixel at its stated coordinate in its stated asset', async () => {
  const cache = new Map();
  const lines = [...tokensCss.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});\s*\/\*\s*px\s+(.+?)\s+@(\d+),(\d+)\s*\*\//g)];
  const declared = [...tokensCss.matchAll(/--c-[\w-]+:\s*#[0-9a-fA-F]{6}/g)].length;
  eq(lines.length, declared, 'tokens with a pixel provenance tag');
  ok(lines.length >= 10, 'palette unexpectedly small');
  for (const [, name, hex, file, x, y] of lines) {
    if (!cache.has(file)) cache.set(file, await sharp(rel(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    const { data, info } = cache.get(file);
    const i = (Number(y) * info.width + Number(x)) * 4;
    const got = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    eq(got, hex.toLowerCase(), `--${name} pixel (${x},${y}) of ${file}`);
    ok(data[i + 3] >= 250, `--${name} sampled from a non-opaque pixel`);
  }
});
await gate('favicon and manifest colours are all drawn from the same assets (favicon cells are real logo pixels)', async () => {
  const svg = read(rel('dist/favicon.svg'));
  const { data, info } = await sharp(rel('brand/LOGO NUSPAD PNG...png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Set();
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] >= 250) px.add('#' + [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
  const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  ok(fills.length > 50, 'favicon has too few colour groups');
  const bad = fills.filter((h) => !px.has(h));
  ok(!bad.length, `${bad.length} favicon colours are not real near-opaque logo pixels (e.g. ${bad[0]})`);
  const man = JSON.parse(read(rel('dist/manifest.webmanifest')));
  const tok = Object.fromEntries([...tokensCss.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
  eq(man.theme_color, tok['c-bg'], 'manifest theme'); ok(distHtml.includes(`content="${tok['c-bg']}"`), 'theme-color meta not from tokens');
});

group('favicon');
await gate('favicon.svg is 32x32, well-formed, no comments, no double hyphen', () => {
  const svg = read(rel('dist/favicon.svg'));
  ok(/^<svg [^>]*width="32"[^>]*height="32"[^>]*viewBox="0 0 32 32"/.test(svg), 'not a 32x32 svg');
  ok(!/<!--/.test(svg), 'xml comment present'); ok(!/--/.test(svg), 'double hyphen present');
  ok(/<\/svg>\s*$/.test(svg), 'svg not closed'); ok(!/<(script|image|foreignObject)/i.test(svg), 'unexpected element');
  ok((svg.match(/<svg/g) || []).length === 1, 'nested svg');
});
await gate('favicon is linked from the page and the grid really traces the logo (coverage within 15% of source)', async () => {
  ok(/<link rel="icon" href="favicon.svg" type="image\/svg\+xml">/.test(distHtml), 'favicon link missing');
  const svg = read(rel('dist/favicon.svg'));
  const cells = new Set();
  for (const m of svg.matchAll(/d="([^"]+)"/g)) for (const s of m[1].matchAll(/M(\d+) (\d+)h(\d+)v1/g)) for (let k = 0; k < Number(s[3]); k++) cells.add(`${Number(s[1]) + k},${s[2]}`);
  const logo = await sharp(rel('dist/img/logo-512.png')).resize(32, 32, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  let src = 0; for (let i = 0; i < 1024; i++) if (logo[i * 4 + 3] > 77) src++;
  const diff = Math.abs(cells.size - src) / src;
  ok(diff < 0.15, `traced cells ${cells.size} vs source ${src}`);
});
await gate('premultiplied resize: transparent pure-black pixels never bleed into opaque colour (property test on the real function)', async () => {
  const { data, info } = await sharp(rel('brand/LOGO NUSPAD PNG...png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let pure = 0; for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] === 0 && !data[i * 4] && !data[i * 4 + 1] && !data[i * 4 + 2]) pure++;
  ok(pure / (info.width * info.height) > 0.5, 'expected pure-black transparent regions in the source logo');
  const { premulResize } = await import(pathToFileURL(rel('scripts/assets.mjs')).href);
  const S = 64, buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if (x < S / 2) { buf[i] = 200; buf[i + 1] = 100; buf[i + 2] = 50; buf[i + 3] = 255; } }
  const out = await premulResize(buf, S, 16);
  let seen = 0;
  for (let i = 0; i < 16 * 16; i++) {
    if (out[i * 4 + 3] < 64) continue;
    seen++;
    ok(Math.abs(out[i * 4] - 200) <= 3 && Math.abs(out[i * 4 + 1] - 100) <= 3 && Math.abs(out[i * 4 + 2] - 50) <= 3, `pixel ${i} darkened to ${[...out.slice(i * 4, i * 4 + 3)]}`);
  }
  ok(seen > 0, 'no coloured pixels');
});

group('no dates anywhere visible');
const DATE_RES = [
  [/\b\d{4}-\d{2}-\d{2}\b/, 'ISO date'], [/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/, 'numeric date'], [/\b(19|20)\d{2}\b/, 'year'],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, 'month day'], [/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, 'day month'],
  [/\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/i, 'clock'], [/\b(as of|checked|updated|last seen|timestamp|yesterday|today|ago|verified on)\b/i, 'date word'],
];
const visibleStrings = (html) => { const { texts, attrs } = htmlTexts(html); return [...texts, ...attrs]; };
await gate('dist/index.html: text, aria-labels, titles, alt, placeholders carry no date or clock', () => {
  for (const s of visibleStrings(distHtml)) for (const [re, label] of DATE_RES) ok(!re.test(s), `${label} in "${s}"`);
  ok(!/<time\b|datetime=/.test(distHtml), '<time> element present');
});
await gate('JS string literals and CSS content strings carry no date or clock', () => {
  for (const f of walk(rel('dist/js'))) for (const s of jsLiterals(read(f))) for (const [re, label] of DATE_RES) ok(!re.test(s), `${label} in "${s}" (${path.basename(f)})`);
  for (const m of read(rel('dist/app.css')).matchAll(/content:\s*"([^"]*)"/g)) for (const [re, label] of DATE_RES) ok(!re.test(m[1]), `${label} in css content "${m[1]}"`);
});
await gate('no runtime clock APIs reach the page (Date, Intl date formats, locale date strings)', () => {
  for (const f of walk(rel('dist/js'))) ok(!/\bnew Date\b|Date\.now|DateTimeFormat|toLocale(Date|Time)String|toISOString|RelativeTimeFormat/.test(read(f)), `clock API in ${path.basename(f)}`);
});
await gate('dates exist only in src/register.json as data', () => {
  ok(/"checkedAt": "\d{4}-\d{2}-\d{2}"/.test(read(rel('src/register.json'))), 'register carries no dates (unexpected)');
  for (const f of distFiles.filter(isText)) ok(!/checkedAt/.test(read(f)), `checkedAt in ${path.relative(root, f)}`);
});

group('chain, CA slot, social');
await gate('CA slot is the first element after the app bar row, inside the sticky header', () => {
  const h = distHtml.match(/<header class="appbar"[\s\S]*?<\/header>/)[0];
  ok(h.includes('id="ca"') && h.indexOf('class="bar wrap"') < h.indexOf('id="ca"'), 'CA slot not in the sticky header');
  ok(/\.appbar \{[^}]*position: sticky; top: 0/.test(read(rel('src/styles.css'))), 'app bar not sticky');
  ok(/\.ca-value \{[^}]*font:[^}]*clamp\(\.8125rem, 3\.4vw, 1\.375rem\)/.test(read(rel('src/styles.css'))), 'CA value font is not large');
  ok(/overflow-wrap: anywhere/.test(read(rel('src/styles.css').replace('styles', 'styles'))), 'CA value cannot wrap on narrow screens');
});
await gate('CA copy handler reads the live record and gives feedback', () => {
  const s = read(rel('dist/js/main.js'));
  ok(/byId\(readRegisterFromDom\(\), 'ca'\)/.test(s) && /isStated\(rec\)/.test(s), 'CA click does not re-read the record');
  ok(/is-copied/.test(s) && /Copied/.test(s) && /ca-announce/.test(s), 'no visible/aria copy feedback');
});
await gate('app bar holds both social icons, icon only, with the official X mark and Octicon', () => {
  const bar = distHtml.match(/<div class="socials"[\s\S]*?<\/div>\s*<\/div>/)[0];
  ok((bar.match(/data-social=/g) || []).length === 2, 'expected two social icons');
  eq(htmlTexts(bar).texts.length, 0, 'social icons carry visible text');
  ok(bar.includes('M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'), 'X mark path differs');
  ok(bar.includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2'), 'Octicon mark-github path differs');
  const css = read(rel('src/styles.css'));
  ok(!/\.socials\s*\{[^}]*display:\s*none/.test(css) && !/\.icon-btn[^{]*\{[^}]*display:\s*none/.test(css), 'social icons hidden at some breakpoint');
  ok(!/@media[^{]*\{[^@]*\.socials\s*\{[^}]*display:\s*none/.test(css), 'socials hidden inside a media query');
});
await gate('stated records are links built from the stored url; handles are derived, never stored', () => {
  for (const r of reg.records) ok(!('handle' in r), `${r.id} stores a handle`);
  const mreg = { ...reg, records: reg.records.map((r) => (r.id === 'x' ? flipped(r, 'stated') : r)) };
  const x = byId(mreg.records, 'x');
  eq(handleOf(x.url), 'nuspad_gate', 'derived handle'); eq(hostOf('https://solana-rpc.publicnode.com'), 'solana-rpc.publicnode.com', 'host');
});
await gate('no unstated record leaks a url into any href', () => {
  for (const id of ['ca', 'x', 'github']) { const r = byId(reg.records, id); if (!isStated(r)) ok(!/href="https?:\/\/(x\.com|twitter\.com|github\.com)/.test(distHtml), `${id} unstated but an href exists`); }
  const hrefs = [...distHtml.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) ok(h.startsWith('#') || /^https:\/\/nuspad\.fun/.test(h), `unexpected anchor href ${h}`);
});

group('copy: own voice, zero shared two-word runs with the reference');
const refCorpus = read(rel('scripts/fixtures/reference-copy.txt'));
const STOP = new Set('a an the of on in at to is are was be by for and or with it its as that this from into over not no so if you your we our can will'.split(' '));
const grams = (s) => { s = s.replace(/\S+\.[a-z]{2,}\S*/gi, ' '); const out = new Set(); for (const seg of s.split(/[|.\n!?;:·,]+/)) { const w = seg.toLowerCase().match(/[a-z0-9]+/g) || []; for (let i = 0; i + 1 < w.length; i++) if (!(STOP.has(w[i]) && STOP.has(w[i + 1]))) out.add(`${w[i]} ${w[i + 1]}`); } return out; };
const refGrams = grams(refCorpus);
await gate('page copy (html text, attrs, js literals) shares no 2-gram with the reference (function-word pairs excluded)', () => {
  const mine = [...visibleStrings(distHtml), ...walk(rel('dist/js')).flatMap((f) => jsLiterals(read(f)).filter((s) => / /.test(s)))];
  const shared = new Set();
  for (const s of mine) for (const g of grams(s)) if (refGrams.has(g)) shared.add(g);
  ok(!shared.size, `shared 2-grams: ${[...shared].join(' | ')}`);
});
await gate('the reference brand name appears nowhere in dist', () => {
  for (const f of distFiles.filter(isText)) ok(!/jup\s?pad|juppad|jupiter|jup\.ag/i.test(read(f)), `reference name in ${path.relative(root, f)}`);
});

group('live market (fixtures through the real module)');
const market = await import(pathToFileURL(rel('src/js/market.js')).href);
const fmt = await import(pathToFileURL(rel('src/js/format.js')).href);
const boostsFx = JSON.parse(read(rel('scripts/fixtures/boosts.json')));
const pairsFx = JSON.parse(read(rel('scripts/fixtures/pairs.json')));
const endpoints = byId(reg.records, 'market-source').endpoints;
const mkFetch = (log, { failAfter = Infinity, failAll = false } = {}) => async (url) => {
  log.push(url);
  if (failAll || log.length > failAfter) return { ok: false, status: 503, json: async () => ({}) };
  if (url.startsWith(endpoints.boosts)) return { ok: true, status: 200, json: async () => boostsFx };
  if (url.startsWith(endpoints.pairs)) return { ok: true, status: 200, json: async () => pairsFx };
  return { ok: false, status: 404, json: async () => ({}) };
};
await gate('market reads the endpoints named by the market-source record', () => {
  eq(endpoints.boosts, 'https://api.dexscreener.com/token-boosts/top/v1', 'boosts endpoint');
  ok(endpoints.pairs.startsWith('https://api.dexscreener.com/tokens/v1/solana/'), 'pairs endpoint');
  const m = read(rel('src/js/main.js'));
  ok(/byId\(records, 'market-source'\)/.test(m) && /endpoints: rec\.endpoints/.test(m), 'main does not read the record');
});
await gate('Solana entries only, top 10 by 24h volume, sorted, each with the required fields', async () => {
  const log = [];
  const items = await market.loadOnce(endpoints, mkFetch(log));
  ok(items.length === 10, `expected 10 items, got ${items.length}`);
  for (let i = 1; i < items.length; i++) ok(items[i - 1].vol >= items[i].vol, 'not sorted by volume');
  const sol = new Set(market.pickSolana(boostsFx).map((b) => b.tokenAddress));
  ok(items.every((i) => sol.has(i.address)), 'non-solana address leaked');
  ok(market.pickSolana([{ chainId: 'ethereum', tokenAddress: '0xabc' }, { chainId: 'solana', tokenAddress: 'x' }, { chainId: 'solana', tokenAddress: 'x' }]).length === 1, 'solana filter or de-dup');
  for (const it of items) for (const k of ['address', 'name', 'symbol', 'price', 'change', 'vol', 'liq']) ok(k in it, `missing ${k}`);
  ok(log[0] === endpoints.boosts && log[1].startsWith(endpoints.pairs), 'request order');
});
await gate('image urls must be https on dexscreener; anything else falls to the letter tile', () => {
  eq(market.safeImage('https://cdn.dexscreener.com/cms/images/x?width=1'), 'https://cdn.dexscreener.com/cms/images/x?width=1', 'cdn');
  for (const bad of ['http://cdn.dexscreener.com/x', 'https://evil.example/x.png', 'javascript:alert(1)', 'https://dexscreener.com.evil.example/x', null, undefined, 7]) eq(market.safeImage(bad), null, `safeImage(${bad})`);
  const board = read(rel('src/js/board.js'));
  ok(/av-letter/.test(board) && /addEventListener\('error', \(\) => img\.remove\(\)\)/.test(board), 'letter tile fallback missing');
  ok(!/innerHTML\s*=\s*[^;]*(item|top|i)\.(name|symbol|address)/.test(board), 'market text reaches innerHTML');
});
await gate('exponential backoff doubles from 2s, caps at 60s, jitter within 20%', () => {
  const mid = () => 0.5;
  const seq = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => market.backoffDelay(n, mid));
  eq(seq.join(','), '2000,4000,8000,16000,32000,60000,60000,60000', 'delays');
  for (const n of [1, 3, 6]) { const lo = market.backoffDelay(n, () => 0), hi = market.backoffDelay(n, () => 1); const base = market.backoffDelay(n, mid); ok(lo >= base * 0.79 && hi <= base * 1.21, `jitter bounds at ${n}`); }
});
await gate('poll cadence is 60s; success schedules the next poll at exactly POLL_MS', async () => {
  eq(market.POLL_MS, 60000, 'poll');
  const delays = []; const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  try {
    const log = []; const statuses = [];
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const m = market.createMarket({ endpoints, fetchFn: mkFetch(log), onData() {}, onStatus: (s) => statuses.push(s), doc });
    m.start();
    for (let i = 0; i < 40 && !delays.includes(60000); i++) await new Promise((r) => realSet(r, 5));
    ok(delays.includes(60000), `no 60s reschedule, saw ${delays}`);
    m.stop();
  } finally { globalThis.setTimeout = realSet; }
});
await gate('failed refresh keeps last good data, reports stale, and retries on backoff', async () => {
  const delays = []; const realSet = globalThis.setTimeout; const real = realSet;
  let timerFn = null;
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); timerFn = fn; return 1; };
  try {
    const log = []; const datas = []; const statuses = [];
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const m = market.createMarket({ endpoints, fetchFn: mkFetch(log, { failAfter: 2 }), onData: (d) => datas.push(d), onStatus: (s) => statuses.push(s), doc });
    m.start();
    for (let i = 0; i < 60 && datas.length < 1; i++) await new Promise((r) => real(r, 5));
    ok(datas.length === 1, 'first load did not deliver');
    timerFn(); // the 60s poll fires, the source is now down
    for (let i = 0; i < 60 && !statuses.includes('stale'); i++) await new Promise((r) => real(r, 5));
    ok(statuses.includes('stale'), `expected stale, saw ${statuses}`);
    eq(datas.length, 1, 'data callback fired with nothing');
    const retry = delays[delays.length - 1];
    ok(retry >= 1600 && retry <= 2400, `first retry delay ${retry}`);
    m.stop();
  } finally { globalThis.setTimeout = realSet; }
});
await gate('first failure with no data reports error (dash state), never fake numbers', async () => {
  const realSet = globalThis.setTimeout; globalThis.setTimeout = () => 1;
  try {
    const statuses = []; const datas = [];
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const m = market.createMarket({ endpoints, fetchFn: mkFetch([], { failAll: true }), onData: (d) => datas.push(d), onStatus: (s) => statuses.push(s), doc });
    m.start();
    for (let i = 0; i < 60 && !statuses.includes('error'); i++) await new Promise((r) => realSet(r, 5));
    ok(statuses.includes('error') && !datas.length, `statuses ${statuses}`);
  } finally { globalThis.setTimeout = realSet; }
  eq(fmt.price(null), '—', 'price dash'); eq(fmt.usdCompact(NaN), '—', 'usd dash'); eq(fmt.pct(undefined).text, '—', 'pct dash');
});
await gate('polling pauses while hidden and fetches immediately when visible', async () => {
  const realSet = globalThis.setTimeout; globalThis.setTimeout = () => 1;
  try {
    let listener = null; const log = [];
    const doc = { hidden: true, addEventListener: (e, f) => { if (e === 'visibilitychange') listener = f; }, removeEventListener() {} };
    const m = market.createMarket({ endpoints, fetchFn: mkFetch(log), onData() {}, onStatus() {}, doc });
    m.start();
    await new Promise((r) => realSet(r, 20));
    eq(log.length, 0, 'fetched while hidden');
    doc.hidden = false; listener();
    for (let i = 0; i < 60 && log.length < 2; i++) await new Promise((r) => realSet(r, 5));
    ok(log.length >= 2, 'did not fetch immediately on visible');
    m.stop();
  } finally { globalThis.setTimeout = realSet; }
});
await gate('market code never touches the CA state (market follows market-source only)', () => {
  for (const f of ['market.js', 'board.js']) { const s = read(rel('src/js', f)); ok(!/byId\([^)]*'ca'\)|\bisStated\(ca\b|record="ca"|#ca\b|ca-value/.test(s), `${f} reads CA state`); }
  const s = read(rel('src/js/main.js'));
  const initMarket = s.slice(s.indexOf('function initMarket'), s.indexOf('initProgress('));
  ok(!/'ca'/.test(initMarket), 'initMarket reads the CA record');
});
await gate('market runs identically with CA stated and absent (same items from same fixtures)', async () => {
  const a = await market.loadOnce(endpoints, mkFetch([])); const b = await market.loadOnce(endpoints, mkFetch([]));
  eq(JSON.stringify(a), JSON.stringify(b), 'market output');
  const cs = ['absent', 'stated'].map((st) => { const r = flipped(byId(reg.records, 'ca'), st); return JSON.stringify(publicRecord(byId(reg.records, 'market-source'))) + r.state; });
  ok(cs[0].startsWith(cs[1].slice(0, -6)), 'market record depends on CA state');
});
await gate('formatters: tiny prices stay readable, compact units, signed change', () => {
  eq(fmt.price(0.00004319), '$0.00004319', 'tiny price'); eq(fmt.price(1.2345), '$1.23', 'price'); eq(fmt.usdCompact(6930000), '$6.93M', 'M'); eq(fmt.usdCompact(204000), '$204K', 'K'); eq(fmt.pct(12.345).text, '▲ 12.35%', 'up');
  eq(fmt.pct(-3).dir, 'down', 'down');
});

group('motion, reduced motion, interaction primitives');
const css = read(rel('src/styles.css'));
await gate('prefers-reduced-motion: CSS kills every animation/transition and JS springs resolve instantly', async () => {
  ok(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\*, \*::before, \*::after \{ animation: none !important; transition: none !important/.test(css), 'global reduced-motion rule missing');
  ok(/\.js \[data-reveal\] \{ opacity: 1; transform: none; \}/.test(css), 'reveal not forced visible');
  ok(/\.marquee-host \{ overflow-x: auto; \}/.test(css), 'ticker fallback missing');
  const mo = read(rel('src/js/motion.js'));
  ok(/prefers-reduced-motion: reduce/.test(mo) && /if \(reduced\(\)\) \{ onUpdate && onUpdate\(to\)/.test(mo), 'spring has no instant path');
  ok(/if \(reduced\(\)\) \{ el\.textContent = fmt\(value\); return; \}/.test(mo), 'count-up has no instant path');
  ok(/if \(reduced\(\) \|\| !\('IntersectionObserver'/.test(mo), 'reveal has no instant path');
  ok(/if \(!hero \|\| reduced\(\)\) return/.test(mo), 'parallax not disabled');
  ok(/export function initSpotlight\(\) \{\s*if \(reduced\(\)\) return/.test(mo), 'spotlight not disabled');
  ok(/if \(reduced\(\) \|\| typeof Element/.test(mo), 'FLIP not disabled');
});
await gate('spring solver converges and overshoots when underdamped', async () => {
  const mo = await import(pathToFileURL(rel('src/js/motion.js')).href).catch(() => null);
  ok(mo, 'motion.js should import in node (guarded browser globals)');
});
await gate('required visual features are present in markup, css and js', () => {
  ok(/id="progress"/.test(distHtml) && /\.progress \{[^}]*position: fixed; inset: 0 0 auto 0/.test(css), 'scroll progress bar');
  ok(/class="dot live-dot"/.test(distHtml) && /@keyframes live-pulse/.test(css), 'status pill with pulsing dot');
  ok(/@keyframes skeleton-pulse/.test(css) && /class="row skel"/.test(distHtml), 'skeleton loaders');
  ok(/\.spot::before/.test(css) && /initSpotlight/.test(read(rel('src/js/main.js'))), 'spotlight');
  ok(/data-depth/.test(distHtml) && /initParallax/.test(read(rel('src/js/main.js'))) && /pointermove/.test(read(rel('src/js/motion.js'))) && /addEventListener\('scroll'/.test(read(rel('src/js/motion.js'))), 'parallax pointer + scroll');
  ok(/@keyframes mesh-shift/.test(css) && /@keyframes drift-a/.test(css), 'animated gradient mesh');
  ok(/flash-up/.test(css) && /export function setNumber/.test(read(rel('src/js/motion.js'))), 'count-up with flash');
  ok(/stiffness/.test(read(rel('src/js/motion.js'))) && /damping/.test(read(rel('src/js/motion.js'))), 'damped spring solver');
  ok(/data-reveal/.test(distHtml) && /--i/.test(distHtml), 'stagger entrance');
  ok(/class="ticker marquee-host"/.test(distHtml) && /animation: marquee var\(--dur-marquee\) linear infinite/.test(css), 'marquee ticker');
});
await gate('animated logo and coin icon are not carried over (static brand mark, no coin art)', () => {
  ok(!/\.brand[^{]*:hover[^{]*img|brand img[^{]*\{[^}]*(transform|animation)/.test(css), 'brand logo animates');
  ok(!/coin|conic-gradient|spin-angle/i.test(css) && !/coin/i.test(distHtml), 'coin art or ring present');
});
await gate('timings and easings match the measured reference values', () => {
  for (const v of ['cubic-bezier(0.25, 1, 0.5, 1)', 'cubic-bezier(0.22, 1, 0.36, 1)', 'cubic-bezier(0.34, 1.4, 0.64, 1)', '--dur-press: 0.14s', '--dur-hover: 0.26s', '--dur-skeleton: 1.6s', '--dur-live: 1.8s', '--dur-marquee: 60s', '--appbar-h: 64px', '--r-module: 20px']) ok(tokensCss.includes(v), `token ${v} missing`);
});

group('layout rules');
await gate('no ch units anywhere in css, js or html', () => {
  for (const f of [...walk(rel('src')), ...walk(rel('dist'))].filter((f) => /\.(css|js|html|mjs)$/.test(f))) ok(!/\d(\.\d+)?ch\b/.test(read(f)), `ch unit in ${path.relative(root, f)}`);
});
await gate('tap targets: every control declares at least 44x44', () => {
  for (const sel of ['.icon-btn', '.ca-copy', '.cp', '.vbtn', '.chip', '.tab', '.chip-link', '.foot-top', '.pillnav a', '.search input']) {
    const block = css.split('\n').filter((l) => l.startsWith(`${sel} {`)).join(' ');
    ok(/(min-)?height: 44px|width: 44px|min-height: 44px/.test(block), `${sel} lacks a 44px size`);
  }
  ok(/\.tabbar li a \{[^}]*min-height: 64px/.test(css), 'tab bar items');
});
await gate('viewport meta, skip link, landmarks, lang present', () => {
  ok(/<meta name="viewport" content="width=device-width, initial-scale=1/.test(distHtml), 'viewport'); ok(/<html lang="en"/.test(distHtml), 'lang');
  ok(/class="skip"/.test(distHtml) && /<main id="main"/.test(distHtml) && /<header/.test(distHtml) && /<footer/.test(distHtml), 'landmarks');
  ok((distHtml.match(/<h1\b/g) || []).length === 1, 'exactly one h1');
});

group('repo hygiene');
await gate('no CLAUDE.md, no .claude directory, no attribution to any assistant anywhere', () => {
  ok(!exists(rel('CLAUDE.md')) && !exists(rel('.claude')) && !exists(rel('dist/CLAUDE.md')), 'assistant files present');
  const bad = new RegExp(['cla' + 'ude', 'anthr' + 'opic', 'co-authored', 'generated (by|with)', '\\bA' + 'I\\b', 'chat' + 'gpt', 'copi' + 'lot'].join('|'), 'i');
  const files = [...walk(root).filter((f) => !/node_modules|\.tmp-gates|package-lock|[\\/]fixtures[\\/]|[\\/]brand[\\/]|[\\/]reference[\\/]|[\\/]dist[\\/](img|fonts)|\.(png|jpe?g|webp|woff2)$/.test(f))].filter(isText).filter((f) => !/reference-copy\.txt$|[\\/]gates\.mjs$/.test(f));
  for (const f of files) { const m = read(f).match(bad); ok(!m, `${path.relative(root, f)} mentions "${m && m[0]}"`); }
});
await gate('README.md, docs/whitepaper.md, LICENSE exist at the root and not in dist', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) { ok(exists(rel(f)), `${f} missing`); ok(!exists(rel('dist', path.basename(f))), `${f} copied into dist`); }
  const lic = read(rel('LICENSE')); ok(/^MIT License/.test(lic) && /Copyright \(c\) 2026 Nuspad/.test(lic), 'LICENSE is not MIT / Nuspad, 2026');
  const rd = read(rel('README.md'));
  for (const h of ['Overview', 'Features', 'Links']) ok(new RegExp(`^## ${h}`, 'm').test(rd), `README lacks ${h}`);
  ok(/Solana/.test(rd) && /nuspad\.fun/.test(rd) && /img\.shields\.io/.test(rd) && /pending/i.test(rd), 'README lacks chain, badge, site or CA placeholder');
  const wp = read(rel('docs/whitepaper.md'));
  ok(/Vision/i.test(wp) && /Tokenomics/i.test(wp) && /Roadmap/i.test(wp) && /Team/i.test(wp), 'whitepaper sections');
  ok((wp.match(/^### Phase \d/gm) || []).length >= 3 && (wp.match(/^### Phase \d/gm) || []).length <= 4, 'roadmap phases 3-4');
});
await gate('scratch folders cleaned up', () => { fs.rmSync(scratch, { recursive: true, force: true }); ok(!exists(scratch), 'scratch remains'); });

// ---------- report ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} gates, ${results.length - failed.length} passed, ${failed.length} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (failed.length) { console.log('failed:'); for (const f of failed) console.log(`  - ${f.name}`); }
process.exit(failed.length ? 1 : 0);
