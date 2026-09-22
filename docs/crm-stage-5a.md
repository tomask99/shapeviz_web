# CRM stage 5a — Company presentations

Implemented 22 September 2026. This is the first bounded increment of stage 5,
not completion of the entire presentation integration. Application changes remain
local/unpushed alongside stage 4. Both new Supabase migrations are applied.

## Delivered

- Company detail `?tab=presentations`: searchable, paginated assignment of existing
  client decks, including newly created decks after returning from Presentation Studio.
- One company may have several decks; a deck has at most one current company link.
- Reusable templates and archived decks cannot be newly assigned.
- Record first sent date/time and optional same-company contact. This is a manual
  sales record: no email is sent and no pipeline status is changed.
- Assignment, unassignment and sent events in the existing company activity timeline.
- Safe unassignment leaves the deck, files, analytics and historical events intact.
- Existing per-deck analytics on demand, with 7/30/90-day selection: visits, active
  time, distinct slides viewed, website clicks and latest visit within the period.
- Existing public `/p/:slug` links and Studio upload/template flows unchanged.
- Responsive layouts, keyboard tabs, loading/empty/retry/conflict states and SVG arrow.

## Architecture

The shared presentation registry has owner-role access but no per-user owner ID.
CRM companies are private to their owner. Therefore a separate private association
table is used rather than exposing company ownership fields in the public registry.

- New `src/crm/presentations.js`, dispatched from `src/crm/handler.js` through the
  existing authenticated admin endpoint. Read actions added to the method allowlist.
- New `public/admin/crm-presentations.js`, mounted/disposed by the existing company
  tabs in `crm-relations.js`; shared styles in `crm.css`.
- Actions: `crm-presentations`, `crm-presentation-catalog`,
  `crm-presentation-assign`, `crm-presentation-unassign`,
  `crm-presentation-sent`, `crm-presentation-stats`.
- Lists bounded to 25; no analytics fetch for each company or each displayed deck.
- Existing service-only `presentation_admin_stats` RPC is reused. The handler
  first checks the company and exact association with the verified user's JWT/RLS;
  only then invokes the stats RPC with the slug from that authorized row, never
  a caller-supplied analytics slug. No analytics rows are copied into CRM.
- Counts are based on visits **started** within the selected period, matching the
  existing RPC. Distinct slide count comes from actual slide views, not `max_slide`.
- Link creation time is labelled **Assigned**, not presented as deck creation time.

## Migrations and safety

- `20260922173501_crm_presentation_links.sql`: private `crm_presentation_links`,
  owner/company and contact composite foreign keys, unique deck reference, RLS,
  restricted column grants, indexes, version/timestamp stamping, automatic audit
  and invoker catalog RPC.
- `20260922173606_crm_presentation_delete_cleanup.sql`: correction caught by the
  rollback SQL test. AFTER-trigger depth cannot reliably identify FK cascade cleanup.
  The audit function now recognizes a missing parent deck, which the FK ensures can
  only occur during parent deletion. Existing service-role deck deletion works without
  a user JWT and preserves the company and all previously recorded sales events.
- CLI created each migration; local filenames match the versions assigned by the
  connected migration tool. Both migrations are required in order.
- Supabase skill security checks informed JWT ownership, private revoked-execute
  audit triggers, column-level grants and tests; existing registry policies unchanged.
- Expected version required for sent/unassign writes; repeated sent requests conflict.
- Sent date cannot be in the future in the API. Published, non-template deck required
  by the database before marking sent. No invented sends from publication timestamps.
- Another owner's CRM association is not disclosed. The shared catalog may offer a
  deck linked privately by another owner; the unique constraint rejects assignment
  with a generic conflict, never returning that owner's company information.

## Verification

- Unit/API suite: **74 passed**, one live Storage test skipped.
- Full browser suite: **63 passed**, one live upload test skipped.
- Build, presentation validation (0 local production decks), and diff whitespace checks passed.
- New unit tests cover registry and company authorization, templates, duplicates,
  malicious slugs, version conflicts, wrong-company contacts, analytics scope and
  privileged RPC denial before ownership is verified.
- New Playwright tests cover assign → reload → mark sent → analytics → timeline →
  unassign; retry, duplicate conflict, keyboard/tab navigation and 320/390px layouts.
  Desktop/mobile screenshots inspected; no page errors in the primary flow.
- `supabase/tests/crm_presentation_links.sql` executed successfully against Supabase.
  Covers ownership, templates, duplicate links, contact FK, stale sends, atomic
  history, unassign preserving the deck, existing stats/unique-slide calculation,
  statistics reset preserving the association/history, and service-role deck deletion
  preserving company/history. All random fixtures rolled back; no Storage files created.
- Browser API responses and server transport tests are mocked; database behavior is
  tested independently. No authenticated production browser flow or deployment yet.
- No new security advisor warnings. Existing
  [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
  [service-only website_sessions policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  and [presentation_sessions share-link index notice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
  remain unchanged. Unused-index notices on new/small tables were not treated as a
  reason to remove ownership or relationship indexes.

## Next stage-5 increment

1. Company selection directly in create/upload/edit presentation workflows, with
   safe retry semantics if saving a deck succeeds but association fails.
2. Explicit reply/sent workflow polish and engagement summary on the company overview.
3. Reliable owner-preview exclusion before any automatic move to PRESENTATION_VIEWED.

Template preview currently disables analytics, but an admin opening the public
presentation URL can still be counted. Historical analytics have no reliable owner
marker. Accordingly this increment labels the limitation and does **not** automatically
change pipeline states, fabricate a CRM view event, or imply visits identify a person.
Overview CRM remains stage 6, after the remaining stage-5 integration.
