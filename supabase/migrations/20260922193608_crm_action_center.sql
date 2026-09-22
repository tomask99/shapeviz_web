-- Phase 2A.1: read-only bounded task queues; existing tables, RLS and write APIs.
create function public.crm_action_center(p_today timestamptz,p_tomorrow timestamptz,p_group text default null,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare page_size constant integer:=10;
begin
 if p_today is null or p_tomorrow is null or not isfinite(p_today) or not isfinite(p_tomorrow)
 or p_tomorrow-p_today not between interval '22 hours' and interval '26 hours'
 or now()<p_today or now()>=p_tomorrow then
  raise exception 'Refresh the Action Center local day' using errcode='22023';
 end if;
 if p_page is null or p_page<1 or p_page>10000 or (p_group is not null and p_group not in ('overdue','today')) then
  raise exception 'Invalid Action Center page or group' using errcode='22023';
 end if;
 return (
  with tasks as materialized (
   select f.*,c.company_name,c.pipeline_status,ct.full_name contact_name,
    case when f.due_at<now() then 'overdue' else 'today' end bucket
   from public.crm_followups f join public.crm_companies c on c.id=f.company_id and c.owner_id=f.owner_id
   left join public.crm_contacts ct on ct.id=f.contact_id and ct.company_id=f.company_id and ct.owner_id=f.owner_id
   where f.owner_id=(select auth.uid()) and c.archived_at is null and f.completed_at is null and f.due_at<p_tomorrow
  ), ranked as (
   select *,row_number() over(partition by bucket order by due_at,id) position from tasks
  ), buckets as (
   select bucket,ordinality from unnest(array['overdue','today']) with ordinality g(bucket,ordinality)
   where p_group is null or bucket=p_group
  )
  select jsonb_build_object('as_of',now(),'groups',jsonb_agg(jsonb_build_object(
   'key',g.bucket,'total',(select count(*) from tasks t where t.bucket=g.bucket),
   'page',p_page,'pageSize',page_size,
   'items',coalesce((select jsonb_agg(to_jsonb(r)-'position'-'bucket' order by position) from ranked r
    where r.bucket=g.bucket and r.position between (p_page-1)*page_size+1 and p_page*page_size),'[]'::jsonb)
  ) order by g.ordinality)) from buckets g
 );
end;$$;
revoke all on function public.crm_action_center(timestamptz,timestamptz,text,integer) from public,anon;
grant execute on function public.crm_action_center(timestamptz,timestamptz,text,integer) to authenticated;
