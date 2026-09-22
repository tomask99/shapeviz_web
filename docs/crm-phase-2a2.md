# Phase 2A.2 — Recent Activity

Implemented locally on 22 September 2026. Not pushed or deployed.

## Scope and decisions

Overview now shows Today, Recent Activity, then existing sales metrics. The feed reuses `crm_activities`, not a second timeline. It includes status changes (including meeting/proposal/won/lost), presentation sends, first checked presentation visits and website clicks, manually recorded replies/activities and completed follow-ups. It excludes archive-only records, note/contact edits and low-level tracking noise. Archived companies are excluded; won/lost companies remain visible.

Times are explicitly **Recorded** times, not inferred reply receipt times. Presentation visits/clicks are the existing first checked event per company/deck, not repeat visits or identified recipients. Repeat-visit aggregation remains deferred to engagement improvements. Manual activities have no importance flag, so all are included. No automatic email, Telegram or pipeline changes were added.

## Implementation and permissions

- `src/crm/recent-activity.js`: bounded read, 20 items plus one lookahead, stable descending `(created_at,id)` keyset pagination. Strict paired cursor validation preserves database microseconds. Minimal response fields and 300-character text excerpts.
- `src/crm/handler.js`, `src/admin/handler.js`: authenticated `crm-recent-activity` action using the existing user JWT, owner predicate and RLS. Inner company join excludes archived/inaccessible companies.
- `public/admin/crm-recent-activity.js`, `crm-recent-types.js`, `crm-overview.js`, `crm.css`: escaped text, company activity links, refresh/latest/older navigation, retained results on failure with retry, hidden-view cleanup and stale-response guards. Task changes refresh the feed.
- No new database tables, policies, migrations, credentials, dependencies or public routes. Uses existing owner and company/time indexes; profile before adding a feed-specific index at larger scale.

## Verification

Node suite: 95 passed, 1 opt-in Storage test skipped. Build passed. Scoped browser tests: 5 passed (feed and Action Center). Feed test covers mobile width, escaped markup, company links, pagination, failed-page retry and navigation cleanup. Screenshot `.cache/recent-activity-mobile.png` visually checked.

Real integration: local app → Supabase Auth → user-JWT API → history → Overview passed. Completing/rescheduling a fixture task displays its stored name; a checked public presentation visit displays the first-visit event and actual status transition. The test creates an isolated temporary owner and records, then removes them in `finally`. Initial run caught metadata `name` versus `title`; corrected and regression-tested before the successful rerun. This is not a production deployment check or a new two-owner RLS audit; existing RLS is unchanged.

Full browser regression: **88 passed, 2 opt-in live tests skipped**; the CRM live test was run separately and passed. Supabase cleanup check confirmed zero fixture users, companies and presentation decks remaining. `git diff --check` passed.

## Manual acceptance / next step

Open Overview, complete a Today task, confirm its activity appears. Page older events and return to latest; open a company activity link. Templates/Leads and sign-out must hide/clear the feed. Refresh displays new events; no realtime subscription is promised.

Next increment: **2A.3 deterministic suggestions with snooze/dismiss**. Recipient links, quick notes and saved views remain separate subsequent increments.
