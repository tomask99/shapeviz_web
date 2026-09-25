# Lead presentation preparation

23 September 2026. Deployed to `https://shapevizweb.vercel.app` as `dpl_DSFJiSaFNEMo1RWPY7sC5bmv93UX`.

## User flow

Qualified is removed from the shared status catalog, pipeline, company forms and filters. Existing Qualified records migrate to New lead with status history preserved; saved filters are updated too. No companies were in Qualified at production migration time.

Prepare presentation is available on each pipeline card, in the company detail header, and in its Presentations tab. The dialog shows the company name and offers active templates. Preparing creates a published client copy using the existing template substitution engine, links the deck to the company and sets Presentation ready. It does not send the presentation. The current board/detail refreshes after success. A later-stage lead explicitly prepared through this action also moves to Presentation ready; replay of an already completed preparation does not regress subsequent status changes.

The company name comes from the owner-authorized CRM row, not from a browser-supplied name. Reusable templates remain unchanged. The existing generic Studio template and upload flows remain available.

## Automatic move after opening

The existing signed tracking gate excludes an authenticated admin's presentation views. Anonymous browser visits receive a signed visit proof; the existing database operation records the checked visit and moves linked, active companies from Presentation ready or Contacted to Presentation viewed. Later stages such as Replied are preserved. A private/incognito browser without the admin login is an anonymous visitor and will count. An already open pipeline may need Refresh to display the newly saved database state.

The follow-up test on 23 September verified this on a newly prepared presentation using real Auth, Storage and the production database: admin visits created zero sessions and kept Presentation ready; deleting the short-lived classification cookie still rechecked the admin login and excluded the visit; a separate anonymous browser created one checked session and moved the lead to Presentation viewed; another admin open did not increase the count; a later anonymous open did not regress Replied. The three gate browser cases (owner, visitor, auth outage) also passed. Synthetic visitor traffic used the same application locally with Telegram disabled, so the test sent no external notifications. No runtime or database changes were necessary for this behavior.

## Implementation and retry behavior

- `src/admin/prepare-presentation.js` orchestrates the existing source reader, HTML transformation and deck saving. Requests carry company ID/version, template slug and an operation UUID.
- A stable `pitch-<operation UUID>` slug and private preparation metadata allow an interrupted request to reuse the same saved deck. The UI retains an uncertain attempt when its dialog is closed and reopened within the same page session.
- `crm_finish_prepared_presentation` links the deck and changes the stage in one database transaction using the owner's JWT/RLS, membership check, company lock and existing owner identity advisory lock. Invalid, archived, foreign or stale records cannot partially link or move a company. Existing triggers record assignment and status history.
- Storage/registry creation precedes that database transaction. If the company changes in between, the saved deck remains in Studio and the company update is rejected. Storage is not part of the database transaction. After a full browser reload, the user should check existing presentations before starting a new attempt whose operation ID differs.
- Migration `20260923172622_crm_prepare_presentation.sql` matches the production migration version. No new MCP write tools or OAuth scopes were added.

## Verification

- 304 unit/API tests passed; one opt-in Storage test skipped.
- 14 affected browser tests passed, including card movement, detail creation, empty templates, retry after a simulated network failure, existing assignment/upload flows and navigation cache invalidation. Desktop/mobile screenshots were inspected.
- Real database rollback fixture `supabase/tests/crm_prepare_presentation.sql` passed: stage/link/history, idempotency, stale-write rollback, archived company, retired-stage rejection and other-owner isolation.
- Production build passed. The opt-in production browser test exercises real Auth, Storage, template HTML, company substitution, published presentation access, association, stage and replay. Fixture accounts, records and source files are removed after verification.
- Security advisors show no new schema warnings. Existing private deny-by-default RLS tables and the existing [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) setting remain unchanged.

The earlier import-validation follow-up was included in this working-tree deployment. Repository completion and fresh verification are recorded in the [25 September checkpoint](completion-checkpoint-2026-09-25.md).
