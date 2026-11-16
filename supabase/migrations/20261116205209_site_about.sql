-- Separate revisions keep profile edits independent of gallery and company changes.
alter table public.site_content
  add column about jsonb check (about is null or jsonb_typeof(about) = 'object'),
  add column about_version integer not null default 1 check (about_version > 0);

comment on column public.site_content.about is 'Slovak and English profile text, managed through the owner-only site editing API. Null uses the built-in copy.';
