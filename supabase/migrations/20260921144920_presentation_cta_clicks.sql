-- Preserve existing sessions, event deduplication, RLS and service-only RPC access.
alter table public.presentation_events drop constraint presentation_events_event_type_check;
alter table public.presentation_events add constraint presentation_events_event_type_check check (event_type in (
  'session_started','slide_viewed','slide_reached_max','video_started','video_completed','session_heartbeat','session_ended','website_clicked'
));

create or replace function public.presentation_admin_stats(p_slug text default null, p_days integer default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
with sessions as (
  select s.* from public.presentation_sessions s where (p_slug is null or s.deck_slug=p_slug)
    and s.started_at >= now()-make_interval(days=>least(greatest(p_days,1),90))
), events as (
  select e.* from public.presentation_events e join sessions s on s.id=e.session_id
), counts as (
  select session_id,count(distinct slide_index) filter(where event_type='slide_viewed') as slides,
    count(*) filter(where event_type='website_clicked') as website_clicks
  from events group by session_id
), daily as (
  select (started_at at time zone 'UTC')::date as day,count(*) as visits,sum(active_seconds) as seconds from sessions group by 1
), slides as (
  select slide_index,
    count(*) filter(where event_type='slide_viewed') as views,
    count(distinct session_id) filter(where event_type='slide_viewed') as sessions,
    sum(active_seconds) as seconds
  from events where slide_index is not null group by slide_index
), decks as (
  select s.deck_slug,count(*) as visits,sum(s.active_seconds) as seconds,
    coalesce(sum(c.website_clicks),0) as website_clicks,
    count(*) filter(where c.website_clicks>0) as website_click_sessions
  from sessions s left join counts c on c.session_id=s.id group by s.deck_slug
), recent as (
  select s.id,s.deck_slug,s.started_at,s.last_seen_at,s.active_seconds,s.max_slide,s.user_agent_category,
    coalesce(c.slides,0) as slides_viewed,coalesce(c.website_clicks,0) as website_clicks
  from sessions s left join counts c on c.session_id=s.id order by s.started_at desc limit 100
)
select jsonb_build_object(
  'summary',(select jsonb_build_object('visits',count(*),'seconds',coalesce(sum(active_seconds),0),'average_seconds',coalesce(round(avg(active_seconds)),0),'slide_views',(select count(*) from events where event_type='slide_viewed'),
    'website_clicks',(select count(*) from events where event_type='website_clicked'),
    'website_click_sessions',(select count(distinct session_id) from events where event_type='website_clicked')) from sessions),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'::jsonb),
  'slides',coalesce((select jsonb_agg(to_jsonb(s) order by s.slide_index) from slides s),'[]'::jsonb),
  'decks',coalesce((select jsonb_agg(to_jsonb(d)) from decks d),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.started_at desc) from recent s),'[]'::jsonb)
);
$$;
revoke all on function public.presentation_admin_stats(text,integer) from public,anon,authenticated;
grant execute on function public.presentation_admin_stats(text,integer) to service_role;

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
    'video_started', 'video_completed', 'session_heartbeat', 'session_ended', 'website_clicked'
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
    event_id, session_id, deck_slug, event_type, slide_index, video_id, video_progress, active_seconds
  ) values (
    p_event_id, p_session_id, p_deck_slug, p_event_type, p_slide_index, p_video_id, p_video_progress, least(greatest(coalesce(p_active_seconds,0),0),300)
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
