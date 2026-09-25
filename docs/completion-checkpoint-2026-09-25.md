# CRM and Research completion checkpoint

25 September 2026. Repository completion of the previously deployed working-tree changes, following the Research filters and Presentation overview commit `2ec6dd2`.

## Included behavior

- **Prepare presentation:** choose an active template from a pipeline card or company, create a published company copy, link it to the lead and move it to Presentation ready. Repeating an interrupted operation reuses its presentation. No outreach is sent. The retired Qualified stage is removed from the UI and database contract.
- **Dialog dismissal:** static and dynamic dialogs support their existing close control or an added sticky cross, backdrop clicks and Escape. Existing save cancellation guards and close cleanup remain effective.
- **Research import validation:** a ninth, read-only MCP tool checks the exact final JSON with the web importer validator. It reports bounded errors and warnings without storing research. It checks format and evidence references; factual accuracy and duplicate checking remain separate.

## Verification of this checkpoint

- Unit/API suite: **305 passed**, one opt-in Storage test skipped.
- Full browser suite: **170 passed**, 11 opt-in tests skipped.
- Two of those opt-in flows were then run explicitly against the local application with real Supabase Auth, Storage and CRM: **both passed**. They cover preparation, retry, admin tracking exclusion, visitor stage movement, nine-tool OAuth/MCP discovery, final JSON validation, owner/scope isolation and revocation. External notifications were disabled. Temporary fixture cleanup completed; a follow-up query found no remaining recent fixture users or preparation templates.
- Database migration `20260923172622_crm_prepare_presentation` is already recorded in production. No migration was reapplied.
- Rollback-only database tests for preparation, pipeline persistence and suggestions: **all three passed**. The two older tests were updated to reflect retirement of Qualified.
- The preparation RPC is security invoker, denies anonymous execution and performs owner checks. Security advisors retain the previously documented deny-by-default RLS notices and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this checkpoint makes no security configuration changes.
- Production build and whitespace checks passed. Mobile preparation and Research approval screenshots were inspected.

These results verify the repository application and existing database compatibility. The deployment IDs in the feature documents are historical records from 23 September, not evidence of a new deployment for this checkpoint.

Feature details: [presentation preparation](crm-prepare-presentation.md), [dialog dismissal](dialog-dismissal.md), [import validation](ai-research-import-validation.md).
