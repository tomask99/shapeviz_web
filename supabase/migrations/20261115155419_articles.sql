create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  title text not null check (length(title) between 1 and 180),
  excerpt text not null default '' check (length(excerpt) <= 500),
  seo_title text not null default '' check (length(seo_title) <= 100),
  seo_description text not null default '' check (length(seo_description) <= 320),
  cover jsonb,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 500000),
  check (status <> 'published' or published_at is not null)
);
create index articles_published_date_idx on public.articles (published_at desc, id) where status = 'published';
alter table public.articles enable row level security;
revoke all on public.articles from anon, authenticated;
grant select, insert, update, delete on public.articles to service_role;
comment on table public.articles is 'Owner-managed editorial content. Public access is through the server, which filters published records.';
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('article-images','article-images',true,4194304,array['image/webp'])
on conflict (id) do nothing;
