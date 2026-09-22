# CRM navigation performance

## Evidence

Read-only Supabase `pg_stat_statements` inspection (following the Supabase performance skill) found company-list RPC mean execution 40.88 ms / maximum 745.47 ms across 295 calls; follow-up list 36.12 ms / maximum 249.53 ms across 11 calls; next-action lookup 1.63 ms across 79 calls. These are cumulative database timings, including development/test traffic, not production browser latency measurements. No statistics were reset and no database records or indexes were changed.

Code inspection found that every route revisit re-fetched its data. Each uncached request also performs server-side authentication and owner verification. Pipeline fans out to nine stage-list RPCs before a next-action lookup. Stage requests already run in parallel; there is no sequential stage loop to remove.

## Implemented

- A page-memory-only cache for four read actions: company lists, pipeline, follow-ups and saved views. Ten-second TTL, 30-entry maximum, keys include all query parameters. Pending identical reads share one request; each consumer receives an independent object.
- Every POST invalidates before and after settlement, including failures with uncertain write outcomes. Reads during a write bypass the cache. Old requests cannot repopulate an invalidated cache.
- Explicit Refresh controls bypass cached data. Logout/auth failure, hiding the page and refocusing the window invalidate the cache. No localStorage, service worker or server-wide CRM cache.
- Pointer/focus on the three navigation links warms only that destination; it honors browser data-saving preference. Follow-up keys retain local-day boundaries and company scope.

No authentication, RLS, database schema, RPC or server authorization logic was weakened or changed. Other reads, including authentication and company-detail reads, remain uncached. Changes made elsewhere may be reflected up to ten seconds later when revisiting a cached view; Refresh always fetches current data.

## Verification

113 Node tests passed, one opt-in test skipped. Existing full browser suite: 95 passed, two opt-in live tests skipped. Additional navigation test plus all three pipeline tests: four passed. Production build passed.

The navigation regression verifies that two rapid visits to each of Leads, Pipeline and Follow-ups issue **three data requests instead of six**, and verifies new requests on Refresh and fresh company status after a mutation. Unit tests cover expiry, key separation, independent copies, bounded memory, failed requests, concurrent writes and stale-response invalidation. Browser checks use the repository's Playwright fallback because agent-browser is unavailable here.

This improves repeated navigation and warms anticipated navigation; it does not claim a measured production speedup or eliminate first-load network/cold-start latency. A next measured optimization, if first opening remains slow after deployment, is one batched pipeline RPC and reducing its repeated signal aggregation. Do not add speculative indexes without a representative query plan.

Changes are local until explicitly pushed/deployed.
