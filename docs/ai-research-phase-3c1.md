# AI Research 3C.1 — authenticated read tools

23 September 2026. A bounded backend delivery following [company Insight and enrichment](ai-research-phase-3b2c.md).

**Completed and verified.** Eight authenticated read tools are available through the existing admin-session API. External MCP authorization and the ChatGPT connection remain the next bounded stage.

## What this stage enables

Shapeviz exposes eight named business reads through a shared registry, executor and existing authenticated admin API. A future ChatGPT/MCP transport can reuse those operations without exposing tables, SQL or generic database access. This stage uses the current Shapeviz session; it does not create a remote MCP server, OAuth integration or ChatGPT connection. There is no new screen, AI API dependency or automatic research.

| Tool | Data and boundaries |
| --- | --- |
| `search_leads` | Current company profiles with exact country, industry, Fit and service filters; literal company-name search, pipeline/archive filters and pages of 25. Includes owned Clients; `is_client` comes from the actual Client relation. |
| `get_lead` | Current narrow company profile, latest canonical AI Insight and original approved Research link. Archived companies remain readable. |
| `check_company_duplicates` | Shared normalized-domain or name/country check across CRM and all Research states. Returns exact match count and at most ten examples, explicitly marked when incomplete. |
| `get_research_candidates` | Existing strict Research filters and bounded metadata pages, without full evidence or event history. |
| `get_research_candidate` | One owned candidate with canonical field provenance, public sources and recommendations. No rejection text, event metadata or manual-edit markers. |
| `get_existing_domains` | Sorted pages of 100 from the complete bounded exclusion set, including Clients, archived companies and rejected Research. Refuses overflow above 10,000 domains. |
| `get_rejected_domains` | Sorted distinct domains from rejected Research, 100 per page; no rejection reasons or company identities. |
| `get_research_catalog` | Shared service mappings, ICP guidance, taxonomies and canonical import schema. |

Company tools omit contacts, notes, financial values, priority, lead source, follow-ups, engagement and presentation data. Company-name search never searches contacts or notes, so those fields cannot affect whether a company is returned. Research text remains private stored content; tool responses mark it as untrusted data. Schema validation preserves evidence structure, not proof that a source claim is true or current.

Current company fields and historical research may differ. The latest accepted enrichment report takes precedence over the original approved candidate, whose link remains available. No tool overwrites either record. ICP guidance never produces an objective numeric score.

## Calling the internal adapter

- `GET /api/admin?action=crm-tools-list` returns the authenticated tool definitions and strict input schemas.
- `POST /api/admin?action=crm-tools-call` accepts exactly `{tool,arguments}`. Calls use the existing same-origin HttpOnly admin session.

For example, in the browser console of a signed-in Shapeviz page:

```js
const response = await fetch('/api/admin?action=crm-tools-call', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    tool: 'search_leads',
    arguments: {
      filters: {country: 'SK', industry: 'Furniture', fit: 'HIGH', service: 'Product CGI'},
      page: 1
    }
  })
});
const result = await response.json();
```

The result includes schema version, a server-generated request ID, tool name, structured data and `read_only` / `untrusted_data` metadata. Requests are capped at 16,384 UTF-8 bytes; responses at 1,000,000 bytes. Overflow returns an error rather than partial data. List tools expose explicit pagination; each request reads current data, not a frozen snapshot. Finish every page before using an exclusion set and account for later CRM changes. A company without a recorded website can still exist; domain absence alone does not rule out duplicates.

See the [implementation contract](ai-research-phase-3c1-contract.md) for signatures, scopes, projections and limits. Arguments cannot choose owners, scopes, SQL, tables, columns, RPCs or arbitrary endpoints. Write operations are not registered.

## Access and logging

The HTTP adapter verifies the current owner through existing session handling. The shared service also checks owner membership with that user's JWT, including for static catalogs. Fixed admin-session scopes are `crm:read`, `research:read` and `catalog:read`; each tool requires its declared subset. Future transports must verify caller identity and derive granted scopes on the server. Passing a bearer token to the current admin adapter does not authenticate it.

Data reads use the verified owner JWT, explicit owner/record conditions and existing RLS. The two new read RPCs are invoker functions, grant execution only to authenticated callers and recheck current owner membership. They reuse existing CRM/Research storage and do not add tables. These controls follow the current [Supabase Data API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

Admitted adapter requests emit `crm_read_tool` server log records with request ID, verified owner ID, controlled tool name, timestamp, duration, status and successful response size. They omit arguments, search strings, result content, cookies, tokens and raw errors. Logs are operational diagnostics; retention and availability belong to the hosting log system. They are not a durable database audit ledger, and logging failure does not modify the read result. Requests rejected before the adapter are handled by existing HTTP/session guards.

There are no new packages, credentials or environment variables. Existing import, review, approval, contact and enrichment writes retain their current explicit confirmation workflows.

## Verification

Applied migration: `supabase/migrations/20260923103216_crm_read_tools.sql`. Local and remote migration lists both contain **45 versions**, with matching MD5 `1450ea11bf379c0618235fd9f3c91e59` over the sorted, newline-joined version strings. This verifies version alignment, not SQL-file content equality.

| Check | Result |
| --- | --- |
| Focused domain and HTTP tests | **26 passed**: 20 domain/registry cases and 6 HTTP gateway cases. |
| Full unit/API regression, `npm.cmd test` | **266 passed, 1 existing opt-in Storage test skipped**; 267 total. |
| Full browser regression, `npm.cmd run test:browser` | **153 passed, 9 opt-in live tests skipped**; 162 total. |
| Isolated real-session read-tool flow | **1 passed** in 23.9 seconds; two temporary owners and cleanup in `finally`. |
| New SQL read-tool fixture | **Passed**, with all fixture data rolled back. |
| Related SQL regressions | **2 passed**: Research inbox and company enrichment; both rolled back. |
| Build / whitespace | `npm.cmd run build` and `git diff --check` **passed**. |
| Independent review | Client relation embedding was corrected to support PostgREST object/null and bounded array forms; no remaining blocking findings. |
| Cleanup | Independent SQL confirmed **0** temporary test users/admins and tool-fixture companies, candidates, contacts, notes, Clients, Research events, activities, reports, import batches and review operations. |

The live test exercises every tool, exact filters and service capitalization mapping, literal company-only search, current Client membership versus unconverted WON Leads, archived reads, latest Insight and approved fallback, canonical sources/provenance, thirteen duplicate matches with an explicitly truncated ten-row sample, and complete pagination of 112 existing and 106 rejected domains. It checks other-owner 404, owner/scope/write/SQL injection rejection, revoked membership 403 and logout 401. Complete before/after snapshots of eight business tables for both owners remained identical.

Focused tests also cover strict input schemas, scope-filtered discovery, missing scopes, current JWT membership even for catalogs, malformed upstream data, response/input bounds, safe audit metadata, session refresh, nested catalog isolation and a valid complete domain set exceeding 1 MB before pagination. The SQL fixture verifies direct anon/service-role denial, invoker/stable function properties, exact projections, literal `%_` search, private-field search isolation, deterministic pages and removal of owner access. Local Docker/Supabase is unavailable, so SQL fixtures ran in rollback transactions on the connected project.

Security advisors are unchanged: three existing RLS-without-policy INFO notices and the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Performance advisors retain the existing unrelated [unindexed foreign key](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) `presentation_sessions_share_link_id_fkey` and 17 unused-index notices. There are no new findings or unrelated configuration changes.

To rerun the isolated flow on Windows, set `$env:LIVE_READ_TOOLS_TEST='true'`, run `npm.cmd run test:browser -- tests/browser/read-tools-live.spec.js --workers=1`, then remove the variable. It uses fictional company data and confirmed synthetic test accounts, with no email, website research or outreach. No visual UI changes were made in this stage; the complete existing browser suite covers UI compatibility.

## Next bounded delivery

**3C.2 — authenticated MCP transport and ChatGPT connection.** Choose and implement external authorization, consent, scoped credentials and revocation, then adapt this tested read registry. Reviewed write tools follow separately. This stage does not claim that ChatGPT is already connected.

Application changes remain local; no Git push or deployment is included.
