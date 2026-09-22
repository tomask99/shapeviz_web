# Phase 2A.1 — Today / Action Center

Implemented 22 September 2026. This is the first increment, not all of Phase 2A.

## Features

Overview starts with real pending tasks: Overdue (before database now, including earlier today) and Today (remaining before local midnight). Counts and ten items per bucket/page, earliest first; company links, complete, edit/reschedule and schedule a new task directly from Overview. Existing analytics and business metrics remain below it. Successful task changes refresh both queues and metrics. Archived companies and completed tasks are excluded; tasks for nonarchived WON/LOST companies are still actionable.

Existing follow-up controller/editor and versioned owner-scoped write API are reused. Separate DOM IDs prevent collisions with the full Follow-ups page. Refresh once per minute while visible, not during editing or a save; route changes/logout clear private action content and invalidate late responses. Loading, errors/retry, conflicts and empty states are explicit. Plain-text task descriptions are escaped and visually abbreviated in cards; full text remains editable.

## Files / API / schema

- New UI: `public/admin/crm-action-center.js`.
- New request validation: `src/crm/action-center.js`.
- Changed: `crm-followups.js`, `crm-overview.js`, `crm.css`, `studio.js`, CRM and admin handlers.
- New authenticated GET action: `/api/admin?action=crm-action-center&today=…&tomorrow=…`, optional group/page. No new page route.
- Applied migration `20260922193608_crm_action_center.sql`: one read-only `SECURITY INVOKER` RPC, empty search path, authenticated EXECUTE only, existing user JWT/RLS and indexes. No tables/columns/policies changed; no legacy data rewritten.
- Server/database validation: 22–26 hour local-day boundaries, current database time inside supplied day; group and page constraints. Overdue/today classification and page-size constant centralized in RPC. Browser does not supply trusted current time.

## Verification

- Node: 91 pass, 1 opt-in Storage test skipped. New Action Center input/JWT test covers invalid bounds, DST-length day, group/page limits and spoofed ownership/clock.
- Targeted browser: Action Center + existing Follow-ups + Overview, 10/10 passed. Tests cover mobile actions, no navigation required, metrics/analytics preservation, errors, conflict drafts, bounded paging, visible refresh and paused polling during editing/hidden routes.
- Full browser regression: 86 passed, 2 opt-in live tests skipped; live CRM was run separately. Late-response coverage additionally ensures a task write forces fresh metrics even if an older Overview request is still pending.
- SQL fixture passed before migration (DDL rollback) and after application. Exact-now/midnight boundaries, ordering/paging, nonarchived closed-company tasks, completed/archived exclusion, other-owner isolation and anonymous denial. Fixture data rolled back.
- Real integration: existing opt-in CRM live test extended through real local app → Auth → API → Supabase RLS, loading an overdue task on Overview, editing it and completing it. Database confirms completion and version 3. Test passed; temporary account/tasks/company/contacts/deck/history removed. Zero leftover test accounts/decks confirmed.
- Build passed; presentation validation passed with zero local decks (presentations are remote). No lint/typecheck scripts exist.
- Supabase security advisors unchanged: intentional service-only `website_sessions` with no client policies; existing leaked-password warning ([guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). No new public access.

## Configuration / limits / next step

No new environment variables or manual configuration. Migration is applied; application changes are local, not pushed/deployed in this turn. Full Follow-ups page intentionally retains before-today calendar grouping; Action Center explains its current-time grouping.

Recent Activity, derived suggestions, snooze/dismiss, recipients and Saved Views are **not** part of this increment. Real pending tasks are not dismissible recommendations. Next: 2A.2 Recent Activity, reusing meaningful existing CRM events without heartbeat/slide noise.
