# CRM stage 1 — Leads

Implemented 22 September 2026. Application changes are local, not pushed/deployed.
The two additive database migrations below HAVE been applied to Supabase.

## Delivered

- Private routes: /admin/leads and /admin/leads/:id, including direct reload,
  login return, browser back/forward and navigation back to presentations.
- Company create/edit/detail, multiple services, free/custom industry, country
  code with generated SK/CZ/INT category, city, web/social links, description,
  manual priority, source and all ten pipeline statuses.
- Search (name, website, description), combined country/industry/status/service/
  priority/source/archive filters, four sorts and server-side 25-row pagination.
- Archive and restore, without a hard-delete action.
- Responsive desktop list and mobile cards using the existing studio palette.
- Durable creation/status/archive/restore history, recorded atomically; timeline
  UI, contacts, notes, Kanban, follow-ups and presentation links remain later stages.

## Files and architecture

- public/admin/crm.js, crm.css: isolated CRM UI and styles.
- public/admin/crm-options.js: shared option definitions for UI and API.
- src/crm/handler.js: validation and CRM actions under existing /api/admin auth.
- public/admin/index.html, studio.js: navigation, route state, API integration;
  authenticated dialogs also close when returning to login.
- src/admin/handler.js: dispatch after existing session/owner/origin checks.
- server.js, vercel.json: explicit document routes, not a catch-all asset rewrite.
- tests/crm.test.js, tests/browser/crm.spec.js, supabase/tests/crm_companies.sql.

API actions: crm-list, crm-detail (GET); crm-create, crm-update, crm-archive (POST).
Every database call carries the verified user's JWT, never an owner supplied by
the form. Updates filter by owner, ID AND version; a stale update returns 409
instead of silently overwriting changes. UI retains the unsaved draft on failure.

## Database

- 20260922163123_crm_companies.sql: crm_companies, crm_activities, RLS policies,
  least-privilege column grants, private audit triggers, invoker list RPC.
- 20260922163602_crm_activity_relationship_index.sql: covering relationship index.

Created with Supabase CLI; local filenames aligned to the versions assigned by
the connected migration tool. No existing presentation schema/data was modified.
Private definer triggers are non-RPC, have an empty search_path, check auth.uid()
and admin role, and cannot be called directly by client roles. Activity writes,
identity/version/timestamp edits and hard deletes are not granted to authenticated.

## Verification

- Unit/API suite: 60 passed, 1 live Storage test skipped.
- Full browser suite: 51 passed, 1 live upload test skipped. Two additional CRM
  error/pagination/conflict checks were then added; all four CRM tests passed.
- Build passed. Presentation validator passed (0 local production decks;
  production presentations remain remotely stored).
- SQL transaction suite ran against Supabase: owner/non-owner/former-owner/anon
  permissions, spoofed ownership, immutable identity, invalid status, atomic
  history, optimistic concurrency, search/combined filters, archive and restore.
  All fixtures including temporary Auth users were rolled back; CRM remains empty.
- Screenshots inspected for desktop detail and mobile list. Browser tests use
  mocked API responses; server/API tests mock Supabase transport. Real database
  behavior is covered separately by SQL tests, not a real authenticated
  browser-to-production end-to-end login.
- Security/performance advisors: no new CRM security finding. The missing CRM
  relationship index was fixed. Unused fresh indexes are expected on empty tables.

Existing unrelated advisor findings left unchanged:

- [Leaked password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- [website_sessions has RLS without client policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  (existing service-only access).
- [presentation_sessions share-link foreign key lacks a covering index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Deployment / next step

No new environment variables, accounts, or provider setup are required. Existing
Supabase configuration/auth are reused. Database is ready; publish the local app
changes through the normal GitHub/Vercel flow before expecting Leads on the live
website. No commit, push or application deployment was performed in this stage.

Next incremental stage: contacts, notes and the company activity interface.
