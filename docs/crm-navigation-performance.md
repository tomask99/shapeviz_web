# CRM navigation performance

## Evidence

Read-only Supabase `pg_stat_statements` inspection (following the Supabase performance skill) found company-list RPC mean execution 40.88 ms / maximum 745.47 ms across 295 calls; follow-up list 36.12 ms / maximum 249.53 ms across 11 calls; next-action lookup 1.63 ms across 79 calls. These are cumulative database timings, including development/test traffic, not production browser latency measurements. No statistics were reset and no database records or indexes were changed.

The 30 September follow-up identified `crm_list_companies` as the first row in
the owner's Query Performance screenshot: 1,330 calls, 63.53 seconds total,
47.77 ms mean. `pg_timezone_names` (38.45 seconds) runs as `authenticator`; the
extension catalog query (about 11 seconds) runs as `postgres`. These catalog
queries are not media downloads. Optimizations target application reads and
Storage transfer rather than modifying Supabase-managed catalogs.

Code inspection originally found that every route revisit re-fetched its data. Each uncached request also performs server-side authentication and owner verification. Active Pipeline previously fanned out to eight stage-list RPCs before a next-action lookup (LOST is a separate view).

## Implemented

- A page-memory-only cache for company lists, pipeline, follow-ups, saved views, presentation lists, presentation statistics and website statistics. Thirty-second TTL, 30-entry maximum, keys include all query parameters. Pending identical reads share one request; each consumer receives an independent object.
- Every POST invalidates before and after settlement, including failures with uncertain write outcomes. Reads during a write bypass the cache. Old requests cannot repopulate an invalidated cache.
- Explicit Refresh controls bypass cached data. Logout/auth failure, hiding the page and refocusing the window invalidate the cache. No localStorage, service worker or server-wide CRM cache.
- Navigation requests data only after opening a destination. Pointer/focus prefetch was removed to avoid database work for screens the owner never opens. Follow-up keys retain local-day boundaries and company scope.
- `crm_pipeline(jsonb,text)` now calculates shared company signals once per SQL statement and returns all eight active stages in one RPC. Each stage retains its full total and first 25 companies; subsequent stage pages still use `crm_list_companies`. LOST remains separate. The function uses caller permissions, owner filtering, existing RLS and authenticated-only execution. Migration: `20260930180330_crm_pipeline_batch.sql`.
- Company overview requests one contact, note and activity instead of receiving up to 30 of each. Queries fetch one extra row to retain accurate pagination metadata. Opening the full tabs still returns 30 records per page, with existing ownership checks.
- Cloud storage rankings embed portal status and the first 50 filename/count pairs per tracker in one owner-scoped read. This replaces the separate portal read and per-tracker ranking requests; later pages remain bounded and on demand. See [client files](client-files.md).

Authentication, RLS and server authorization remain enforced. Authentication and company-detail reads remain uncached. Changes made elsewhere may be reflected up to thirty seconds later when revisiting a cached list view; Refresh always fetches current data. The Pipeline materialized CTE exists only for the duration of one statement, not as a persistent cache.

## Broader audit, 30 September 2026

| Area | Finding and action |
| --- | --- |
| Pipeline | Eight repeated signal calculations replaced by one bounded RPC. A read-only production EXPLAIN comparison measured 112.229 ms for the eight legacy reads together and 21.525 ms for the new function. Identical results verified under the owner's authenticated role. This is a single database sample, not a browser latency guarantee. |
| Company detail | Summary no longer transfers whole pages of unused contacts, notes and activity. Full tabs and edits retain their existing behavior. |
| Download statistics | One batched ranking read; filenames/extensions and lifetime totals retained. No counter reset or history deletion. |
| MEGA metadata | Concurrent fresh requests share an in-flight tree read within the same server instance. Once it finishes, the next fresh request still reloads MEGA, including additions, moves, renames and removals. |
| Public website | Responsive WebP, lazy images, deferred video sources, visibility-based video pausing and idle/reduced-motion cursor handling already exist. Media is served by Vercel. |
| Presentations | Milenium media is bundled on Vercel; conditional build downloads reuse verified cached bytes. Presentation access remains checked on each request. Other presentations and original admin media can still use Supabase Storage. |
| Analytics | Compact registry reads, active-time tracking and download-completion deduplication are retained. No reduction in statistics accuracy or retention was introduced. |
| Research, clients, tasks, notes, reports and OAuth | Existing bounded lists, aggregation, on-demand reads and authorization reviewed. No speculative shared cache for private data or removal of security checks. |
| Database advisors | No new findings. Existing performance notices are informational: five unindexed foreign keys and 17 unused indexes. No measured reason to add/drop them in this change. Existing password-leak protection warning and intentional server-only RLS tables are unrelated to these optimizations. |

Advisor references: [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [policy-free RLS tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

These changes primarily reduce database work, API calls and metadata transfer. They do not reset Supabase's already consumed bandwidth. Media bytes remain the larger bandwidth consideration; see [presentation media](presentation-media.md).

## Verification

Latest verification: 362 Node tests passed, one opt-in live upload test skipped.
Twenty targeted browser tests passed, covering Pipeline, navigation, company
relations, desktop/mobile file rankings, previews, sharing and downloads.
Build and SVG-only icon validation passed. Real Postgres compatibility tests
cover all filters, stage limits, stable ordering, archives and owner isolation.
A read-only live REST check verified the embedded ranking response.

The navigation regression verifies that two rapid visits to each of Leads, Pipeline and Follow-ups issue **three data requests instead of six**, and verifies new requests on Refresh and fresh company status after a mutation. Hover/focus alone must make zero destination requests. Unit tests cover expiry, key separation, independent copies, bounded memory, failed requests, concurrent writes and stale-response invalidation. Agent-browser verified local rendering; Playwright verified the interactions.

The earlier page-memory cache improves repeated navigation and avoids unused prefetches. The batched Pipeline now also reduces first-load database work; network and cold-start latency still apply. Do not add speculative indexes without a representative query plan.

The application changes were deployed in commit `2778a38`.
