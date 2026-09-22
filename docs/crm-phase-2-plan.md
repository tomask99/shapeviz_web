# Phase 2 — Sales operating system

Brief: `briefs/SHAPEVIZ_CRM_PHASE_2_SALES_OS_BRIEF.md`. Audited 22 September 2026.

## Existing foundation (reuse)

Vanilla HTML/CSS/ES modules; `/api/admin?action=...`; Supabase Auth cookies, verified owner role and user-JWT CRM queries. UUID companies own contacts, notes, follow-ups, activities and presentation links. Public slugs/analytics remain separate. No new framework, workspace or parallel CRM.

Phase 1 already supplies bounded/paginated follow-ups, local-day date helpers, versioned complete/reschedule actions with transactional history, private company-wide engagement, admin exclusion, safe automatic VIEWED, optional WON/LOST values, reports and pipeline signals. Existing Overview has statistics and five next tasks, but no inline task actions. Reuse these workflows.

## Delivery sequence

Current: **2A–2E implemented within the brief scope**. The complete handoff is `docs/crm-phase-2-completion.md`; provider boundaries are documented in `docs/crm-integrations.md`. Relevant migrations are applied. Application changes remain local/unpushed and have not been deployed. Earlier 2A handoffs below are historical. Repeat visits, quick notes, saved views, lead intelligence, clients/projects, company presentation creation/copying, reporting, CSV and command search are now implemented. Actual mailbox/calendar integrations remain intentionally outside scope.

1. **2A.1 — Today / Action Center:** actual pending overdue tasks and remaining tasks today, company links, inline complete/reschedule using the existing follow-up editor/API. Isolated loading/error states and bounded server-side queries. No recommendations yet.
2. **2A.2 — Recent Activity:** bounded meaningful cross-company feed, no slide/heartbeat noise. Existing history stores first viewed/click per deck, not repeat visits; derive repeat signals carefully.
3. **2A.3 — Suggestions:** centralized transparent rules, snooze/dismiss state, prefilled editable follow-up action. Do not confuse missing data with no engagement; Phase 1 score excludes historical unchecked visits.
4. **2A.4 — Recipient links/share:** opaque revocable tokens, minimal public context, preserve generic links and all redirects (including tracking gate), separate recipient analytics. Existing `sent_at` refers to first company/deck send; do not overwrite it per recipient.
5. **2A.5 — Quick notes:** reuse note records/editor, no duplicate timeline system.
6. **2A.6 — Saved Views:** owner-scoped validated filter serialization, rename/delete/default.
7. **2B:** manual Fit separate from Priority/Engagement; explainable richer signals; reviewed website metadata with SSRF protection; duplicate warnings, no automatic merges.
8. **2C:** explicit conversion retaining company identity; clients; create presentation from company; reuse current parent/clone relation before adding versions; lightweight projects.
9. **2D:** actual historical funnel, loss reasons, distinct one-time/monthly reporting, reviewed CSV import/export and command palette.
10. **2E:** integration seams only; no mailbox/calendar integration, external messages or meetings created automatically.

## 2A.1 decisions

- Action Center overdue means `due_at < database now()`, including earlier today. Remaining today is `now() <= due_at < next local midnight`; buckets never overlap. Existing Follow-ups page retains its calendar-day grouping, explicitly labelled.
- Browser supplies UTC instants for local midnight; database validates the 22–26 hour day window and that current database time lies inside it. Handles DST without 24-hour arithmetic.
- Read-only invoker RPC reuses existing follow-ups/company/contact tables, RLS and pending-task indexes. No new table or public access.
- Ten tasks per bucket/page, earliest first with stable UUID tie-breaker. Complete/reschedule uses existing owner/company/version checks and history triggers.
- Real tasks cannot be dismissed as suggestions. Dismissal comes with recommendations in 2A.3.
- Archived companies and completed tasks excluded; actual tasks on WON/LOST companies retained until completed/rescheduled.
- Existing analytics and CRM metrics preserved below the action section. No auth or public presentation changes.

## Verification / handoff

For each stage: Node tests, browser regression/mobile/error/race checks, build, SQL ownership/boundary fixtures, live integration where practical. No automatic push/deploy unless requested. Do not mark all of Phase 2A complete after 2A.1.
