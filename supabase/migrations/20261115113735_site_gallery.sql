alter table public.site_content
  add column gallery jsonb check (gallery is null or (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 100)),
  add column gallery_version integer not null default 1 check (gallery_version > 0);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-gallery', 'site-gallery', true, 4194304, array['image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
