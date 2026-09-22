# CRM stage 5b2 — manually recorded client replies

Completed 22 September 2026. Application changes are local/unpushed. Additive migrations `20260922181101_crm_reply_activity` and `20260922181325_crm_reply_policy_consolidation` are applied to the connected Supabase project.

## Delivered

- Record reply from company Overview or Activity: required received date/time and summary, optional company contact. Contact loading is paginated and retryable; archived companies are read-only for replies.
- Received time is entered in the browser's local zone and stored as canonical UTC. Future/nonexistent local times and invalid input are rejected. Autumn repeated local times use the first occurrence, explained in the dialog.
- A `reply_received` event in existing `crm_activities`, not a duplicate replies table. Contact ID/name are historical metadata; deleting a contact preserves the reply. Received time is separate from the timestamp when the event was recorded. Activity retains recorded-time ordering; Overview's latest reply uses received-time ordering.
- No email sending/synchronization, automatic pipeline changes, follow-up completion or presentation analytics mutation. WON/LOST/advanced statuses remain unchanged. Pipeline can still be edited separately.
- Each form submission has a stable UUID. After an uncertain save, the payload is locked and Retry sends the same ID/content. API returns an already saved event only when owner, company, type and content/date/contact match. Conflicting retries cannot overwrite history. After closing/reloading, check Activity before creating another record.
- Replies are immutable in the UI/API, like other historical activities. Corrections can be noted with the existing manual activity action; no silent audit rewrite.

## Security and implementation

`src/crm/replies.js` exposes POST `crm-reply-add` and GET `crm-reply-summary` under the existing authenticated `/api/admin` boundary. Every CRM read/write carries the verified user JWT and owner filter. Read summary fetches one event using a partial index. No secrets or service-role writes are used for replies.

Supabase/Postgres skills guided reuse of RLS, a private SECURITY INVOKER validation trigger, explicit column grants, a bounded indexed lookup and rollback tests. The trigger validates direct Data API writes too and derives the historical contact name, ignoring spoofed metadata. No UPDATE/DELETE grant is added. Client-set ID permission does not grant access to system event types. The second migration consolidates the existing manual/reply INSERT policies without changing their authorization semantics, resolving the new multiple-permissive-policy advisory.

## Verification

- Node suite: **78 passed, 1 live Storage test skipped**.
- Playwright suite: **70 passed, 1 live upload skipped**. New tests cover lost-response retry with one history event, reload, summary, escaped text/contact names, contact-load retry, future-date validation, archive restrictions, mobile layout and no pipeline write.
- Build passed; local presentation validation passed (0 local decks, production decks are remote).
- SQL tests `supabase/tests/crm_replies.sql` passed in rollback-only transactions both while validating DDL and after deployment. Tests cover ownership, immutable history, duplicate IDs, future/empty input, contact ownership, contact deletion, archived writes, anon reads and rejection of forged system events. Existing manual activity remains permitted as before.
- Browser skills used the installed Playwright fallback because agent-browser is unavailable. Desktop/mobile screenshots inspected in `.cache/crm-reply-*.png`; no new browser dependencies.
- Browser API responses are mocked; SQL tests exercise the real database separately, not an authenticated production-browser integration test. Test fixtures were rolled back; no client records or Storage objects changed.

Existing unrelated advisor notices remain: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [service-only website sessions without RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [presentation session FK index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), including the newly created reply index before real traffic. No new security advisor finding.

## Next

5b3: company engagement summary reusing existing analytics. Automatic VIEWED remains deferred until real visits can be separated reliably from admin/test visits. Then stage 6 business Overview. No GitHub push or Vercel deployment in this increment.
