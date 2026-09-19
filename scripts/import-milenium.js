import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourcePath = path.resolve(process.argv[2] || 'presentations/prezentacia_milenium.html');
const targetDir = path.resolve('presentations/milenium');
const assetDir = path.join(targetDir, 'assets', 'generated');
const extensions = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['video/mp4', 'mp4']]);
let html = await readFile(sourcePath, 'utf8');
const sourceHash = createHash('sha256').update(html).digest('hex');
const dataUri = /data:([^;,"']+)(?:;[^,"']*)?;base64,([A-Za-z0-9+/=]+)/g;
const matches = [...html.matchAll(dataUri)];
if (!matches.length) throw new Error(`No embedded media found in ${sourcePath}`);

await rm(assetDir, { recursive: true, force: true });
await mkdir(assetDir, { recursive: true });
const files = new Map();
for (const match of matches) {
  const mime = match[1].toLowerCase();
  const extension = extensions.get(mime);
  if (!extension) throw new Error(`Unsupported embedded media type: ${mime}`);
  const bytes = Buffer.from(match[2], 'base64');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const filename = `${mime.startsWith('video/') ? 'video' : 'image'}-${digest.slice(0, 16)}.${extension}`;
  if (!files.has(digest)) {
    await writeFile(path.join(assetDir, filename), bytes);
    files.set(digest, { filename, bytes: bytes.length, mime });
  }
  html = html.replace(match[0], `assets/generated/${filename}`);
}

const finalSlideMatch = html.match(/<section class="slide final-brand-slide">[\s\S]*?<\/section>/);
const deckEnd = '\n</div>\n\n<div id="imageLightbox"';
if (finalSlideMatch && html.includes(deckEnd)) {
  html = html.replace(finalSlideMatch[0], '');
  html = html.replace(deckEnd, `\n${finalSlideMatch[0]}\n</div>\n\n<div id="imageLightbox"`);
}
html = html
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Milenium — Social Media &amp; Visual Direction · Shapeviz</title>')
  .replaceAll('preload="auto"', 'preload="metadata"')
  .replace('<section class="slide">\n  <div class="eyebrow">10 — SOCIAL / CAMPAIGN ASSETS</div>', '<section class="slide campaign-assets-slide">\n  <div class="eyebrow">10 — SOCIAL / CAMPAIGN ASSETS</div>')
  .replace('<section class="slide">\n  <div class="eyebrow">14 — SOCIAL MEDIA OUTPUTS</div>', '<section class="slide social-outputs-slide">\n  <div class="eyebrow">14 — SOCIAL MEDIA OUTPUTS</div>');

const headInsert = [
  '<base href="/p/milenium/">',
  '<meta name="robots" content="noindex, nofollow, noarchive">',
  '<meta name="referrer" content="no-referrer">',
  '<link rel="canonical" href="https://shapeviz.com/p/milenium">',
  '<meta property="og:title" content="Milenium — Social Media &amp; Visual Direction">',
  '<meta property="og:description" content="Private visual direction proposal by Shapeviz.">',
].join('\n');
if (!html.includes('name="robots"')) html = html.replace('</head>', `${headInsert}\n</head>`);
else if (!html.includes('<base href="/p/milenium/">')) html = html.replace('<head>', '<head>\n<base href="/p/milenium/">');
const tracker = '<script src="/presentation-system/tracker.js" data-deck="milenium" data-analytics="true" defer></script>';
if (!html.includes('/presentation-system/tracker.js')) html = html.replace('</body>', `${tracker}\n</body>`);

await mkdir(targetDir, { recursive: true });
await writeFile(path.join(targetDir, 'index.html'), html, 'utf8');
const uniqueBytes = [...files.values()].reduce((total, file) => total + file.bytes, 0);
console.log(`Imported Milenium from ${sourcePath}`);
console.log(`Source SHA-256: ${sourceHash}`);
console.log(`${matches.length} embedded references -> ${files.size} unique files (${(uniqueBytes / 1024 / 1024).toFixed(1)} MB)`);
