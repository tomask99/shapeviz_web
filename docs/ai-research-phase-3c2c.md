# AI Research 3C.2c — deployment and desktop MCP connection

23 September 2026. Continues [external authorization](ai-research-phase-3c2b.md).

**Deployed; actual local Work conversation successfully called Shapeviz MCP.** The owner chose the desktop application's Streamable HTTP MCP option. Its shared configuration includes `shapeviz`; OAuth login, eight-tool discovery and `get_research_catalog` succeeded both through the installed client and in the owner's real Work conversation. The owner supplied the successful response screenshot, and the local transcript confirms the tool call and returned catalog. Client-side disconnect/reconnection and first-turn behavior in a fresh conversation remain acceptance checks. A separate web ChatGPT connection has not been created or verified.

## Prepared

Follow-up on 23 September: [import validation](ai-research-import-validation.md) adds a ninth read-only MCP tool and pre-delivery validation instructions. That follow-up is deployed as `dpl_CzsjjY6NSnWLBnjeKstT3a1c2DUA`. The eight-tool client and conversation results below are historical evidence from before this addition. The Phase 3 checkpoint was subsequently pushed as `bb9a539c85fffc43929318f78f17a94244510e18`; the validation follow-up is now included in the [25 September repository completion checkpoint](completion-checkpoint-2026-09-25.md).

`npm.cmd run mcp:check -- https://shapevizweb.vercel.app` checks both protected-resource discovery routes, authorization-server metadata, anonymous MCP initialization denial and the consent page. It requires exact canonical issuer/resource/endpoint values, the three read scopes, public-client support, PKCE S256 and issuer identification. Responses are limited to 64 KiB and requests have a 15-second timeout. Redirects are not followed. The check sends no credentials or cookies, grants no access and reads no CRM data. Exit code is nonzero when any check fails.

The command is in `scripts/check-mcp-deployment.js`. Its integration test uses the actual OAuth handler and confirms that a successful check makes zero database calls. Other cases cover disabled OAuth, invalid origins, deployment-protection redirects, HTML metadata, anonymous success and excessive response sizes.

The owner-facing status and verification prompts are in [chatgpt-connection.md](chatgpt-connection.md). Production retains public web client `shapeviz-chatgpt` with `https://chatgpt.com/connector_platform_oauth_redirect` and adds native client `shapeviz-desktop` with `http://127.0.0.1/callback`.

Production has `MCP_OAUTH_ENABLED=true`, `MCP_OAUTH_ALLOW_LOOPBACK=false`, both client registrations and a newly generated dedicated 32-byte base64 encryption key stored as a sensitive server variable. The key was sent directly to Vercel through stdin and was not saved locally or printed. `SITE_URL` was explicitly set to `https://shapevizweb.vercel.app`. No Supabase credentials were replaced and local `.env` was not changed.

## Desktop support

`src/oauth/domain.js` accepts an explicit `application_type: "native"` registration with a portless HTTP loopback IP callback. It permits the ephemeral listener port required by [RFC 8252 § 7.3](https://www.rfc-editor.org/rfc/rfc8252#section-7.3), while retaining the exact literal IP and path. Arbitrary hosts, `localhost`, alternate IP spellings, query strings, fragments and credentials are rejected. Web callbacks remain exact; the production issuer remains HTTPS. Consent and the grant preserve the concrete requested URI, and the existing SQL exchange checks that exact URI including port. No database change was needed.

The desktop app and CLI share configuration as documented in [OpenAI MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The installed `codex-cli 0.155.0-alpha.16.3` registered the client using `codex mcp add shapeviz --url https://shapevizweb.vercel.app/api/mcp --oauth-client-id shapeviz-desktop`; the owner completed the resulting consent flow and the CLI reported `Successfully logged in.` The configuration and OAuth storage were managed by the CLI. No token was pasted into a header or printed. Do not add `--oauth-resource` to this command: this installed version also discovers the resource and otherwise sends it twice.

Verification used the installed app-server's `mcpServerStatus/list` and `mcpServer/tool/call` in an ephemeral thread without starting a model turn. It returned OAuth authentication, all eight expected tool names and a successful catalog result. The user's grant remains active; revocation tests use synthetic accounts instead.

Follow-up after the owner fully restarted the desktop app: the owner explicitly confirmed using **Chat**. That conversation reported no Shapeviz tool; an earlier conversation had substituted Supabase. Neither is a successful conversation acceptance check. The desktop app's own startup log confirms successful Shapeviz initialization after restart. Verification was repeated with the exact desktop binary (`codex-cli 0.155.0-alpha.16`, distinct from the IDE's `.16.3`) and returned `runtimeStatus: connected`, OAuth, all eight tools and a successful catalog call. The next user check must use **Work → Work locally**, so the conversation runs through the configured local host. Do not advise another restart as the fix or describe ordinary Chat as verified.

### Confirmed first-turn startup race and configuration fix

The owner subsequently tried local Work and still received “tool unavailable”. This was verified against the exact local thread, not inferred from its screenshot: thread origin `codex_work_desktop`, local environment, desktop version `.16`. Its first assistant tool searched `ALL_TOOLS` and found no Shapeviz entry. The corresponding `codex_mcp::connection_manager::tool_catalog` log explicitly says `omitting pending optional MCP server server_name=shapeviz` during both startup prewarm and the first model step. Desktop notifications show Shapeviz starting at 15:55:51.419 UTC and ready at 15:55:54.972 UTC, after the initial tool catalog was captured. Later notifications still show it ready. Switching modes was insufficient to resolve this timing issue.

Updated the shared local config with top-level `mcp_optional_startup_grace_ms = 0` and `[mcp_servers.shapeviz] startup_timeout_sec = 30`. As documented in [OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), zero waits for each optional server's startup timeout rather than the default 1,000 ms grace period. Shapeviz remains optional: an outage or expired OAuth does not turn it into a mandatory dependency for every unrelated conversation. This global grace change may add a few seconds at startup for other optional MCP servers too. No credentials, other server definitions, application runtime or deployment were changed.

After the configuration edit, the exact desktop binary parsed the new timeout and a fresh ephemeral client again returned connected OAuth status, eight tools and successful catalog content. This is configuration/transport verification, not proof of model conversation success. The immediate owner acceptance step is to send another tool request in the existing Work conversation, whose server is already ready. Future fresh threads use the adjusted grace setting when the application loads the updated configuration.

### Real conversation acceptance confirmed

The owner retried in the same local Work conversation and supplied the successful response screenshot. The local transcript independently confirms eight `mcp__shapeviz__*` tools discovered at 16:34:29 UTC, followed by `tools.mcp__shapeviz__get_research_catalog({})` at 16:34:32.552 UTC. The tool returned the structured catalog at 16:34:34.575 UTC; the assistant then summarized services, classifications, opportunity signals, the import schema and three ICP profiles. This is direct Shapeviz MCP use, not Supabase fallback or a standalone protocol fixture. It confirms conversation discovery, selection, execution and result rendering for the catalog. It does not yet prove the first-turn race cannot recur in a newly created conversation, or the UI flow for expired/revoked credentials.

## Current deployment evidence

- Verified existing project `shapeviz_web`, project ID `prj_Pzrq9NdhthrAIdjwXxsxJ7RlEEQu`, team `team_2Ji2B1mrLU2jX7d1D0ZFAwGW` (`tomask99-s-projects`), canonical alias `https://shapevizweb.vercel.app`.
- **Production READY:** `dpl_FdGVNk8Fbr3BUdonJYpsijgWGYAe`, [deployment](https://shapeviz-9vwrqa2dg-tomask99-s-projects.vercel.app), build completed in 18 seconds. Includes native desktop callbacks. Node 24; `framework: null` and `dist` output from repository configuration.
- The first deployment returned OAuth 503. Explicitly setting the canonical `SITE_URL` and redeploying resolved it. All five checks now pass, including metadata discovery, anonymous MCP rejection and the consent page.
- CLI access is restored. The connected Vercel app's earlier scope/argument errors were bypassed using the authenticated CLI.
- Deployment uses the local working tree based on Git HEAD `e96a178`, including uncommitted Phase 3 changes. No Git push was performed. Later test/documentation changes do not modify the deployed application runtime.
- Existing database migration verification remains the evidence recorded in 3C.2b; this stage adds no migrations.

## Verification

| Check | Result |
| --- | --- |
| Final full unit/API regression | 297 passed, 1 opt-in Storage test skipped; 298 total, including native redirect and concrete-port binding checks. |
| New deployment readiness tests (included above) | 4 passed, including the real OAuth handler with no database access. |
| Full browser regression before native extension | 158 passed, 10 opt-in live tests skipped; 168 total. |
| OAuth browser regression after native extension | 5 passed. |
| Production build and Vercel deployment | Passed; READY on the canonical alias. |
| Public deployment readiness | All five checks passed. |
| Production web Auth / OAuth / MCP fixture before native extension | 1 passed in 1.1 minutes. |
| Production native Auth / OAuth / MCP fixture | 1 passed in 1.1 minutes, including rejection of exchange on another callback port, eight tools, two-owner isolation, read scopes, code replay, concurrent exchange, disconnect, revoked membership and source logout. |
| Production error-log scan | No error-level logs returned for the current deployment after the fixture. |
| Independent SQL cleanup check | Zero fixture users, companies, grants and decision receipts remain. |
| Owner's installed client login / discovery / catalog call | Passed with saved OAuth credentials; eight tools and successful `get_research_catalog`. |
| Actual local Work conversation discovery / catalog call / rendering | Passed; owner screenshot plus transcript confirm direct Shapeviz MCP use at 16:34 UTC. |
| Fresh conversation first-turn behavior and client disconnect/reconnection | Pending; server revocation is verified separately by the production fixture. |
| Separate web ChatGPT connection | Not created or verified; not required for the chosen desktop setup. |

Local regression logs are in ignored `.cache/phase-3c2c-unit.log`, `.cache/phase-3c2c-browser.log`, `.cache/phase-3c2c-desktop-unit.log` and `.cache/phase-3c2c-desktop-live.log`. The live OAuth fixture supports an explicit production mode restricted to the verified canonical origin. It uses temporary owners and intercepts the web or loopback callback in the test browser. These fixtures are distinct from the successful real installed-client login and catalog call.

The earlier web production run is recorded in `.cache/phase-3c2c-production-oauth.log`. Cleanup tolerates only 401/403 for redundant logout of an already-revoked token; other cleanup errors still fail the test. The native production fixture allows 15 seconds for the initial remote connection-list load after a first run exceeded the local five-second expectation. The complete rerun passed and removed its temporary users and company data; independent SQL counts confirmed zero fixture users, companies, grants and decision receipts. Business snapshots before and after read-tool execution were identical. No screenshots, traces, passwords, codes or access tokens are retained by this credential-bearing test.

To rerun explicitly against this production deployment:

```powershell
$env:LIVE_OAUTH_TEST='true'
$env:LIVE_OAUTH_ORIGIN='https://shapevizweb.vercel.app'
$env:LIVE_OAUTH_NATIVE='true'
npm.cmd run test:browser -- tests/browser/oauth-live.spec.js --workers=1
Remove-Item Env:LIVE_OAUTH_TEST
Remove-Item Env:LIVE_OAUTH_ORIGIN
Remove-Item Env:LIVE_OAUTH_NATIVE
```

Omit `LIVE_OAUTH_NATIVE` for the web callback fixture. Without either production setting, the opt-in fixture starts its local server. The default browser suite skips it. Temporary database changes are restricted to synthetic test owners and cleaned up in `finally`.

## Resume

1. Continue using the working local Work conversation. The catalog acceptance check is complete; the guide also includes owner CRM/Research read prompts.
2. When checking a fresh conversation, confirm the adjusted startup grace exposes Shapeviz on its first turn. During a deliberate acceptance check, verify desktop behavior after disconnect and reauthenticate; do not revoke the owner's newly working grant merely to repeat the server fixture.
3. Keep 3C.2c open for those remaining client acceptance checks; 3C.3 write tools are a separate bounded stage. Access remains limited to at most one hour and the source session; there is no automatic token renewal.
