# CRM stage 4 — Follow-ups

Implemented 22 September 2026. Application changes are local and not yet pushed or
deployed. The additive Supabase migration is already applied and verified; it is
compatible with the currently deployed stage-3 application (`8b26e50`).

## Delivered

- `/admin/follow-ups`, sidebar entry and company-scoped `?companyId=<uuid>` view.
- Schedule from the company detail or search/select an active company globally.
- Title, local due date/time, optional description and optional company contact.
- Edit/reschedule and mark complete; no hard-delete or automatic emails/reminders.
- Overdue / Today / Upcoming / Completed, independently paginated at 25 items.
- Earliest incomplete follow-up as Next action in Leads, company detail and Kanban.
- Atomic created/rescheduled/updated/completed events in the existing timeline.
- Archived companies excluded from the work queue; restore them before editing.
- Preserved forms on error, conflict feedback, loading/empty/retry states and
  navigation through reload/back/forward. Existing visual tokens and native dialogs.

## Architecture and files

- New UI: `public/admin/crm-followups.js`, `public/admin/crm-dates.js`.
- Integrated `crm.js`, `crm-pipeline.js`, `crm-relations.js`, `crm.css`, `index.html`
  and `studio.js`; explicit document routes in `server.js` and `vercel.json`.
- New API module `src/crm/followups.js`, routed by the existing authenticated handler.
- `GET crm-followups`, `POST crm-followup-save`, `POST crm-followup-complete`.
- No dependency or environment changes. No presentation/analytics schema changes.

## Database and safety

Migration: `supabase/migrations/20260922171846_crm_followups.sql`.
Created with `supabase migration new`, then filename aligned with the version
assigned by the connected Supabase migration tool when applying the same SQL.

- New `crm_followups` table, RLS, column-level grants, owner/company composite FK,
  contact/company/owner composite FK and indexes for ownership, relationships,
  due dates, completed dates and next actions.
- Removing a contact detaches only the optional contact reference; the task and
  company remain. Hard deletion of follow-ups is not granted to authenticated users.
- All API reads/writes use the verified user's JWT and explicit ownership scope.
- Status/edit writes include the expected version and `completed_at IS NULL`.
- Completion timestamp is stamped by the database, not trusted from the client.
- Automatic history is written only by a private, revoked-execute audit trigger
  with explicit owner/admin checks. Clients can still insert only manual events.
- Invoker RPC `crm_list_followups` returns bounded grouped results; invoker
  `crm_next_actions` enriches visible companies in one batch, not one call per row.
- Supabase and Postgres skill checks informed RLS, column grants and partial indexes.

## Date semantics

Database timestamps are UTC instants (`timestamptz`); display and grouping use the
browser's local timezone. Overdue means before local midnight today, not earlier
today. Today is `[local midnight, next local midnight)`, so DST days may have
23 or 25 hours. Page refreshes the day boundaries at midnight or on window focus,
without interrupting an open editor. Nonexistent spring-forward times are rejected.
Repeated autumn times choose the first occurrence, explicitly explained in the form.

## Verification

- Unit/API tests: 71 passed, one live Storage test skipped.
- Full browser tests: 61 passed, one live upload test skipped.
- Build and presentation validation passed (0 local production decks; decks remote).
- New `tests/crm-followups.test.js` covers validation, scope, version conflicts,
  UTC input, DST, local midnight, invalid local dates and batched next actions.
- `tests/browser/crm-followups.spec.js` covers schedule → reload → Leads/Pipeline
  Next action → reschedule → complete → company history; global company selection,
  mobile form, retry, preserved drafts, independent pagination and midnight refresh.
- `supabase/tests/crm_followups.sql` executed against Supabase: owner isolation,
  invalid cross-company contact, forged event rejection, atomic history, stale
  updates, next-action ordering, contact deletion, grouping and archived exclusion.
  All temporary fixtures rolled back; no real client data was used.
- Desktop and mobile screenshots visually inspected. No page errors in the primary
  browser workflow. Existing presentation/template/analytics regression tests run.
- Browser API data and API transport tests are mocked; real database behavior is
  tested separately. No authenticated live production browser flow was run, and
  the new application code has not been deployed yet.

Advisors: no new CRM security warnings. Existing unrelated findings remain:
[leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[website_sessions RLS with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
(intentional service-only access), and the existing
[presentation_sessions share-link FK index notice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
Unused-index notices on small/new tables are not grounds to remove required indexes.

## Next increment

Stage 5: explicitly associate presentations with companies, sent metadata and
existing presentation engagement. CRM Overview remains scheduled for stage 6.
