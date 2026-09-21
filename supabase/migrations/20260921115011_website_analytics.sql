-- Version matches the migration applied to the linked Supabase project.
create table public.website_sessions (
  id uuid primary key,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds between 0 and 604800),
  device text not null check (length(device) <= 150),
  location text not null check (length(location) <= 300),
  source text not null check (length(source) <= 253)
);
create index website_sessions_started_at_idx on public.website_sessions (started_at);
alter table public.website_sessions enable row level security;
revoke all on public.website_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.website_sessions to service_role;

create function public.record_website_visit(p_id uuid, p_seconds integer, p_device text, p_location text, p_source text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare inserted integer;
begin
  if p_id is null or p_seconds is null or p_seconds not between 0 and 604800 then
    raise exception 'Invalid visit';
  end if;
  insert into public.website_sessions(id, device, location, source)
  values(p_id, p_device, p_location, p_source) on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  update public.website_sessions set last_seen_at = now(),
    active_seconds = greatest(active_seconds, least(p_seconds, greatest(0, floor(extract(epoch from now() - started_at)))::integer))
  where id = p_id;
  return inserted = 1;
end;
$$;
revoke all on function public.record_website_visit(uuid,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.record_website_visit(uuid,integer,text,text,text) to service_role;

create function public.website_admin_stats(p_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_days not in (7,30,90) or p_days is null then raise exception 'Invalid period'; end if;
  with visits as materialized (
    select * from public.website_sessions
    where started_at >= ((now() at time zone 'UTC')::date - (p_days - 1))::timestamp at time zone 'UTC'
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object('visits',count(*),'seconds',coalesce(sum(active_seconds),0),'average_seconds',coalesce(round(avg(active_seconds)),0)) from visits),
    'daily', coalesce((select jsonb_agg(d order by d.day) from (select (started_at at time zone 'UTC')::date as day,count(*) as visits,sum(active_seconds) as seconds from visits group by 1) d),'[]'::jsonb),
    'devices', coalesce((select jsonb_agg(d) from (select device as label,count(*) as visits from visits group by 1 order by 2 desc,1 limit 20) d),'[]'::jsonb),
    'sources', coalesce((select jsonb_agg(d) from (select source as label,count(*) as visits from visits group by 1 order by 2 desc,1 limit 20) d),'[]'::jsonb),
    'locations', coalesce((select jsonb_agg(d) from (select location as label,count(*) as visits from visits group by 1 order by 2 desc,1 limit 20) d),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.website_admin_stats(integer) from public, anon, authenticated;
grant execute on function public.website_admin_stats(integer) to service_role;
