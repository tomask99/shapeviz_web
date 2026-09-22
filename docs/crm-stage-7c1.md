# CRM stage 7c1 — optional lost reason

Implemented 22 September 2026. Migration `20260922184933_crm_lost_reason.sql` applied; application remains local/unpushed along with stages 4–7b.

## Scope

- Add/Edit company exposes Lost reason when status is LOST or a reason is already saved. Choices: No reply, Not interested, Budget, Timing, Already has supplier, Not a fit, Other; Not specified clears it.
- LOST remains valid without a reason. Pipeline drag/menu status updates stay unchanged and never erase the saved reason. Detail shows either Lost reason or Previously saved lost reason when the company is reopened; it is explicitly not interpreted as the current outcome.
- A reason can be corrected/cleared through Edit company. The existing version check prevents stale writes and failed saves retain the draft. Legacy clients omitting the field do not overwrite it.
- This stores the latest manually maintained reason, not a history of each loss cycle. Existing status-change history remains intact; editing the reason alone updates company version/time but does not add a new activity event.
- WON date, sold service, actual project/monthly values and notes are intentionally deferred to the next bounded increment.

## Implementation and security

One additive constrained text column on `crm_companies`, default empty. Only column-level INSERT/UPDATE grants are added to authenticated. Existing owner/admin RLS, JWT authorization and version trigger are unchanged. No new API routes, tables, indexes, Storage actions, dependencies or destructive operations.

`public/admin/crm-outcome.js` centralizes reason choices; `src/crm/handler.js` validates them and `public/admin/crm.js` manages the form/detail UI. Supabase/Postgres skills guided the constrained field and unchanged RLS boundary. Current changelog and table documentation checked.

## Verification

- Node: 87 passed, 1 optional live Storage test skipped.
- Full Playwright regression suite: 79 passed, 1 optional live upload skipped.
- Targeted browser: 4 passed, covering optional reason, save/reload, conflict draft retention, reopening/clearing and existing pipeline moves. Mobile screenshot inspected: `.cache/crm-lost-mobile.png`.
- SQL fixtures passed before and after migration: optional default, invalid choice rejection, retained reason, status history, stale version, cross-owner isolation and anonymous denial. Fixtures rolled back, no client records modified.
- Build, local presentation validation (0 local decks) and whitespace checks passed.
- Browser skills used installed Playwright because agent-browser is unavailable. Browser APIs are mocked; connected SQL verification is separate, not a production end-to-end login.
- Advisors have no new stage-specific finding. Existing notices remain: [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [share-link FK index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No unrelated settings changed.
