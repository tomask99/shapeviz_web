# CRM stage 5b3 — engagement in company Overview

Implemented locally on 22 September 2026. No schema migration, push or deployment.

## Scope

- Company Overview now contains a Presentation engagement panel with a selector for linked decks and 7/30/90-day periods. It is explicitly a summary of **one selected presentation**, not an aggregate across the company.
- Shows visits, active time, distinct viewed slides, website clicks and latest visit in the selected period, plus saved sent state and presentation visibility. If tracking is currently disabled, historical metrics are labeled accordingly.
- Uses existing `crm-presentations` and `crm-presentation-stats`, with the same owner/JWT authorization and existing service-only analytics RPC behind the authorized link check. No new analytics table, endpoints, permissions, tracking events or pipeline changes.
- Initial Overview loads only a bounded page of links (25). Stats load only on Show engagement for the selected link; there is no per-company/per-deck analytics fan-out. More/Previous controls expose further linked presentations.
- Changing deck/period clears old metrics; sequence guards prevent stale requests from overwriting a newer choice or tab. Failed reads show retry errors, not fake zero engagement. Empty associations have an explicit empty state and Manage presentations shortcut.
- Shared `engagementMarkup` renders both Overview and the existing Presentations tab consistently. Distinct slide indices are counted, not max_slide; sessions are visits, not identified people. Period follows the existing RPC's cohort of sessions started within the requested number of days.

## Verification

- Node tests: 80 passed, 1 live Storage test skipped.
- Playwright: 73 passed, 1 live upload skipped. Checks cover lazy loading, selected link/period, pagination, errors/retry, empty links, tracking-disabled warning, navigation, mobile width and stale responses. Existing presentation tab tests also pass with the shared renderer.
- Build and local presentation validation passed (0 local decks; production decks live remotely).
- Existing SQL presentation-link/analytics checks passed against the connected database, with fixture writes rolled back. No client data or Storage changes.
- Desktop/mobile panel screenshots inspected: `.cache/crm-engagement-desktop.png`, `.cache/crm-engagement-mobile.png`.
- Supabase skill review retained private association authorization. Browser skills used installed Playwright because agent-browser is unavailable. Browser API responses are mocked; SQL tests verify the live DB separately, not a production end-to-end browser login.

## Remaining scope

Company-wide engagement aggregation and COLD/ACTIVE/HOT scoring are not implemented. The panel deliberately labels individual-deck scope. Automatic VIEWED is still deferred because historical public-page tracking can include admin visits. Next planned increment: stage 6 business Overview, keeping Presentation performance intact. Application stages 4–5b3 remain local/unpushed.
