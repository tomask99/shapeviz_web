import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { discoverProjects, validateProject } from '../src/presentations/registry.js';
import { renderPresentationTemplate } from '../src/presentations/page.js';
import { preparePublishedHtml } from '../src/presentations/publish-html.js';

test('remote media does not move analytics or navigation to the storage origin', () => {
  const html = preparePublishedHtml('<html><head><base href="/p/old/"></head><body><img src="assets/image.jpg"><script src="/presentation-system/tracker.js" data-deck="old"></script></body></html>', {
    slug: 'new-client', mediaBase: 'https://example.supabase.co/storage/v1/object/public/media/new-client/revision/', analytics: true
  });
  assert.match(html, /<base href="\/p\/new-client\/">/);
  assert.match(html, /src="https:\/\/example.supabase.co\/storage\/v1\/object\/public\/media\/new-client\/revision\/assets\/image.jpg"/);
  assert.match(html, /src="\/presentation-system\/tracker.js" data-deck="new-client"/);
  assert.equal((html.match(/tracker.js/g) || []).length, 1);
});

const repository = path.resolve(import.meta.dirname, '..');
const event = { deck: 'milenium', sessionId: '2fd862b8-8249-4e7a-93fb-ec3bf367f101', eventId: '6646aebf-5db5-42ad-88f4-a387162de25f', eventType: 'slide_viewed', slideIndex: 3 };

async function withServer(options, run) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('serves Milenium at a canonical isolated route with protected metadata', async () => {
  await withServer({ env: {} }, async origin => {
    const response = await fetch(`${origin}/p/milenium`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Milenium/);
    assert.doesNotMatch(html, /site-header/);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /'unsafe-inline'/);
    assert.equal((await fetch(`${origin}/p/milenium/`, { redirect: 'manual' })).status, 308);
    assert.equal((await fetch(`${origin}/p/milenium/project.json`)).status, 404);
    assert.equal((await fetch(`${origin}/p/unknown-client`)).status, 404);

    const project = JSON.parse(await readFile(path.join(repository, 'presentations/milenium/project.json'), 'utf8'));
    const cover = await fetch(`${origin}/p/milenium/${project.cover}`);
    assert.equal(cover.status, 200);
    assert.match(cover.headers.get('content-type'), /^image\//);
    const videoName = (await import('node:fs/promises')).readdir(path.join(repository, 'presentations/milenium/assets/generated')).then(files => files.find(file => file.endsWith('.mp4')));
    const clip = await fetch(`${origin}/p/milenium/assets/generated/${await videoName}`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(clip.status, 206);
    assert.equal((await clip.arrayBuffer()).byteLength, 100);
  });
});

test('discovers a test fixture without adding it to production presentations', async () => {
  const fixtures = path.join(repository, 'tests/fixtures/presentations');
  assert.deepEqual((await discoverProjects(fixtures)).map(project => project.slug), ['test-company']);
  await withServer({ env: {}, presentationsDir: fixtures }, async origin => {
    const response = await fetch(`${origin}/p/test-company`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Fixture deck/);
  });
  await assert.rejects(readFile(path.join(repository, 'presentations/test-company/project.json')), /ENOENT/);
});

test('registry rejects traversal, protected public media, and missing assets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'shapeviz-presentation-'));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.html'), '<img src="assets/missing.jpg">');
  const base = {
    id: 'safe-deck', slug: 'safe-deck', client: 'Safe', title: 'Safe', date: '2026', description: 'Safe deck',
    cover: null, entry: 'index.html', locale: 'en', status: 'published', access: { mode: 'unlisted' },
    analytics: { enabled: false, slideCount: 1 }, media: { provider: 'local', baseUrl: null }
  };
  await assert.rejects(validateProject({ ...base, entry: '../secret.html' }, directory), /safe relative path/);
  await assert.rejects(validateProject({ ...base, access: { mode: 'password' } }, directory), /cannot use local public media/);
  await assert.rejects(validateProject(base, directory), /does not exist/);
});

test('analytics is truthful when unconfigured and validates before storage', async () => {
  await withServer({ env: {} }, async origin => {
    const response = await fetch(`${origin}/api/presentation-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-analytics-status'), 'not-configured');
    const invalid = await fetch(`${origin}/api/presentation-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, slideIndex: 5000 }) });
    assert.equal(invalid.status, 400);
  });
});

test('analytics writes only through the configured server-side RPC', async () => {
  let request;
  const env = { SUPABASE_URL: 'https://shapeviz.supabase.co', SUPABASE_SECRET_KEY: 'server-secret' };
  await withServer({ env, send: async (url, options = {}) => {
    if (url.includes('/presentation_projects?')) return Response.json([{ deck_slug: 'milenium', status: 'published', analytics_enabled: true }]);
    request = { url, options };
    return new Response(null, { status: 204 });
  } }, async origin => {
    const response = await fetch(`${origin}/api/presentation-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-analytics-status'), 'recorded');
  });
  assert.equal(request.url, 'https://shapeviz.supabase.co/rest/v1/rpc/record_presentation_event');
  assert.equal(request.options.headers.apikey, env.SUPABASE_SECRET_KEY);
  assert.equal(request.options.headers.Authorization, undefined);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.p_deck_slug, 'milenium');
  assert.equal(payload.p_event_id, event.eventId);
  assert.equal(payload.p_slide_index, 3);
  assert.equal(payload.p_user_agent_category, 'desktop');
});

test('renders a remote template instance with escaped client content', async () => {
  const project = {
    deck_slug: 'minotti', source_type: 'template', template_key: 'shapeviz-introduction-v1',
    client: 'Minotti <script>', title: 'A visual partnership', presentation_date: 'September 2026',
    description: 'Tailored deck', locale: 'en', status: 'published', access_mode: 'unlisted', analytics_enabled: true,
    content: {
      headline: 'A visual partnership.', intro: 'Prepared for Minotti.', opportunity: 'Build desire.',
      focus: 'Visual direction and CGI.', cta: 'Let’s talk.'
    }
  };
  const html = await renderPresentationTemplate(project);
  assert.match(html, /Minotti &lt;script&gt;/);
  assert.doesNotMatch(html, /Minotti <script>/);
  assert.match(html, /data-deck="minotti"/);
});

test('serves a Supabase template from a clean remote presentation route', async () => {
  const env = { SUPABASE_URL: 'https://shapeviz.supabase.co', SUPABASE_SECRET_KEY: 'server-secret', PRESENTATIONS_REMOTE: 'true' };
  const project = {
    deck_slug: 'minotti', source_type: 'template', template_key: 'shapeviz-introduction-v1', client: 'Minotti',
    title: 'A visual partnership', presentation_date: 'September 2026', description: 'Tailored deck', locale: 'en',
    status: 'published', access_mode: 'unlisted', analytics_enabled: true, content: {
      headline: 'A visual partnership.', intro: 'Prepared for Minotti.', opportunity: 'Build desire.',
      focus: 'Visual direction and CGI.', cta: 'Let’s talk.'
    }
  };
  await withServer({ env, send: async url => {
    if (url.includes('/presentation_projects?')) return Response.json([project]);
    throw new Error(`Unexpected remote request: ${url}`);
  } }, async origin => {
    const response = await fetch(`${origin}/p/minotti`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.match(await response.text(), /Prepared for Minotti/);
  });
});

test('serves standalone HTML from private Storage and hides unpublished slugs', async () => {
  const env = { SUPABASE_URL: 'https://shapeviz.supabase.co', SUPABASE_SECRET_KEY: 'server-secret', PRESENTATIONS_REMOTE: 'true' };
  const project = {
    deck_slug: 'remote-deck', source_type: 'standalone', source_bucket: 'presentation-source', source_path: 'remote-deck/index.html',
    status: 'published', access_mode: 'unlisted', analytics_enabled: false
  };
  await withServer({ env, send: async url => {
    if (url.includes('/presentation_projects?')) return Response.json(url.includes('remote-deck') ? [project] : []);
    if (url.includes('/storage/v1/object/authenticated/')) return new Response('<!doctype html><title>Remote deck</title>', { headers: { 'Content-Type': 'text/html' } });
    throw new Error(`Unexpected remote request: ${url}`);
  } }, async origin => {
    const response = await fetch(`${origin}/p/remote-deck`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Remote deck/);
    assert.equal((await fetch(`${origin}/p/unknown-remote`)).status, 404);
  });
});
