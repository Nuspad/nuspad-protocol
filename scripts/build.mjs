// Build: src/ -> dist/. Flags: --register <file> --out <dir> (used by the gate harness).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssets, readTokens } from './assets.mjs';
import { renderPage } from '../src/template.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };

export async function build({ registerFile = path.join(root, 'src/register.json'), out = path.join(root, 'dist'), quiet = false, skipAssets = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const reg = JSON.parse(fs.readFileSync(registerFile, 'utf8'));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const tokens = readTokens(root);
  const css = fs.readFileSync(path.join(root, 'src/tokens.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  fs.writeFileSync(path.join(out, 'app.css'), css);

  fs.cpSync(path.join(root, 'src/js'), path.join(out, 'js'), { recursive: true });

  const nm = (p) => path.join(root, 'node_modules', p);
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  fs.copyFileSync(nm('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2'), path.join(out, 'fonts/bricolage-grotesque-wght.woff2'));
  fs.copyFileSync(nm('@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2'), path.join(out, 'fonts/instrument-sans-wght.woff2'));
  fs.copyFileSync(nm('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'), path.join(out, 'fonts/ibm-plex-mono-400.woff2'));
  fs.copyFileSync(nm('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'), path.join(out, 'fonts/ibm-plex-mono-500.woff2'));

  if (!skipAssets) {
    log('assets:');
    await buildAssets(root, out, log);
  }

  const html = renderPage(reg).replace('__THEME__', tokens['c-bg']);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
    name: 'Nuspad', short_name: 'Nuspad', display: 'standalone', start_url: '.',
    background_color: tokens['c-bg'], theme_color: tokens['c-bg'],
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
  }, null, 2));
  fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/img/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  log(`built ${path.relative(root, out) || out}`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build({ registerFile: arg('--register') && path.resolve(arg('--register')), out: arg('--out') && path.resolve(arg('--out')) });
}
