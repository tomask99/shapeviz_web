import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPresentationProject, getPrivatePresentationSource, hasSupabase, slugPattern } from './remote.js';

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultTemplatesRoot = path.resolve(moduleRoot, '../../presentation-templates');
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.supabase.co data: blob:; media-src 'self' https://*.supabase.co blob:; connect-src 'self'; font-src 'self' https://*.supabase.co data:; base-uri 'self' https://*.supabase.co; form-action 'none'; frame-ancestors 'none'";

function valueAt(data, key) {
  return key.split('.').reduce((value, part) => value?.[part], data);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]).replace(/\r?\n/g, '<br>');
}

export async function renderPresentationTemplate(project, { templatesRoot = defaultTemplatesRoot } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.template_key || '')) throw new Error('Invalid template key');
  const filename = path.join(templatesRoot, project.template_key, 'index.html');
  const template = await readFile(filename, 'utf8');
  const data = {
    project: {
      slug: project.deck_slug,
      client: project.client,
      title: project.title,
      date: project.presentation_date,
      description: project.description,
      locale: project.locale
    },
    content: project.content || {}
  };
  data.project.analytics = project.analytics_enabled === true ? 'true' : 'false';
  return template.replace(/{{\s*([a-z0-9_.-]+)\s*}}/gi, (match, key) => {
    const value = valueAt(data, key);
    if (value === undefined || value === null) throw new Error(`Missing template value: ${key}`);
    return escapeHtml(Array.isArray(value) ? value.join(' · ') : value);
  });
}

function requestedSlug(req) {
  const fromQuery = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  if (fromQuery) return fromQuery;
  try { return new URL(req.url, 'http://localhost').searchParams.get('slug'); }
  catch { return null; }
}

export function createPresentationPageHandler({ env = process.env, send = fetch, templatesRoot = defaultTemplatesRoot } = {}) {
  return async function presentationPage(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const slug = requestedSlug(req);
    if (!slugPattern.test(slug || '')) { res.writeHead(404).end('Not found'); return; }
    if (!hasSupabase(env)) { res.writeHead(503, { 'Cache-Control': 'no-store' }).end('Presentation service is not configured'); return; }

    try {
      const project = await getPresentationProject(slug, { env, send });
      if (!project || project.status !== 'published' || project.access_mode !== 'unlisted') {
        res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }).end('Not found');
        return;
      }
      const html = project.source_type === 'template'
        ? await renderPresentationTemplate(project, { templatesRoot })
        : await getPrivatePresentationSource(project, { env, send });
      const etag = `"${createHash('sha256').update(html).digest('hex').slice(0, 24)}"`;
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; " + csp.replace("script-src 'self'", `script-src 'self' ${new URL(env.SUPABASE_URL).origin}`).replace("style-src 'self'", `style-src 'self' ${new URL(env.SUPABASE_URL).origin}`),
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        ETag: etag
      };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end(); else res.end(html);
    } catch (error) {
      console.error('Presentation delivery failed:', error.message);
      res.writeHead(502, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }).end('Presentation is temporarily unavailable');
    }
  };
}
