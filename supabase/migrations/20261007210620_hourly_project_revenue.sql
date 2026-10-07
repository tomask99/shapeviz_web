-- Add completed hourly work to the existing one-time total. Aggregate entries
-- per project first so multiple sessions cannot duplicate an agreed price.
create or replace function public.crm_project_revenue() returns jsonb
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select p.id,p.owner_id,p.status,p.project_value,p.monthly_value,p.hourly_rate_cents
  from public.crm_projects p
  join public.crm_companies c on c.id=p.company_id and c.owner_id=p.owner_id
  where p.owner_id=(select auth.uid()) and c.archived_at is null and p.status<>'CANCELLED'
 ), hourly as (
  select e.project_id,round(sum(e.earned_cents::numeric)/100,2) as amount
  from public.crm_time_entries e join eligible p on p.id=e.project_id and p.owner_id=e.owner_id
  where e.owner_id=(select auth.uid()) and e.kind='project' and e.status='finished' and p.hourly_rate_cents is not null
  group by e.project_id
 )
 select jsonb_build_object('currency','EUR',
  'one_time',jsonb_build_object(
   'amount',(coalesce(sum(p.project_value),0)+coalesce(sum(h.amount),0))::text,
   'count',count(*) filter(where p.project_value is not null or h.project_id is not null),
   'hourly_amount',coalesce(sum(h.amount),0)::text,
   'hourly_count',count(h.project_id)),
  'monthly',jsonb_build_object(
   'amount',coalesce(sum(p.monthly_value) filter(where p.status='ACTIVE'),0)::text,
   'count',count(*) filter(where p.status='ACTIVE' and p.monthly_value is not null)))
 from eligible p left join hourly h on h.project_id=p.id;
$$;
revoke all on function public.crm_project_revenue() from public,anon;
grant execute on function public.crm_project_revenue() to authenticated;
notify pgrst,'reload schema';
