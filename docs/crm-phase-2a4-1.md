# Phase 2A.4.1 — Recipient tracking foundation

Implemented 22 September 2026. This is the backend/public-tracking increment, **not the complete recipient sharing UI**. Database migrations applied; application code remains local/unpushed/undeployed.

## Completed

- Owner-authenticated API creates an ad-hoc recipient or snapshots an existing company contact, lists up to 25 recipients per page and permanently revokes an individual link.
- URL `/p/<deck>?r=<random-token>` uses 32 cryptographically random bytes. Only SHA-256 hash is stored. Creation returns the raw link once; list/revoke responses exclude the hash. A lost creation response currently requires a replacement link and revoking the unused record; no automatic creation retry is promised.
- Public resolution checks deck, current company association, owner role, archive status and revocation. Invalid/revoked links return 404; service failure returns 502, not anonymous attribution fallback. Unassign/reassign invalidates the old association's links without deleting previous sessions.
- Tracking gate and local trailing-slash redirect preserve the token. No changes to public generic links, content templates or private HTML source files.
- A signed one-hour visit proof binds a recipient hash to a server-generated session UUID and deck. No recipient name, email, company UUID, CRM status or notes are rendered into public content.
- Atomic service-only ingestion wraps the existing event and checked-visit functions. Session lock prevents mixing recipients or changing generic sessions into recipient sessions. Revocation/unassignment are checked on every attributed event, including already-open pages. Existing event-ID deduplication remains intact. Generic visitors still use nullable recipient attribution; owner previews remain excluded.

Revocation stops this recipient link, not the underlying generic unlisted presentation. Someone forwarding a recipient link shares its attribution; this is link activity, **not proof of the person's identity**. Historical analytics survive revocation/unassignment. Deleting the presentation through the existing delete workflow cascades its recipient records and sessions.

## Files / schema / routes

New modules: `src/crm/recipients.js`, `src/presentations/recipient-token.js`.

Changed: `src/crm/handler.js`, `src/admin/handler.js`, `src/presentations/page.js`, `src/presentations/events.js`, `public/presentation-system/tracker.js`, `server.js`; relevant unit/browser fixtures and live integration test.

Migrations:

- `20260922201435_crm_recipient_foundation.sql`: private `crm_presentation_recipients`, nullable `presentation_sessions.recipient_id`, indexes, RLS, minimal grants, irreversible revoke timestamp, service-only resolver/atomic ingest RPCs.
- `20260922201649_crm_recipient_lock_scope.sql`: recipient/association row locks retained; company share lock removed to avoid lock upgrades during concurrent automatic status advancement.

API actions: `crm-recipients` (GET), `crm-recipient-create` and `crm-recipient-revoke` (POST). Existing authentication, same-origin checks and user JWT/RLS apply. Public clients cannot query recipients or invoke resolver/ingest RPCs directly.

The legacy `presentation_share_links` table is globally owner-role scoped and points to legacy settings. Reusing its permissions for private CRM contacts would violate company ownership. It and its existing session FK are left untouched; the new entity extends the existing company/deck association instead.

No dependencies, credentials, env variables or manual setup added. Apply both migrations before deploying the updated ingestion handler in other environments. Applied versions match local filenames. Existing deployment continues using the previous ingestion function until the code is deployed.

## Verification

Transactional SQL `supabase/tests/crm_recipients.sql`: two-owner and anonymous isolation, correct/wrong deck resolution, two separate recipients, session attribution mismatch, generic/recipient isolation, event deduplication, revocation, unassignment and preservation of analytics. All passed; fixtures rolled back.

Real local app → Supabase Auth/API → recipient URL (including trailing slash and fresh-browser classification gate) → stored checked session → revoke → rejected late heartbeat / 404 reopen passed. Owner previews produce no sessions. Public content/config do not contain private recipient name/email. Generic visits and existing CRM workflows still pass in the same integration test. Temporary users, decks, companies and recipient records were cleaned; counts verified zero.

Node tests additionally cover random canonical tokens, duplicate/malformed URL parameters, JWT/owner scoping, hash-only writes, safe bounded lists and proof/session binding: **99 passed, 1 opt-in Storage test skipped**. Full browser regression: **90 passed, 2 opt-in tests skipped**; live CRM test ran separately and passed. Build and whitespace checks passed. No new UI was added in this increment; production/Vercel redirects have not been exercised in a deployed environment.

Supabase skills guided RLS, explicit grants, invoker functions, indexes and real query verification. Browser verification used the project's Playwright fallback because agent-browser is unavailable. No new security advisor findings. Existing notices remain: [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website_sessions policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [legacy share-link FK index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). The new recipient index may initially be reported as [unused](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); retain it for FK and upcoming recipient analytics queries.

## Next — 2A.4.2

Add the Share dialog to company presentation cards: existing contact, add contact/ad-hoc recipient, general link, copy-once result and revoke controls. Add per-recipient mark-as-sent and activity without overwriting the existing first company/deck sent timestamp. Add owner-authorized aggregate recipient analytics (checked visits, active time, actual unique slides, website clicks, last visit) and labels distinguishing link attribution from personal identity. Quick notes and saved views remain later increments. **Do not mark 2A.4 or Phase 2A complete yet.**
