# CRM stage 7b — separate open-pipeline estimates

Implemented 22 September 2026. Migration `20260922184332_crm_pipeline_value_summary.sql` is applied. Application stages 4–7b remain local, without push or deployment.

## Scope and meaning

- Business Overview displays One-time pipeline and Monthly opportunities separately, with EUR amounts and number of companies with an estimate.
- Both use the existing Open opportunities definition: non-archived companies currently in REPLIED, MEETING or PROPOSAL. Earlier stages, WON, LOST and archived companies are excluded.
- These are unweighted estimates, not revenue, forecast income or historical conversion statistics. Monthly amounts are not annualized or added to one-time amounts.
- Missing amounts and supplied amounts with UNKNOWN frequency are excluded from both sums and reported as separate company counts. With no supplied estimates a card says Not estimated; an explicit zero estimate displays EUR 0.00.
- Missing/malformed value payloads display an unavailable message with Refresh sales guidance while other dashboard sections remain available. Normal refresh, local-midnight refresh, navigation and logout reuse existing behavior.

## Implementation

- Extends the existing SECURITY INVOKER `crm_business_overview` RPC with `pipeline_value`; all previous response fields and day-boundary semantics remain intact. One bounded response, no per-company calls and no new API route/table/index.
- Aggregates exact numeric amounts in Postgres and returns totals as decimal strings. `public/admin/crm-pipeline-value.js` renders localized EUR using BigInt integer formatting and exact fractional digits, without rounding totals through JavaScript Number.
- Owner predicate, existing table RLS and authenticated-only function EXECUTE remain unchanged. No writes to company data, Storage or tracking. Existing clients ignore the additive response field safely.
- Supabase/Postgres skills informed the invoker/RLS boundary and exact arithmetic. Browser skills used installed Playwright because agent-browser is unavailable.

## Verification

- Node: 85 passed, 1 optional live Storage test skipped.
- Full Playwright regression suite: 78 passed, 1 optional live upload skipped.
- Four targeted Overview browser tests passed, covering separate amounts, explicit zero, missing estimates, refresh, malformed data fallback, navigation/logout, midnight and retained presentation analytics.
- SQL fixtures passed before and after migration: exact decimal sums, frequency separation, archive/closed/early-stage exclusions, zero vs missing, status/amount updates, owner isolation, non-admin isolation and anonymous denial. Existing stage 6 Overview SQL regression also passed. Fixture data rolled back.
- Build and local presentation validation passed (0 local decks; production content is remote). Desktop and 320px mobile screenshots inspected: `.cache/crm-overview-desktop.png`, `.cache/crm-pipeline-value-mobile.png`. Very long amounts wrap rather than overflow.
- Browser responses are mocked; connected-database SQL checks are separate, not a production browser end-to-end login.
- Advisors show no new stage-specific issue. Existing notices: [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [share-link FK index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No unrelated settings changed.

## Next step

Optional WON/LOST metadata, keeping estimated opportunity amounts separate from actual won project/recurring values. Automatic VIEWED and aggregate engagement scoring remain deferred as documented in the implementation plan.
