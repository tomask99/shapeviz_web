# CRM stage 7a — optional opportunity value

Implemented 22 September 2026. Migration `20260922183619_crm_opportunity_value.sql` applied; application remains local with stages 4–6, without push/deployment.

## Scope

- Add/Edit company has a collapsed optional estimate section, expanded when editing an existing amount. Amounts are explicitly EUR and estimates, not booked revenue.
- One estimate per company, with ONE_TIME, MONTHLY or UNKNOWN frequency. Detail Overview displays the formatted amount and frequency; it is not added to pipeline cards or aggregated on the dashboard yet.
- Blank clears the amount and resets frequency to UNKNOWN. Zero remains a real value. Decimal comma and decimal point are accepted; negative, nonfinite, exponent, grouped or >2-decimal input is rejected without silent rounding. Maximum is EUR 999,999,999.99.
- Validation is shared between browser and server in `public/admin/crm-value.js`; API maps invalid input to 400. Omitted fields in older clients remain untouched during company edits.
- Existing verified JWT, owner predicates, RLS, admin-role checks and optimistic version checks are reused. Failed writes preserve the form draft.

## Database

Two additive columns on `crm_companies`: exact `numeric estimated_value` (nullable) and constrained `text value_type` (default UNKNOWN). CHECK constraints validate range, precision, frequency and empty-value consistency. Unconstrained numeric plus a precision CHECK rejects excess decimals instead of silently coercing them to scale two.

Only INSERT/UPDATE grants for these two columns are added to authenticated. Existing RLS and version/audit triggers remain in effect. No new table, route, dependency, public access, Storage mutation or client-data backfill. Existing companies receive no estimate. Value edits bump the company version/updated time; no new value-change activity event is introduced.

Supabase/Postgres skills informed exact numeric storage, column-scoped grants and unchanged RLS. Current [Supabase table documentation](https://supabase.com/docs/guides/database/tables) and changelog were checked; no relevant breaking change was identified.

## Verification

- Node: 83 passed, 1 optional live Storage test skipped.
- Full Playwright regression suite: 77 passed, 1 optional live upload skipped.
- Targeted browser checks: 5 passed, including create/reload/edit, comma normalization, invalid precision, conflict draft retention/retry, monthly/zero/clear and mobile layout. Screenshot inspected: `.cache/crm-value-mobile.png`.
- SQL transaction fixtures passed both before and after applying migration: default compatibility, exact amount round-trip, stale writes, legacy updates, invalid inputs, zero/clear, cross-owner isolation and anonymous denial. All fixture data rolled back.
- Build, local presentation validation (0 local decks) and diff whitespace checks passed.
- Browser skills used installed Playwright because agent-browser is unavailable. Browser APIs are mocked; SQL checks run separately against the connected database. This is not a production browser login test.
- Advisors contain the same pre-existing notices as stage 6: [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [share-link FK index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No new stage-specific issue.

## Next bounded step

Separate open-pipeline totals for one-time and monthly estimates, explicitly excluding unknown-frequency values from those sums. WON/LOST metadata remains a later step; estimated value is not a substitute for actual won project/recurring revenue.
