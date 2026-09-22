# Phase 2 Sales OS — completion handoff

22 September 2026. Scope: `briefs/SHAPEVIZ_CRM_PHASE_2_SALES_OS_BRIEF.md`.
This supersedes the incremental Phase 2A handoffs. Application changes are local, not committed, pushed or deployed. The migrations listed below have been applied to the connected Supabase project.

## Completed functionality

- **2A:** Today/overdue Action Center, meaningful recent activity including repeat visits, transparent snoozable/dismissible suggestions, revocable recipient links and sharing history, quick notes, private saved filter views with rename/delete/default.
- **2B:** manual Fit independent of Priority and Engagement; centralized, explained engagement thresholds; reviewed website metadata; duplicate warnings by normalized domain or company name/country. No automatic merging or fabricated enrichment.
- **2C:** explicit WON-to-client conversion preserving the original company/history; Clients directory and account notes; presentations created/uploaded directly from company context; draft presentation copies with parent relation and separate analytics; lightweight client projects and separate project/monthly value summaries.
- **2D:** cohort funnel based on recorded stages/events, lost reasons, separate one-time/monthly opportunity reporting, reviewed transactional CSV import with duplicate policy and retry idempotency, filtered CSV export, Cmd/Ctrl+K search and quick actions.
- **2E:** email/calendar integration seams only, as requested by the brief. See `crm-integrations.md`.

## New implementation files

Frontend modules in `public/admin/`: `crm-action-center.js`, `crm-recent-activity.js`, `crm-recent-types.js`, `crm-suggestions.js`, `crm-suggestion-rules.js`, `crm-recipient-sharing.js`, `crm-quick-note.js`, `crm-saved-views.js`, `crm-filter-config.js`, `crm-normalize.js`, `crm-clients.js`, `crm-csv.js`, `crm-operations.js`, `crm-command.js`.

Server modules in `src/crm/`: `action-center.js`, `recent-activity.js`, `suggestions.js`, `recipients.js`, `saved-views.js`, `website-metadata.js`, `clients.js`, `operations.js`. Also `src/presentations/recipient-token.js`.

## Modified implementation files

`public/admin/`: `crm.js`, `crm.css`, `studio.js`, `studio-company.js`, `crm-followups.js`, `crm-overview.js`, `crm-pipeline.js`, `crm-presentations.js`, `crm-relations.js`, `crm-signals.js`.

`server.js`, `vercel.json`, `src/admin/handler.js`, `src/crm/handler.js`, `src/presentations/events.js`, `src/presentations/page.js`, `public/presentation-system/tracker.js`. Existing presentation upload, template creation, public rendering and analytics workflows are reused rather than replaced.

## Applied migrations / schema

All files are under `supabase/migrations/`:

1. `20260922193608_crm_action_center.sql` — owner-scoped task queues.
2. `20260922200152_crm_suggestions.sql` — suggestion state and rule RPCs.
3. `20260922201435_crm_recipient_foundation.sql` — recipient/link tracking foundation.
4. `20260922201649_crm_recipient_lock_scope.sql` — locking scope hardening.
5. `20260922202527_crm_recipient_sharing.sql` — share/sent workflow.
6. `20260922203820_crm_saved_views.sql` — private saved views, one default per owner.
7. `20260922204121_crm_lead_intelligence.sql` — optional Fit, normalized-domain lookup, duplicate checks and list filters.
8. `20260922204539_crm_clients_projects.sql` — client profiles and projects referencing the existing company identity.
9. `20260922205122_crm_sales_operations.sql` — immutable import batches, atomic import, reports and search RPCs.
10. `20260922210008_crm_engagement_refinement.sql` — centralized thresholds, progress, repeat activity, reserved calendar field.
11. `20260922210149_crm_sales_os_hardening.sql` — repeat-session ordering and recipient-aware last contact.
12. `20260922211230_crm_additional_suggestions.sql` — repeated-view and contacted/no-recorded-view rules.
13. `20260922211803_crm_client_values_search.sql` — client value summaries and presentation search scope.

New data stays owner-scoped. Client/project writes use version checks and audited activity. Import batches make the same confirmed retry return the prior result instead of duplicating companies. Presentation copies reuse `parent_slug`; no parallel version-history schema was introduced.

## Routes and business rules

New pages: `/admin/clients`, `/admin/reports`. Existing `/admin/leads`, company detail, pipeline, follow-ups and Studio expose the other actions. All APIs remain under authenticated `/api/admin?action=...`.

API groups: `crm-action-center`, recent activity, suggestions and suggestion state, recipient/share actions; `crm-saved-views` and `crm-saved-view-save/delete/default`; `crm-website-metadata`, `crm-duplicates`; `crm-clients`, `crm-client`, `crm-client-convert/save`, `crm-projects`, `crm-project-save`; `crm-import-preview/commit`, `crm-sales-report`, `crm-global-search`; `clone-presentation`. Existing note, presentation association and follow-up APIs are reused.

Filter choices and serialization live in `crm-filter-config.js`; domain/name normalization in `crm-normalize.js`; CSV parsing/export in `crm-csv.js`; enrichment, import and project validation in their server modules. SQL centralizes engagement and suggestion configuration.

Engagement: NONE for no checked sessions; ACTIVE for at least 2 visits, 60 seconds, 50% known-deck progress, or a website click. HOT requires at least two signals among 3 visits, 180 seconds, 80% progress and a website click. Fit and Priority are never overwritten by this calculation. Missing slide counts mean unknown progress, not zero or invented completion.

Reports use actual recorded milestones for a company-created-date cohort, not inferred earlier stages. Estimates and project values are not payments or accounting revenue. Monthly and one-time values remain separate; absent values and explicit zero remain distinct. A no-view suggestion means no recorded eligible visit, not proof that the recipient never opened the presentation.

## Security and operational limits

Following the Supabase skill workflow, changes use migrations, user-JWT invoker operations, owner-scoped RLS, limited column grants and SQL ownership tests. CRM records remain private. Presentation search respects the existing shared owner-role presentation registry; it does not expose another user's private company relationship. Public recipient links do not reveal private notes, company metadata or recipient email.

Website metadata accepts only public HTTP(S) endpoints on normal ports. It resolves and pins public IPv4 addresses, validates every redirect, blocks local/private/special networks, caps responses at 512 KB and uses a 10-second total budget. It is not a crawler, cannot access IPv6-only sites, and requires review before saving.

CSV import: at most 200 rows / 80,000 characters, strict headers, reviewed content hash, duplicate skip/create choice, atomic transaction and stable batch ID on retry. Exports neutralize spreadsheet formulas and cap a filtered export at 5,000 leads. Saved views cap at 100 per owner. Search is bounded per object type. Large datasets should use narrower filters rather than silently assuming an unlimited export.

Clones are new drafts with their own slug and analytics; the original remains unchanged. Storage and associations are checked before success. Retry markers prevent duplicate copy creation after an association failure.

## Verification

- Node unit/API regression suite: **109 passed, 1 opt-in test skipped**. Full Playwright browser suite: **95 passed, 2 opt-in live tests skipped**. The expanded live CRM test was also run separately and passed. Production build passed.
- New unit/API tests: action center, recent activity, suggestions, recipients, `crm-sales-os.test.js`, `crm-clone.test.js`.
- New browser coverage: action center, recent activity, suggestions, recipient sharing, `crm-sales-os.spec.js`; expanded company-to-presentation and live CRM tests. Existing analytics, tracking gate and relations tests updated for the new workflows.
- Rollback-only SQL fixtures: `crm_action_center.sql`, `crm_suggestions.sql`, `crm_recipients.sql`, `crm_sales_os.sql`, and updated `crm_signals.sql`. Checks include anonymous/two-owner isolation, conversion, projects, saved defaults, import retries and duplicate handling.
- Real Supabase integration passed: quick notes, Fit, WON conversion, projects, saved views, CSV import, reporting, search and actual Storage-backed draft copy. Test auth users, companies, presentations and stored copy objects were cleaned up.
- Mobile layout, error/retry draft preservation, public presentation behavior and real public website metadata fetch were checked.
- No separate lint/typecheck scripts exist in this repository. Build and test scripts are the available checks.
- Advisor baseline: existing leaked-password-protection warning, service-only website session RLS info, legacy share-link FK index recommendation and unused-index notices. These were not silently changed as part of this feature.

## Configuration / intentional exclusions / next step

No new package or external provider credentials are required. Existing Supabase/Auth/Storage configuration remains required. The database is migrated; publishing application code is still required before the new UI is available on the production site.

Actual Gmail/mailbox sync, calendar OAuth/event creation, automated outreach, AI enrichment, accounting/payment processing and automatic duplicate merging are intentionally not implemented. They are not placeholders backed by fake data; they are outside this brief's implementation scope.

Recommended next step: review the completed UI, then explicitly approve GitHub push and Vercel deployment. After deployment, perform an owner-login smoke test of Clients, Reports, template creation and public recipient links.
