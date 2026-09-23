# AI Research 3C.2a — internal MCP transport

23 September 2026. A bounded continuation of [authenticated read tools](ai-research-phase-3c1.md).

**Completed and verified.** This stage adds the actual MCP protocol over the existing owner session. ChatGPT is not connected. External OAuth, consent and revocation are the next stage, 3C.2b; the real ChatGPT connection follows in 3C.2c.

## Scope and endpoint

`POST /api/admin?action=crm-tools-mcp` accepts MCP Streamable HTTP requests. It reuses the eight read tools, their exact JSON Schemas and their owner-JWT executor from 3C.1. The existing native server and Vercel admin function already route this endpoint, so no new public route or rewrite is needed.

The adapter uses the official `@modelcontextprotocol/sdk`, pinned to `1.30.0`. It creates one server and transport per HTTP request, returns JSON responses, and issues no MCP session IDs. This follows the SDK's [stateless Streamable HTTP pattern](https://ts.sdk.modelcontextprotocol.io/server). Its low-level `Server` interface preserves the existing JSON Schema registry, including `anyOf`, without translating it into a second schema system. The SDK is a protocol dependency; it does not call a model or require a paid AI API.

Supported operations are initialization, ping, tool discovery and calls. Initialization notifications return HTTP 202. Tools advertise read-only, non-destructive, idempotent behavior over stored data. There are no write tools, prompts, resources, task execution, sampling or server-initiated streams. `GET`, `DELETE` and other methods return 405; batches, session IDs and replay headers are refused.

The endpoint requires both JSON and event-stream MIME types in `Accept`, as required by the transport, although successful requests use JSON responses. The SDK negotiates protocol versions; unsupported version headers on subsequent requests are rejected.

## Authentication and data boundaries

This is an **internal admin-session adapter**, not an external OAuth resource server. It retains HttpOnly cookies, same-origin POST checks, verified Supabase user identity and current owner membership. Bearer credentials alone do not authenticate it. No browser cookie or Supabase user token should be copied into a ChatGPT connector configuration.

Every request, including initialization and ping, checks membership with the user's JWT. Each tool call goes through the existing scope checks, projections, validation and RLS. The admin adapter supplies its three trusted read scopes; MCP arguments, headers, client capabilities and metadata cannot grant permissions or choose another owner. Tool discovery is filtered by those trusted scopes. Removing owner membership prevents an already initialized client from making another request.

Results contain identical text and `structuredContent` envelopes with the schema version, server request ID, tool name, data and `read_only` / `untrusted_data` markers. Research remains historical, untrusted content. Company privacy exclusions and pagination limits are unchanged from 3C.1.

The complete request is limited to **16,384 UTF-8 bytes**. The complete serialized JSON-RPC response is limited to **1,000,000 bytes**, including both the structured result and escaped text copy. A report can therefore fit the domain limit yet exceed the MCP wire limit; that returns a small error without partial research. Tool failures use `isError: true` and a safe message; `_meta['shapeviz/httpStatus']` records the application status. HTTP authentication and request guards return JSON-RPC error envelopes. SDK internals and unexpected upstream exceptions are not exposed.

Metadata-only `crm_mcp_read` logs record a generated request ID, verified owner ID, allowlisted method/tool names, time, duration, application status and successful wire size. They omit client request IDs, arguments, result content, cookies, credentials and raw errors. As in 3C.1, these are hosting logs rather than a durable database audit. Requests denied before the adapter use the existing session/HTTP guards.

For an internal check, use the browser console on a signed-in Shapeviz page:

```js
const response = await fetch('/api/admin?action=crm-tools-mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-11-25',
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {name: 'get_research_catalog', arguments: {}},
  }),
});
console.log(await response.json());
```

The browser supplies its session and Origin. A complete SDK client performs initialization first, as exercised by the automated tests. This example does not configure an external client.

## Why external authorization is separate

OpenAI's [MCP authentication requirements](https://developers.openai.com/plugins/build/auth) require resource discovery, an authorization-code flow with PKCE, audience-bound credentials, scope checks and the exact redirect URI shown by ChatGPT. A working MCP protocol alone does not provide these controls.

Supabase's current [OAuth flow documentation](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) explicitly says custom scopes are not supported. Its [token security guidance](https://supabase.com/docs/guides/auth/oauth-server/token-security) also makes client-aware data access a separate RLS concern. Consequently, simply enabling its OAuth server or forwarding a normal owner session would not establish the scoped, revocable read grant required here. The provider and grant design must resolve these boundaries before external access is enabled.

The remaining sequence is:

1. **3C.2b — external authorization:** implement owner consent, audience-bound read grants and revocation; prevent credential use from bypassing the intended read tools; expose accurate discovery and per-tool OAuth metadata; test isolation, expiry, PKCE, replay and revocation.
2. **3C.2c — real connection:** after an explicitly authorized deployment, configure the canonical HTTPS resource and the callback from the user's ChatGPT setup. Verify sign-in, tool discovery, reads and access removal through that actual client before reporting it connected.
3. **3C.3 — reviewed writes:** separately adapt the existing confirmed import/review/enrichment operations.

No OAuth provider was enabled, external client registered, credential created or environment variable changed in this stage. There is no new UI, migration, schema or RLS change. Existing 45 migration versions remain unchanged. Application changes are local, not pushed or deployed.

## Verification

| Check | Result |
| --- | --- |
| MCP HTTP and official-client tests | **10 passed**: exact discovery, structured/text results, auth/CSRF, malformed envelopes, batch rejection, scopes, write refusal, concurrent owner isolation, membership revocation, refresh, redaction and complete response limits. |
| Full unit/API regression | **276 passed, 1 existing opt-in Storage test skipped**; 277 total. |
| Full browser regression | **153 passed, 9 live opt-in tests skipped**; 162 total. |
| Real Auth/API/Supabase read-tool and MCP fixture | **1 passed**, 33.2 seconds; all eight tools, cross-owner denial, revocation/logout and unchanged business snapshots. |
| Production build and `git diff --check` | Passed. |
| Dependency installation audit | Zero reported vulnerabilities at installation. |

The live fixture extends the existing read-tool test: the official MCP client uses the browser's private request context and compares all eight tool results with the established adapter. It checks pagination, inaccessible records, removal of owner membership, logout and unchanged snapshots of eight business tables. Synthetic confirmed accounts do not send email; fixture records are removed in `finally`. Traces and screenshots are disabled for this credential-bearing fixture.

A subsequent read-only SQL check found **zero** remaining fixture users, companies, candidates, contacts, notes or research reports. No schema or RLS changes were made, so the prior stage's migration/SQL acceptance checks were not repeated.

Reproduce with `node --test tests/mcp-http.test.js`, `npm.cmd test`, `npm.cmd run test:browser` and `npm.cmd run build`. The isolated live fixture is opt-in:

```powershell
$env:LIVE_READ_TOOLS_TEST='true'
npm.cmd run test:browser -- tests/browser/read-tools-live.spec.js --workers=1
```

Run browser suites sequentially because their shared setup uses port 4173. The repository has no separate lint or typecheck command.
