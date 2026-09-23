# AI Research 3A.3 — reviewed JSON import

23 September 2026. Scope: stage 3A.3 of [the Phase 3 plan](ai-research-phase-3-plan.md).

Owners can copy a research brief into ChatGPT, bring its JSON response back to the AI Research inbox, review validation and duplicate matches, and save selected candidates. Imports write only Research records. Lead conversion, candidate editing, rejection and deeper research remain later stages.

Database migrations are applied to the connected `shapeviz_web` Supabase project. Application changes remain local; no deployment or Git push was performed. No paid AI API, model SDK, new package dependency or AI credential is required.

## Using the workflow

1. Open **Sales → AI Research** at `/admin/ai-research` and choose **Research prompt**. Select General research or one of the three ideal client profiles. The prompt includes the current canonical schema, service/category catalogs, evidence rules and all known workspace domains within the stated limits.
2. Choose **Copy prompt**, open ChatGPT and paste it there. If clipboard access is unavailable, the text is selected for manual copying. **Open ChatGPT** opens the general ChatGPT website; it is not an API integration or a configured custom agent.
3. Choose **Import JSON** and paste the JSON response or upload a UTF-8 JSON file. The import limit is **100 candidates and 500,000 UTF-8 bytes**. Markdown fences and invalid envelopes are rejected; editable input stays available after errors.
4. Choose **Preview import**. Each valid row shows warnings, existing matches, earlier matching rows and expandable full candidate data, sources and evidence. Invalid rows show their errors and are excluded from import. Missing websites or sources and custom categories are warnings; unknown services and malformed evidence are errors.
5. Review each valid row. New rows default to **Import candidate**; possible duplicates default to **Skip this row**. **Keep despite the possible match** explicitly creates a separate Research candidate without merging or modifying an existing record. The confirmation button shows the number selected.
6. After saving, choose **Done** to refresh the inbox. New candidates receive `NEW`; explicitly retained matches receive `DUPLICATE` with an available same-owner company/candidate link and the duplicate-check timestamp. Imported Fit, sources, field provenance, service reasons and source origin are preserved.

Changing the JSON invalidates its preview. A changed duplicate snapshot or expired preview requires a fresh preview and retains the input. An ambiguous network/server failure keeps the exact batch ID, JSON, decisions and preview for **Retry import**, including when the dialog is reopened in the same page session. A page reload loses that in-memory attempt; a fresh preview then checks any records already saved and defaults matching rows to skip. This is not durable client-side draft storage.

## API and validation

All endpoints use the existing verified owner session, current `presentation_admins` membership, private no-store responses and same-origin checks for writes. Caller-provided ownership or workflow fields are rejected.

| Method / action | Request | Result |
| --- | --- | --- |
| `GET crm-research-prompt` | Optional `profile`: `furniture-manufacturer`, `lighting-brand`, `architecture-interior-studio`; omitted means all profiles. | `prompt`, `excluded_count`, `profile`, and available `profiles`. |
| `POST crm-research-import-preview` | `{json: "<raw JSON>"}` | Schema version, row/valid counts, sanitized candidates, row errors/warnings, `duplicates`, `match_count`, `within`, raw content `hash` and signed `previewToken`. |
| `POST crm-research-import-commit` | `{json, previewToken, batchId, choices: [{row, decision}], confirm: "import"}` | `imported`, `skipped`, `candidate_ids`; a repeated completed request also returns `replayed: true`. |

Actions are query parameters on `/api/admin?action=...`. Each valid row requires exactly one `skip`, `import` or `keep` decision; invalid rows are omitted from `choices`. `skipped` counts valid rows explicitly skipped, while the UI reports invalid rows separately. A known match requires `keep`; an earlier matching row only requires `keep` if that earlier row is also selected.

`src/research/import.js` calls the same schema-driven validator used by the CLI before both preview and commit. The server, not the browser, derives normalized identities and writes canonical candidate fields. Generated company-name normalization is removed before insertion. NUL, lone UTF-16 surrogates, normalized domains over 253 characters and website URLs that exceed 2,048 characters after URL normalization are rejected per row. Valid supplementary Unicode remains accepted.

The HTTP transport permits 3,100,000 bytes to accommodate an escaped JSON string and its review token; this does not raise the decoded source limit of 500,000 bytes. Duplicate RPC identity payloads are capped at 200,000 bytes; canonical database commit rows are capped at 2,000,000 bytes, each with at most 100 rows.

The prompt is generated from `RESEARCH_IMPORT_SCHEMA`, canonical catalogs and ICP definitions rather than a separately maintained schema. Exclusions include Leads, Clients, archived companies and candidates of every status, including rejected records. The database returns at most 10,001 domains to detect overflow; more than 10,000 domains, an incomplete response, or a generated prompt exceeding 500,000 UTF-8 bytes produces an error. No shortened exclusion list is silently presented as complete. Domainless records cannot contribute a domain exclusion; import still checks name and country.

## Duplicate identity and atomic commit

- A nonempty normalized domain is a match across `crm_companies` and `crm_research_candidates`. Name matching requires both a normalized nonempty name and a nonempty country. Empty countries do not establish name-based identity. Legal suffixes are preserved; unrelated subdomains are not merged.
- Matching includes archived companies and every Research lifecycle status. Within-batch checks compare valid rows and account for skipped rows when committing.
- Preview returns up to ten displayed matches per row, plus the full match count and a fingerprint over all matches. The fingerprint includes identity/review state, so changes outside the displayed ten also invalidate a pending import. Match ordering prioritizes domain matches and retains a CRM match in the bounded result when applicable.
- The SQL domain helper now handles query strings, fragments, ports, trailing dots and canonical IPv6 authorities consistently with stored URLs from the JavaScript URL parser. Its existing company-domain expression index is rebuilt, and a company name/country index is added.
- An HMAC token binds the verified owner, exact raw JSON hash, minimal duplicate snapshots and a one-hour expiry. The existing server-only Supabase secret signs the token; it is never sent to the browser. A changed body, another owner, invalid signature or expired review cannot authorize a write.
- Commit validates again and sends only canonical rows, reviewed decisions and the signed expected snapshot to the database. The batch request hash binds raw JSON and canonically ordered decisions, independent of the preview's expiry time or decision-array order.
- A per-owner transaction advisory lock coordinates imports with ordinary company/candidate writes. The commit's volatile duplicate helper reads current state after the lock is acquired. Current owner membership is rechecked and locked for the transaction. A changed snapshot returns HTTP 409 without a partial import.
- The private ledger is keyed by `(owner_id, batch_id)`. An unchanged completed batch returns its original IDs before a new duplicate check; reuse with different content/decisions returns 409. Selected candidates and their ledger result are saved atomically. Within-batch duplicate links are derived again from inserted rows in SQL.

Simultaneous real HTTP tests cover different batches competing for the same domain and two requests sharing one batch. They establish the observed API outcomes described below; they do not instrument a deliberately paused transaction to prove a particular lock-wait schedule.

## Database and access boundary

Migrations:

- `supabase/migrations/20260923082632_crm_research_import.sql` — applied: duplicate-candidate link/FK/index, corrected domain normalization/indexes, owner mutation locks, private import ledger, duplicate/exclusion reads and atomic import.
- `supabase/migrations/20260923083108_crm_research_duplicate_order.sql` — applied: stronger domain matches rank first, while bounded previews retain applicable CRM matches and a fingerprint of the complete match set.

All 40 local migration versions match the recorded remote versions; the MD5 hashes of the sorted version lists also match. The final database fixture passed after applying the ordering correction.

`public.crm_research_candidates` stays read-only for authenticated browser roles. Broad direct INSERT/UPDATE/DELETE permissions are not granted to make imports work. The server validates the full canonical schema and signed review before calling the **service-role-only, security-invoker** `public.crm_research_import` RPC. That function also checks its role and current owner membership, never accepts an unverified browser-selected owner, and inserts only explicit candidate columns. Anonymous and authenticated callers cannot invoke it directly. No `SECURITY DEFINER` write shortcut is introduced.

Duplicate preview and exclusion reads use the owner's verified JWT and invoker RPCs, retaining RLS. The private helper `crm_private.research_duplicate_rows` has narrowly scoped EXECUTE grants plus schema USAGE for its callers. It verifies authenticated owner identity and membership itself; service-role use still requires a current owner. The private schema is not exposed by PostgREST. Existing private tables/functions do not acquire new public execution or table privileges from schema USAGE.

`crm_private.research_import_batches` has RLS enabled and no authenticated/anonymous grants or policies. Only the service role receives SELECT/INSERT; ordinary users cannot inspect another owner's import history or forge a replay. Its RLS-without-policy advisor INFO is intentional fail-closed behavior for this unexposed server ledger, not a missing browser policy.

The new composite `(duplicate_candidate_id, owner_id)` foreign key prevents cross-owner Research links. The existing company duplicate FK remains owner-scoped. Research detail displays the relevant link; imports never create Leads, contacts, activities, approvals or rejection actions.

## Files and verification

- Backend: `src/research/import.js`, extended research/admin/CRM dispatch and the canonical validator.
- UI: `public/admin/research-import.js`, Research heading/detail integration and dialog styles in `research.css`.
- Node tests: `tests/research-import.test.js`, expanded `research.test.js` and `research-inbox.test.js` cover signature/owner/expiry checks, mixed valid/invalid batches, reviewed choices, replay payload stability, Unicode/URL bounds, complete prompts, HTTP size/auth boundaries and server-only commit credentials.
- Browser tests: `tests/browser/research-import.spec.js` covers paste/upload, mixed validation, existing and within-batch matches, explicit keep/skip, stale previews/navigation, ambiguous retries, 409 recovery, prompt selection/copy fallback, escaped content and mobile layout. Existing inbox cases remain covered.
- `supabase/tests/crm_research_import.sql`: rollback-only database checks for owner isolation, role/grant boundaries, cross-owner links, duplicate matching, snapshots, explicit keep, skipped rows, idempotency, exclusion completeness and bounded-match behavior. A 13-match regression (12 name-matching candidates and one domain-matching company) verifies that the stronger company match appears first despite the ten-item cap and is linked by commit. Existing `crm_research.sql`, `crm_sales_os.sql` and `crm_companies.sql` fixtures also passed in rolled-back transactions.
- `tests/browser/research-live.spec.js`: **1 passed** with an isolated temporary Supabase owner. Real UI import reviewed valid, invalid and duplicate rows; sources/provenance persisted; replay returned the same saved result; competing different batches returned 200/409; simultaneous requests for the same batch returned 200/200 with the same candidate IDs. The actual prompt included the owner's domains. Direct authenticated table insertion and direct import RPC invocation returned 403, and Leads remained unchanged. Cleanup runs in `finally`.
- `npm.cmd test`: **151 passed, 1 opt-in Storage test skipped** (152 total).
- Targeted Research browser suite: **12 passed**.
- `npm.cmd run test:browser`: **108 passed, 3 opt-in live tests skipped**.
- `npm.cmd run build` and `git diff --check`: **passed**. There are no separate lint or typecheck scripts.

Live desktop/mobile screenshots include `.cache/research-live-import-desktop.png` and `.cache/research-live-import-mobile.png`. The repository's working Playwright/Chrome setup provides browser verification. Default runs skip the isolated live test; run it explicitly with `LIVE_RESEARCH_TEST=true` when validating the real Auth/API/database path. Cleanup checks found zero remaining fixture users, Research records or import batches. Local Docker/Supabase remains unavailable, so SQL fixtures used the connected project's rollback transactions.

Security advisor results retain the existing [website-session RLS-without-policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), plus the intentional private-ledger INFO described above. There is no new security warning. Performance findings are [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) and the existing [presentation share-link FK index recommendation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys); there is no new unindexed FK. No unrelated security settings were changed.

## Configuration and next stage

The app uses the existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and owner authentication setup. No new environment variable, paid integration or deployment configuration is required. The service key remains server-only; owner JWTs continue to protect read access through RLS.

Next: **3A.4 — candidate editing and explained manual Fit, rejection with reason/history, approval review, atomic conversion to exactly one Lead, approval-time duplicate recheck and a durable research association.** Extend the Lead service/source constraints in that stage. The overall 3A and Phase 3 acceptance criteria are not complete yet.
