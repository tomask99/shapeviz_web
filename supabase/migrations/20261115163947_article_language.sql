alter table public.articles
  add column language text not null default 'en' check (language in ('en','sk'));
