# CRM stage 3 — Pipeline / Kanban

Implemented 22 September 2026. Stages 0–2 were pushed as commit 8b6dec4 and the
Vercel deployment reported success before this increment was prepared.

## Delivered

- /admin/pipeline with nine active stages; Lost is available through the view filter.
- Drag-and-drop and an equivalent status menu for keyboard/mobile users.
- Company name/link, country, industry and manual priority on each card.
- Search, country and priority filters; archived companies excluded.
- 25 cards per stage initially, counts and per-stage Load more.
- Saves update only pipeline_status, using verified user JWT, owner ID, company ID,
  version and archived_at IS NULL. Existing company audit trigger records changes
  atomically. Conflicts and network failures preserve the visible prior card and
  selection, show a clear error and offer refresh. The UI does not assume a timed-out
  write was rejected by the server.
- No duplicate pipeline entities, no new migration or configuration.
- No fabricated next-action/engagement indicators: those await later integrations.

## Files / architecture

- New public/admin/crm-pipeline.js; CRM CSS, module and studio navigation updated.
- Explicit server.js/vercel.json route; deep-link login and back/forward preserved.
- New GET /api/admin?action=crm-pipeline aggregates a fixed nine bounded calls to
  the existing invoker list RPC (one for the Lost view), not per-card queries.
- New POST /api/admin?action=crm-status updates a single active company; GET cannot
  mutate it. Existing same-origin/session/owner protections remain in place.
- New tests/crm-pipeline.test.js, tests/browser/crm-pipeline.spec.js and
  supabase/tests/crm_pipeline.sql.

## Verification

- Unit/API suite: 67 passed, one live Storage test skipped.
- Full browser suite: 58 passed, one live upload test skipped.
- Build and presentation validation passed (0 local production decks).
- Real Supabase SQL transaction test: active status change, corresponding audit
  event, stale-version rejection, Lost filtering and archived-move rejection.
  Temporary user/company/activity fixtures rolled back.
- Desktop/mobile screenshots inspected. Browser tests cover actual pointer drag,
  menu moves, reload/back navigation, Lost view, error recovery, paging, and layout
  at 320/390 px. No page errors in the tested flow.
- Browser tests mock API data and API tests mock Supabase transport. Real database
  behavior is tested independently; no authenticated production browser session
  was available for a complete live end-to-end test.

## Deployment

GitHub main is connected to Vercel production at https://shapevizweb.vercel.app.
Commit/deployment status is the release record. Post-deploy checks verify document
and module delivery and that anonymous CRM API access returns 401.
Runtime log scanning is unavailable with the current Vercel credentials; HTTP
smoke checks do not substitute for authenticated production-flow monitoring.

Next incremental stage: Follow-ups.
