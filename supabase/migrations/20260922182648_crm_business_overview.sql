create function public.crm_business_overview(p_today timestamptz,p_tomorrow timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_today is null or p_tomorrow is null or not isfinite(p_today) or not isfinite(p_tomorrow)
 or p_tomorrow-p_today not between interval '22 hours' and interval '26 hours'
 then raise exception 'Invalid local day boundaries' using errcode='22023';end if;
 return (
  with companies as materialized (
   select id,owner_id,company_name,pipeline_status from public.crm_companies
   where owner_id=(select auth.uid()) and archived_at is null
  ), stages as (
   select pipeline_status,count(*) as total from companies group by pipeline_status
  ), pending as materialized (
   select f.id,f.company_id,c.company_name,f.title,f.due_at from public.crm_followups f
   join companies c on c.id=f.company_id and c.owner_id=f.owner_id
   where f.owner_id=(select auth.uid()) and f.completed_at is null
  ), next_tasks as (
   select * from pending order by due_at,id limit 5
  )
  select jsonb_build_object(
   'total_leads',(select count(*) from companies),
   'stages',coalesce((select jsonb_object_agg(pipeline_status,total) from stages),'{}'::jsonb),
   'replies_recorded',(select count(*) from companies c where exists(select 1 from public.crm_activities a where a.company_id=c.id and a.owner_id=c.owner_id and a.event_type='reply_received')),
   'followups',(select jsonb_build_object('overdue',count(*) filter(where due_at<p_today),'today',count(*) filter(where due_at>=p_today and due_at<p_tomorrow),'upcoming',count(*) filter(where due_at>=p_tomorrow)) from pending),
   'next_tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at,t.id) from next_tasks t),'[]'::jsonb)
  )
 );
end;
$$;
revoke all on function public.crm_business_overview(timestamptz,timestamptz) from public,anon;
grant execute on function public.crm_business_overview(timestamptz,timestamptz) to authenticated;
