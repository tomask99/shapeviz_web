# AI Research 3A.2 — private inbox

23 September 2026. Scope: stage 3A.2 of [the Phase 3 plan](ai-research-phase-3-plan.md).

Company research now has a separate, private inbox in Sales. Owners can browse compact candidate cards, search/filter/sort them, open evidence details and return to the same filtered list. This stage is read-only: candidates do not become Leads and users cannot import, approve, reject or edit records yet.

The database migration is applied to the connected `shapeviz_web` Supabase project. Application changes are local and have not been committed, pushed or deployed. There are no seeded example candidates in the user's inbox. Until the importer is added in 3A.3, an empty inbox is expected.

## Routes and UI

- `/admin/ai-research`: Sales navigation, server-side search, status/Fit controls, advanced filters, seven sort modes and pages of 25 records.
- `/admin/ai-research/:id`: profile/classification, products/markets, positioning with provenance, Fit explanation, service relevance, signal evidence, pitch angle, sources, duplicate-check state and research metadata.
- Explicit loading, empty inbox, no matches, missing record and retry states. URL filters survive detail navigation and browser history. Late requests cannot overwrite another CRM page.
- Missing duplicate checks say **Not checked yet**; this is never presented as a duplicate-free result. Actual cross-table duplicate detection remains in 3A.3.
- Research strings are escaped and external links allow only HTTP(S) without credentials, with `noopener noreferrer`. Source references scroll/focus the cited source without reloading the detail.
- Desktop and 390px mobile layouts reuse the existing dark/amber Studio styles. No artificial import/approval buttons or paid embedded chatbot.

New browser modules: `public/admin/research.js`, `research.css`, `research-filters.js`. Integration changes: `crm.js`, `studio.js`, `index.html`, `server.js`, `vercel.json`.

## API and private data

New `src/research/handler.js` is dispatched through the existing CRM/admin boundary:

- `GET /api/admin?action=crm-research-list`: validated filters/page, user-JWT invocation of `crm_research_list`.
- `GET /api/admin?action=crm-research-detail&id=<uuid>`: explicit owner/id filter and explicit detail projection; inaccessible/nonexistent IDs return 404 after authentication.

Both retain verified owner membership, authentication and no-store response headers. Query parameters reject repeated/unknown keys, ownership injection, invalid enum values and invalid/out-of-range pages. There is no new write endpoint.

Filter keys: `q`, `country`, `country_category`, `industry`, `business_type`, `product_category`, `market_segment`, `fit`, `research_confidence`, `research_status`, `potential_service`, `opportunity_signal`, `source_origin`, `duplicate_status`, `last_researched`, `sort`, `page`. Search matches company/domain, description, industry/business type, products, markets, pitch and service names. It treats `%` and `_` as literal text. Taxonomy text filters allow the contract's custom values.

The list omits full sources, field provenance, signal evidence, complete research summaries and owner IDs. Cards contain at most three strongest service recommendations and three signal tags. Detailed evidence is requested only when opening a candidate.

## Database migration

`supabase/migrations/20260923080416_crm_research_inbox.sql`:

- Adds **`public.crm_research_candidates`**, independently of `crm_companies`.
- Stores the 3A.1 classification/research fields, Fit/reason, confidence, sources and provenance. Sources and evidence stay inside the same owner-scoped row rather than introducing a separate ownership surface.
- Adds lifecycle metadata: status, research/audit dates, version, rejection reason, duplicate company link and last duplicate check. Lifecycle actions are intentionally not exposed yet.
- Generates normalized company name, country group, source count and signal count. Normalized domain is supplied by the shared JavaScript validator when persisting a proposal. Future writes must not accept caller-supplied normalization.
- Adds owner-scoped indexes for created time, normalized domain/name, status, Fit, country, industry and last researched time; a composite duplicate-company FK/index prevents cross-owner links; JSON indexes support service/signal filtering.
- Private invoker trigger maintains version, timestamps, immutable owner/ID and searchable text.
- **RLS + explicit grants:** authenticated owners can SELECT only when they retain owner membership in `presentation_admins`. No anonymous table/RPC access, no authenticated INSERT/UPDATE/DELETE privilege. Service-role writes are reserved for trusted server operations and isolated fixtures.
- Adds **`public.crm_research_list(jsonb, integer)`**, a read-only security-invoker RPC with explicit owner filtering, validated query shape, bounded page size and stable ID tie-breaker.

The CLI created the migration scaffold. After successful transaction-only checks, the migration was applied through Supabase; the local filename was reconciled to the actual recorded version `20260923080416`. No existing company or presentation schema was modified.

Read permissions do not authorize future writes. Stage 3A.3 must add its reviewed transactional import operation, validate every proposal with the shared schema, add necessary database write policies/grants and test direct-API bypass paths before exposing imports. Do not grant broad writes merely to make an importer work.

Search currently scans searchable text within the owner's matching records; indexed filters and paginated responses bound the read flow. Trigram/full-text indexing can be added if measured search volume warrants it. No claim of indexed substring search is made.

## Validation and import/Lead boundaries

The 3A.1 candidate schema and JSON example remain unchanged. This stage adds read-filter validation only. It does not change the import format, calculate duplicate matches, map candidates to Leads, extend Lead services/source constraints, send outreach or expose ChatGPT/MCP writes. The source and evidence data model is ready for later reviewed imports.

## Verification

- `tests/research-inbox.test.js`: filter validation, JWT/owner-scoped list/detail, private API access, read-only action boundary and deep-link shell/cache protections.
- `tests/browser/research.spec.js`: five browser cases covering navigation/detail/source references, filters/sort/paging/history, error recovery/empty states, delayed-response navigation, mobile and hostile research content.
- `supabase/tests/crm_research.sql`: executed both with the proposed migration in a rolled-back transaction and against the applied schema. Checks own/other-owner/non-admin/removed-admin/anonymous access, forbidden direct writes, cross-owner FK protection, literal searches, combined filters, source payload projection, sorting and non-overlapping pagination. Every fixture is rolled back.
- `tests/browser/research-live.spec.js`: real Supabase Auth → admin API → owner-JWT/RLS → list/detail rendering. Passed using an isolated temporary account and validated candidate; direct authenticated insertion was denied, filters and reload worked, no Lead was created, logout removed API access. Fixtures were cleaned in `finally`.
- Screenshots in `.cache/research-live-desktop.png`, `.cache/research-live-detail-desktop.png`, `.cache/research-live-detail-mobile.png` and the mocked mobile cases were visually inspected. No horizontal overflow or page errors in the Research flow.
- The agent-browser CLI could not configure its Chrome connection on this machine (connection timeout); verification used the repository's working Playwright/Chrome setup. Its isolated browser session was closed.
- `npm.cmd test`: **133 passed, 1 opt-in Storage test skipped**.
- `npm.cmd run test:browser`: **101 passed, 3 opt-in live tests skipped**. Existing Leads, Pipeline, Follow-ups, contacts, notes, Studio, presentations, analytics, auth and public-site cases remain green.
- Explicit `LIVE_RESEARCH_TEST=true` run: **1 passed** after the final UI changes. Database cleanup checks confirmed zero remaining test users/candidates.
- `npm.cmd run build` and `git diff --check`: **passed**. There are no separate lint/typecheck scripts in this repository.

Supabase security advisors found no new Research security issue. Existing unrelated findings remain: [website session RLS without a policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Performance advisors report [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), including indexes on the new, empty table, and the existing [presentation share-link FK index recommendation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). No unrelated settings were changed.

## Configuration and next step

No new package dependency or AI credential is required. The existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and owner Auth setup must be available to the app. The missing `SUPABASE_URL` was added to the ignored local `.env`, using the connected Shapeviz project; existing credentials were preserved. The live test also supplies that known project URL explicitly. No production environment variable was changed.

Run the isolated live check explicitly with `LIVE_RESEARCH_TEST=true`; it creates and then deletes its own test account/candidate. Default browser runs skip it. Local Supabase/Docker is unavailable, so SQL was verified using the connected project's transaction-only fixtures instead of a local reset.

Next: **3A.3 — paste/upload JSON, preview/validation, cross-table and intra-batch duplicates, reviewed atomic import with retry safety, and the ChatGPT prompt helper.** Lead approval/rejection remains 3A.4.
