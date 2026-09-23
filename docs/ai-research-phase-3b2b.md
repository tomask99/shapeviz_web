# AI Research 3B.2b — evidence-backed contacts

23 September 2026. Bounded delivery following [similar-company discovery](ai-research-phase-3b2a.md).

**Completed and verified:** public-contact prompts, evidence review, staged proposals and separately confirmed CRM contact creation from an approved Research candidate. Lead enrichment remains the next stage.

## Workflow

Open a Research candidate and choose **Find contacts**. Prepare the company-specific prompt and copy it into ChatGPT. The prompt requests public professional contacts and evidence for each supplied field. Shapeviz does not call an AI API, perform contact discovery itself or send outreach.

Paste the returned contact JSON, preview the evidence and choose which rows to save. Every selection starts unchecked. Invalid and duplicate rows cannot be selected. Saving creates only contact proposals attached to the candidate; it does not create a Lead or CRM contact.

After the candidate is approved as a Lead, return to its contact proposals and explicitly create a CRM contact from an individual reviewed proposal. Confirmation names the person and target company. Candidate approval itself never creates contacts. Unwanted proposals can be dismissed while retaining their history. Rejected candidates retain readable contact history; restore the candidate before new contact research or decisions. Archived companies cannot receive newly created research contacts.

The CRM contact keeps an **Original reviewed research** snapshot with source links, confidence and field evidence. Ordinary manual edits preserve that snapshot, clearly labeled as historical research that may differ from current contact fields. Deleting a CRM contact does not reopen its proposal or permit accidental recreation.

## Evidence contract

Contact JSON has a separate envelope: `{schema_version:1,candidate_id:"…",contacts:[…]}`. The existing company import schema v1 is unchanged. Maximum 20 contacts and 200,000 UTF-8 bytes; an empty array is a valid no-results response.

The [fictional format example](examples/research-contacts.v1.json) demonstrates the structure only. Its placeholder candidate ID, person and `.example` source are not real research and must not be imported as facts.

Contacts contain a required name and confidence, optional role/email/phone/LinkedIn, 1–10 public source entries and per-field provenance. Every supplied value needs confidence, a nonempty evidence explanation and source URLs present in that contact's source list. Names, email addresses, phone numbers and LinkedIn profiles must be labeled VERIFIED. A role may be INFERRED if its basis is explained, but an inferred role stays in Research and is not copied into the CRM position field. Unknown details remain blank; no address patterns or guessed names are generated.

Validation checks structure and evidence references, not the truth of an external claim. Human source review is still required. General mailboxes without an evidenced contact name, private contact lookup and bulk outreach are outside this delivery.

## Storage and access

`crm_research_contacts` stores immutable proposals and reference identity, proposal state, version and optional created-contact association. Owner and candidate relationships are enforced in the database. Authenticated owners can read their proposals; writes use narrowly scoped service transactions after server validation and confirmation. Each candidate retains at most 100 proposals including history.

`crm_contacts.research_evidence` preserves the original structured research snapshot. Browser contact saves cannot write or replace this field. Existing contacts, primary-contact selection and manual contact fields are not overwritten by research creation.

Reads carry the verified owner's JWT with RLS and current owner membership. The bounded contact context includes complete duplicate information or fails on overflow rather than presenting an incomplete review. Duplicate identity uses case-insensitive email or whitespace-normalized case-insensitive name within the batch, retained proposals and contacts of the approved company. Dismissed proposals do not prevent a corrected proposal.

Preview tokens bind the owner, candidate version, unchanged JSON and eligible rows. Saves are atomic, recheck the reference and duplicate state, and replay exact operation retries through the existing private operation ledger. Creation resolves the candidate's approved company on the server, checks the saved reference identity, active company and current duplicates, and serializes with existing CRM contact-save operations. No client-supplied target company is accepted. Existing authenticated direct table writes retain their manual-contact behavior; no global uniqueness restriction is added to legacy contacts.

After an ambiguous server/network failure, the browser keeps the exact request, selections and operation UUID in memory and locks editing until **Retry last request** resolves it. Reopening the dialog preserves this attempt in the same page session. Definite validation/conflict responses retain the JSON but require a fresh preview with unchecked choices. Reloading the page loses this temporary attempt; inspect saved proposals before continuing. Import preview tokens expire after one hour.

The service transaction preserves existing audit triggers by temporarily setting and restoring both verified owner claim locations. Contact creation produces the existing contact-added activity. Source URLs are displayed as safe HTTP(S) links; this stage does not fetch them on the server.

## API and compatibility

The existing `/api/admin` dispatcher exposes `crm-research-contacts`, `crm-research-contacts-prompt`, `crm-research-contacts-preview`, `crm-research-contacts-commit` and `crm-research-contact-decide`. There is no new page route, package, model credential or environment variable. See the [implementation contract](ai-research-phase-3b2b-contract.md) for request shapes and limits.

This stage starts contact research from a Research candidate. Existing CRM companies without a linked candidate retain manual contact entry. Direct-company contact research, contact proposal editing after storage, bulk creation, richer Lead enrichment and scheduled discovery are not implemented here.

## Verification

Applied migration: `supabase/migrations/20260923095427_crm_research_contacts.sql`. Local and remote migration version lists both contain **43 entries**, with identical MD5 `fcfe672644fb938e4fd84f9dd52ae9df` over the sorted, newline-joined version strings. This checks version alignment, not SQL-file content equality.

| Check | Result |
| --- | --- |
| Full unit/API regression, `npm.cmd test` | **220 passed, 1 existing opt-in Storage test skipped**; includes 17 new contact domain/API tests and 3 HTTP gateway tests. |
| Focused contact, Research and CRM browser checks | **16 passed**, including 9 new contact interaction tests. |
| Full browser regression, `npm.cmd run test:browser` | **143 passed, 7 opt-in live tests skipped**; 150 total. |
| Isolated real Auth/API/Supabase contact flow | **1 passed**; uses two temporary owners and cleans up in `finally`. |
| New SQL contact fixture | **Passed** in a rollback transaction. |
| Existing SQL regressions | **5 passed**: manual contacts/notes, Research inbox, import, review/approval and refresh; all rolled back. |
| Build and source assets | `npm.cmd run build` **passed**; the four changed admin source assets match generated files. |
| Whitespace and format example | `git diff --check` **passed**; fictional example validates and explicitly warns that its inferred role will not be copied. |
| Fixture cleanup | Independent SQL confirmed **0** temporary Research test users, candidates, contact proposals, research-created CRM contacts, Research events, import batches and review operations. |
| Independent implementation review | No blocking issues found in the API/UI/migration integration, ownership, evidence, duplicate checks and retry behavior. |

The live test covers read-only prompt generation, unchecked selections, evidence-preserving proposal saves, import replay, duplicate preview, cross-owner isolation, approval without automatic contacts, explicit contact creation and replay, concurrent creation returning 200/409, inferred-role omission, preservation of primary-contact choices, manual contact edits retaining original evidence, deletion retaining CREATED history and post-logout 401. Desktop and 390px mobile captures are stored locally in `.cache/research-contacts-live-desktop.png` and `.cache/research-contacts-live-mobile.png`.

The SQL fixture additionally checks direct-role denial, composite ownership constraints, immutable evidence, rejected/archived/version/identity conflicts, atomic batch failure, source validation, exact audit counts, owner claim restoration, removed-member denial, the 100-proposal history bound and fail-closed overflow at 1,001 existing company contacts. Local Docker/Supabase is unavailable, so fixtures run in rollback transactions on the connected project.

Security advisors show no new findings: the existing three RLS-without-policy INFO notices and leaked-password-protection warning remain unchanged. Performance advisors retain the existing unrelated `presentation_sessions_share_link_id_fkey` index recommendation and report 17 unused indexes, down from 18 before verification. No unrelated settings or indexes were changed.

To run the isolated test on Windows, set `$env:LIVE_RESEARCH_TEST='true'`, run `npm.cmd run test:browser -- tests/browser/research-contacts-live.spec.js --workers=1`, then remove the variable. The default suite skips live tests. No real contact discovery or outreach is performed by these fictional fixtures.

## Next delivery

**3B.2c — Lead AI Insight and selected enrichment.** Existing manual CRM values must remain protected and accepted changes retain evidence. Direct ChatGPT/MCP tools and scheduled agents remain later stages.

Application changes are local; no Git push or deployment is included.
