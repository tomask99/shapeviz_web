-- Existing one-time/monthly prices remain unchanged. A non-null rate denotes Hourly.
alter table public.crm_projects add column hourly_rate_cents integer
 check(hourly_rate_cents between 1 and 999999999),
 add constraint crm_hourly_price check(hourly_rate_cents is null or (project_value is null and monthly_value is null));
grant insert(hourly_rate_cents),update(hourly_rate_cents) on public.crm_projects to authenticated;

create table public.crm_time_sessions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,
 company_id uuid,project_id uuid,kind text not null check(kind in ('project','custom_activity')),
 activity_name text not null default '' check(length(activity_name)<=160),
 description text not null default '' check(length(description)<=5000),
 status text not null default 'running' check(status in ('running','paused','finished')),
 rate_cents integer check(rate_cents between 1 and 999999999),
 started_at timestamptz not null,ended_at timestamptz,
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,owner_id),
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id) on delete restrict,
 check((kind='project' and project_id is not null and company_id is not null and rate_cents is not null)
 or (kind='custom_activity' and project_id is null and company_id is null and rate_cents is null and length(btrim(activity_name))>0)),
 check((status='finished' and ended_at>started_at) or (status<>'finished' and ended_at is null))
);
create unique index crm_time_one_open on public.crm_time_sessions(owner_id) where status<>'finished';
create index crm_time_sessions_project on public.crm_time_sessions(project_id,company_id,owner_id);
create index crm_time_sessions_history on public.crm_time_sessions(owner_id,started_at desc,id);
create table public.crm_time_segments (
 id uuid primary key default gen_random_uuid(),session_id uuid not null,owner_id uuid not null,
 started_at timestamptz not null,ended_at timestamptz,
 foreign key(session_id,owner_id) references public.crm_time_sessions(id,owner_id) on delete restrict,
 check(ended_at is null or ended_at>started_at)
);
create unique index crm_time_one_segment on public.crm_time_segments(session_id) where ended_at is null;
create index crm_time_segments_session on public.crm_time_segments(session_id,owner_id,started_at);
create index crm_time_segments_period on public.crm_time_segments(owner_id,started_at,ended_at);
create table public.crm_time_manual (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,company_id uuid not null,project_id uuid not null,
 work_date date not null check(work_date between '1900-01-01' and '9999-12-31'),
 duration_seconds integer not null check(duration_seconds between 1 and 86400),
 rate_cents integer not null check(rate_cents between 1 and 999999999),
 description text not null default '' check(length(description)<=5000),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id) on delete restrict
);
create index crm_time_manual_project on public.crm_time_manual(project_id,company_id,owner_id);
create index crm_time_manual_history on public.crm_time_manual(owner_id,work_date desc,id);
-- Private retry ledger. No table grants to the browser or Data API.
create table crm_private.time_requests (
 owner_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,action text not null,data jsonb not null,result_id uuid,
 created_at timestamptz not null default now(),primary key(owner_id,request_id)
);
alter table crm_private.time_requests enable row level security;
revoke all on crm_private.time_requests from public,anon,authenticated;
alter table public.crm_time_sessions enable row level security;
alter table public.crm_time_segments enable row level security;
alter table public.crm_time_manual enable row level security;
revoke all on public.crm_time_sessions,public.crm_time_segments,public.crm_time_manual from public,anon,authenticated;
grant select on public.crm_time_sessions,public.crm_time_segments,public.crm_time_manual to authenticated;
create policy time_sessions_read on public.crm_time_sessions for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy time_segments_read on public.crm_time_segments for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy time_manual_read on public.crm_time_manual for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));

create function crm_private.hourly_project_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.hourly_rate_cents is not null and new.hourly_rate_cents is null and
 (exists(select 1 from public.crm_time_sessions where project_id=old.id) or exists(select 1 from public.crm_time_manual where project_id=old.id)) then
  raise sqlstate 'PT409' using message='This project has time records. Keep Hourly billing to preserve its history.';
 end if;
 return new;
end;$$;
revoke all on function crm_private.hourly_project_guard() from public,anon,authenticated;
create trigger crm_hourly_project_guard before update on public.crm_projects for each row execute function crm_private.hourly_project_guard();

-- Invoker views preserve owner RLS. One row per billable record, rounded once to cents.
create view public.crm_time_session_values with(security_invoker=true) as
 select s.*,p.name as project_name,c.company_name,
 coalesce(t.duration_seconds,0)::bigint as duration_seconds,
 case when s.rate_cents is not null then round(coalesce(t.duration_seconds,0)*s.rate_cents::numeric/3600)::text end as earned_cents
 from public.crm_time_sessions s
 left join public.crm_projects p on p.id=s.project_id
 left join public.crm_companies c on c.id=s.company_id
 left join lateral(select sum(greatest(0,extract(epoch from coalesce(g.ended_at,date_trunc('second',statement_timestamp()))-g.started_at))) as duration_seconds
  from public.crm_time_segments g where g.session_id=s.id and g.owner_id=s.owner_id) t on true;
create view public.crm_time_entries with(security_invoker=true) as
 select s.id,s.owner_id,s.company_id,s.project_id,s.project_name,s.company_name,s.kind,'Tracked'::text as source,
 s.activity_name,s.description,s.status,s.started_at,s.ended_at,null::date as work_date,s.started_at as sort_at,
 s.duration_seconds,s.rate_cents,s.earned_cents,s.version from public.crm_time_session_values s
 union all
 select m.id,m.owner_id,m.company_id,m.project_id,p.name,c.company_name,'project','Manual',p.name,m.description,'finished',null,null,m.work_date,
 m.created_at,m.duration_seconds,m.rate_cents,round(m.duration_seconds*m.rate_cents::numeric/3600)::text,m.version
 from public.crm_time_manual m join public.crm_projects p on p.id=m.project_id join public.crm_companies c on c.id=m.company_id;
revoke all on public.crm_time_session_values,public.crm_time_entries from public,anon,authenticated;
grant select on public.crm_time_session_values,public.crm_time_entries to authenticated;

-- Only this private, audited mutation gateway can write timer data. It checks the
-- caller itself, locks per owner, and rejects stale versions before any changes.
create function crm_private.time_command(p_action text,p_request uuid,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s public.crm_time_sessions; m public.crm_time_manual; p public.crm_projects;
 op crm_private.time_requests; rid uuid; stamp timestamptz; segment_start timestamptz;
begin
 if uid is null or not exists(select 1 from public.presentation_admins where user_id=uid and role='owner') then
  raise sqlstate '42501' using message='Owner access required.';end if;
 if p_request is null or p_data is null or p_action not in ('start','pause','resume','finish','manual_save','manual_delete') then
  raise sqlstate 'PT400' using message='Invalid timer command.';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-time:'||uid::text,0));
 select * into op from crm_private.time_requests where owner_id=uid and request_id=p_request;
 if found then
  if op.action<>p_action or op.data<>p_data then raise sqlstate 'PT409' using message='Retry the original request or synchronize first.';end if;
  return jsonb_build_object('id',op.result_id,'replayed',true);
 end if;
 stamp:=date_trunc('second',clock_timestamp());
 if p_action='start' then
  if exists(select 1 from public.crm_time_sessions where owner_id=uid and status<>'finished') then
   raise sqlstate 'PT409' using message='Finish your existing timer before starting another.';end if;
  if p_data->>'kind'='project' then
   select pr.* into p from public.crm_projects pr join public.crm_companies c on c.id=pr.company_id
    where pr.id=(p_data->>'project_id')::uuid and pr.company_id=(p_data->>'company_id')::uuid and pr.owner_id=uid and c.archived_at is null for share of pr;
   if not found or p.hourly_rate_cents is null then raise sqlstate 'PT400' using message='Select an available hourly project for this client.';end if;
  elsif p_data->>'kind'<>'custom_activity' or p_data->>'kind' is null or length(btrim(coalesce(p_data->>'activity_name','')))=0 then
   raise sqlstate 'PT400' using message='Enter an activity name.';
  end if;
  insert into public.crm_time_sessions(owner_id,company_id,project_id,kind,activity_name,description,rate_cents,started_at)
   values(uid,p.company_id,p.id,p_data->>'kind',btrim(coalesce(p_data->>'activity_name','')),coalesce(p_data->>'description',''),p.hourly_rate_cents,stamp) returning * into s;
  insert into public.crm_time_segments(session_id,owner_id,started_at) values(s.id,uid,stamp);rid:=s.id;
 elsif p_action in ('manual_save','manual_delete') then
  select pr.* into p from public.crm_projects pr join public.crm_companies c on c.id=pr.company_id
   where pr.id=(p_data->>'project_id')::uuid and pr.company_id=(p_data->>'company_id')::uuid and pr.owner_id=uid and c.archived_at is null for share of pr;
  if not found or p.hourly_rate_cents is null then raise sqlstate 'PT400' using message='Select an available hourly project for this client.';end if;
  if nullif(p_data->>'id','') is not null then
   select * into m from public.crm_time_manual where id=(p_data->>'id')::uuid and project_id=p.id and owner_id=uid for update;
   if not found or m.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Time entry changed. Reload before saving.';end if;
  end if;
  if p_action='manual_delete' then
   if m.id is null then raise sqlstate 'PT400' using message='Select an entry to delete.';end if;
   delete from public.crm_time_manual where id=m.id;rid:=m.id;
  elsif m.id is null then
   insert into public.crm_time_manual(owner_id,company_id,project_id,work_date,duration_seconds,rate_cents,description)
    values(uid,p.company_id,p.id,(p_data->>'work_date')::date,(p_data->>'duration_seconds')::integer,p.hourly_rate_cents,coalesce(p_data->>'description','')) returning id into rid;
  else
   update public.crm_time_manual set work_date=(p_data->>'work_date')::date,duration_seconds=(p_data->>'duration_seconds')::integer,
    description=coalesce(p_data->>'description',''),version=version+1,updated_at=stamp where id=m.id;rid:=m.id;
  end if;
 else
  select * into s from public.crm_time_sessions where id=(p_data->>'id')::uuid and owner_id=uid for update;
  if not found then raise sqlstate 'PT404' using message='Timer not found.';end if;
  if s.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Timer changed in another tab. Synchronize before continuing.';end if;
  if (p_action='pause' and s.status<>'running') or (p_action='resume' and s.status<>'paused') or (p_action='finish' and s.status='finished') then
   raise sqlstate 'PT409' using message='Timer state changed. Synchronize before continuing.';end if;
  if s.status='running' then
   select started_at into segment_start from public.crm_time_segments where session_id=s.id and ended_at is null;
   if segment_start is null or stamp<=segment_start then raise sqlstate 'PT400' using message='Allow at least one second of work before pausing or finishing.';end if;
   update public.crm_time_segments set ended_at=stamp where session_id=s.id and ended_at is null;
  end if;
  if p_action='resume' then insert into public.crm_time_segments(session_id,owner_id,started_at) values(s.id,uid,stamp);end if;
  update public.crm_time_sessions set status=case p_action when 'pause' then 'paused' when 'resume' then 'running' else 'finished' end,
   ended_at=case when p_action='finish' then stamp end,updated_at=stamp,version=version+1 where id=s.id;rid:=s.id;
 end if;
 insert into crm_private.time_requests(owner_id,request_id,action,data,result_id) values(uid,p_request,p_action,p_data,rid);
 return jsonb_build_object('id',rid,'replayed',false);
end;$$;
revoke all on function crm_private.time_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function crm_private.time_command(text,uuid,jsonb) to authenticated;
create function public.crm_time_command(p_action text,p_request uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select crm_private.time_command(p_action,p_request,p_data);
$$;

create function public.crm_time_open() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('serverNow',statement_timestamp(),'item',(select to_jsonb(s) from public.crm_time_session_values s where owner_id=(select auth.uid()) and status<>'finished'));
$$;
create function public.crm_time_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('item',(select to_jsonb(s) from public.crm_time_session_values s where id=p_id and owner_id=(select auth.uid())),
 'segments',coalesce((select jsonb_agg(jsonb_build_object('started_at',g.started_at,'ended_at',g.ended_at) order by g.started_at) from public.crm_time_segments g where session_id=p_id and owner_id=(select auth.uid())),'[]'::jsonb));
$$;
create function public.crm_time_options(p_page integer default 1,p_company uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with clients as(select c.id,c.company_name,c.archived_at from public.crm_clients cl join public.crm_companies c on c.id=cl.company_id
 where cl.owner_id=(select auth.uid()) order by c.company_name,c.id limit 101 offset (least(greatest(p_page,1),10000)-1)*100),
 projects as(select p.id,p.company_id,p.name,p.hourly_rate_cents,p.status from public.crm_projects p
 where p.owner_id=(select auth.uid()) and p.company_id=p_company and p.hourly_rate_cents is not null order by p.name,p.id limit 101 offset (least(greatest(p_page,1),10000)-1)*100)
 select case when p_company is null then jsonb_build_object('items',coalesce((select jsonb_agg(c) from (select * from clients limit 100)c),'[]'::jsonb),'hasMore',(select count(*)>100 from clients))
 else jsonb_build_object('items',coalesce((select jsonb_agg(p) from (select * from projects limit 100)p),'[]'::jsonb),'hasMore',(select count(*)>100 from projects)) end;
$$;
create function public.crm_project_time(p_project uuid,p_company uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.crm_projects where id=p_project and company_id=p_company and owner_id=auth.uid() and hourly_rate_cents is not null) then
  raise sqlstate 'PT404' using message='Hourly project not found.';end if;
 select jsonb_build_object('tracked_seconds',coalesce(sum(duration_seconds) filter(where source='Tracked' and status='finished'),0),
  'manual_seconds',coalesce(sum(duration_seconds) filter(where source='Manual'),0),
  'earned_cents',coalesce(sum(earned_cents::numeric) filter(where status='finished'),0)::text,
  'open_seconds',coalesce(sum(duration_seconds) filter(where status<>'finished'),0),
  'open_earned_cents',coalesce(sum(earned_cents::numeric) filter(where status<>'finished'),0)::text) into result
 from public.crm_time_entries where project_id=p_project and company_id=p_company and owner_id=auth.uid();
 return result;
end;$$;
create function public.crm_time_history(p_from date default null,p_to date default null,p_company uuid default null,p_project uuid default null,p_kind text default '',p_page integer default 1,p_zone text default 'Europe/Bratislava')
 returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as(select e.* from public.crm_time_entries e where owner_id=(select auth.uid())
  and (p_company is null or company_id=p_company) and (p_project is null or project_id=p_project) and (p_kind='' or kind=p_kind)
  and (source='Manual' and (p_from is null or work_date>=p_from) and (p_to is null or work_date<=p_to)
   or source='Tracked' and exists(select 1 from public.crm_time_segments g where g.session_id=e.id
    and (p_to is null or g.started_at<((p_to+1)::timestamp at time zone p_zone))
    and (p_from is null or coalesce(g.ended_at,statement_timestamp())>(p_from::timestamp at time zone p_zone))))),
 paged as(select * from filtered order by coalesce(work_date,(started_at at time zone p_zone)::date) desc,sort_at desc,id limit 26 offset (least(greatest(p_page,1),10000)-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(p) from (select * from paged limit 25)p),'[]'::jsonb),'hasMore',(select count(*)>25 from paged));
$$;
-- Clip each segment to local period boundaries. Midnight and DST follow the
-- selected IANA timezone; pauses never contribute. Manual records use work_date.
create function public.crm_time_summary(p_zone text default 'Europe/Bratislava') returns jsonb language sql stable security invoker set search_path='' as $$
 with local as(select statement_timestamp() at time zone p_zone as stamp),periods as(
 select key,start_date,(start_date::timestamp at time zone p_zone) as start_at from local,
 lateral(values('today',stamp::date),('week',date_trunc('week',stamp)::date),('month',date_trunc('month',stamp)::date)) p(key,start_date)),
 totals as(select p.key,
  coalesce((select sum(greatest(0,extract(epoch from least(coalesce(g.ended_at,date_trunc('second',statement_timestamp())),date_trunc('second',statement_timestamp()))-greatest(g.started_at,p.start_at))))
   from public.crm_time_segments g where g.owner_id=(select auth.uid()) and coalesce(g.ended_at,statement_timestamp())>p.start_at),0)
  +coalesce((select sum(m.duration_seconds) from public.crm_time_manual m where m.owner_id=(select auth.uid()) and m.work_date between p.start_date and (statement_timestamp() at time zone p_zone)::date),0) as seconds from periods p)
 select jsonb_object_agg(key,seconds::bigint) from totals;
$$;
revoke all on function public.crm_time_command(text,uuid,jsonb),public.crm_time_open(),public.crm_time_detail(uuid),public.crm_time_options(integer,uuid),public.crm_project_time(uuid,uuid),public.crm_time_history(date,date,uuid,uuid,text,integer,text),public.crm_time_summary(text) from public,anon;
grant execute on function public.crm_time_command(text,uuid,jsonb),public.crm_time_open(),public.crm_time_detail(uuid),public.crm_time_options(integer,uuid),public.crm_project_time(uuid,uuid),public.crm_time_history(date,date,uuid,uuid,text,integer,text),public.crm_time_summary(text) to authenticated;
notify pgrst,'reload schema';
