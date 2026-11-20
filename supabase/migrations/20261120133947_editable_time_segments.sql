-- Null descriptions inherit the original session description, including legacy segments.
alter table public.crm_time_segments add column description text check(length(description)<=5000);

create or replace function crm_private.time_command(p_action text,p_request uuid,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s public.crm_time_sessions; m public.crm_time_manual; p public.crm_projects;
 op crm_private.time_requests; rid uuid; stamp timestamptz; segment_start timestamptz; work_clock time; work_zone text; work_day date; work_start timestamptz; g public.crm_time_segments; edit_start timestamptz; edit_end timestamptz;
begin
 if uid is null or not exists(select 1 from public.presentation_admins where user_id=uid and role='owner') then
  raise sqlstate '42501' using message='Owner access required.';end if;
 if p_request is null or p_data is null or p_action not in ('start','pause','resume','finish','manual_save','manual_delete','entry_delete','segment_save') then
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
 elsif p_action='segment_save' then
  select * into s from public.crm_time_sessions where id=(p_data->>'id')::uuid and owner_id=uid for update;
  if not found then raise sqlstate 'PT404' using message='Session not found.';end if;
  if s.version is distinct from (p_data->>'version')::integer then raise sqlstate 'PT409' using message='Session changed. Close and reopen its details before saving.';end if;
  select * into g from public.crm_time_segments where id=(p_data->>'segment_id')::uuid and session_id=s.id and owner_id=uid for update;
  if not found then raise sqlstate 'PT404' using message='Segment not found.';end if;
  if g.ended_at is null then raise sqlstate 'PT409' using message='Pause or finish the timer before editing this segment.';end if;
  edit_start:=(p_data->>'started_at')::timestamptz;edit_end:=(p_data->>'ended_at')::timestamptz;
  if edit_start is null or edit_end is null or not isfinite(edit_start) or not isfinite(edit_end)
   or edit_start<timestamptz '1900-01-01 00:00:00+00' or edit_end<=edit_start or edit_end>stamp
   or date_trunc('second',edit_start)<>edit_start or date_trunc('second',edit_end)<>edit_end then
   raise sqlstate 'PT400' using message='Enter valid times, with end after start and no later than now.';end if;
  if exists(select 1 from public.crm_time_segments x where x.session_id=s.id and x.id<>g.id
   and x.started_at<edit_end and (x.ended_at is null or x.ended_at>edit_start)) then
   raise sqlstate 'PT400' using message='This time overlaps another segment in the session.';end if;
  update public.crm_time_segments set started_at=edit_start,ended_at=edit_end,description=coalesce(p_data->>'description','') where id=g.id;
  update public.crm_time_sessions set
   started_at=(select min(x.started_at) from public.crm_time_segments x where x.session_id=s.id),
   ended_at=case when s.status='finished' then (select max(x.ended_at) from public.crm_time_segments x where x.session_id=s.id) end,
   version=version+1,updated_at=stamp where id=s.id;rid:=s.id;
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
create or replace view public.crm_time_session_values with(security_invoker=true) as
 select s.id,s.owner_id,s.company_id,s.project_id,s.kind,s.activity_name,coalesce(t.description,s.description) as description,s.status,
 p.hourly_rate_cents as rate_cents,s.started_at,s.ended_at,s.version,s.created_at,s.updated_at,
 p.name as project_name,c.company_name,
 coalesce(t.duration_seconds,0)::bigint as duration_seconds,
 case when p.hourly_rate_cents is not null then round(coalesce(t.duration_seconds,0)*p.hourly_rate_cents::numeric/3600)::text end as earned_cents
 from public.crm_time_sessions s
 left join public.crm_projects p on p.id=s.project_id and p.company_id=s.company_id and p.owner_id=s.owner_id
 left join public.crm_companies c on c.id=s.company_id
 left join lateral(select sum(greatest(0,extract(epoch from coalesce(g.ended_at,date_trunc('second',statement_timestamp()))-g.started_at))) as duration_seconds,
  string_agg(distinct coalesce(g.description,s.description),E'\n') as description
  from public.crm_time_segments g where g.session_id=s.id and g.owner_id=s.owner_id) t on true;

create or replace function public.crm_time_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('item',(select to_jsonb(s) from public.crm_time_session_values s where id=p_id and owner_id=(select auth.uid())),
 'segments',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'started_at',g.started_at,'ended_at',g.ended_at,'description',coalesce(g.description,s.description)) order by g.started_at,g.id)
 from public.crm_time_segments g join public.crm_time_sessions s on s.id=g.session_id and s.owner_id=g.owner_id
 where g.session_id=p_id and g.owner_id=(select auth.uid())),'[]'::jsonb));
$$;
notify pgrst,'reload schema';
