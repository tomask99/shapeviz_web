# Phase 2A.3 — Rule-based follow-up suggestions

Implemented 22 September 2026. Database migration applied; application changes remain local, unpushed and undeployed.

## Completed scope

Overview now places recommendations between Today tasks and Recent Activity. Five deterministic rules use real company state and the existing 30-day checked-visit signals; no AI scoring, messages, meetings or pipeline changes are triggered. One recommendation per company, in this precedence:

1. MEETING with no pending task.
2. REPLIED with no pending task.
3. Existing HOT engagement with no pending task; underlying checked visits, seconds and clicks are shown.
4. Last checked presentation visit at least three days ago, no recorded reply, no pending task, and an outreach/presentation stage.
5. QUALIFIED without recorded outreach, reply or checked visits, and no pending task. Historical status transitions prevent a reopened qualified lead being described as never contacted.

All pending tasks suppress recommendations, including overdue tasks already visible in Today. Archived and WON/LOST companies are excluded. This conservative behavior avoids recommending duplicate work. Qualified wording is explicitly **without recorded outreach**, not proof that contact never occurred.

Create follow-up reuses the existing editor: company/title prefilled, existing next-day default due time, editable date/contact/description before saving. Saving uses the original owner/company/version validations and history triggers, then refreshes suggestions. No task is created just by opening the dialog.

Snooze lasts 24 elapsed hours (database clock). Dismiss lasts until restored for that company/rule. Hidden rules can be restored from the snoozed/dismissed view while they still match current data. Another higher-priority rule may appear after a status/signal change. Expired snoozes return on refresh/navigation; there is no realtime subscription. A dismissed lower-priority rule never bypasses a currently matching higher-priority rule. Existing activities are not edited or deleted.

## Files and API

New files:

- `supabase/migrations/20260922200152_crm_suggestions.sql`
- `supabase/tests/crm_suggestions.sql`
- `src/crm/suggestions.js`
- `public/admin/crm-suggestion-rules.js` (display titles/explanations)
- `public/admin/crm-suggestions.js`
- `tests/crm-suggestions.test.js`
- `tests/browser/crm-suggestions.spec.js`

Modified: `src/crm/handler.js`, `src/admin/handler.js`, `public/admin/crm-followups.js`, `crm-action-center.js`, `crm-overview.js`, `crm.css`, `tests/browser/crm-live.spec.js` and the phase plan.

Existing `/api/admin` actions extended with read `crm-suggestions` and POST-only `crm-suggestion-state`. No public route or dependency added.

## Schema / business rules / security

One additive table, `crm_suggestion_state`, keyed by company/owner/rule, with mutually exclusive nullable dismissal/snooze timestamps. Composite company ownership FK, RLS, owner lookup index, explicit grants. Owner IDs and timestamps are never accepted from the browser. State upsert is atomic; restore clears preference fields without deleting history.

Central SQL `crm_suggestion_config()` owns timing/page thresholds; `crm_suggestion_rule()` owns precedence and conditions. `crm_suggestions()` aggregates existing signals server-side and returns ten cards per stable priority/company page. `crm_set_suggestion_state()` validates rule/action/company and sets state with the database clock. Every function uses invoker privileges and an empty search path, with anonymous/public execution revoked. Reads and writes use the authenticated user JWT, not service-role CRM queries.

Migration name/version reconciled with the applied Supabase migration. No startup reset, backfill, environment variables or manual configuration required on the connected project. Other environments must apply the migration before deploying the UI.

## Verification

- Node: 96 passed, 1 opt-in Storage test skipped.
- Build and `git diff --check`: passed.
- Scoped browser regression: 9 passed, covering suggestions, Today and the original Follow-ups workflow.
- Full browser regression: 90 passed, 2 opt-in live tests skipped; the CRM live test was run separately and passed.
- Mobile screenshot `.cache/suggestions-mobile.png` visually inspected: readable, actions wrap, no horizontal overflow. Browser checks cover persisted mocked state, snooze/dismiss/restore, editable defaults, failed-save draft preservation, retry and late-response navigation cleanup.
- Real local app → Supabase Auth/API/RLS → UI test passed: snooze survives reload, restore/dismiss work, editable follow-up saves once and suppresses the recommendation. Isolated fixture user/data removed in `finally`; sessions revoked before deleting the temporary user.
- Transactional SQL tests passed: rule thresholds, missing-data behavior, closed/archived exclusion, overdue-task suppression, page boundaries, snooze expiry, state idempotence, history preservation and two-owner/anonymous access isolation. Fixtures rolled back.
- Cleanup query confirmed zero fixture users, companies, decks and orphan suggestion states.

Supabase skills guided explicit RLS/grants, invoker RPCs, centralized SQL rules and real database verification. No new advisor findings. Existing unrelated notices remain: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website_sessions has no client RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [existing share-link FK index notice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Auth configuration was not changed.

## Intentionally deferred / next

No “never opened” rule: legacy unchecked sessions and incomplete tracking coverage cannot prove absence of visits. Multiple views are represented by existing HOT signals, not another duplicate card. Engagement scoring itself remains the Phase 1 implementation, pending Phase 2B. No meeting entity, per-recipient inference, dismissal reason field, automatic contact or bulk actions.

Next: **2A.4 recipient-specific secure links and share workflow**, preserving generic links and existing analytics. Quick notes and saved views follow separately. Phase 2A as a whole is not complete.
