# AI Research 3B.1 — deeper research and reviewed refresh

23 September 2026. Scope: stage 3B.1 of [the Phase 3 plan](ai-research-phase-3-plan.md), following the verified [3A MVP](ai-research-phase-3a4.md).

Open Research candidates now support company-specific **Research deeper** and **Research again** prompts, computed research gaps and a suggested next action, and selective application of a returned JSON proposal. Existing manual decisions, citation history and unchecked fields are protected. Research updates modify the existing candidate; they create no new candidate or Lead and do not enrich an existing Lead.

The migration is applied to the connected `shapeviz_web` Supabase project. Application changes remain local and have not been pushed or deployed. No new package, paid AI API, AI credential, environment variable or manual configuration is required.

Stage 3B.1 is verified: 186 Node tests, 124 browser regression tests, one separately enabled live Supabase test, rollback SQL fixtures and the build passed. All 42 local/remote migration versions align, advisors have no new findings, and isolated fixture cleanup returned zero remaining records. Exact run boundaries are recorded below.

## Workflow and scope

1. Open an unapproved, non-rejected candidate at the existing `/admin/ai-research/:id` route. **Missing information** distinguishes unrecorded fields from recorded facts needing verification. **Suggested next research action** derives from those gaps; it does not assert that the company lacks a product, service or downloadable asset.
2. Choose **Research deeper** to investigate gaps, or **Research again** to recheck current evidence. **Prepare prompt** reads the saved candidate and its version. The prompt includes its complete canonical research, protected manual fields, evidence rules, guidance and a candidate-specific JSON schema.
3. Copy the prompt into ChatGPT. The UI explains that it contains private saved research; the owner chooses to share it. Clipboard failure selects the text for manual copying. **Open ChatGPT** opens the general website. Shapeviz does not call an AI model, fetch company websites, execute a ChatGPT tool or transmit the research to ChatGPT automatically.
4. Paste or upload the returned single-candidate JSON, up to **500,000 UTF-8 bytes**, then choose **Preview updates**. The envelope must match the candidate, its saved version and the selected research mode. Invalid input stays available for correction. Editing JSON invalidates a previous comparison.
5. Review Current/Proposed values. **Every group starts unchecked.** Select only the changes to apply. A protected group exposes a separate acknowledgment to replace that manual review. Selecting a fact that cites a new URL also requires selecting **Add research sources**.
6. Apply the selected changes. The server validates the merged result and the database atomically rechecks ownership, version, selections, overrides, source history and dates. The detail then shows the updated candidate and one **Research refreshed** history event with the mode, selected groups, overrides, actual changed fields and relevant Fit/date changes.

Approved candidates remain preserved and closed to this workflow. Rejected candidates must first use the existing explicit restoration action. No automatic research-state transition begins when a prompt is prepared or copied. Successful changes return the candidate to `NEEDS_REVIEW`, except an existing `DUPLICATE` remains flagged when its identity is unchanged. A company-name, website or country change clears obsolete duplicate links/check time; approval still performs its own current duplicate check.

Guidance is computed by the shared `researchGuidance()` helper, using existing fields, source types and recorded signals. It is not another stored AI result, a numeric score, or a persisted missing-information/next-action column. No contact discovery or negative opportunity signal is fabricated from an empty record.

## Proposal contract and selective merge

The creation/import schema remains version 1. Updates use a separate strict envelope with the same candidate schema:

```json
{
  "schema_version": 1,
  "candidate_id": "<existing candidate UUID>",
  "base_version": 3,
  "mode": "deeper",
  "candidate": {"...": "every canonical candidate field, including unchanged fields"}
}
```

The candidate example above is descriptive, not valid import data. The generated prompt contains the complete actual envelope and schema. Allowed modes are `deeper` and `refresh`. Candidate proposals must include every canonical top-level field and be independently valid: referenced URLs must occur in their own `sources`. Ownership, generated values, lifecycle/approval fields and extra envelope fields are rejected. `source_origin` must stay unchanged; an update does not rewrite how the candidate originally entered Shapeviz.

| Review group | Applied together | Manual protection |
| --- | --- | --- |
| Each company/profile fact in `PROVENANCE_FIELDS` | Its value and that field's provenance | The fact marker, a granular `field_provenance.<field>` marker, or the existing coarse `field_provenance` marker protects the group. |
| Fit | `fit` and `fit_reason` | Either manual marker protects the complete pair. |
| Positioning, service recommendations, opportunity signals and other arrays | The complete selected object/array | Its existing manual marker protects the group. These lists are explicit replacements, not automatic item merges. |
| Summary, pitch, confidence and last-researched date | The selected field | Its existing manual marker protects it. |
| Sources | New distinct source URLs appended to the existing array | A manual `sources` marker also protects additions. |

Only changed groups are selectable. Unselected values and evidence remain intact. Protected selected groups require exactly their corresponding override choices; a blanket permission, an unselected override or an override for an unprotected group is rejected. Applying an explicitly accepted AI proposal does **not** erase existing `manual_fields` markers, so later refreshes remain protected.

Source handling is deliberately additive: old source entries, their order, URLs, titles, type, retrieval time and `supports` metadata stay unchanged. Omitting an old source does not delete it. Attempted same-URL metadata changes are ignored with a visible `source_metadata_preserved` warning. New distinct entries are appended, still within the canonical limit of 50 sources. Refresh cannot rewrite or remove historical citations, and it cannot record a second retrieval snapshot under the same URL. A future source-history design can extend that capability; this stage does not silently replace evidence.

The normal evidence rules still apply to the final selected combination: verified facts require cited sources, inferences need explanations, and Fit needs its reason. A selected claim referencing an unselected new source is rejected with an instruction to select **Add research sources**. Canonical format checks do not independently prove that a public claim is true; the review remains a human decision.

`last_researched_at` is a selectable supplied value, never an automatic `Date.now()` stamp. A changed value cannot erase a known date, move backwards or exceed the server clock by more than five minutes. An unchanged historical value is preserved even if it predates these checks. Source retrieval times are also supplied data; the application does not invent them.

## API, privacy and retries

All actions retain the existing verified owner session, current owner membership, private no-store responses and same-origin write checks at `/api/admin?action=...`. There are no new page routes. Candidate reads use the owner's JWT and RLS with an explicit owner/ID filter.

| Method / action | Request | Result |
| --- | --- | --- |
| `GET crm-research-refresh-prompt` | `id`, `version`, `mode=deeper\|refresh` | `{prompt}` for the current open candidate. Read-only; no external website or model request. |
| `POST crm-research-refresh-preview` | `{id, version, proposal}` | `groups`, `warnings`, `mode`, `reviewToken`. Each group has `key`, `label`, `before`, `after`, `manual` and `fields`. |
| `POST crm-research-refresh-commit` | `{id, version, operationId, proposal, selectedFields, overwriteManualFields, reviewToken, confirm: "apply"}` | Candidate ID/version and warnings; a completed identical replay also returns `replayed: true`. |

Fact comparisons use `{value, provenance}`; Fit comparisons use `{fit, fit_reason}`. Other groups compare the complete scalar, object or array. The existing HTTP transport allowance accommodates JSON escaping and tokens; the decoded proposal stays limited to 500,000 bytes.

The HMAC preview token binds the verified owner, candidate/version, canonical normalized proposal hash, mode, refresh purpose and a **one-hour expiry**. The operation hash additionally binds the sorted selected and override groups. Changing selections is allowed before the first commit; changing the proposal requires a new signed preview. Formatting/key-order differences that normalize to the same canonical proposal do not alter replay identity.

The server merges against the current candidate only when versions match. A stale exact retry passes a null candidate payload to the existing operation ledger, allowing the database to return a previously completed result before checking the newer version or closed state. An uncompleted stale operation returns a conflict. Ledger insertion, research mutation and history insertion share one transaction and the existing owner mutation lock. The service-only RPC checks membership even for replay.

After an ambiguous network/server failure, the browser retains the exact proposal, token, selections and operation UUID in memory and locks editing while **Retry selected updates** resolves that attempt. Reopening the dialog in the same page session preserves it. A definite validation/conflict response retains the JSON but clears the comparison, requiring a new preview with unchecked choices. Reloading the page loses the in-memory attempt; inspect the current candidate before preparing another proposal. Expired tokens require a fresh current-version preview. This is not durable draft storage or an unlimited retry window.

## Migration, files and verification

Applied migration: `supabase/migrations/20260923091114_crm_research_refresh.sql`.

It adds `candidate_refreshed` to the existing Research event constraint and creates the **service-role-only, security-invoker** `public.crm_research_refresh` RPC. It adds no table, candidate column, public route or browser write grant. The transaction reuses the owner lock and private `research_review_operations` ledger. It checks exact selected groups, manual overrides, unchanged unselected values, normalized website/domain consistency, immutable origin, additive source history and non-regressing research dates before writing explicit candidate columns. It keeps manual markers unchanged, emits one event for an actual change and never mutates a Lead.

Anonymous and authenticated roles cannot invoke that write RPC directly. Existing candidate/event RLS remains in effect. The only service credential use occurs inside the authenticated server boundary; no security-definer shortcut, browser secret or arbitrary database tool is exposed.

| Area | Files / checks |
| --- | --- |
| Domain and backend | `src/research/refresh-domain.js`, `refresh.js`; existing Research dispatcher integration. Shared `schema.js` and `validation.js` remain the canonical contract. |
| UI and guidance | `public/admin/research-refresh.js`, `research-guidance.js`, candidate detail/history integration and styles in the existing Research modules. |
| New Node tests | `tests/research-refresh.test.js`: **16 passed**, covering strict envelopes/limits, signatures, selective merge, grouped evidence, source history, manual overrides, timestamp rules, owner reads/service writes and stale/replay behavior. `tests/research-guidance.test.js` covers record gaps without fabricated negative conclusions. |
| Focused browser checks | New `tests/browser/research-refresh.spec.js`: **9 passed**, plus **5 existing inbox tests passed**. Covers prompt/copy, unchecked groups, explicit overrides, retained inputs, retries, stale responses, file/mode/version validation, hostile text, mobile layout and closed candidates. |
| Post-migration SQL | `crm_research_refresh.sql`, `crm_research_review.sql`, `crm_research_import.sql` and `crm_research.sql` **passed** in rollback transactions against the applied schema. |
| Full Node regression | `npm.cmd test`: **186 passed, 1 opt-in Storage test skipped**; 187 total. |
| Build and whitespace | `npm.cmd run build` and `git diff --check`: **passed**. |
| Migration alignment | All **42 local/remote migration versions match**. Both sorted version lists have MD5 `11c5a7f2a8d0e92f7b8534cd6e116a84`; this compares version lists, not migration file contents. |
| Full browser regression | **124 passed, 4 skipped**; 128 total in 1.9 minutes. This run started before the new isolated refresh live file was created; no combined total including that later file is claimed. |
| Isolated live path | `tests/browser/research-refresh-live.spec.js`, `LIVE_RESEARCH_TEST=true`, one worker: **1 passed in 15.7 seconds**. The separate default-mode run correctly reported **1 skipped**. |
| Fixture cleanup | Remote queries returned **0** temporary `research-test-*` users, candidates, Research events, import batches and review operations. |
| Final advisors | **No new findings**; existing security/performance findings are described below. |

The refresh SQL fixture verifies direct-role denial, same-owner access, removed-member denial, closed/version conflicts, unselected and protected-field enforcement, source preservation, history and ledger behavior. Local Docker/Supabase is unavailable, so database verification uses rollback transactions on the connected project. The repository has no separate lint or typecheck script.

The live refresh test used an isolated owner through actual Auth → admin API → JWT/RLS → reviewed transaction. It verified protected manual fields, source preservation, exact retries, stale-version rejection, competing updates returning 200/409, forbidden direct RPC access returning 403 and post-logout access returning 401. Its mobile screenshot was independently inspected. The final independent review found no blocking issue.

Final security findings are unchanged: three [RLS-without-policy INFO findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for `website_sessions` and the two private Research ledgers, plus the existing [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The private ledgers intentionally deny browser access. Performance findings remain the existing [`presentation_sessions_share_link_id_fkey` index recommendation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [18 unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No unrelated policies, indexes or authentication settings were changed.

## Next stage

Next: **3B.2 — evidence-backed contacts and similar-company discovery**, scoped into another bounded delivery. Richer Lead AI Insight, selected Lead enrichment, bulk workflows, source retrieval history, direct ChatGPT/MCP tools and scheduled or embedded agents remain later work. Existing approval and presentation/CRM flows remain as delivered in 3A. This stage sends no outreach and does not automatically begin any deferred capability.
