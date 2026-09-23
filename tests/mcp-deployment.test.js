import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createOAuthHandler} from '../src/oauth/handler.js';
import {checkDeployment, deploymentOrigin} from '../scripts/check-mcp-deployment.js';

test('Deployment check requires a canonical HTTPS origin and rejects credentials and paths', () => {
  assert.equal(deploymentOrigin('https://shapeviz.example/'), 'https://shapeviz.example');
  for (const value of ['not-a-url', 'http://shapeviz.example', 'https://user:secret@shapeviz.example', 'https://shapeviz.example/api/mcp', 'https://shapeviz.example?token=secret', 'https://shapeviz.example#fragment']) assert.throws(() => deploymentOrigin(value));
});

test('Public readiness passes the real OAuth handler without accessing data or creating grants', async () => {
  const env = {MCP_OAUTH_ENABLED: 'true', MCP_OAUTH_ALLOW_LOOPBACK: 'true', MCP_OAUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'), MCP_OAUTH_CLIENTS: JSON.stringify([{client_id: 'shapeviz-chatgpt', name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect']}]), SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SECRET_KEY: 'fixture'};
  let dataCalls = 0;
  const handler = createOAuthHandler({env, send: async () => { dataCalls++; throw new Error('No database access is expected.'); }});
  const page = await readFile(new URL('../public/admin/connections.html', import.meta.url), 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/admin/connections') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end(page); }
    else handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  env.SITE_URL = 'http://127.0.0.1:' + server.address().port;
  try {
    const report = await checkDeployment(env.SITE_URL, {allowLoopback: true});
    assert.equal(report.ok, true, JSON.stringify(report.results));
    assert.equal(report.results.length, 5);
    assert.equal(dataCalls, 0);
    env.MCP_OAUTH_ENABLED = 'false';
    const disabled = await checkDeployment(env.SITE_URL, {allowLoopback: true});
    assert.equal(disabled.ok, false);
    assert.equal(disabled.results.filter(result => !result.ok).length, 4);
    assert.equal(dataCalls, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('Readiness refuses deployment-protection redirects, HTML metadata and anonymous MCP success', async () => {
  for (const send of [
    async () => new Response('', {status: 302, headers: {Location: 'https://login.example'}}),
    async () => new Response('<html>Login</html>', {headers: {'Content-Type': 'text/html'}}),
    async () => Response.json({}),
  ]) {
    const report = await checkDeployment('https://shapeviz.example', {send});
    assert.equal(report.ok, false);
    assert.equal(report.results.every(result => !result.ok), true);
  }
});

test('Readiness bounds responses and never follows redirects or sends credentials', async () => {
  let calls = 0;
  const report = await checkDeployment('https://shapeviz.example', {send: async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).has('authorization'), false);
    assert.equal(new Headers(options.headers).has('cookie'), false);
    return new Response('x'.repeat(65537));
  }});
  assert.equal(calls, 5);
  assert.equal(report.ok, false);
  assert.equal(report.results.every(result => /64 KiB/.test(result.message)), true);
});
