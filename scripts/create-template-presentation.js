import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hasSupabase, slugPattern, upsertPresentationProject } from '../src/presentations/remote.js';

const descriptorPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!descriptorPath) throw new Error('Usage: npm run presentation:create:template -- path/to/instance.json');
const descriptor = JSON.parse(await readFile(path.resolve(descriptorPath), 'utf8'));
if (!slugPattern.test(descriptor.slug || '')) throw new Error('slug must be lowercase and URL-safe');
for (const field of ['client', 'title', 'date', 'description', 'locale', 'template']) {
  if (typeof descriptor[field] !== 'string' || !descriptor[field].trim()) throw new Error(`${field} is required`);
}
const schemaPath = path.resolve('presentation-templates', descriptor.template, 'schema.json');
if (!slugPattern.test(descriptor.template)) throw new Error('Invalid template key');
if (!['draft', 'published', 'archived'].includes(descriptor.status || 'draft')) throw new Error('Invalid status');
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
if (schema.key !== descriptor.template) throw new Error('Template schema key does not match its directory');
if (!descriptor.content || typeof descriptor.content !== 'object' || Array.isArray(descriptor.content)) throw new Error('content must be an object');
for (const key of schema.requiredContent) {
  if (typeof descriptor.content[key] !== 'string' || !descriptor.content[key].trim()) throw new Error(`content.${key} is required`);
}
if (!dryRun && !hasSupabase(process.env)) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env before creating an instance.');

const project = {
  deck_slug: descriptor.slug,
  source_type: 'template',
  template_key: descriptor.template,
  client: descriptor.client,
  title: descriptor.title,
  presentation_date: descriptor.date,
  description: descriptor.description,
  locale: descriptor.locale,
  status: descriptor.status || 'draft',
  access_mode: 'unlisted',
  analytics_enabled: descriptor.analytics !== false,
  slide_count: 5,
  source_bucket: null,
  source_path: null,
  media_bucket: null,
  media_prefix: null,
  cover_path: null,
  content: descriptor.content,
  published_at: (descriptor.status || 'draft') === 'published' ? new Date().toISOString() : null
};
if (dryRun) console.log(JSON.stringify(project, null, 2));
else {
  const saved = await upsertPresentationProject(project, { env: process.env });
  console.log(`Created ${saved.source_type} presentation at /p/${saved.deck_slug}`);
}
