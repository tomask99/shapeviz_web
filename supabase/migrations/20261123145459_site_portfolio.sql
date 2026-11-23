-- One public snapshot with a separate version keeps portfolio edits atomic and
-- independent of the other site editors. The server supplies the initial content.
alter table public.site_content
  add column portfolio jsonb check (
    portfolio is null or (
      jsonb_typeof(portfolio) = 'object'
      and portfolio ? 'blocks'
      and jsonb_typeof(portfolio -> 'blocks') = 'array'
      and jsonb_array_length(portfolio -> 'blocks') <= 60
    )
  ),
  add column portfolio_version integer not null default 1 check (portfolio_version > 0);

-- The existing owner-only API signs scoped uploads. Public reads use object URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-portfolio', 'site-portfolio', true, 4194304, array['image/webp']);
