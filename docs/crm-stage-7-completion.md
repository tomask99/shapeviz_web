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
- Browser checks: 83 non-live cases verified. Final full rerun had 82 pass, 2 opt-in skips and one artifact-cleanup failure caused by a concurrent runner deleting its trace file; the affected template library suite was rerun alone (3/3 pass). Earlier full suite and all 4 new completion/gate checks passed.
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

Application commit `e62673ae79314ceffab40613b5fb0aedc5274816` pushed to `main`. GitHub Vercel status reports **success / Deployment has completed**: [deployment](https://vercel.com/tomask99-s-projects/shapeviz_web/GkM5S5dLNnj4YuGyrk2Y2At9HtCG).

Production: https://shapevizweb.vercel.app. Public `/admin/leads` and `/admin/follow-ups` serve the login shell; unauthenticated CRM API returns 401. New JS assets return 200. Real production browser integration passed using `LIVE_CRM_TEST=true LIVE_APP_ORIGIN=https://shapevizweb.vercel.app`: login, company + contact + WON save/reload, RLS reads, filters and source reporting. Temporary account and records removed; follow-up SQL confirmed zero test users/decks. Visitor-to-VIEWED integration was verified against the same live Supabase using the local app server (Telegram disabled for that isolated fixture).

Runtime log/drain inspection remains unavailable: CLI is logged out and the connected Vercel app lacks this team scope. Deployment success is evidenced by GitHub status and real production HTTP/browser checks, not a claimed clean runtime-log scan.
