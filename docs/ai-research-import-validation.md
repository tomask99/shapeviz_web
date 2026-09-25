# Research import validation before file delivery

23 September 2026. Follow-up to [desktop MCP connection](ai-research-phase-3c2c.md).

Repository completion and fresh verification: [25 September checkpoint](completion-checkpoint-2026-09-25.md). The deployment details below describe the original 23 September release.

## Problem and behavior

A ChatGPT-generated ten-candidate file passed JSON parsing but failed the web import contract for rows 1, 7 and 8. Their website provenance cited a homepage absent from that candidate's `sources` array. The listed sources instead contained specific supporting pages. A valid JSON syntax alone does not ensure a valid Research import.

`validate_research_import` exposes the exact shared `validateResearchImport` implementation to MCP and the authenticated tool endpoint. It takes `{ "json": "<complete final file text>" }`, returns overall and per-row validity, actionable error paths/codes/messages, warnings, byte count and SHA-256 of the exact input. Malformed JSON and import-envelope errors are returned as validation results. It does not repair, persist or import data.

MCP initialization instructions, the research catalog's `import_workflow`, and tool descriptions tell the client to validate the complete final file, fix errors and repeat until `valid=true`. Any subsequent edit requires another validation. Evidence references must match real supporting sources in the same candidate. Fabricated sources, dates or evidence are forbidden; unavailable validation must be disclosed rather than calling the file import-ready.

These instructions guide the model; they are not an enforced export gate. Factual accuracy, duplicate checks and authorization to import remain separate. Warnings require review. The existing web validator still rejects invalid rows independently.

## Boundaries

- Nine tools in total: eight existing read operations plus the validator. Uses existing `catalog:read`; no new grant, write scope, database migration or secret.
- Owner authentication and current membership checks remain required. Validation itself performs no business-data reads or writes.
- Uses the existing import limits: 500,000 UTF-8 bytes and at most 100 candidates. JSON text may contain newlines/tabs; ordinary filter restrictions remain unchanged.
- Only the validation tool receives a larger request envelope allowance (3,100,000 bytes for escaped JSON). Other tool calls remain bounded to 16,384 bytes.
- Diagnostics are limited to 200 issues and 80,000 serialized UTF-8 bytes, with bounded paths/messages and explicit `issues_truncated`. Per-row counts remain available. The response does not echo the candidate payload or log it.
- The input hash identifies exact validated text; it is not a signed certificate or a guarantee of factual correctness.

## Verification

- Full unit/API suite: 302 passed, one opt-in Storage test skipped (303 total).
- Regression tests reproduce missing references in rows 1/7/8, compare against the web validator, validate the corrected ten candidates and check exact-text hashes.
- Tests cover malformed input, byte limits, escaped/control-heavy diagnostics, pretty-printed files above the old 16 KB limit, owner/scopes, ordinary-tool limits and absence of business-data calls.
- Production build passed. Deployment `dpl_CzsjjY6NSnWLBnjeKstT3a1c2DUA` is READY at `https://shapevizweb.vercel.app` (deployment URL `https://shapeviz-ik09jqx39-tomask99-s-projects.vercel.app`).
- All five public MCP/OAuth readiness checks passed on the canonical production alias.
- Production native OAuth/MCP browser fixture passed (1.3 minutes): nine tools, invalid rows 1/7/8, corrected ten-candidate import above 30 KB, scope and owner isolation, replay, disconnect and source logout. Independent cleanup query confirmed zero fixture users, companies, grants or decisions.
- The user's original local file returned seven valid candidates and exactly the three reported errors. The previously corrected copy returned ten valid candidates. User files remain outside the repository; committed tests use synthetic data.

New client sessions must load the updated nine-tool catalog and initialization instructions. Production protocol tests are separate from a real user conversation following the new validation workflow.
