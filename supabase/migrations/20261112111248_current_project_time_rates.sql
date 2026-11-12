-- Project pricing is global: all work uses the current project rate. Keep the
-- original stored snapshots for audit, without rewriting time or entry versions.
-- Invoker views retain the existing owner RLS and round once per entry.
create or replace view public.crm_time_session_values with(security_invoker=true) as
 select s.id,s.owner_id,s.company_id,s.project_id,s.kind,s.activity_name,s.description,s.status,
 p.hourly_rate_cents as rate_cents,s.started_at,s.ended_at,s.version,s.created_at,s.updated_at,
 p.name as project_name,c.company_name,
 coalesce(t.duration_seconds,0)::bigint as duration_seconds,
 case when p.hourly_rate_cents is not null then round(coalesce(t.duration_seconds,0)*p.hourly_rate_cents::numeric/3600)::text end as earned_cents
 from public.crm_time_sessions s
 left join public.crm_projects p on p.id=s.project_id and p.company_id=s.company_id and p.owner_id=s.owner_id
 left join public.crm_companies c on c.id=s.company_id
 left join lateral(select sum(greatest(0,extract(epoch from coalesce(g.ended_at,date_trunc('second',statement_timestamp()))-g.started_at))) as duration_seconds
  from public.crm_time_segments g where g.session_id=s.id and g.owner_id=s.owner_id) t on true;

create or replace view public.crm_time_entries with(security_invoker=true) as
 select s.id,s.owner_id,s.company_id,s.project_id,s.project_name,s.company_name,s.kind,'Tracked'::text as source,
 s.activity_name,s.description,s.status,s.started_at,s.ended_at,null::date as work_date,s.started_at as sort_at,
 s.duration_seconds,s.rate_cents,s.earned_cents,s.version,null::text as work_time,null::text as time_zone from public.crm_time_session_values s
 union all
 select m.id,m.owner_id,m.company_id,m.project_id,p.name,c.company_name,'project','Manual',p.name,m.description,'finished',
 (m.work_date+m.work_time) at time zone m.time_zone,((m.work_date+m.work_time) at time zone m.time_zone)+make_interval(secs=>m.duration_seconds),m.work_date,
 coalesce((m.work_date+m.work_time) at time zone m.time_zone,m.created_at),m.duration_seconds,p.hourly_rate_cents,
 round(m.duration_seconds*p.hourly_rate_cents::numeric/3600)::text,m.version,m.work_time::text,m.time_zone
 from public.crm_time_manual m
 join public.crm_projects p on p.id=m.project_id and p.company_id=m.company_id and p.owner_id=m.owner_id
 join public.crm_companies c on c.id=m.company_id;

create or replace function public.crm_project_time(p_project uuid,p_company uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; rate integer;
begin
 select hourly_rate_cents into rate from public.crm_projects
 where id=p_project and company_id=p_company and owner_id=auth.uid() and hourly_rate_cents is not null;
 if not found then raise sqlstate 'PT404' using message='Hourly project not found.';end if;
 select jsonb_build_object('hourly_rate_cents',rate,
  'tracked_seconds',coalesce(sum(duration_seconds) filter(where source='Tracked' and status='finished'),0),
  'manual_seconds',coalesce(sum(duration_seconds) filter(where source='Manual'),0),
  'earned_cents',coalesce(sum(earned_cents::numeric) filter(where status='finished'),0)::text,
  'open_seconds',coalesce(sum(duration_seconds) filter(where status<>'finished'),0),
  'open_earned_cents',coalesce(sum(earned_cents::numeric) filter(where status<>'finished'),0)::text) into result
 from public.crm_time_entries where project_id=p_project and company_id=p_company and owner_id=auth.uid();
 return result;
end;$$;

notify pgrst,'reload schema';
