# CRM completion — 22 September 2026

## Delivered scope

- Optional WON date, service, agreed one-time and monthly EUR values, notes. Distinct from estimates, retained after stage changes, explicitly clearable.
- Optional logo URL (not upload) and initial primary contact, saved atomically with the new company.
- Company-wide 30-day COLD / ACTIVE / HOT across currently linked presentations. HOT = at least 3 visits, 180 active seconds or 1 website click; ACTIVE = at least 1 visit. Rules centralized in `crm_engagement_level`, not configurable in admin UI.
- Server classification before public presentation tracking. HttpOnly signed classification, short-lived signed visit proof. Owner visits excluded; transient auth errors fail closed. Existing sandbox and private CRM RLS preserved.
- Verified visits update READY/CONTACTED to PRESENTATION_VIEWED only. Advanced/closed/archived leads are not moved. First presentation-view / website-click history deduplicated per company/deck/type.
- Filters for presentation status, engagement, pending follow-up, reply, last presentation sent; sorting by activity, sent date, next task and engagement. Signals in list/pipeline/detail.
- Source report with current lead/stage counts and separate agreed WON sums, not historical conversion rates.

## Database

Applied migrations: `20260922191132_crm_company_completion`, `20260922191133_crm_engagement`. Existing data retained. CRM calls use user JWT/RLS. Only the server/service role can verify visits; no public RPC can claim verified engagement. No service key reaches browser.

## Verification

- Node suite: 90 passed, 1 opt-in Storage test skipped.
- Full existing browser suite: 79 passed, 1 opt-in upload test skipped; 4 new completion/gate checks passed separately.
- Build and presentation validation passed (0 local presentations; real presentations remain remote).
- SQL completion and signals fixtures passed against live Supabase, rolled back. Includes atomic invalid-contact rollback, retained/clearable WON values, ownership, service-only RPC, auto-stage guard, event deduplication and aggregate filters.
- Opt-in `tests/browser/crm-live.spec.js`: real temporary Supabase Auth user, real app API, real RLS, company/contact/WON save + reload, aggregate filters/source report, actual browser visit through gate/tracker/API/database and auto VIEWED. Admin produces no sessions. Temporary user/company/contact/deck/history/sessions removed. No Telegram test messages sent by local integration server.
- Visual inspection: `.cache/crm-live.png`; normal Shapeviz shell retained.
- Supabase advisors: no new security findings. Existing leaked-password protection warning remains; [configuration guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Existing service-only website table intentionally has no client RLS policies. Existing missing share-link FK index and informational unused indexes not altered.

## Explicit limits

- Analytics cannot identify the person visiting. A signed visitor proof is not authentication; public visitors can share it. DNT, blockers, disabled cookies and expired proof can suppress signals.
- Historical unchecked sessions remain in original analytics, but do not influence company score or automatically change stages. No retroactive backfill.
- An admin must be signed in in that browser. Incognito/another browser is indistinguishable from a visitor. Classification lasts five minutes; login/logout refresh it.
- Last contact means explicitly recorded presentation sent date, not every email/phone call. Report uses current nonarchived state and recorded values, not invoiced/paid revenue.
- The gate may add `?sv_gate=1`; original `/p/:slug` links remain valid. Without cookies it renders untracked rather than looping.
- Logo is an external URL, not a new Storage upload workflow.

## Deployment

Prepared for GitHub push and Git-triggered production deployment. Direct CLI is logged out; connected Vercel app lacks project-team scope. Final production verification is recorded after deployment below.
