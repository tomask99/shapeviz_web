# CRM stage 6 — business Overview

Implemented on 22 September 2026. Database migration `20260922182648_crm_business_overview.sql` applied to the connected project. Application changes remain local; no push or deployment in this stage.

## Scope and definitions

- Overview adds a Sales overview above existing presentation analytics. Templates and CRM subpages hide it; logout clears its data. Presentation performance and website analytics remain separate and unchanged in meaning.
- Total leads counts non-archived companies, including WON and LOST. Contacted, Meetings and Won are current pipeline counts, not historical conversions. Open opportunities means REPLIED + MEETING + PROPOSAL.
- Replies recorded counts distinct non-archived companies with a manual `reply_received` activity, not reply events or the current REPLIED pipeline state.
- Follow-ups count incomplete tasks for non-archived companies: overdue before local midnight, today until the next local midnight, upcoming thereafter. The earliest five incomplete tasks link to company details. All ten pipeline stages link to filtered Leads.
- Local-day boundaries refresh after midnight while Overview is active, including after tab visibility changes. Explicit refresh, loading, empty and retry states are available. CRM read failures do not hide presentation analytics or display misleading zeros.

## Data and security

`crm-overview` reads one `crm_business_overview` RPC using the verified user's JWT. The stable SECURITY INVOKER function has an empty search path, explicit owner filters and existing table RLS. Only authenticated users receive EXECUTE permission. No per-company requests, new tracking, pipeline mutations, Storage changes or schema tables.

The API and SQL validate finite day boundaries (22–26 hours to allow timezone transitions). SQL returns one aggregate JSON object and a bounded five-task list. Supabase/Postgres skills informed the invoker/RLS boundary and aggregate-query design; existing indexes were retained.

## Verification

- Node: 81 passed; 1 opt-in live Storage test skipped.
- Playwright full suite: 76 passed; 1 opt-in live upload test skipped. Covers navigation, filtered-stage links, preserved presentation metrics, escaped company names, failure/retry, logout, mobile width and local midnight.
- SQL fixture tests passed before and after migration: empty state, ownership isolation, anonymous rejection, archived/completed exclusion, distinct replies, DST day boundaries, invalid ranges and five-task bound. Fixture writes rolled back; real client data unchanged.
- Build and local presentation validation passed (0 local decks; production decks are remote).
- Desktop and mobile screenshots inspected in `.cache/crm-overview-*.png`. Browser skills used installed Playwright because agent-browser is unavailable. Browser API responses are mocked; live SQL validation is separate, not a production browser end-to-end login.
- Post-migration advisors show no new stage-specific issue. Existing notices remain: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website_sessions has no client RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [presentation_sessions share-link FK lacks a covering index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No unrelated settings or indexes changed.

## Remaining scope

Stage 7 remains incremental: monetary values, WON/LOST metadata, advanced filtering/reporting and configurable engagement rules. Automatic VIEWED still requires reliable admin-visit exclusion; company-wide engagement is not implemented. Stages 4–6 application changes remain unpushed.
