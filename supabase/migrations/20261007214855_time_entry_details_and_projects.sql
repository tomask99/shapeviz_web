-- Existing date-only entries keep an unknown start time. New entries record a local
-- minute and its IANA zone. Snapshotted rates and exact worked seconds are retained.
alter table public.crm_time_manual add column work_time time,add column time_zone text;
alter table public.crm_time_manual add constraint crm_time_manual_clock check((work_time is null and time_zone is null) or (work_time is not null and time_zone is not null and length(time_zone) between 1 and 100 and extract(second from work_time)=0 and work_time<time '24:00'));
create or replace view public.crm_time_entries with(security_invoker=true) as
 select s.id,s.owner_id,s.company_id,s.project_id,s.project_name,s.company_name,s.kind,'Tracked'::text as source,
 s.activity_name,s.description,s.status,s.started_at,s.ended_at,null::date as work_date,s.started_at as sort_at,
 s.duration_seconds,s.rate_cents,s.earned_cents,s.version,null::text as work_time,null::text as time_zone from public.crm_time_session_values s
 union all
 select m.id,m.owner_id,m.company_id,m.project_id,p.name,c.company_name,'project','Manual',p.name,m.description,'finished',
 (m.work_date+m.work_time) at time zone m.time_zone,((m.work_date+m.work_time) at time zone m.time_zone)+make_interval(secs=>m.duration_seconds),m.work_date,
 coalesce((m.work_date+m.work_time) at time zone m.time_zone,m.created_at),m.duration_seconds,m.rate_cents,round(m.duration_seconds*m.rate_cents::numeric/3600)::text,m.version,m.work_time::text,m.time_zone
 from public.crm_time_manual m join public.crm_projects p on p.id=m.project_id join public.crm_companies c on c.id=m.company_id;
create or replace function crm_private.time_command(p_action text,p_request uuid,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s public.crm_time_sessions; m public.crm_time_manual; p public.crm_projects;
 op crm_private.time_requests; rid uuid; stamp timestamptz; segment_start timestamptz; work_clock time; work_zone text; work_day date; work_start timestamptz;
begin
 if uid is null or not exists(select 1 from public.presentation_admins where user_id=uid and role='owner') then
  raise sqlstate '42501' using message='Owner access required.';end if;
 if p_request is null or p_data is null or p_action not in ('start','pause','resume','finish','manual_save','manual_delete','entry_delete') then
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
 elsif p_action='entry_delete' then
  if p_data->>'confirm' is distinct from 'delete' or p_data->>'source' not in ('Tracked','Manual') or p_data->>'source' is null then
   raise sqlstate 'PT400' using message='Confirm entry deletion.';end if;
  if p_data->>'source'='Tracked' then
   select * into s from public.crm_time_sessions where id=(p_data->>'id')::uuid and owner_id=uid for update;
   if not found then raise sqlstate 'PT404' using message='Time entry not found.';end if;
   if s.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Time entry changed. Refresh before deleting.';end if;
   delete from public.crm_time_segments where session_id=s.id and owner_id=uid;
   delete from public.crm_time_sessions where id=s.id and owner_id=uid;rid:=s.id;
  else
   select * into m from public.crm_time_manual where id=(p_data->>'id')::uuid and owner_id=uid for update;
   if not found then raise sqlstate 'PT404' using message='Time entry not found.';end if;
   if m.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Time entry changed. Refresh before deleting.';end if;
   delete from public.crm_time_manual where id=m.id and owner_id=uid;rid:=m.id;
  end if;
 elsif p_action in ('manual_save','manual_delete') then
  select pr.* into p from public.crm_projects pr join public.crm_companies c on c.id=pr.company_id
   where pr.id=(p_data->>'project_id')::uuid and pr.company_id=(p_data->>'company_id')::uuid and pr.owner_id=uid and c.archived_at is null for share of pr;
  if not found or p.hourly_rate_cents is null then raise sqlstate 'PT400' using message='Select an available hourly project for this client.';end if;
  if nullif(p_data->>'id','') is not null then
   select * into m from public.crm_time_manual where id=(p_data->>'id')::uuid and project_id=p.id and owner_id=uid for update;
   if not found or m.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Time entry changed. Reload before saving.';end if;
  end if;
  if p_action='manual_save' then
   work_day:=(p_data->>'work_date')::date;
   work_clock:=case when p_data?'work_time' then nullif(p_data->>'work_time','')::time else m.work_time end;
   work_zone:=case when p_data?'work_time' then nullif(p_data->>'time_zone','') else m.time_zone end;
   if work_clock is not null then
    if work_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=work_zone) then raise sqlstate 'PT400' using message='Invalid time zone.';end if;
    work_start:=(work_day+work_clock) at time zone work_zone;
    if (work_start at time zone work_zone) is distinct from work_day+work_clock then raise sqlstate 'PT400' using message='This local time does not exist because the clocks change. Choose another start time.';end if;
   else work_zone:=null;end if;
  end if;
  if p_action='manual_delete' then
   if m.id is null then raise sqlstate 'PT400' using message='Select an entry to delete.';end if;
   delete from public.crm_time_manual where id=m.id;rid:=m.id;
  elsif m.id is null then
   insert into public.crm_time_manual(owner_id,company_id,project_id,work_date,duration_seconds,rate_cents,description,work_time,time_zone)
    values(uid,p.company_id,p.id,(p_data->>'work_date')::date,(p_data->>'duration_seconds')::integer,p.hourly_rate_cents,coalesce(p_data->>'description',''),work_clock,work_zone) returning id into rid;
  else
   update public.crm_time_manual set work_date=(p_data->>'work_date')::date,duration_seconds=(p_data->>'duration_seconds')::integer,
    description=coalesce(p_data->>'description',''),work_time=work_clock,time_zone=work_zone,version=version+1,updated_at=stamp where id=m.id;rid:=m.id;
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
create or replace function public.crm_time_history(p_from date default null,p_to date default null,p_company uuid default null,p_project uuid default null,p_kind text default '',p_page integer default 1,p_zone text default 'Europe/Bratislava')
 returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as(select e.* from public.crm_time_entries e where owner_id=(select auth.uid())
  and (p_company is null or company_id=p_company) and (p_project is null or project_id=p_project) and (p_kind='' or kind=p_kind)
  and (source='Manual' and ((started_at is null and (p_from is null or work_date>=p_from) and (p_to is null or work_date<=p_to)) or (started_at is not null and (p_from is null or ended_at>(p_from::timestamp at time zone p_zone)) and (p_to is null or started_at<((p_to+1)::timestamp at time zone p_zone))))
   or source='Tracked' and exists(select 1 from public.crm_time_segments g where g.session_id=e.id
    and (p_to is null or g.started_at<((p_to+1)::timestamp at time zone p_zone))
    and (p_from is null or coalesce(g.ended_at,statement_timestamp())>(p_from::timestamp at time zone p_zone))))),
 paged as(select * from filtered order by coalesce(work_date,(started_at at time zone p_zone)::date) desc,sort_at desc,id limit 26 offset (least(greatest(p_page,1),10000)-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(p) from (select * from paged limit 25)p),'[]'::jsonb),'hasMore',(select count(*)>25 from paged));
$$;
create or replace function public.crm_time_summary(p_zone text default 'Europe/Bratislava') returns jsonb language sql stable security invoker set search_path='' as $$
 with local as(select statement_timestamp() at time zone p_zone as stamp),periods as(
 select key,start_date,(start_date::timestamp at time zone p_zone) as start_at from local,
 lateral(values('today',stamp::date),('week',date_trunc('week',stamp)::date),('month',date_trunc('month',stamp)::date)) p(key,start_date)),
 totals as(select p.key,
  coalesce((select sum(greatest(0,extract(epoch from least(coalesce(g.ended_at,date_trunc('second',statement_timestamp())),date_trunc('second',statement_timestamp()))-greatest(g.started_at,p.start_at))))
   from public.crm_time_segments g where g.owner_id=(select auth.uid()) and coalesce(g.ended_at,statement_timestamp())>p.start_at),0)
  +coalesce((select sum(case when e.started_at is null then e.duration_seconds else greatest(0,extract(epoch from least(e.ended_at,(((statement_timestamp() at time zone p_zone)::date+1)::timestamp at time zone p_zone))-greatest(e.started_at,p.start_at))) end)
   from public.crm_time_entries e where e.owner_id=(select auth.uid()) and e.source='Manual'
   and ((e.started_at is null and e.work_date between p.start_date and (statement_timestamp() at time zone p_zone)::date) or (e.started_at is not null and e.ended_at>p.start_at and e.started_at<(((statement_timestamp() at time zone p_zone)::date+1)::timestamp at time zone p_zone)))),0) as seconds from periods p)
 select jsonb_object_agg(key,seconds::bigint) from totals;
$$;
create function public.crm_workspace_projects(p_q text default '',p_company uuid default null,p_status text default 'OPEN',p_billing text default '',p_page integer default 1)
 returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_page is null or p_page<1 or p_page>10000 or p_status is null or p_status not in ('OPEN','','PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED') or p_billing is null or p_billing not in ('','HOURLY','ONE_TIME','MONTHLY') or length(p_q)>160 then
  raise sqlstate 'PT400' using message='Invalid project filters.';end if;
 return (with filtered as materialized (
  select p.id,p.company_id,c.company_name,p.name,p.description,p.status,p.hourly_rate_cents,p.project_value,p.monthly_value,p.start_date,p.end_date,p.updated_at
  from public.crm_projects p join public.crm_companies c on c.id=p.company_id and c.owner_id=p.owner_id
  where p.owner_id=(select auth.uid()) and c.archived_at is null
   and (p_company is null or p.company_id=p_company)
   and (p_status='' or (p_status='OPEN' and p.status in ('ACTIVE','ON_HOLD','PLANNED')) or p.status=p_status)
   and (p_billing='' or (p_billing='HOURLY' and p.hourly_rate_cents is not null) or (p_billing='ONE_TIME' and p.project_value is not null) or (p_billing='MONTHLY' and p.monthly_value is not null))
   and (coalesce(p_q,'')='' or strpos(lower(p.name||' '||c.company_name),lower(p_q))>0)
 ), paged as(select * from filtered order by case status when 'ACTIVE' then 0 when 'ON_HOLD' then 1 when 'PLANNED' then 2 else 3 end,updated_at desc,id limit 25 offset (p_page-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(p) from paged p),'[]'::jsonb),'total',(select count(*) from filtered),'page',p_page,'pageSize',25));
end;$$;
revoke all on function public.crm_workspace_projects(text,uuid,text,text,integer) from public,anon;
grant execute on function public.crm_workspace_projects(text,uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
