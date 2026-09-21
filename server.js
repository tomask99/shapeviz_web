import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContactHandler } from './src/contact.js';
import { createWebsiteEventHandler } from './src/website/events.js';
import { createAdminHandler } from './src/admin/handler.js';
import { createPresentationEventHandler } from './src/presentations/events.js';
import { createPresentationPageHandler } from './src/presentations/page.js';
import { discoverProjects } from './src/presentations/registry.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const siteCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const presentationCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

function safeFile(base, relative) {
  const filename = path.resolve(base, relative);
  const relation = path.relative(base, filename);
  if (relation.startsWith('..') || path.isAbsolute(relation) || relation.split(/[\\/]/).some(part => part.startsWith('.'))) return null;
  return filename;
}

async function serveFile(req, res, filename, pathname, extraHeaders = {}) {
  try {
    const info = await stat(filename);
    const contentType = mime[path.extname(filename).toLowerCase()];
    if (!info.isFile() || !contentType) { res.writeHead(404).end('Not found'); return; }
    const headers = { 'Content-Type': contentType, 'Cache-Control': /\/assets\/|\/media\//.test(pathname) ? 'public, max-age=86400' : 'no-cache', 'Accept-Ranges': 'bytes', ...extraHeaders };
    let start = 0, end = info.size - 1, status = 200;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = info.size ? end - start + 1 : 0;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(filename, { start, end: Math.max(0, end) });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}

export function createApp({ publicDir = path.join(root, 'public'), presentationsDir = path.join(root, 'presentations'), builtPresentations = false, templatesRoot, env = process.env, send = fetch } = {}) {
  const contact = createContactHandler({ env, send });
  const websiteEvent = createWebsiteEventHandler({ env, send });
  const admin = createAdminHandler({ env, send });
  const presentationEvent = createPresentationEventHandler({ env, send, presentationsRoot: presentationsDir });
  const presentationPage = createPresentationPageHandler({ env, send, ...(templatesRoot ? { templatesRoot } : {}) });
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', siteCsp);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end('Bad request'); return; }
    if (pathname === '/api/contact') { await contact(req, res); return; }
    if (pathname === '/api/site-events') { await websiteEvent(req, res); return; }
    if (pathname === '/api/admin') { await admin(req, res); return; }
    if (pathname === '/adminlogin' || pathname === '/admin') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.supabase.co; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-src 'self' blob:; img-src 'self' https://*.supabase.co data: blob:; media-src 'self' https://*.supabase.co blob:; font-src 'self' https://*.supabase.co data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      await serveFile(req,res,path.join(publicDir,'admin/index.html'),pathname,{'Cache-Control':'no-store'});return;
    }
    if (pathname === '/api/presentation-events') { await presentationEvent(req, res); return; }
    if (pathname === '/api/presentation-page') { await presentationPage(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }

    const deckMatch = /^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/.*)?$/.exec(pathname);
    if (deckMatch) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', presentationCsp);
      const [, slug, suffix = ''] = deckMatch;
      if (suffix === '/') { res.writeHead(308, { Location: `/p/${slug}` }).end(); return; }
      if (env.PRESENTATIONS_REMOTE === 'true') {
        if (suffix) { res.writeHead(404).end('Not found'); return; }
        req.query = { slug };
        await presentationPage(req, res);
        return;
      }
      let deckRoot;
      let relative;
      if (builtPresentations) {
        deckRoot = path.join(presentationsDir, slug);
        relative = suffix ? suffix.slice(1) : 'index.html';
      } else {
        const project = (await discoverProjects(presentationsDir)).find(item => item.slug === slug && item.status === 'published' && item.access.mode === 'unlisted');
        if (!project) { res.writeHead(404).end('Not found'); return; }
        deckRoot = project.directory;
        relative = suffix ? suffix.slice(1) : project.entry;
      }
      if (relative === 'project.json') { res.writeHead(404).end('Not found'); return; }
      const filename = safeFile(deckRoot, relative);
      if (!filename) { res.writeHead(404).end('Not found'); return; }
      await serveFile(req, res, filename, pathname);
      return;
    }

    const filename = safeFile(publicDir, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!filename) { res.writeHead(404).end('Not found'); return; }
    await serveFile(req, res, filename, pathname);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const production = process.argv.includes('--production');
  createApp({
    publicDir: path.join(root, production ? 'dist' : 'public'),
    presentationsDir: path.join(root, production ? 'dist/p' : 'presentations'),
    builtPresentations: production
  }).listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`SHAPEVIZ is ready at http://localhost:${port}`);
  });
}
