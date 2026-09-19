-- Turn the initial analytics settings table into the operational presentation
-- registry. The HTML source stays private; intentionally public media is served
-- from a separate CDN-backed bucket.

alter table public.presentation_settings rename to presentation_projects;

alter table public.presentation_projects
  add column source_type text not null default 'standalone'
    check (source_type in ('standalone', 'template')),
  add column template_key text,
  add column slide_count integer check (slide_count between 1 and 1000),
  add column client text,
  add column title text,
  add column presentation_date text,
  add column description text,
  add column locale text not null default 'en',
  add column status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  add column source_bucket text,
  add column source_path text,
  add column media_bucket text,
  add column media_prefix text,
  add column cover_path text,
  add column content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  add column published_at timestamptz;

alter table public.presentation_projects
  add constraint presentation_source_configuration check (
    (source_type = 'standalone' and source_bucket is not null and source_path is not null)
    or (source_type = 'template' and template_key is not null)
  ) not valid;

comment on table public.presentation_projects is
  'Server-only registry for standalone decks and data-driven template instances.';
comment on column public.presentation_projects.content is
  'Allowlisted template variables; never raw passwords, share keys, or recipient PII.';

create index presentation_projects_status_idx
  on public.presentation_projects (status, updated_at desc);

update public.presentation_projects set
  source_type = 'standalone',
  client = 'Milenium',
  title = 'Social Media & Visual Direction',
  presentation_date = 'September 2026',
  description = 'Visual direction proposal for Milenium.',
  locale = 'sk',
  status = 'draft',
  source_bucket = 'presentation-source',
  source_path = 'milenium/index.html',
  media_bucket = 'presentation-media',
  media_prefix = 'milenium/',
  cover_path = 'milenium/assets/generated/image-29e6f188b6566c00.png',
  content = '{}'::jsonb,
  published_at = null
where deck_slug = 'milenium';

alter table public.presentation_projects
  alter column client set not null,
  alter column title set not null,
  alter column presentation_date set not null,
  alter column description set not null,
  validate constraint presentation_source_configuration;

alter policy "owners can manage presentation settings"
  on public.presentation_projects rename to "owners can manage presentation projects";

create or replace function public.set_presentation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_presentation_projects_updated_at
before update on public.presentation_projects
for each row execute function public.set_presentation_updated_at();

create or replace function public.record_presentation_event(
  p_session_id uuid,
  p_event_id uuid,
  p_deck_slug text,
  p_event_type text,
  p_slide_index integer default null,
  p_video_id text default null,
  p_video_progress double precision default null,
  p_active_seconds integer default 0,
  p_user_agent_category text default 'unknown'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_event_id uuid;
begin
  if p_event_type not in (
    'session_started', 'slide_viewed', 'slide_reached_max',
    'video_started', 'video_completed', 'session_heartbeat', 'session_ended'
  ) then
    raise exception 'Unsupported presentation event';
  end if;

  if not exists (
    select 1 from public.presentation_projects
    where deck_slug = p_deck_slug
      and status = 'published'
      and analytics_enabled
  ) then
    return;
  end if;

  insert into public.presentation_sessions (
    id, deck_slug, user_agent_category, max_slide
  ) values (
    p_session_id,
    p_deck_slug,
    coalesce(p_user_agent_category, 'unknown'),
    greatest(coalesce(p_slide_index, 1), 1)
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.presentation_sessions
    where id = p_session_id and deck_slug = p_deck_slug
  ) then
    raise exception 'Session belongs to another deck';
  end if;

  insert into public.presentation_events (
    event_id, session_id, deck_slug, event_type, slide_index, video_id, video_progress
  ) values (
    p_event_id, p_session_id, p_deck_slug, p_event_type, p_slide_index, p_video_id, p_video_progress
  )
  on conflict (event_id) do nothing
  returning event_id into inserted_event_id;

  if inserted_event_id is null then
    return;
  end if;

  update public.presentation_sessions set
    last_seen_at = now(),
    active_seconds = active_seconds + greatest(coalesce(p_active_seconds, 0), 0),
    max_slide = greatest(max_slide, coalesce(p_slide_index, 1)),
    ended_at = case when p_event_type = 'session_ended' then now() else ended_at end
  where id = p_session_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'presentation-source',
    'presentation-source',
    false,
    5242880,
    array['text/html', 'application/json']
  ),
  (
    'presentation-media',
    'presentation-media',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'video/mp4', 'video/webm', 'font/woff2']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The public bucket permits reads only. Upload, update, and delete remain
-- restricted to server-side secret-key requests.
create policy "public presentation media can be read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'presentation-media');
