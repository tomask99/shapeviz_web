# AI Research 3C.2b — external authorization and owner consent

23 September 2026. A bounded continuation of [the internal MCP transport](ai-research-phase-3c2a.md).

**Completed and verified.** External clients now have a separate, scoped OAuth authorization path for the eight existing read tools. Owners can review permissions, allow or decline access, inspect connections and disconnect them. Application changes remain local; two database migrations have been applied. External OAuth is disabled by default and the actual ChatGPT client has not been connected. Deployment and real ChatGPT verification belong to **3C.2c**.

## Owner experience

The Studio account menu links to **Connected apps**, at `/admin/connections`. An authorization request opens this page, asks for the existing Shapeviz sign-in when necessary, and displays the application name, the account granting access, each requested read permission and the latest possible access expiry. Approval and denial are explicit. The page lists the owner's latest 100 grants with active, pending, expired or revoked status; disconnect requires confirmation.

The account displayed with consent comes from the exact server review receipt, including when another tab changes the account during page loading. Approval is refused if the current account or source session differs from that receipt. Application names and labels use text rendering, including malicious-looking strings. Mobile layout, error handling and cancellation are covered by browser tests.

**Access lasts at most one hour and can end sooner.** The grant is bounded by the source Supabase access token's expiry minus a 30-second margin and by the expiry shown at review. Signing out of the source session, removing owner membership, disconnecting the grant, or replacing it with a new consent for the same owner/client prevents subsequent requests. A request already executing may finish.

There is no refresh token or automatic extension. The client must start a new authorization flow after expiry. Refreshing the Studio session does not extend an existing grant. This is the deliberate lifetime boundary of 3C.2b; longer-lived access would need a separate credential and renewal design.

## OAuth and MCP contract

The authorization server supports **pre-registered public clients, authorization code and PKCE S256**. It does not advertise dynamic registration, Client ID Metadata Documents, OIDC, confidential-client authentication or refresh grants. This uses a supported path in [OpenAI's MCP authentication guidance](https://developers.openai.com/plugins/build/auth); interoperability with the actual ChatGPT configuration remains an acceptance check for 3C.2c.

| Endpoint | Contract |
| --- | --- |
| `GET /.well-known/oauth-authorization-server` | Canonical issuer, authorization/token/revocation endpoints, supported read scopes, S256, public-client authentication and issuer response support. |
| `GET /.well-known/oauth-protected-resource/api/mcp` | Exact resource audience and authorization server. The origin-level `/.well-known/oauth-protected-resource` is also available. |
| `GET /oauth/authorize` | Exact registered client/callback, `response_type=code`, explicit resource and scope, opaque state and S256 challenge. |
| `POST /oauth/token` | URL-encoded code exchange with exact client, callback, resource and verifier. Returns an opaque Bearer access token, granted scopes and remaining seconds. |
| `POST /oauth/revoke` | URL-encoded token and registered public client ID. Idempotent, with no token-existence disclosure. |
| `POST /api/mcp` | External Bearer authentication followed by the existing stateless MCP adapter and owner-JWT read executor. |

Read scopes remain `crm:read`, `research:read` and `catalog:read`; there are no write scopes. Authorization codes last **60 seconds**, can be exchanged once, and are bound to client, callback, PKCE and resource. A correctly bound replay revokes the token issued from that code, including concurrent exchanges. Invalid bindings fail without consuming a valid code. Requests reject unsupported or duplicate parameters and arbitrary redirects; both successful and eligible error redirects include state and issuer.

The external MCP endpoint refuses admin-cookie authentication and credentials in URLs. It exposes protected-resource discovery through `WWW-Authenticate`, advertises OAuth requirements per tool, and returns the MCP authentication metadata needed for insufficient-scope responses. Tool discovery is filtered to the grant's scopes. Existing read projections, output limits, metadata-only tool logs and RLS remain in effect. The internal `/api/admin?action=crm-tools-mcp` path continues to use the existing admin session.

These boundaries follow [MCP authorization requirements](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [OAuth security guidance](https://www.rfc-editor.org/rfc/rfc9700.html). No endpoint calls a model or requires a paid AI API.

## Credential and database boundaries

External access tokens contain 32 random bytes with an `sv_mcp_` prefix; only their SHA-256 hashes are stored. Authorization codes are also random and stored only as hashes. The external token is neither a Supabase JWT nor an admin session and cannot authenticate directly to those APIs.

The verified owner's source access JWT is encrypted server-side with AES-256-GCM under a dedicated key. Authenticated encryption binds it to the grant ID, owner, client, resource, scopes, source session and expiry. It is never returned to the external client. No Supabase refresh token is copied into OAuth storage. Each request checks the live grant, source session and owner membership, verifies the source user through Supabase Auth, and performs CRM reads with the owner's JWT and existing RLS.

The source-session check is necessary because logout does not itself invalidate an already-issued JWT; [Supabase documents checking the JWT's `session_id` against `auth.sessions`](https://supabase.com/docs/guides/auth/sessions). The private helper checks the session owner and `not_after`. When MCP OAuth is enabled, Shapeviz logout now waits for successful Auth logout before reporting completion or clearing the local session.

Applied migrations:

- `20260923111547_crm_mcp_oauth.sql`: private decision/grant tables, indexes, RLS and narrowly granted state-transition functions.
- `20260923113251_crm_mcp_oauth_pending_expiry.sql`: displays an unexchanged, expired authorization code as an expired connection.

Both private tables deny direct `anon` and `authenticated` access. Public OAuth RPCs use security invoker, a fixed search path and service-role-only execution. A narrow private security-definer helper is required because `service_role` cannot directly select `auth.sessions`; it exposes only a session-validity boolean to that role and adds no Auth table grants. Existing business tables and their RLS policies are unchanged.

Consent requests are encrypted, expire after ten minutes and arrive in a URL fragment that the page immediately removes from history. The page holds them in memory rather than browser storage. A separate HttpOnly, SameSite Strict cookie binds the request to the initiating browser. A second encrypted review receipt binds the displayed consent to the verified owner, session, request and expiry. Decision hashes prevent reusing either approval or denial. New consent replaces previous grants for the same owner/client transactionally.

Revocation clears the stored encrypted JWT. New consent also clears encrypted JWTs from time-expired grants and purges decision receipts older than one day. Grant metadata is retained; there is no scheduled cleanup job in this stage. Removing a registered client blocks its grants at request time, and rotating the encryption key invalidates existing encrypted requests and grants. Either operation requires new authorization before access resumes; this implementation has no key rotation overlap.

## Configuration and delivery

`.env.example` documents the configuration; **`.env` was not changed**. All configuration is server-side:

| Variable | Value / purpose |
| --- | --- |
| `MCP_OAUTH_ENABLED` | Defaults to `false`; external endpoints return 503 until explicitly enabled with valid configuration. |
| `SITE_URL` | Exact canonical HTTPS origin. The issuer is this origin and the resource is this origin plus `/api/mcp`. |
| `MCP_OAUTH_ENCRYPTION_KEY` | Dedicated, securely generated 32-byte key in canonical base64. Do not reuse a Supabase key. |
| `MCP_OAUTH_CLIENTS` | JSON array of `{client_id, name, redirect_uris}` public-client registrations. Callbacks must match exactly, without query or fragment. Use the actual callback shown by the chosen ChatGPT setup. |
| `MCP_OAUTH_ALLOW_LOOPBACK` | Defaults to `false`. Enables explicit HTTP loopback origins only for local testing; refused on Vercel. |

Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` remain necessary for the server. No secret belongs in the browser, callback URL, document or MCP client configuration. The client ID is public; this flow has no client secret.

Implementation lives in `src/oauth/{domain,admin,handler}.js`, with the external adapter in `api/mcp.js`, OAuth entrypoints in `api/oauth/`, and the connection page in `public/admin/connections.*`. Both native server routing and Vercel rewrites include canonical endpoints. Admin actions are `oauth-preview`, `oauth-decide`, `oauth-connections` and `oauth-disconnect`, using the existing verified session and same-origin checks. Token/revocation forms are limited to 8 KiB; consent and MCP JSON requests to 16 KiB. External CORS allows only the issuer and registered callback origins, without credentialed browser access.

## Verification

| Check | Result |
| --- | --- |
| New OAuth domain / HTTP tests | **15 passed**: configuration, exact callback/resource, PKCE, encrypted bindings, review identity, expiry/tampering, discovery, scopes, official MCP client, strict logout failure handling and serverless body parsing. |
| Full unit/API regression | **291 passed, 1 existing opt-in Storage test skipped**, 292 total. Focused OAuth tests also rerun after the final case-insensitive Bearer parsing adjustment. |
| Full browser regression | **158 passed, 10 opt-in live tests skipped**, 168 total. All five new connection UI tests also rerun after binding the displayed account to the review response. |
| Real Auth / Supabase / OAuth / MCP fixture | **1 passed**, 24.4 seconds of test execution. |
| Rollback-only SQL fixture | Passed, including pending-code expiry, private ACLs, owner/session isolation, replay, revocation and source logout. |
| Mobile visual inspection | Passed at 390 px; consent remains readable without horizontal overflow, malicious-looking client text is escaped. |
| Production build and whitespace checks | Passed. |

The live fixture creates two synthetic confirmed owners without sending email, two owned companies, and an isolated local OAuth configuration. It signs in through the real browser form, checks approval and denial, discovers all eight tools with the official MCP SDK, verifies owner isolation and scope denial, and rejects both unknown writes and opaque-token reuse against the admin API and Supabase Data API. It also verifies replacement consent, correctly bound code replay, concurrent code exchanges, UI disconnect cancellation/confirmation, token revocation, membership removal and source-session logout. Business company/activity snapshots remain unchanged by tool execution. Traces and screenshots are disabled for this credential-bearing fixture; synthetic users and dependent grants are removed in `finally`.

Cleanup checks found **zero** remaining OAuth fixture users, fixture companies, private grants or decision receipts. Local and remote migration histories both contain **47 versions**, with the same sorted-version MD5 `1ab6cfa0587e3da3614b093fbf63d673`.

Security advisors report five [RLS-without-policy INFO notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), including the two deliberately service-only OAuth tables. The existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is unchanged. Performance advisors retain the existing [unindexed presentation-session foreign key](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and report 17 [unused-index INFO notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), including the new grant-expiry index after the small test fixture. Those existing unrelated settings and indexes were not changed.

Reproduce unit and UI checks with `node --test tests/oauth-domain.test.js tests/oauth-http.test.js`, `npm.cmd test`, `npm.cmd run test:browser` and `npm.cmd run build`. Live verification is opt-in:

```powershell
$env:LIVE_OAUTH_TEST='true'
npm.cmd run test:browser -- tests/browser/oauth-live.spec.js --workers=1
Remove-Item Env:LIVE_OAUTH_TEST
```

Run browser suites sequentially because their shared setup uses port 4173. The live fixture requires the existing private Supabase configuration; it generates its own temporary OAuth key and client without changing `.env`. Run `supabase/tests/crm_mcp_oauth.sql` as a complete transaction with sufficient test privileges; it ends with rollback. There is no separate lint or typecheck script.

## Next bounded stage

**3C.2c** configures the canonical HTTPS deployment and the exact registered public client/callback from the user's ChatGPT setup, enables OAuth for that environment, and tests authentication, real tool discovery/reads, scope behavior and disconnect through ChatGPT. Deployment requires separate authorization. The official SDK fixture completed here is evidence for the protocol and access boundary, not evidence of a real ChatGPT connection.

**3C.3**, afterwards, separately adds reviewed write tools using the existing validated import, review and enrichment operations. Full Phase 3 remains intentionally unfinished.
