# AI Research — Phase 3 delivery plan

Brief: `briefs/SHAPEVIZ_AI_RESEARCH_AGENT_PHASE_3.md`. Repository audit: 23 September 2026.

**Delivery rule:** implement one bounded stage at a time, verify it and leave a handoff. The whole brief, and even all of 3A, must not be implemented in one pass.

**Completed and verified: the 3A MVP, 3B.1–3B.2c, 3C.1 read tools and 3C.2a–3C.2b MCP transport and external authorization. 3C.2c is deployed; the owner's actual local Work conversation discovered Shapeviz and successfully called its catalog tool.** Eight scoped read operations support separate opaque OAuth credentials, explicit owner consent and revocation. Production is live at `https://shapevizweb.vercel.app`; web and native OAuth registrations are configured, and the production native OAuth/MCP fixture passes. Access remains bounded to at most one hour and the source session. The current handoff is [ai-research-phase-3c2c.md](ai-research-phase-3c2c.md). Existing UI workflows include explicit enrichment and immutable report history. No paid AI API, model SDK or AI credential is introduced. Fresh conversation first-turn behavior and client disconnect/reconnection remain acceptance checks; a separate web connection has not been created. The rest of Phase 3 is not complete. Application code was deployed from the local working tree, without a Git push.

## Repository audit and reuse

**3C.2c real Work conversation now succeeds:** the owner screenshot and local transcript confirm eight-tool discovery and a direct Shapeviz catalog call at 16:34 UTC. The first attempt exposed a startup race; the shared config now waits for optional servers' startup timeouts, with 30 seconds for Shapeviz. All five public checks, production native OAuth/MCP tests and installed-client checks also pass. See the [connection guide](chatgpt-connection.md) and [3C.2c handoff](ai-research-phase-3c2c.md) for evidence and remaining fresh-conversation/disconnect acceptance checks.

| Area | Existing implementation / decision |
| --- | --- |
| Framework | Node.js ES modules, native HTTP server, vanilla HTML/CSS/browser modules. No React, Next.js or ORM. |
| Routing | `server.js`, `vercel.json`, `/admin/...` routes served by the Studio shell; browser navigation in `public/admin/crm.js`; `/api/admin?action=...`. Both server routes and Vercel rewrites must be updated when adding Research. |
| Database | Supabase/Postgres with timestamped migrations and rollback-only SQL fixtures. |
| Authentication | Supabase Auth, HttpOnly cookies, verified owner membership in `presentation_admins`. CRM queries carry the verified user's JWT. |
| Ownership / RLS | `owner_id = auth.uid()` plus current admin-owner membership. Existing per-user ownership is the boundary; do not introduce a second workspace model. RLS protects reads and writes; column grants protect identity/audit fields. |
| Leads / Clients | `crm_companies` is the company/Lead identity, with contacts, notes, follow-ups, activity, presentation links and client profiles. Fit already exists and is independent of Priority/Engagement. |
| Taxonomy / services | Existing industry suggestions and service values in `crm-options.js`; services and lead source also have SQL constraints. Historical service capitalization must remain compatible. |
| Validation | Handwritten server validators in `src/crm/validation.js` and domain modules. No Zod/Ajv dependency. Use bounded schema-driven validation for the new contract. |
| Imports | Reviewed CSV import has content hashes, duplicate policy, transactional commit and retry idempotency. Reuse the pattern, but research JSON must stage candidates instead of creating Leads. |
| Duplicates | `crm-normalize.js` and the Research duplicate helper match company domain or nonempty name/country across Leads, Clients, archived companies, candidates and rejected history. Clients retain company identity. Explicit keep creates a marked Research duplicate; records are never silently merged. |
| UI | Studio/CRM headings, dialogs, cards, tags, filters, pagination, notifications and error states. Reuse warm dark surfaces, amber, off-white text and `crm.css`; retain mobile usability. |
| Presentations | Existing upload, templates, public pages, company relations and analytics remain separate from private research. |

## Delivery sequence

| Stage | Scope | Exit condition |
| --- | --- | --- |
| **3A.1 — contract** | Central research schema, catalog/ICP configuration, evidence rules, normalization, validation and example JSON. | Valid/invalid proposals are distinguished deterministically; legacy CRM catalog values still pass regression tests. |
| **3A.2 — private inbox** | Add candidate storage, owner RLS, bounded list/detail APIs, `/admin/ai-research` and `/admin/ai-research/:id`, compact cards, sources/provenance, search/filter/sort and empty/loading/error states. | Owners can inspect their candidates; anon/non-admin/other-owner access is denied in SQL/API tests; desktop/mobile layout passes. |
| **3A.3 — ChatGPT import (complete)** | Paste/upload JSON, validation preview, explicit conflict review, duplicate lookup across Leads/Clients/candidates/rejections and within the batch, reviewed transactional import, retry idempotency, copyable prompt and excluded domains. | ChatGPT output can be reviewed and saved as candidates without a paid AI API or unexpected duplicate records. See the [3A.3 handoff](ai-research-phase-3a3.md). |
| **3A.4 — review to Lead (complete)** | Candidate edits, explained manual Fit, rejection/restoration/history, approval review, atomic candidate-to-Lead mapping, approval-time duplicate recheck, durable research association and meaningful timeline entries. All 14 CRM services and the AI Research source are supported. | A reviewed candidate becomes one Lead, exact retries return the same result, all research remains accessible and rejected companies stay known. See the [3A.4 handoff](ai-research-phase-3a4.md) for the 3A acceptance coverage and final verification results. |
| **3B.1 — deeper research (complete)** | Candidate-specific deeper/refresh prompts, selective existing-candidate updates, computed missing-information/next-action guidance, explicitly reviewed research dates, protected manual fields and additive source history. | Changes start unchecked, manual overrides require explicit confirmation, unselected data and historical citations stay intact, and updates are retry-safe. See the [3B.1 handoff](ai-research-phase-3b1.md) for final verification results. |
| **3B.2a — similar companies (complete)** | Reference-based discovery from Research or CRM, target countries, full known/rejected-domain exclusions and the existing reviewed JSON import. | Prompts require independent evidence; new findings enter Research through explicit import with duplicate checks. See the [3B.2a handoff](ai-research-phase-3b2a.md) for final verification and the manual ChatGPT bridge's limits. |
| **3B.2b — contacts (complete)** | Candidate-based Find contacts, per-field evidence/confidence, reviewed contact proposals and separate CRM creation after approval. Original evidence survives manual CRM edits. | Only selected evidence-backed proposals are staged; explicit creation rechecks owner, reference identity and duplicates. See the [3B.2b handoff](ai-research-phase-3b2b.md) for verification and the direct-company workflow boundary. |
| **3B.2c — Lead insight and enrichment (complete)** | AI Insight for existing Leads/Clients, latest and historical reports, manual ChatGPT enrichment and optional city/industry/description/services/Fit updates. | Existing CRM values require exact replacement acknowledgement; accepted reports retain immutable evidence/history and retries are idempotent. See the [3B.2c handoff](ai-research-phase-3b2c.md). |
| **3C.1 — authenticated read tools (complete)** | Eight named read operations, strict schemas/scopes, owner-JWT reads, company-only search, bounded output and metadata-only server logging. Existing admin-session HTTP adapter; no external credentials or MCP transport. | Read-only ownership, privacy, pagination and unchanged business data pass API/live/SQL checks. See the [3C.1 handoff](ai-research-phase-3c1.md). |
| **3C.2a — internal MCP transport (complete)** | Official SDK Streamable HTTP over the existing owner session, exact read schemas, stateless requests, bounded responses and safe errors. | Official MCP client discovers/calls the tools; scopes, concurrent owners, auth and read-only boundaries pass. See the [3C.2a handoff](ai-research-phase-3c2a.md). |
| **3C.2b — external authorization (complete)** | Explicit owner consent, public-client PKCE, opaque read grants, expiry/revocation, OAuth discovery and Connected apps UI. | PKCE, replay, scope, isolation and revocation passed API/browser/live/SQL checks. Production configuration followed in 3C.2c. See the [3C.2b handoff](ai-research-phase-3c2b.md). |
| **3C.2c — ChatGPT verification (in progress)** | Production deployed; native OAuth and actual local Work discovery/catalog call pass. Production fixtures verify owner isolation, scopes, port binding and revocation. | Finish fresh-conversation first-turn and client disconnect/reconnection acceptance. Separate web connection remains untested. See the [handoff](ai-research-phase-3c2c.md). |
| **3C.3 — reviewed write tools** | Adapt existing validated import/review/enrichment operations behind explicit write scopes, confirmation and durable audit. | No arbitrary SQL or second insertion system; direct writes are reported only when actually implemented and tested. |
| **3D — future** | Scheduled discovery, drafting, embedded agent and outreach approval workflows. | Separate future brief; not required for the first release. |

Each stage stops at its exit condition. No automatic outreach, mailbox/calendar integration or Git push is part of these stages. Production deployment was separately authorized and completed during 3C.2c.

## Migration and integration boundaries to preserve

- Add `crm_research_candidates` separately from `crm_companies`; do not populate Leads during import. Use owner-scoped indexes for domain, status, Fit, country, industry, created/researched timestamps. List reads must not load complete source/evidence payloads for every card.
- Candidate lifecycle, IDs, duplicate links, approval timestamps and audit fields are server-owned. Import proposals cannot set them. Use version checks for edits and a transaction for approval/history.
- Source and provenance records must share candidate ownership. Cross-owner links must be impossible; child tables need RLS or appropriate scoped relational constraints.
- Preserve rejected records. Repeated research updates the existing candidate through an explicit workflow, not a second import insertion path.
- Stage 3A.3 corrected SQL domain extraction for canonical stored URLs, including query strings without a path, fragments, ports, trailing dots and IPv6, and rebuilt the company-domain expression index. Preserve this regression coverage. Do not infer company identity by stripping legal suffixes or merging unrelated subdomains.
- Stage 3A.4 extended the central CRM catalog and Lead/won-service SQL constraints to accept `Lifestyle CGI` and `Product Animation`. All 14 research services now map to supported CRM values; preserve the historical capitalization of the original values.
- Stage 3A.4 added Lead source `AI Research` with the approval transaction. Research `source_origin` remains a separate property; approval always starts the Lead in `NEW_LEAD` with independently reviewed Priority.
- Existing activity types have constraints. New approval/update events need a compatible migration and meaningful event boundaries, not one event per field.
- Research should retain its own classification, sources and evidence after approval. Map existing company fields through the existing validation rules; retain fields with no Lead column in the linked research record. Do not flatten evidence into unstructured notes.
- Stage 3B.1 refresh applies only to open candidates and never changes a Lead. It retains `manual_fields`, requires explicit overrides, groups facts with their provenance, and appends new source URLs without rewriting or deleting historical source entries. The existing 50-source bound still applies; richer retrieval history requires a separate design.
- Stage 3B.2a similar-company discovery is read-only and accepts any owned reference state, including rejected candidates and archived companies. CRM references use current company fields rather than historical approved research. Every result needs independent evidence; the existing v1 import accepts `SIMILAR_COMPANY` origin but does not infer origin, enforce prompt countries or store a reference-company relationship.
- Stage 3B.2b stores contact proposals separately from candidate JSON v1. Name/email/phone/LinkedIn require VERIFIED field evidence; an inferred role remains research only. Candidate approval never creates contacts. Separate creation resolves the approved active company, rechecks duplicates/reference identity, preserves primary/manual contacts and stores an immutable original evidence snapshot. Rejected candidates retain read-only history. Direct-company research and editing saved proposals remain outside this delivery.
- Stage 3B.2c stores full accepted company research in append-only `crm_company_research`, with before/after values for the five explicitly selected CRM targets. Each material report advances company version once, including report-only acceptance; an identical report with no selected changes is a quiet no-op. Factual CRM copies require VERIFIED citations; all occupied targets need replacement acknowledgement. Fresh snapshots may revisit source URLs without modifying earlier reports or original approved Research. Identity, sales fields and other company relations remain outside enrichment.
- Stage 3C.1 exposes only the fixed read-tool registry. Do not adapt broad `crm-list`/`crm-detail` responses directly: their operational fields and contact-search behavior are outside tool scope. Narrow invoker reads use current owner membership and RLS; shared research domain helpers retain their evidence, normalization and exclusion rules. Future transports must verify identity and scopes before invoking the executor. Existing server log metadata is not a durable audit ledger. Domain pagination reads current data rather than a frozen snapshot.
- Missing information and next-action guidance are computed from the existing record, not stored claims about the company's capabilities. Research timestamps are supplied and explicitly selected; do not invent a timestamp merely because an update was saved.
- Use owner-JWT reads and verified owner domain operations, never browser service keys. Stages 3A.3–3A.4 retain authenticated read-only candidate access and use service-only invoker transactions behind canonical validation and signed review. Approval preserves existing company audit triggers by temporarily setting and restoring both verified owner claim locations inside the transaction. Future writes must preserve that boundary or introduce equally constrained, tested permissions. Private tables require explicit grants and RLS as described in the [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security). Test current owner, another owner, removed admin and anonymous access.
- This stage performs no website fetching. URL format validation is not SSRF protection; any later server-side research fetch must reuse the existing hardened metadata transport or an equivalent validated transport.

## 3A.1 delivered contract

Files:

- `public/admin/service-catalog.js`: one catalog with canonical research names and existing CRM storage values. In 3A.1, `crm-options.js` derived the original 12 CRM services, preserving their values and order, while Research accepted 14. Stage 3A.4 extended CRM support to all 14, including Lifestyle CGI and Product Animation.
- `public/admin/research-options.js`: research labels, confidence/provenance values, taxonomy suggestions, opportunity signals and three editable-in-code ICP definitions. ICPs describe research criteria; they do not assign objective scores.
- `src/research/schema.js`: the versioned JSON Schema used for structural validation and export. No separately maintained JSON schema file.
- `src/research/validation.js`: pure candidate and batch validation; shared CRM normalization; structured errors/warnings. No persistence, network calls, duplicate database lookups or approval side effects.
- `docs/examples/research-candidates.v1.json`: fictional format example, with `.example` URLs. It is not actual researched company data.
- `scripts/research-schema.js` and `scripts/validate-research.js`: schema export and local validation commands.
- `tests/research.test.js`: contract, evidence, malformed data, ownership-field injection, normalization, limits, mixed-row errors, catalog compatibility and CLI checks.

### JSON format

```json
{
  "schema_version": 1,
  "candidates": [
    {"company_name": "Example", "website": "https://example.com", "country": "CZ"}
  ]
}
```

Version 1 may be omitted for compatibility with the brief's minimal envelope; another version is rejected. Country uses the CRM's two-letter format (`CZ`, `SK`, `AT`), not full country names. Unknown optional text is `""`, unknown Fit/confidence/date is `null`, lists default to `[]` and omitted fact provenance becomes `UNKNOWN`.

Every assigned Fit needs `fit_reason`. Positioning with a value requires `VERIFIED` or `INFERRED`; inferred values need an explanation. Verified facts need `source_urls` pointing to entries in the candidate's `sources`. Signals require confidence and evidence; their omitted status defaults to `INFERRED`. Source retrieval times are never fabricated. Format validation checks supplied evidence structure, not whether a public claim is true; human review remains required.

Industry, business type, products and markets are extensible: unknown values are preserved with review warnings. Unknown services and signal codes are errors (`Other` / `OTHER` are explicit options). Repeated categories, signals, source URLs or recommendations are errors. Historical service capitalization is canonicalized. Missing websites/sources produce review warnings rather than invented values.

The envelope is limited to 100 candidates / 500,000 UTF-8 bytes. Candidate text and arrays have schema-defined bounds. Invalid rows have a row number and errors, with no partially sanitized candidate. Valid rows retain their data and warnings. Envelope errors reject the whole batch. This is a validation result for the future preview, not an import endpoint.

All objects reject unrecognized fields, including ownership and lifecycle metadata. Contact/social discovery fields remain outside company import v1. Stage 3B.2b adds a separate contact envelope and per-field evidence contract; do not add contacts to company JSON or silently discard them from incoming data.

`validateResearchCandidate()` returns `{candidate, warnings}`; the candidate additionally includes derived `normalized_company_name` and `normalized_domain`. These are storage-side fields, not fields accepted in ChatGPT output. Candidate-to-Lead mapping was subsequently added in 3A.4 as the reusable `researchLeadInput()` operation.

### Local commands

```sh
npm run research:validate -- docs/examples/research-candidates.v1.json
npm run --silent research:schema
```

The validator exits with code 1 for invalid input, prints warnings for review and never writes data. Schema export is standard JSON Schema draft 2020-12; the server also enforces the evidence/reference and Fit relationships described above. Keep those semantic rules in future prompt helpers and tool wrappers.

### Verification / next handoff

- `node --test tests/research.test.js tests/crm-sales-os.test.js`: **23 passed**.
- `npm.cmd test`: **128 passed, 1 existing opt-in live Storage test skipped**. This includes the existing CRM, auth, pipeline, follow-up, presentation and analytics unit/API regressions and 15 new research tests.
- `npm.cmd run build`: **passed**.
- `git diff --check`: **passed**.
- The example validator and schema export run without credentials as part of the new tests. No browser suite or live database checks were run for this domain-only stage.

This repository has no separate lint or typecheck script. No database migration, database table/field, RLS change, API route or UI component was added in 3A.1; there is therefore no migration or new UI flow to validate at this stage. No manual configuration is required. Changes are local, not pushed or deployed.

On this Windows machine PowerShell blocks `npm.ps1`; use `npm.cmd` for the commands above without changing the execution policy.

The 3A.1 verification above is historical. The **3A MVP, 3B.1–3B.2c, 3C.1 and 3C.2a–3C.2b are complete**; see the [3C.2b handoff](ai-research-phase-3c2b.md) for current scope and verification, and the [3B.2c handoff](ai-research-phase-3b2c.md) for enrichment behavior. Next: **3C.2c — actual ChatGPT connection and verification**, then separately bounded reviewed write tools. The full Phase 3 brief remains intentionally unfinished.
