import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
const inquiry = { name: 'Test Visitor', email: 'visitor@example.com', company: 'Example', services: ['CGI & 3D'], message: 'A test inquiry about a new visual identity project.', consent: true, website: '' };
const configured = { RESEND_API_KEY: 'test-key', CONTACT_TO_EMAIL: 'studio@example.com', CONTACT_FROM_EMAIL: 'website@example.com', SITE_URL: 'https://example.com' };
async function withServer(options, run) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); } finally { await new Promise(resolve => server.close(resolve)); }
}
function post(origin, body = inquiry, headers = {}) {
  return fetch(`${origin}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('serves the site and media ranges without exposing private files', async () => {
  await withServer({ env: {} }, async origin => {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html lang="en">/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const route of ['/.env', '/package.json', '/server.js', '/%2e%2e%2f.env', '/.git/config']) {
      assert.equal((await fetch(origin + route)).status, 404, route);
    }
    const clip = await fetch(`${origin}/media/milenium-motion.mp4`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(clip.status, 206);
    assert.equal((await clip.arrayBuffer()).byteLength, 100);
    const suffix = await fetch(`${origin}/media/milenium-motion.mp4`, { headers: { Range: 'bytes=-100' } });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${origin}/media/milenium-motion.mp4`, { headers: { Range: 'bytes=999999999-' } })).status, 416);
  });
});
test('unconfigured contact does not pretend to send', async () => {
  await withServer({ env: {} }, async origin => {
    const response = await post(origin);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  });
});
test('rejects malformed fields, missing consent and cross-origin requests', async () => {
  await withServer({ env: configured, send: () => assert.fail('Invalid inquiries must not reach delivery') }, async origin => {
    assert.equal((await post(origin, { ...inquiry, email: 'invalid' })).status, 400);
    assert.equal((await post(origin, { ...inquiry, consent: false })).status, 400);
    assert.equal((await post(origin, { ...inquiry, services: ['Injected service'] })).status, 400);
    assert.equal((await post(origin, { ...inquiry, website: 'bot' })).status, 400);
    assert.equal((await post(origin, inquiry, { Origin: 'https://unrelated.example' })).status, 403);
  });
});
test('rate limits repeated requests', async () => {
  await withServer({ env: {} }, async origin => {
    for (let i = 0; i < 5; i++) await post(origin, { ...inquiry, consent: false });
    const response = await post(origin);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  });
});
test('sends plain text through the provider with visitor as reply-to', async () => {
  let payload;
  await withServer({ env: configured, send: async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'test-only-receipt' }), { status: 200 });
  } }, async origin => {
    const response = await post(origin, inquiry, { Origin: configured.SITE_URL });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(payload.reply_to, inquiry.email);
    assert.deepEqual(payload.to, [configured.CONTACT_TO_EMAIL]);
    assert.equal(payload.from, configured.CONTACT_FROM_EMAIL);
    assert.ok(payload.text.includes(inquiry.message));
    assert.equal(payload.html, undefined);
  });
});
test('delivery failures are reported as failures', async () => {
  await withServer({ env: configured, send: async () => new Response('{}', { status: 500 }) }, async origin => {
    const response = await post(origin);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, false);
  });
});
