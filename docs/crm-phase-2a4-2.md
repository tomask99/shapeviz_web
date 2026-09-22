# Phase 2A.4.2 — Recipient sharing UI and analytics

## Completed

Company → Presentations → Share / recipients provides the generic presentation URL and private recipient links. Choose an existing company contact or enter an ad-hoc name and optional email. Contact creation reuses the existing Contacts tab via Manage / add contacts; it is not duplicated inline.

Generated bearer URLs appear once, can be copied (manual selection fallback), survive recipient-list refresh, and are cleared on close/disposal. Creation errors preserve drafts and explicitly warn about uncertain results before retrying. Lists and contact pickers are paginated. Mobile dialog scrolls without horizontal overflow.

Each recipient can be marked sent, permanently revoked, and inspected for 7/30/90-day checked visits, active seconds, distinct viewed slides, website clicks and last visit. Periods use session start time; disabled tracking preserves historical statistics. A forwarded link remains attributed to the original link, not a verified human. No email is sent.

## Files and schema

- Created `public/admin/crm-recipient-sharing.js`, `tests/browser/crm-recipient-sharing.spec.js`, this handoff.
- Modified `public/admin/crm-presentations.js`, `public/admin/crm.css`, `src/crm/recipients.js`, `src/admin/handler.js`, `tests/crm-recipients.test.js`, `tests/browser/crm-live.spec.js`, `supabase/tests/crm_recipients.sql`, phase plan.
- Applied migration `20260922202527_crm_recipient_sharing.sql` to the linked Supabase project.
- Added recipient `sent_at`, an immutable first-send timestamp. The private transactional trigger writes existing `presentation_sent` activity; repeating the same update is a no-op. The original company/presentation first-send timestamp is untouched.
- Added invoker RPC `crm_recipient_stats(uuid,integer)`. It sums sessions separately from events to avoid join multiplication.
- Added actions on the existing `/api/admin` endpoint: GET `crm-recipient-stats`, POST `crm-recipient-sent`. Reuses existing create/list/revoke actions. No parallel API or business-rule engine.

## Security and verification

User-JWT owner/company scoping and RLS remain mandatory. Sent writes require a current active association and a published unlisted non-template deck. Direct recipient inserts cannot set `sent_at`; its activity cannot be bypassed through insert. Analytics is authenticated invoker-only and revoked links retain history. Raw tokens are never listed or stored in the database. Shared-link activity is not identity verification.

Verified: 100 Node tests passed (one unrelated opt-in Storage test skipped); SQL rollback fixtures cover immutable/idempotent send activity, owner isolation, periods and recipient-only aggregates. Browser tests cover contact/ad-hoc paths, failure draft preservation, clipboard fallback, mobile width and secret lifecycle. Live integration uses the actual UI, API and Supabase to create, mark sent, view, attribute, inspect and revoke a link; passed, with temporary user/deck cleanup confirmed. Build and diff whitespace checks passed.

Security advisor reports no new findings: existing service-only website_sessions without client policies and disabled leaked-password protection remain. No new secrets or manual configuration needed. Application changes remain local/unpushed; migration is already applied. Deployment is still required for the new UI to appear on production.

Full browser regression: **92 passed, 2 opt-in tests skipped**; the CRM opt-in test also passed separately against Supabase. Mobile screenshot inspected. Performance advisor retains the pre-existing legacy share-link FK index notice and unused-index informational findings; no indexes were removed based on low fixture traffic.

## Deferred / next

No mail delivery, bulk sending, token recovery, verified-recipient identity, inline contact editor or historical generic-session reattribution. Create a new link if the original was not copied. Next incremental stage: **2A.5 Quick notes**, reusing existing note records/editor and timeline. Remaining Phase 2 work is listed in the phase plan.
