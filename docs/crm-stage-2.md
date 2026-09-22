# CRM stage 2 — Contacts, notes and activity

Release update: stage 2 was pushed in commit `8b6dec4` on 22 September 2026;
Vercel reported success. The handoff below records its original pre-deploy state.

Implemented 22 September 2026. Application changes remain local, without commit,
push or Vercel deployment. Database migration HAS been applied to Supabase.

## Delivered

- Company tabs: Overview, Contacts, Notes, Activity; keyboard navigation and tab
  URLs survive reload/back/forward.
- Multiple contacts: name, position, email, phone, LinkedIn, Instagram, contact
  notes, primary contact. Create/edit/delete with confirmation; company preserved.
- At most one primary contact per company: a partial unique index plus a
  transactional, security-invoker save RPC serializes normal primary changes.
  A failed or stale save does not clear the previous primary contact.
- Separate freeform notes: create/edit/delete, newest first, optimistic version
  checks. Contacts and notes show errors without discarding unsaved drafts.
- Activity: existing company history, automatic contact/note events, manual text
  entries, local date formatting and pagination (30 items per page).
- Overview: contact summary, latest note preview and latest activity.
- Lead search now also matches contact names and email addresses.

No Kanban, follow-ups, presentation/company links or automatic pipeline advancement
were added. No email is sent by these features.

## Files / API

- New public/admin/crm-relations.js: independent company tabs and record editor.
- Modified public/admin/crm.js, crm.css: integration, search hint, responsive styles.
- New src/crm/relations.js and validation.js; handler.js now reuses validation.
- src/admin/handler.js: authenticated read-action allowlist extended.
- New tests/crm-relations.test.js, tests/browser/crm-relations.spec.js,
  supabase/tests/crm_contacts_notes.sql.

All endpoints remain under /api/admin and existing owner/session/origin checks:

- GET crm-contacts, crm-notes, crm-activity (companyId, page).
- POST crm-contact-save, crm-contact-delete, crm-note-save, crm-note-delete,
  crm-activity-add.

Each operation validates company ownership using the verified user's JWT. Updates
and deletes match company, owner, record ID and version. Only manual activity may
be inserted directly by an authenticated client; automatic events are appended
by private audit triggers in the same transaction as the corresponding change.
Activity retains a contact name snapshot after contact deletion, not duplicate
email/phone/note contents. Note deletion retains the event but not the note text.

## Database

Migration: 20260922164551_crm_contacts_notes.sql.

- New crm_contacts and crm_notes with composite company/owner foreign keys,
  RLS, scoped grants and indexes.
- Extended crm_activities event constraint; manual-only insert policy.
- Private version/timestamp and activity triggers; public invoker crm_save_contact.
- Replaced crm_list_companies with the existing filters/pagination plus contact
  search. Existing company and presentation data were not rewritten.
- Activity timestamp default uses clock_timestamp for ordered transaction events.

The CLI-generated migration filename was aligned to the version assigned by the
connected Supabase migration tool. Earlier applied migration files were not edited.

## Verification

- Unit/API suite: 64 passed, 1 live Storage test skipped.
- Browser suite: 55 passed, 1 live upload test skipped.
- Build and presentation validation passed (0 local decks; presentations are remote).
- Both stage 1 and stage 2 SQL regression scripts passed against Supabase.
  New tests cover cross-owner/former-owner/anonymous access, primary uniqueness,
  failed primary replacement rollback, stale versions, contact search, immutable
  relationships, forged history rejection and preservation after deletion.
- Test Auth users and all fixture data were rolled back. Final counts for companies,
  contacts, notes and activities were zero.
- Desktop activity and mobile contacts screenshots inspected; no browser page
  errors in the tested flows.
- Browser tests mock API responses; API tests mock the Supabase transport.
  Database permissions and mutations are separately tested with real transactional
  SQL. A real authenticated browser-to-production flow has NOT been verified.

Supabase advisors reported no new CRM security or missing-FK-index issue.
Unused indexes on empty tables are expected. Existing unrelated notices remain:
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[service-only website RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[presentation share-link index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Next

No new configuration or environment variables are required. The database is ready;
publish the local app through GitHub/Vercel before expecting these controls online.
Next incremental stage: Pipeline/Kanban over the existing companies.
