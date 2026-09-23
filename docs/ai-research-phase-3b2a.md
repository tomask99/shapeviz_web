# AI Research 3B.2a — find similar companies

23 September 2026. This bounded delivery implements the similar-company discovery part of [the Phase 3 plan](ai-research-phase-3-plan.md). Contacts and Lead enrichment remain separate stages.

**Completed and verified:** reference-based discovery from Research and CRM, with full owner-scoped exclusions and the existing reviewed JSON import. Contacts and Lead enrichment are not part of this delivery.

## Workflow

Open a Research candidate or a company in CRM and choose **Find similar companies**. Enter one to ten target country codes and a requested result count from one to twenty. Prepare the prompt, review its reference profile and excluded domains, and copy it into ChatGPT. The copied prompt contains saved business research; nothing is sent to ChatGPT automatically.

The reference can be an approved or rejected candidate, or an archived company. This action is read-only and does not reopen, approve or edit that record. A rejected or archived record is a comparison reference, not an automatically endorsed ideal client. Clients retain the existing CRM company identity and use the same company-detail entry point.

Changing countries or count invalidates the prepared prompt. Failed requests keep the input available for correction or retry. Late responses cannot restore an old prompt after an option change or navigation. Clipboard failure selects the text for manual copying.

Use **Import research JSON** to open the existing reviewed importer. It validates the canonical schema, presents all findings and duplicate matches, and saves only explicitly confirmed Research candidates. Import creates no Lead. Existing approval remains a separate action with its own duplicate recheck.

This is a manual ChatGPT bridge: Shapeviz prepares instructions and reviews returned JSON. It does not browse company websites, call an AI model, run ChatGPT tools or perform outreach. No package, AI credential or environment variable is added.

## Reference, results and duplicate handling

Candidate references use their stored business profile and supporting research, with evidence status kept visible. CRM company references use current company fields and services. The prompt does not fetch historical approved research and mix it with subsequently edited CRM values. Contacts, private notes, financial values and review history are excluded from the reference projection.

The instructions require independent evidence for every discovered company. Similarity is explained in `research_summary`; Fit and service recommendations need their own justification. A reference's classification, facts, sources, dates or Fit must not be copied into a result as though independently verified. Reference text and external page content are treated as data, not instructions.

The existing owner-scoped exclusion RPC supplies the full known domain list: Leads, Clients, archived companies and every candidate status, including rejected records. The reference domain is also excluded explicitly, along with its name/country identity when no website is recorded. An incomplete or oversized exclusion list fails rather than silently truncating it. Exclusions are a snapshot; domainless records and changes after prompt generation are still checked by import preview and commit.

The result format remains the existing schema version 1:

```json
{"schema_version":1,"candidates":[{"company_name":"Fictional example","website":"https://example.test","country":"CZ","source_origin":"SIMILAR_COMPANY"}]}
```

This minimal example demonstrates the envelope, not researched facts. The generated prompt includes the complete canonical schema and evidence rules. It requests `source_origin: "SIMILAR_COMPANY"`, already supported by validation, storage and filters. If evidence is insufficient, fewer results or an explanation are appropriate; no fictional company is inserted to meet the requested count. The import limit remains 100 candidates and 500,000 UTF-8 bytes.

The importer preserves the supplied origin and evidence. It does not infer an origin from the button used to open it, enforce prompt target countries, or store a new reference-company relationship. Returned data remains visible for review. Candidate-to-Lead mapping and the final `AI Research` Lead source are unchanged.

## API and access

`GET /api/admin?action=crm-research-similar-prompt` accepts:

| Parameter | Contract |
| --- | --- |
| `referenceType` | `candidate` or `company` |
| `referenceId` | Existing owned record UUID |
| `countries` | One to ten distinct comma-separated two-letter country codes; normalized to uppercase |
| `count` | Integer 1–20; defaults to 10 |

It returns `{prompt, excluded_count, reference, countries, count}`. `reference` contains `{type, id, name, status, version}` from the record read for this request. Unknown or repeated parameters are rejected. Countries follow the existing CRM code-format convention, without adding a separate country catalog.

The server verifies the signed-in owner and current membership. Reference reads use explicit owner/ID filters, a bounded column projection and the owner's JWT; exclusion reads also use that JWT and existing RLS. Invisible records return 404. Responses remain private and `no-store`. There is no mutation RPC, signed write token or browser service credential for prompt generation.

No page route, table, column, constraint, grant, policy or migration is added. The read action is registered through the existing Research/CRM/admin dispatcher. The shared exclusion loader is also used by the general discovery prompt, keeping its previous contract and fail-closed bounds.

## Files and verification

- Backend: `src/research/similar.js`, shared `exclusions.js`, existing import/Research dispatcher integration.
- UI: `public/admin/research-similar.js`, Research and CRM detail integration, existing Research styles and importer.
- Tests: focused backend/API, browser interactions, and isolated live Supabase verification.

- `npm.cmd test`: **200 passed, 1 existing opt-in live Storage test skipped**.
- `npm.cmd run test:browser`: **134 passed, 6 opt-in live tests skipped**. This includes ten new similar-company interaction tests covering both entry points, validation, escaping, failed requests, stale responses, navigation, clipboard fallback and mobile layout.
- Targeted similar-company, Research inbox and CRM relationship browser regression: **17 passed**.
- `npm.cmd run build`: **passed**. Generated admin assets match their source files.
- `git diff --check`: **passed**.
- `LIVE_RESEARCH_TEST=true npm.cmd run test:browser -- tests/browser/research-similar-live.spec.js --workers=1`: **1 passed** against the configured Supabase project with two isolated owners. Verified candidate and current CRM profiles, approved/rejected/archived references, copy, full exclusions, cross-owner 404s, private-domain isolation, unchanged database snapshots after prompt generation, the import handoff, rejected-duplicate skip, preserved evidence and `SIMILAR_COMPANY` origin, no Lead creation and 401 after sign-out.
- Desktop and 390px mobile screenshots inspected; no horizontal overflow or JavaScript errors. Local captures: `.cache/research-similar-live-desktop.png` and `.cache/research-similar-live-mobile.png`.
- Strict live-test cleanup and an independent SQL read confirmed **0 test users, candidates, research events, import batches and review operations**. No test companies remain. The existing **42 migration versions** are unchanged.

No schema migration is required for this stage. The read-only API reuses existing owner-scoped tables, RLS and exclusion lookup; returned results use the existing reviewed import transaction.

On this Windows machine, enable the opt-in test in PowerShell with `$env:LIVE_RESEARCH_TEST='true'` before the browser command; remove that variable afterward. The default suite skips live tests. No real company discovery, AI request or outreach is performed by these fixtures.

## Next delivery

**3B.2b — evidence-backed contacts:** a contact proposal contract, public-source evidence and confidence, candidate review, and explicit contact creation without fabricated addresses or automatic outreach. **3B.2c** will cover richer Lead AI Insight and selected enrichment. Bulk workflows, richer source retrieval history, direct ChatGPT/MCP tools and scheduled agents remain later work.

Application changes remain local; no Git push or deployment is part of this delivery.
