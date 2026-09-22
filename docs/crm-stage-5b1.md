# CRM stage 5b1 — company selection in Presentation Studio

Implemented locally on 22 September 2026. No new migration, push or deployment.

## Scope

- Optional existing-company search in template instance creation, finished HTML upload and client-presentation settings. Search uses the existing private CRM list, active companies only, first 25 results with a refine-search notice. Company IDs are explicit; names never create CRM records automatically or rewrite uploaded HTML.
- Reusable template upload/edit stays separate and has no company association picker.
- An existing association is shown with a link to the company's Presentations tab. Reassignment remains an explicit unassign/assign workflow there, preserving awareness of sent metadata. Studio prevents converting a linked deck to a template.
- Deck save precedes association. Once save succeeds, form inputs are locked and retry only repeats association, never upload/finalize/variant/update. The partial-success message includes the saved URL and a company-detail recovery path. Escape cannot dismiss an in-flight save.
- New GET `crm-presentation-company` reads only the current owner's link with user JWT/RLS. New POST `crm-presentation-ensure` uses the existing insert permissions; a unique conflict succeeds only if the exact same company/deck/owner link is visible. No reassignment, ownership spoofing or other-owner company disclosure. Existing assign behavior remains unchanged.
- All CRM writes retain session, owner-role and same-origin checks. CRM association is not embedded in public deck content. No automatic emails, sent dates, pipeline changes or analytics resets.

## Verification

- `npm.cmd test`: 75 passed, 1 live Storage test skipped.
- Playwright: 67 passed, 1 live upload skipped. New mocked-API flows cover variant/edit/upload association retry, existing links, template exclusion, reopen/reset and mobile width. Existing upload/finalization and template-library regressions pass.
- `npm.cmd run build` passed; `presentations:validate` passed with 0 local decks (production decks are remote).
- Existing `supabase/tests/crm_presentation_links.sql` passed against the connected DB in a transaction with all fixture writes rolled back: ownership, invalid links, sent history and server-side deletion cleanup.
- Desktop/mobile screenshots inspected in `.cache/studio-company-*.png`. Browser skill fallback: agent-browser unavailable, used installed Playwright. Supabase skill review kept all private reads/writes in user JWT context; no grant/RLS/schema changes were needed.
- Browser API responses are mocked; this is not a deployed, authenticated browser-to-production integration test.

## Limits and next increment

Retry state lasts while the dialog remains open. After closing/reloading, assign the saved deck from company detail. This increment does not add durable idempotency to variant creation if the *initial deck-save response itself* is lost; check the library before recreating in that case. Safe association retry applies once deck-save success is received (including a lost association response).

Next: manual reply recording and engagement summary; automatic VIEWED remains deferred until admin visits can be reliably excluded. Stages 4, 5a and 5b1 application changes are still local/unpushed.
