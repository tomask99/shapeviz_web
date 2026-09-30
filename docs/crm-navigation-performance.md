# CRM navigation performance

## Evidence

Read-only Supabase `pg_stat_statements` inspection (following the Supabase performance skill) found company-list RPC mean execution 40.88 ms / maximum 745.47 ms across 295 calls; follow-up list 36.12 ms / maximum 249.53 ms across 11 calls; next-action lookup 1.63 ms across 79 calls. These are cumulative database timings, including development/test traffic, not production browser latency measurements. No statistics were reset and no database records or indexes were changed.

Code inspection found that every route revisit re-fetched its data. Each uncached request also performs server-side authentication and owner verification. Pipeline fans out to nine stage-list RPCs before a next-action lookup. Stage requests already run in parallel; there is no sequential stage loop to remove.

## Implemented

- A page-memory-only cache for company lists, pipeline, follow-ups, saved views, presentation lists, presentation statistics and website statistics. Thirty-second TTL, 30-entry maximum, keys include all query parameters. Pending identical reads share one request; each consumer receives an independent object.
- Every POST invalidates before and after settlement, including failures with uncertain write outcomes. Reads during a write bypass the cache. Old requests cannot repopulate an invalidated cache.
- Explicit Refresh controls bypass cached data. Logout/auth failure, hiding the page and refocusing the window invalidate the cache. No localStorage, service worker or server-wide CRM cache.
- Navigation requests data only after opening a destination. Pointer/focus prefetch was removed to avoid database work for screens the owner never opens. Follow-up keys retain local-day boundaries and company scope.

No authentication, RLS, database schema, RPC or server authorization logic was weakened or changed. Other reads, including authentication and company-detail reads, remain uncached. Changes made elsewhere may be reflected up to thirty seconds later when revisiting a cached view; Refresh always fetches current data.

## Verification

Latest verification: 359 Node tests passed, one opt-in live upload test skipped.
Ten targeted browser tests passed, covering navigation caching, desktop/mobile
media previews, tracking and presentation statistics. Production build passed.

The navigation regression verifies that two rapid visits to each of Leads, Pipeline and Follow-ups issue **three data requests instead of six**, and verifies new requests on Refresh and fresh company status after a mutation. Hover/focus alone must make zero destination requests. Unit tests cover expiry, key separation, independent copies, bounded memory, failed requests, concurrent writes and stale-response invalidation. Agent-browser verified local rendering; Playwright verified the interactions.

This improves repeated navigation and avoids unused prefetches; it does not claim a measured production speedup or eliminate first-load network/cold-start latency. A next measured optimization, if first opening remains slow after deployment, is one batched pipeline RPC and reducing its repeated signal aggregation. Do not add speculative indexes without a representative query plan.

Changes are local until explicitly pushed/deployed.
