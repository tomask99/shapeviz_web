import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set(['draft', 'published', 'archived']);
const accessModes = new Set(['unlisted', 'password', 'link']);
const mediaProviders = new Set(['local', 'supabase-private', 'remote']);

function safeRelative(value, field) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw new Error(`${field} must be a safe relative path`);
  }
  return value.replaceAll('\\', '/');
}

async function mustExist(root, relative, label) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`${label} escapes the deck directory`);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error(`${label} does not exist: ${relative}`);
}

export async function validateProject(raw, directory, { checkReferences = true } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('project.json must contain an object');
  for (const field of ['id', 'slug', 'client', 'title', 'date', 'description', 'locale']) {
    if (typeof raw[field] !== 'string' || !raw[field].trim()) throw new Error(`${field} is required`);
  }
  if (!slugPattern.test(raw.slug) || raw.id !== raw.slug) throw new Error('id and slug must match and use lowercase URL-safe characters');
  if (!statuses.has(raw.status)) throw new Error(`status must be one of: ${[...statuses].join(', ')}`);
  if (!accessModes.has(raw.access?.mode)) throw new Error(`access.mode must be one of: ${[...accessModes].join(', ')}`);
  if (typeof raw.analytics?.enabled !== 'boolean') throw new Error('analytics.enabled must be a boolean');
  if (raw.analytics.slideCount !== null && (!Number.isInteger(raw.analytics.slideCount) || raw.analytics.slideCount < 1 || raw.analytics.slideCount > 1000)) {
    throw new Error('analytics.slideCount must be null or an integer from 1 to 1000');
  }
  if (!mediaProviders.has(raw.media?.provider)) throw new Error(`media.provider must be one of: ${[...mediaProviders].join(', ')}`);
  const entry = safeRelative(raw.entry, 'entry');
  const cover = raw.cover === null ? null : safeRelative(raw.cover, 'cover');
  await mustExist(directory, entry, 'entry');
  if (cover && raw.media.provider === 'local') await mustExist(directory, cover, 'cover');
  if (raw.access.mode !== 'unlisted' && raw.media.provider === 'local') {
    throw new Error('password/link decks cannot use local public media; configure supabase-private or remote protected delivery');
  }
  if (checkReferences && raw.media.provider === 'local') {
    const html = await readFile(path.join(directory, entry), 'utf8');
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);
    for (const reference of references) {
      if (/^(?:https?:|data:|#|\/)/i.test(reference)) continue;
      const pathname = reference.split(/[?#]/)[0];
      if (pathname) await mustExist(path.dirname(path.join(directory, entry)), pathname, 'referenced asset');
    }
  }
  return { ...raw, entry, cover, directory };
}

export async function discoverProjects(root) {
  const projects = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const directory = path.join(root, entry.name);
    const metadataPath = path.join(directory, 'project.json');
    try { await access(metadataPath); } catch { throw new Error(`${entry.name}: missing project.json`); }
    try {
      const raw = JSON.parse(await readFile(metadataPath, 'utf8'));
      projects.push(await validateProject(raw, directory));
    } catch (error) {
      throw new Error(`${entry.name}: ${error.message}`);
    }
  }
  const duplicates = projects.filter((project, index) => projects.findIndex(other => other.slug === project.slug) !== index);
  if (duplicates.length) throw new Error(`Duplicate presentation slug: ${duplicates[0].slug}`);
  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}
