# AI Research 3A.4 — review to Lead

23 September 2026. Scope: stage 3A.4 of [the Phase 3 plan](ai-research-phase-3-plan.md). This verified stage completes the **3A MVP**; deeper research, enrichment and direct ChatGPT tools remain later stages.

Owners can edit imported candidates, explain manual Fit changes, reject and restore candidates, review the proposed Lead, and explicitly approve it. Approval creates one normal CRM Lead while preserving the complete research record and its sources. Existing CRM companies block conversion; matching Research candidates require an explicit acknowledgment. No paid AI API, model SDK, new package dependency or AI credential is introduced.

The database migration is applied to the connected `shapeviz_web` Supabase project. Application changes remain local; no Git push or deployment was performed.

Final verification passed: 168 Node tests, 115 browser regression tests, two separately enabled live Supabase browser tests, rollback SQL fixtures and the build. All 41 local/remote migration versions align, and temporary Research fixtures were removed. Detailed results and the default skipped-test scope are recorded below.

## Owner workflow

1. Open a candidate at `/admin/ai-research/:id` and choose **Edit candidate**. Edit company facts, classification, Fit and its reason, summary, recommended services, signals, positioning, pitch, sources and provenance. Structured evidence has JSON editors; invalid input stays available for correction. Saving sends the complete canonical proposal with its version, not an unbounded partial database update.
2. A changed fact cannot silently keep its previous evidence. If the supplied provenance is unchanged, the server resets it to `UNKNOWN` with empty evidence and references. Deliberately supplied replacement evidence must pass the canonical rules. Changing a positioning value with the same explanation is rejected until its evidence is updated; no inferred explanation is fabricated.
3. The detail shows **Manual corrections**, a manual Fit indicator where applicable, and **Review history**. A material save creates one event containing changed field names and previous/current Fit. Saving an unchanged candidate does not create another event or increment its version. Identity changes clear an obsolete duplicate result so it can be checked again.
4. **Reject candidate** accepts an optional reason and preserves the record. Rejected domains remain in future prompt exclusions and duplicate checks. **Restore to review** is an explicit action: it clears the current rejection state while retaining the rejection and restoration history. Rejected candidates must be restored before editing or approval.
5. **Approve as lead** opens a review dialog. Select Lead Priority and services, then choose **Preview lead**. The default Priority is `MEDIUM`, independently of Fit. Any of the 14 canonical services can be selected; original recommendation relevance/reasons remain on the research record. Changing choices invalidates the displayed preview.
6. Review the mapped Lead and current duplicate matches. An existing Lead, Client or archived CRM company blocks approval. Research matches, including rejected candidates, require the acknowledgment checkbox. **Confirm and create lead** is the only action that creates a Lead.
7. The approved candidate links to its Lead and becomes read-only through the review workflow. The Lead shows its reviewed Fit explanation, summary, source origin and a **View research and sources** link. Its activity timeline includes the approval. Later Lead edits remain independent of the approved research record.

The inbox and detail routes are unchanged. No new public route is added. Research history reads the latest 50 events; all events remain stored. The linked Lead summary is the minimal preserved-research view for 3A, not the richer AI Insight/enrichment workflow planned for 3B.

## API and candidate-to-Lead mapping

Actions use `/api/admin?action=...`, the existing verified owner session and current owner membership. Writes retain same-origin validation and private no-store responses. Reads use the owner's JWT and RLS; the browser never receives a service key.

| Method / action | Request | Result |
| --- | --- | --- |
| `GET crm-research-detail` | `id` | Existing full candidate projection, now including `approved_company_id`, `manual_fields`, and a separate `events` array. |
| `GET crm-research-company` | `companyId` | `{candidate}` with linked candidate ID, name, Fit/reason, summary, source origin, approval timestamp and manual fields; `null` when no link is visible. |
| `POST crm-research-save` | `{id, version, operationId, candidate}` | Candidate ID/version and validation `warnings` when evaluated; a completed repeated operation also returns `replayed: true`. All canonical top-level proposal fields are required; ownership, generated and lifecycle fields are rejected. |
| `POST crm-research-reject` | `{id, version, operationId, reason?}` | Candidate ID/version; optional trimmed reason up to 3,000 characters. |
| `POST crm-research-restore` | `{id, version, operationId}` | Candidate ID/version after returning to `NEEDS_REVIEW`. |
| `POST crm-research-approval-preview` | `{id, version, priority, services}` | Candidate, mapped `lead`, displayed `duplicates`, full `match_count`, `company_match_count`, `can_approve`, and signed `reviewToken`. Services use canonical research names. |
| `POST crm-research-approve` | `{id, version, operationId, reviewToken, acknowledgeDuplicates, confirm: "approve"}` | `{candidate_id, company_id, version}`; completed repeats include `replayed: true`. |

`operationId` is a UUID created for an individual reviewed action. Unknown fields, malformed versions, repeated query parameters and caller-selected ownership are rejected. The canonical JSON import remains schema version 1; its envelope, limits and candidate insertion workflow are unchanged.

`src/research/mapping.js` exports `researchLeadInput()` and uses the existing CRM company validator. It does not flatten evidence into notes or invent contacts, social URLs or financial values.

| Research / reviewed input | CRM result |
| --- | --- |
| Company name, website, country, city, industry, short description | Copied to the corresponding existing company columns. |
| `fit` | Copied as `LOW`, `MEDIUM`, `HIGH` or `null`; the explanation remains on the linked candidate. |
| Reviewed canonical services | Mapped through `SERVICE_CATALOG.crmValue`, preserving historical CRM capitalization. All 14 services are supported, including `Lifestyle CGI` and `Product Animation`. |
| Reviewed Priority | `LOW`, `MEDIUM` or `HIGH`, default `MEDIUM`; independent of Fit and research confidence. |
| Lead source and pipeline status | Fixed to `AI Research` and `NEW_LEAD`. |
| Social links, contacts and opportunity value | No invented values; social links empty, no contact inserted, amount unspecified and value type `UNKNOWN`. |
| Classification beyond existing company columns, positioning, Fit reason, sources/provenance, summary, recommendation reasons, signals, pitch, confidence and research dates | Preserved in the associated Research candidate and accessible from the Lead. |

## Duplicate protection, versioning and retries

Duplicate matching remains shared with import: normalized domain is a strong match; nonempty normalized name plus country is a secondary match. Leads, Clients, archived companies and every Research status participate. The candidate being reviewed is excluded **before** limiting displayed matches and calculating the fingerprint. The preview displays at most ten matches, but `company_match_count` and the fingerprint cover the complete set, so a company outside that display limit still blocks conversion. Records are never silently merged or updated by approval.

Previews are observations, not locks. The server signs the owner, candidate/version, exact mapped Lead, complete duplicate snapshot, approval purpose and one-hour expiry with HMAC. Commit accepts those reviewed values; it does not accept replacement Lead fields from the browser. The database then acquires the existing owner mutation lock, checks current membership and candidate version/state, recalculates duplicates, and compares the current snapshot. A conflicting edit or duplicate change returns HTTP 409 before any Lead is created.

The private operation ledger is keyed by owner and operation UUID. It binds a stable request hash and the original result. Within the same transaction, approval inserts the Lead, preserves existing company audit behavior, writes one Research approval activity, associates and closes the candidate, writes Research history and saves the ledger result. Replaying a completed unchanged operation returns the same Lead ID before checking the candidate's newer version or closed state. Reusing an operation UUID for a different payload returns 409. Saves, rejection and restoration use the same ledger boundary; save hashes bind the incoming proposal before any evidence reset derived from stored data.

An ambiguous server/network failure retains the exact request and operation UUID in memory. Draft controls are locked while its result is unresolved, and **Retry save** or **Retry approval** sends that same operation. Dialog reopening in the same page session retains the attempt. Definite validation/conflict responses allow correction or a new preview while keeping editable input. A page reload loses the in-memory attempt: reload the candidate to inspect its current state and any resulting Lead link. An expired approval token requires reloading/reviewing again. This is not durable client-side draft storage or an unlimited-lifetime retry token.

## Migration and access boundary

Applied migration: `supabase/migrations/20260923085034_crm_research_review.sql`.

- `crm_research_candidates` gains `manual_fields` and `approved_company_id`. A composite company/owner foreign key prevents cross-owner association; a unique association index and consistency check align the approved status, company link and approval timestamp.
- `public.crm_research_events` stores `candidate_updated`, `candidate_rejected`, `candidate_restored` and `candidate_approved` events with owner/candidate foreign keys. RLS allows only current authenticated owners to read their history. Authenticated users receive no direct history writes.
- `crm_private.research_review_operations` stores operation hashes and results. It has RLS, no browser policy/grant, and narrowly scoped service-role SELECT/INSERT permissions. It is not exposed by PostgREST.
- Shared duplicate helpers support excluding the current candidate and retaining the complete company count. The authenticated, security-invoker `crm_research_review_duplicates` RPC preserves JWT/RLS access.
- `crm_research_review` and `crm_research_approve` are **service-role-only, security-invoker** transactions. They check their execution role, lock current owner membership and enforce candidate identity/state/version. Anonymous and authenticated callers cannot invoke them directly. Candidate tables remain read-only to browser roles.
- Existing company triggers require a verified owner identity. Approval sets both transaction-local `request.jwt.claim.sub` and `request.jwt.claims` only after role/membership checks, executes the existing company audit path, then restores both values. Existing trigger authorization is not weakened and no public security-definer write path is added.
- CRM service and won-service constraints accept all 14 catalog values; source constraints accept `AI Research`. The activity constraint adds `ai_research_approved`, with a unique candidate/owner activity index to prevent repeated approval entries.

No data backfill creates Leads. Approval preserves the candidate; it does not delete or flatten research. Existing import, presentation, contact, follow-up and pipeline operations retain their entry points.

## Files and verification

Backend files: `src/research/review.js`, `src/research/mapping.js`, extended Research/CRM/admin dispatch, and the central service/source catalogs. UI files: `public/admin/research-review.js`, existing Research detail/styles, and linked research/activity rendering in `public/admin/crm-relations.js`.

| Check | Recorded result |
| --- | --- |
| New Node/API tests, `tests/research-review.test.js` | **17 passed**: all-service mapping, private owner scope, signed purpose/identity/version/expiry, hidden company matches, acknowledgment, malformed snapshots, stable replay hashes, stale provenance, protected field injection, rejection/restoration and linked reads. |
| `npm.cmd test` | **168 passed, 1 opt-in Storage test skipped**; 169 total. |
| New browser suite, `tests/browser/research-review.spec.js` | **7 passed**: full candidate edits, retained errors, manual Fit/history, ambiguous retries, rejection/restoration, explicit approval and both links, company/research duplicate decisions, mobile and cancellation. |
| Full browser regression before adding the new opt-in live case | **115 passed, 3 skipped**; 118 total. The subsequently added `research-review-live.spec.js` was separately checked in default mode: **1 skipped**. No combined rerun total is claimed. |
| `supabase/tests/crm_research_review.sql` | Passed in a rollback transaction: lifecycle/history, no-op saves, approval mapping, duplicate self-exclusion and bounded display, idempotency, closed-state/version conflicts, same-owner links, current/other/removed-owner and anonymous access, direct-RPC grants and audit claims. |
| Real Supabase browser verification | **2 passed in 30.2 seconds**: `tests/browser/research-live.spec.js` and the new `research-review-live.spec.js` ran sequentially with `LIVE_RESEARCH_TEST=true`. |
| SQL regression after migration application | `crm_companies.sql`, `crm_sales_os.sql`, `crm_completion.sql` and `crm_research_review.sql` **passed** in rollback transactions. |
| `npm.cmd run build` and `git diff --check` | **Passed**. |
| Migration alignment and fixture cleanup | All **41 local/remote versions match**. Cleanup queries returned **0** fixture users, candidates, Research events, import batches and review operations. |

The new opt-in live case exercises actual Auth → admin API → owner JWT/RLS → transactional conversion, including manual edits, rejected-domain memory, restoration, all-service conversion, preserved evidence, direct authenticated write/RPC denial, stale previews, competing approvals and repeated identical approval requests. It creates an isolated owner and removes its fixtures in `finally`. The mobile approval-dialog screenshot was also visually inspected. Local Docker/Supabase is unavailable, so SQL fixtures run against the connected project's rollback transactions. There is no separate lint or typecheck script.

The sorted local and remote migration version lists both have MD5 `8be4d1756f860e81233c2dbb40e97f37`. This compares the recorded version lists, not migration file contents. Cleanup checks covered `research-test-*` users and their candidates, `crm_research_events`, private import batches and private review operations.

Final security advisors reported **no new warning**. The existing disabled leaked-password protection warning remains unchanged. RLS-without-policy INFO findings cover the existing `website_sessions`, previous private import ledger and new private review ledger. The private ledger findings are intentional: browser access is denied rather than granted by a policy. Public Research history has its explicit owner read policy. Performance advisors reported the existing presentation share-link foreign-key index recommendation and 18 unused indexes; there is no new unindexed foreign key. No unrelated security configuration was changed.

## 3A acceptance and next stage

The completed and verified 3A MVP covers the brief's flow: private discovery inbox and structured JSON import with preview; company classification, explained Fit, services, signals, pitch, confidence, cited sources and explicit evidence status; searchable/filterable candidates; reviewed edits and rejection memory; duplicate-aware explicit approval into a normal Lead with research retained. The workflow uses ChatGPT's manual JSON bridge and requires no separate paid AI API.

No manual configuration or new environment variables are required beyond the existing Supabase URL, server credential and owner authentication. The schema exporter/example JSON remain compatible. The application has not been deployed, and no direct ChatGPT write integration is claimed.

Next: **3B.1 — deeper/refresh research prompts, missing-information and next-action support, proposed updates to existing candidates, and protection of manually reviewed fields during refresh.** Contacts, similar-company discovery, richer Lead AI Insight, bulk review, selected Lead enrichment, MCP/direct tools and scheduled or embedded agents remain later bounded stages. This delivery sends no outreach and does not begin those stages automatically.
