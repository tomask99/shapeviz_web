alter table public.articles add column translation_group text check (translation_group ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(translation_group) <= 120);
create unique index articles_translation_language_idx on public.articles (translation_group, language) where translation_group is not null;
