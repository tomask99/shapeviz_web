# Migration reconciliation — 2026-09-22

Scope: prepare the existing presentation database for incremental CRM migrations.
No application schema, presentation, analytics or Storage data was modified.

## Changes

Three local filenames now use their already-applied production versions. Their SQL
matched production after comment/whitespace normalization; no SQL was replayed:

| Migration | Previous local version | Production/aligned version |
| --- | --- | --- |
| presentation_audio_formats | 20260921085314 | 20260921085329 |
| telegram_visit_notifications | 20260921112336 | 20260921112515 |
| telegram_website_click_notifications | 20260922132801 | 20260922133053 |

`20260921082743_remove_all_presentation_data.sql` was moved outside the executable
migration directory to `supabase/retired-migrations/*.sql.disabled`. This historical
one-off DELETE must never be replayed. The archive is documentation, not a migration.

`20260921144920_presentation_cta_clicks` already existed in the live schema, but was
missing from migration history. Both RPC bodies were compared with the local SQL,
along with the event-type constraint, signatures, invoker security, empty search_path
and service-only execution grants. One row was inserted into
`supabase_migrations.schema_migrations`, containing the original SQL as stored text,
NOT executing it. The INSERT also required matching RPC bodies and privileges and
used ON CONFLICT DO NOTHING; it returned the expected version/name.

The connected Supabase SQL tool was used for this metadata-only repair because the
local CLI has no Supabase access token. No credentials were added or changed.

## Known historical content differences

The first two migration versions match production history, but the local SQL omits
historical Milenium seed data. Full normalized comparisons confirmed these are the
only differences:

- `20260919152926`: omitted insertion of the default Milenium presentation settings.
- `20260919152927`: omitted the update assigning Milenium metadata, source/media
  paths and draft status.

These omissions preserve the current no-built-in-presentation behavior. Do not
restore the seed or overwrite real presentations to make historical text identical.
Production's original stored statements were not rewritten.

## Verification and remaining limits

- Read back production history: all 10 active local migration versions/names match;
  no pending local versions and no remote-only versions at reconciliation time.
- Confirmed audio MIME types and both Telegram claim columns already exist.
- Regression tests protect the reconciled filenames and retired DELETE statement.
- This is a version/history comparison, not a fresh database replay or schema diff.
  A CLI dry-run was not available because CLI authentication is missing.
- Before deploying a NEW migration, recheck remote history and review its SQL.
  With an authenticated CLI, use `supabase migration list --project-ref <project>`
  and a linked-project `supabase db push --dry-run --skip-vault` before applying.
  Never use reset, include-all or replay the retired cleanup to fix history.

No CRM schema or UI was added in this stage. Next: the Leads/company increment in
`docs/crm-implementation-plan.md`.
