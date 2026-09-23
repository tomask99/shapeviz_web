# AI Research 3B.2c — Lead AI Insight and selected enrichment

23 September 2026. A bounded single-company delivery following [evidence-backed contacts](ai-research-phase-3b2b.md).

**Completed and verified.** This delivery adds company AI Insight, immutable report history and explicitly selected enrichment. The next bounded stage is 3C's authenticated read-tool layer.

## Workflow

Company overview now presents **AI Insight** with research Fit, recommended services and reasons, summary, pitch angle, evidence-backed signals, classification, missing information and sources. Current CRM Fit remains separate from research Fit. The research date is the supplied `last_researched_at`, never the date a report was accepted. A later manual CRM change makes the difference between current CRM values and the historical research explicit.

The newest accepted company report supplies Insight. Before the first report, a linked approved Research candidate supplies the original view. That candidate and its sources remain unchanged and directly accessible. A manually created or imported company without a candidate can start its own enrichment; there is no requirement to re-import it as a Research candidate.

Choose **Enrich company** or **Research again**, prepare a prompt for the existing company, copy it into ChatGPT, and paste or upload the resulting JSON. Shapeviz does not call an AI API, browse source pages or perform outreach. Review the complete report and source evidence, select any CRM fields to update, and separately accept the AI Insight. All choices start unchecked. Saving just the report is valid.

Every existing nonempty CRM target is treated as protected, regardless of its apparent origin. Replacing it requires its own explicit acknowledgement. Selected fields and their before/after values are retained with the report. Unselected values remain unchanged. A stale company version requires a fresh preview; the existing JSON remains available.

## Mapping and evidence boundaries

Only city, industry, short description, services and Fit can be changed. City, industry and description need VERIFIED provenance citing the report's sources. Inferred or unknown facts can remain in the research report but cannot be copied as CRM facts. Services are reasoned recommendations mapped through the shared catalog, and Fit retains its required explanation in Insight. Empty proposals cannot clear CRM fields.

Each proposed CRM field also passes the existing company validator independently. A valid research value exceeding a CRM text limit stays in the Insight and is marked unavailable for copying; it does not prevent accepting the report or other valid changes.

Company name, website/domain identity and country identify the reference and remain fixed in this workflow. Pipeline, Priority, lead source, social profiles, money, outcomes, contacts, notes and presentation data are outside the update mapping. Existing manual company editing remains available for those fields.

The envelope is `{schema_version:1,company_id,base_version,research}` with a complete canonical Research candidate and `source_origin: "ENRICHMENT"`. Existing company import v1 is unchanged. The envelope is bounded to 500,000 UTF-8 bytes. At least one public source is required, every recommended service needs a reason, and canonical fact/source relationships remain enforced. Research dates may be unknown but cannot be in the future; older research is flagged for review. Validation checks the evidence structure and references, not the truth of external claims.

Each report is immutable. Revisited URLs may have new retrieval metadata in a new report; earlier reports and original approved Research keep their exact source entries. History uses bounded pages and allows opening the full accepted report, including selected fields, replacements and before/after values.

Find similar companies uses the existing CRM reference workflow. Find contacts reuses the existing candidate contact workflow when approved Research is linked; companies without that link retain manual contact entry. Bulk research, direct-company contact research and scheduled discovery remain outside this delivery.

## Transaction and access

Owner-JWT reads use RLS, current owner membership and explicit company/owner constraints. The prompt contains only the bounded business profile and historical research context; private contacts, notes and financial fields are excluded. Historical report IDs cannot select a different company's report.

HMAC preview tokens bind owner, company, version, canonical proposal and eligible/protected field sets, with a one-hour expiry. The browser cannot supply arbitrary CRM changes: the server derives the selected patch from the validated report. The service-only invoker transaction checks current membership, owner, active company, version, identity, evidence, allowed field mapping and exact overwrite acknowledgements.

The transaction locks the company, updates only selected targets, saves immutable evidence and a single `ai_research_enriched` activity, and records the operation result atomically. Every new report advances company version once, including report-only acceptance. This serializes competing research and manual changes. An identical latest report with no selected CRM changes is a quiet no-op. Exact successful retries replay before checking newer company versions or archive state. Both verified owner claim locations are restored after existing company audit triggers run.

An ambiguous network/server failure preserves the exact request, token, selections and operation UUID in memory; reopening the dialog can retry it without duplicating history. A definite conflict preserves the JSON and requires a new preview. Page reload loses this temporary retry state; inspect report history before continuing. No credentials are stored in the browser or research payload.

API shapes are documented in the [implementation contract](ai-research-phase-3b2c-contract.md). The existing `crm-research-company` endpoint remains compatible. No package, AI credential, environment variable or page route is added.

## Verification

Applied migration: `supabase/migrations/20260923101634_crm_research_enrich.sql`. Local and remote migration version lists both contain **44 entries**, with matching MD5 `70680a464a089ba4b15eff0eac873edc` over sorted, newline-joined version strings. This confirms version alignment, not SQL-file content equality.

| Check | Result |
| --- | --- |
| Full unit/API regression, `npm.cmd test` | **240 passed, 1 existing opt-in Storage test skipped**; includes 18 new enrichment domain/API tests and 2 HTTP gateway tests. |
| Focused enrichment, Research and CRM browser checks | **29 passed**, including 10 new enrichment interaction tests. |
| Full browser regression, `npm.cmd run test:browser` | **153 passed, 8 opt-in live tests skipped**; 161 total. |
| Isolated real Auth/API/Supabase enrichment flow | **1 passed**; two temporary owners, cleanup in `finally`. |
| New SQL enrichment fixture | **Passed** in a rollback transaction. |
| Existing SQL regressions | **6 passed**: manual contacts/notes, Research inbox, import, review/approval, refresh and contacts; all rolled back. |
| Build and source assets | `npm.cmd run build` **passed**; all five changed admin assets match generated files. |
| Whitespace | `git diff --check` **passed**. |
| Fixture cleanup | Independent SQL confirmed **0** temporary test users/admins/companies/candidates/contact proposals/research-created contacts/Research events/activities/import batches/review operations/company reports. |
| Independent implementation review | No blocking findings in API/SQL authorization, selection mapping, history, retry behavior or UI integration. |

The live path covers read-only prompt generation, unchecked selections, protected replacements, selective CRM updates, report-only acceptance, immutable original research, report-history rendering, exact replay, no-op receipts, manual changes invalidating stale reviews, archived history, unlinked-company enrichment, cross-owner isolation and logout. Two independently reviewed reports competing for one company version yield **200/409** and exactly one new revision. Desktop and 390px mobile captures were inspected at `.cache/research-enrich-live-desktop.png` and `.cache/research-enrich-live-mobile.png`; neither layout overflows horizontally.

The SQL fixture additionally checks direct-role denial, composite ownership constraints, report immutability, source/provenance validation, exact overwrite acknowledgements, all five field mappings, claim restoration, quiet no-op/activity counts, removed-member denial and preservation of contacts, notes, Clients, sales fields and the original approved candidate. A fixture-only table-alias ambiguity was corrected before the successful run; the applied migration needed no correction. Local Docker/Supabase is unavailable, so these fixtures ran in rollback transactions on the connected project.

Security advisors remain unchanged: three existing RLS-without-policy INFO notices and the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Performance advisors retain the existing unrelated `presentation_sessions_share_link_id_fkey` index recommendation and 17 unused indexes. No new findings or unrelated setting/index changes.

To rerun the isolated flow on Windows, set `$env:LIVE_RESEARCH_TEST='true'`, run `npm.cmd run test:browser -- tests/browser/research-enrich-live.spec.js --workers=1`, then remove the variable. The default suite skips live tests. The test uses fictional company data and does not perform real research or outreach.

## Next delivery

**3C — authenticated tool layer**, starting with bounded read operations that reuse existing ownership and domain rules. Direct ChatGPT writes and automatic agents remain later work.

Application changes remain local; no Git push or deployment is included.
