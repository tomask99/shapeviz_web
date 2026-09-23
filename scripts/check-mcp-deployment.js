import {pathToFileURL} from 'node:url';
import {SCOPES} from '../src/oauth/domain.js';

const MAX_BYTES = 65536;
const includesAll = (actual, expected) => Array.isArray(actual) && expected.every(value => actual.includes(value));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

export function deploymentOrigin(value, {allowLoopback = false} = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Provide the canonical HTTPS origin, for example https://shapevizweb.vercel.app.'); }
  const local = allowLoopback && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  ensure((url.protocol === 'https:' || local) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use an HTTPS origin without credentials, a path, query or fragment.');
  return url.origin;
}

/** Public readiness only: no cookies, credentials, consent or CRM data are sent. */
export async function checkDeployment(value, {send = fetch, allowLoopback = false} = {}) {
  const origin = deploymentOrigin(value, {allowLoopback});
  const resource = origin + '/api/mcp';
  const metadataUrl = origin + '/.well-known/oauth-protected-resource/api/mcp';
  const results = [];
  async function request(path, options = {}) {
    let response;
    try {
      response = await send(origin + path, {redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000), ...options});
    } catch {
      throw new Error('Network or TLS request failed; check that the deployment is reachable.');
    }
    const chunks = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const {done, value: chunk} = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            throw new Error('Response exceeds the 64 KiB check limit.');
          }
          chunks.push(Buffer.from(chunk));
        }
      } finally { reader.releaseLock(); }
    }
    return {response, text: Buffer.concat(chunks).toString('utf8')};
  }
  async function json(path) {
    const {response, text} = await request(path, {headers: {Accept: 'application/json'}});
    ensure(response.status === 200, `HTTP ${response.status}; 404 means missing routes, 503 means OAuth is disabled or misconfigured, redirects/login pages may indicate deployment protection or a noncanonical URL.`);
    ensure(/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || ''), 'Expected JSON metadata, not an HTML page.');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON metadata.'); }
    ensure(data && typeof data === 'object' && !Array.isArray(data), 'Expected an OAuth metadata object.');
    return data;
  }
  async function check(name, run) {
    try { await run(); results.push({name, ok: true}); }
    catch (error) { results.push({name, ok: false, message: error.message}); }
  }
  for (const path of ['/.well-known/oauth-protected-resource/api/mcp', '/.well-known/oauth-protected-resource']) {
    await check(path, async () => {
      const data = await json(path);
      ensure(data.resource === resource, 'Resource must match the canonical origin plus /api/mcp exactly.');
      ensure(Array.isArray(data.authorization_servers) && data.authorization_servers.length === 1 && data.authorization_servers[0] === origin, 'Authorization server must match the canonical issuer exactly.');
      ensure(includesAll(data.scopes_supported, SCOPES) && data.scopes_supported.length === SCOPES.length, 'Expected exactly the three read scopes.');
      ensure(includesAll(data.bearer_methods_supported, ['header']) && data.bearer_methods_supported.length === 1, 'Only header Bearer authentication may be advertised.');
    });
  }
  await check('/.well-known/oauth-authorization-server', async () => {
    const data = await json('/.well-known/oauth-authorization-server');
    ensure(data.issuer === origin, 'Issuer must match the canonical origin exactly.');
    for (const [key, path] of Object.entries({authorization_endpoint: '/oauth/authorize', token_endpoint: '/oauth/token', revocation_endpoint: '/oauth/revoke'})) {
      ensure(data[key] === origin + path, `Unexpected ${key}.`);
    }
    ensure(data.authorization_response_iss_parameter_supported === true, 'RFC 9207 issuer identification must be advertised.');
    ensure(includesAll(data.code_challenge_methods_supported, ['S256']), 'PKCE S256 is required.');
    ensure(includesAll(data.token_endpoint_auth_methods_supported, ['none']), 'Public OAuth clients must be supported.');
    ensure(includesAll(data.response_types_supported, ['code']) && includesAll(data.grant_types_supported, ['authorization_code']), 'Authorization code flow must be supported.');
    ensure(includesAll(data.scopes_supported, SCOPES) && data.scopes_supported.length === SCOPES.length, 'Expected exactly the three read scopes.');
  });
  await check('/api/mcp rejects anonymous initialization', async () => {
    const {response} = await request('/api/mcp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'shapeviz-deployment-check', version: '1.0.0'}}}),
    });
    ensure(response.status === 401, `Expected HTTP 401 without credentials; received ${response.status}.`);
    const challenge = response.headers.get('www-authenticate') || '';
    ensure(/^Bearer\s/i.test(challenge) && challenge.includes(`resource_metadata="${metadataUrl}"`), 'Missing or incorrect OAuth resource metadata challenge.');
    ensure(/(?:^|,)\s*no-store\b/i.test(response.headers.get('cache-control') || ''), 'Authentication responses must not be cached.');
  });
  await check('/admin/connections consent page', async () => {
    const {response, text} = await request('/admin/connections', {headers: {Accept: 'text/html'}});
    ensure(response.status === 200 && /^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') || ''), `Expected the consent page with HTTP 200; received ${response.status}.`);
    ensure(text.includes('id="connection-signin"') && text.includes('id="connection-consent"'), 'The deployed page does not contain the expected sign-in and consent controls.');
  });
  return {origin, resource, ok: results.every(result => result.ok), results};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help') {
    console.log('Usage: npm run mcp:check -- https://your-canonical-origin');
    console.log('Checks public routing, OAuth discovery and anonymous access denial. Does not establish a ChatGPT connection.');
    process.exitCode = args[0] === '--help' ? 0 : 1;
    return;
  }
  try {
    const report = await checkDeployment(args[0]);
    console.log(`MCP deployment: ${report.resource}`);
    for (const result of report.results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.message ? ': ' + result.message : ''}`);
    console.log(report.ok ? 'Public readiness passed. Real ChatGPT sign-in, tool calls and disconnect still require verification.' : 'Public readiness failed. Fix these checks before connecting ChatGPT.');
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
