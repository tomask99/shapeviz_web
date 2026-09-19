import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { discoverProjects, validateProject } from '../src/presentations/registry.js';

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
  await withServer({ env, send: async (url, options) => { request = { url, options }; return new Response(null, { status: 204 }); } }, async origin => {
    const response = await fetch(`${origin}/api/presentation-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-analytics-status'), 'recorded');
  });
  assert.equal(request.url, 'https://shapeviz.supabase.co/rest/v1/rpc/record_presentation_event');
  assert.equal(request.options.headers.apikey, env.SUPABASE_SECRET_KEY);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.p_deck_slug, 'milenium');
  assert.equal(payload.p_event_id, event.eventId);
  assert.equal(payload.p_slide_index, 3);
  assert.equal(payload.p_user_agent_category, 'desktop');
});
