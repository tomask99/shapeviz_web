import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateProject } from '../src/presentations/registry.js';
import { preparePublishedHtml } from '../src/presentations/publish-html.js';
import { hasSupabase, publicMediaBase, uploadStorageObject, upsertPresentationProject } from '../src/presentations/remote.js';

const directory = path.resolve(process.argv[2] || 'presentations/milenium');
const dryRun = process.argv.includes('--dry-run');
const metadata = JSON.parse(await readFile(path.join(directory, 'project.json'), 'utf8'));
const project = await validateProject(metadata, directory);
if (project.access.mode !== 'unlisted') throw new Error('The current publisher supports unlisted decks only. Protected media must use private delivery.');
if (!dryRun && !hasSupabase(process.env)) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env before publishing.');

const mime = new Map([
  ['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.woff2', 'font/woff2']
]);

async function filesBelow(root, relative = '') {
  const results = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...await filesBelow(root, child));
    else results.push(child.replaceAll('\\', '/'));
  }
  return results;
}

const assets = (await filesBelow(directory)).filter(file => file !== project.entry && file !== 'project.json');
for (const asset of assets) {
  if (!mime.has(path.extname(asset).toLowerCase())) throw new Error(`Unsupported asset type: ${asset}`);
}

const sourceHtml = await readFile(path.join(directory, project.entry), 'utf8');
const hash = createHash('sha256').update(sourceHtml);
for (const asset of [...assets].sort()) hash.update(asset).update(await readFile(path.join(directory, asset)));
const revision = hash.digest('hex').slice(0, 20);
const prefix = `${project.slug}/${revision}/`;

const remoteShape = {
  deck_slug: project.slug,
  source_type: 'standalone',
  template_key: null,
  client: project.client,
  title: project.title,
  presentation_date: project.date,
  description: project.description,
  locale: project.locale,
  status: project.status,
  access_mode: project.access.mode,
  analytics_enabled: project.analytics.enabled,
  slide_count: project.analytics.slideCount,
  source_bucket: 'presentation-source',
  source_path: `${prefix}index.html`,
  media_bucket: 'presentation-media',
  media_prefix: prefix,
  cover_path: project.cover ? `${prefix}${project.cover}` : null,
  content: {},
  published_at: project.status === 'published' ? new Date().toISOString() : null
};

const localBytes = await Promise.all(assets.map(async file => (await readFile(path.join(directory, file))).length));
console.log(`${project.slug}: ${assets.length} media files, ${(localBytes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB`);
if (dryRun) {
  console.log('Dry run passed; no remote data was changed.');
  process.exit(0);
}

const mediaBase = publicMediaBase(remoteShape, process.env);
const html = preparePublishedHtml(sourceHtml, { slug: project.slug, mediaBase, analytics: project.analytics.enabled });
if (Buffer.byteLength(html) > 4_000_000) throw new Error('HTML exceeds the delivery limit. Externalize embedded media before publishing.');

let cursor = 0;
async function uploadWorker() {
  while (cursor < assets.length) {
    const index = cursor++;
    const relative = assets[index];
    const bytes = await readFile(path.join(directory, relative));
    await uploadStorageObject({
      bucket: remoteShape.media_bucket,
      object: `${prefix}${relative}`,
      body: bytes,
      contentType: mime.get(path.extname(relative).toLowerCase()),
      env: process.env
    });
    console.log(`[${index + 1}/${assets.length}] ${relative}`);
  }
}
await Promise.all([uploadWorker(), uploadWorker(), uploadWorker()]);
await uploadStorageObject({
  bucket: remoteShape.source_bucket,
  object: remoteShape.source_path,
  body: html,
  contentType: 'text/html',
  env: process.env
});
const saved = await upsertPresentationProject(remoteShape, { env: process.env });
console.log(`Published ${saved.deck_slug}; source SHA-256 ${createHash('sha256').update(html).digest('hex')}`);
console.log(`Route: /p/${saved.deck_slug}`);
