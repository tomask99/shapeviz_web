-- Shapeviz Presentation System
-- Public clients cannot read or write these tables directly. Presentation events
-- are accepted only by the server-side API, which uses SUPABASE_SECRET_KEY.

create table public.presentation_settings (
  deck_slug text primary key check (deck_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  access_mode text not null default 'unlisted' check (access_mode in ('unlisted', 'password', 'link')),
  password_hash text,
  grant_version integer not null default 1 check (grant_version > 0),
  analytics_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((access_mode = 'password' and password_hash is not null) or access_mode <> 'password')
);

create table public.presentation_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now()
);

create table public.presentation_share_links (
  id uuid primary key default gen_random_uuid(),
  deck_slug text not null references public.presentation_settings(deck_slug) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  token_digest bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create table public.presentation_sessions (
  id uuid primary key,
  deck_slug text not null references public.presentation_settings(deck_slug) on delete cascade,
  share_link_id uuid references public.presentation_share_links(id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  max_slide integer not null default 1 check (max_slide >= 1),
  user_agent_category text check (user_agent_category in ('desktop', 'mobile', 'tablet', 'unknown'))
);

create table public.presentation_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  session_id uuid not null references public.presentation_sessions(id) on delete cascade,
  deck_slug text not null references public.presentation_settings(deck_slug) on delete cascade,
  event_type text not null check (event_type in (
    'session_started', 'slide_viewed', 'slide_reached_max',
    'video_started', 'video_completed', 'session_heartbeat', 'session_ended'
  )),
  slide_index integer check (slide_index is null or slide_index between 1 and 1000),
  video_id text check (video_id is null or char_length(video_id) between 1 and 120),
  video_progress double precision check (video_progress is null or video_progress between 0 and 1),
  occurred_at timestamptz not null default now()
);

create index presentation_sessions_deck_started_idx
  on public.presentation_sessions (deck_slug, started_at desc);
create index presentation_events_session_time_idx
  on public.presentation_events (session_id, occurred_at);
create index presentation_events_deck_type_time_idx
  on public.presentation_events (deck_slug, event_type, occurred_at desc);
create index presentation_share_links_deck_idx
  on public.presentation_share_links (deck_slug, created_at desc);

alter table public.presentation_settings enable row level security;
alter table public.presentation_admins enable row level security;
alter table public.presentation_share_links enable row level security;
alter table public.presentation_sessions enable row level security;
alter table public.presentation_events enable row level security;

revoke all on table public.presentation_settings from anon, authenticated;
revoke all on table public.presentation_admins from anon, authenticated;
revoke all on table public.presentation_share_links from anon, authenticated;
revoke all on table public.presentation_sessions from anon, authenticated;
revoke all on table public.presentation_events from anon, authenticated;

grant all on table public.presentation_settings to service_role;
grant all on table public.presentation_admins to service_role;
grant all on table public.presentation_share_links to service_role;
grant all on table public.presentation_sessions to service_role;
grant all on table public.presentation_events to service_role;
grant usage, select on sequence public.presentation_events_id_seq to service_role;

grant select on table public.presentation_admins to authenticated;
grant select, insert, update, delete on table public.presentation_settings to authenticated;
grant select, insert, update, delete on table public.presentation_share_links to authenticated;
grant select on table public.presentation_sessions to authenticated;
grant select on table public.presentation_events to authenticated;

create policy "admins can read their own role"
  on public.presentation_admins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owners can manage presentation settings"
  on public.presentation_settings for all to authenticated
  using (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ))
  with check (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ));

create policy "owners can manage presentation links"
  on public.presentation_share_links for all to authenticated
  using (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ))
  with check (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ));

create policy "owners can read presentation sessions"
  on public.presentation_sessions for select to authenticated
  using (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ));

create policy "owners can read presentation events"
  on public.presentation_events for select to authenticated
  using (exists (
    select 1 from public.presentation_admins
    where user_id = (select auth.uid()) and role = 'owner'
  ));

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
    select 1 from public.presentation_settings
    where deck_slug = p_deck_slug and analytics_enabled
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

revoke all on function public.record_presentation_event(uuid, uuid, text, text, integer, text, double precision, integer, text) from public, anon, authenticated;
grant execute on function public.record_presentation_event(uuid, uuid, text, text, integer, text, double precision, integer, text) to service_role;

create or replace function public.delete_expired_presentation_events(
  p_retention interval default interval '180 days'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  if p_retention < interval '30 days' then
    raise exception 'Retention must be at least 30 days';
  end if;
  delete from public.presentation_events where occurred_at < now() - p_retention;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_presentation_events(interval) from public, anon, authenticated;
grant execute on function public.delete_expired_presentation_events(interval) to service_role;
