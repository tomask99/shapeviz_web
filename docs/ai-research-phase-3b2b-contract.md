# 3B.2b implementation contract

Implemented contract for the bounded candidate contact-research delivery. Final results are recorded in the [stage handoff](ai-research-phase-3b2b.md).

## Scope

Candidate-based Find contacts, including approved candidates. Rejected candidates retain read-only proposal history; restore before new research or decisions. No direct-company research entry point in this stage. Approved candidates resolve their existing company; no automatic contacts on Lead approval. CRM contacts expose an original research evidence snapshot without implying subsequent manual edits are verified.

## Contact proposal envelope

Separate from unchanged company import v1: `{schema_version:1,candidate_id:<uuid>,contacts:[...]}`. Maximum 20 rows / 200000 UTF-8 bytes; an empty array represents no public contacts found. Unknown fields fail. Each contact has `full_name` (required), `job_title`, `email`, `phone`, `linkedin` (empty if unknown), `confidence` (LOW/MEDIUM/HIGH required), `sources` (1–10 canonical Research source objects), and `field_provenance` for these five fields using existing `{status,confidence,evidence,source_urls}` structure. Unknown strings are empty; empty fields use UNKNOWN. Every populated field needs confidence, nonempty evidence and cited sources. Name, email, phone and LinkedIn must be VERIFIED; job_title may be INFERRED. Inferred job_title stays in research and maps to an empty CRM job_title. No guessing names/addresses, private lookup or outreach. No Instagram/notes/primary-contact or lifecycle fields in this contract.

## API

All reads use owner JWT, current membership and RLS. All writes use strict inputs, canonical validation, explicit confirmation and service-only invoker transactions, with existing operation-ledger retries.

- GET `crm-research-contacts` with `id`: `{candidate:{id,company_name,website,country,version,research_status,approved_company_id},company,items,can_research,can_create}`. `company` is null or `{id,company_name,archived_at}` for the actual linked CRM company. `items` are stored proposal rows with `proposal`, `reference_identity`, `status`, `version`, `created_contact_id`, `created_company_id`, timestamps, plus `duplicates:[{id,full_name,email}]` for current CRM matches and `stale_reference:boolean`. Bound at 100 per candidate; never silently truncate. `can_create` requires an approved candidate and active existing company.
- GET `crm-research-contacts-prompt` with `id`: `{prompt,candidate:{id,company_name,version}}`. Uses current bounded business identity only, no existing private contacts or notes. Reject rejected candidate. Requests the envelope above, public professional business contacts and independent field evidence.
- POST `crm-research-contacts-preview`: `{id,json}`. Returns `{candidate,rows:[{row,contact,errors,warnings,duplicates:[{kind,id,full_name,email}]}],valid_count,count,reviewToken}`. Duplicates compare case-insensitive email OR whitespace-normalized case-insensitive name within batch, nondismissed saved proposals and existing contacts of the approved company. Invalid rows have null contact. Empty array is valid and produces no selectable rows. Preview is read-only.
- POST `crm-research-contacts-commit`: `{id,json,reviewToken,selected:[rowNumbers],operationId,confirm:'save_contacts'}`. Only explicitly selected valid, nonduplicate rows are accepted. HMAC token binds owner, candidate ID/version and canonical input hash (one-hour expiry). Returns `{saved,skipped,ids}`. Atomic transaction rechecks reference version/state and duplicates before appending immutable proposals; stale/duplicate changes yield 409 and no partial save. Exact operation replay returns the original result.
- POST `crm-research-contact-decide`: `{id:<proposalId>,version,operationId,decision:'create'|'dismiss',confirm:'create_contact'|'dismiss_contact'}`. Returns `{id,status,version,contact_id,company_id}`. No client company ID or editable proposal. Explicit create uses an approved candidate's current active company, checks reference identity and duplicates again under company lock, copies verified fields and an immutable original research snapshot, and never changes primary contact or manual existing contacts. Dismiss is allowed only for PROPOSED rows; history remains. Exact retries replay before checking changed state.

## Storage

New `crm_research_contacts`: id, owner_id, candidate_id, proposal JSONB, reference_identity JSONB (`company_name`,`website`,`country` copied from current candidate), status PROPOSED/CREATED/DISMISSED, version, created_company_id, created_contact_id, created_at, updated_at. Owner+candidate composite FK. Created contact ownership/company consistency via composite FK where feasible; deleting a created contact clears only its ID and never reopens the proposal. Authenticated owners can read, not write these rows. Index candidate+owner and FK columns. Maximum 100 stored proposals per candidate (including history).

Add `crm_contacts.research_evidence` JSONB nullable, writable only by service transaction. Snapshot contains `{proposal_id,candidate_id,reference_identity,proposal}`. Existing contact save RPC leaves it unchanged. UI labels it as original reviewed research, with sources/field statuses and a note that later manual edits may differ.

RPCs (service role only, explicit current owner membership; owner advisory lock uses existing seed 731903):

- `crm_research_contacts_import(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_contacts jsonb)` where p_contacts is canonical selected contacts array. Return `{saved,skipped:0,ids}`; API computes skipped count for unselected rows while preserving retry identity. Rows remain proposals; no candidate/Lead change.
- `crm_research_contact_decide(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_decision text)`.

Read context uses the authenticated security-invoker `crm_research_contact_context(p_id uuid)` RPC. It returns one JSON value with candidate, company, proposals and projected existing CRM contacts. More than 100 proposals or 1,000 company contacts returns an overflow flag; the API fails closed. This avoids PostgREST row limits silently truncating duplicate checks.

Use `crm_private.research_review_operations` for transaction replay. Restore both owner claim locations after service-created contact writes so existing contact stamps/activity triggers run as the verified owner. Use the same company row lock as `crm_save_contact` for duplicate rechecks. No migration to the canonical company JSON schema or candidate approval transaction.

## UI

Research detail button Find contacts opens one shared controller dialog. Load saved proposals; prepare/copy prompt; paste JSON; preview errors, sources, field evidence and duplicate reasons; every selection initially unchecked. Save selected proposals only. Persist JSON/selections/retry operation on failed writes, invalidate preview after JSON edit, close and ignore late results on navigation. Saved proposals show full evidence and status, plus explicit create or dismiss confirmation. Candidate approval prerequisite is visible. CRM contact cards display the immutable research snapshot via reusable safe evidence renderer. Desktop/mobile, safe links, keyboard and stale-response handling must match existing dialogs.
