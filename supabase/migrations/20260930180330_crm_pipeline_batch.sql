-- One bounded Pipeline read instead of recalculating signals for every stage.
-- Materialization lasts for this statement only; no persistent/stale cache.
create function public.crm_pipeline(p_filters jsonb default '{}',p_mode text default 'active')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_mode is null or p_mode not in ('active','lost') then
  raise exception 'Invalid pipeline mode' using errcode='22023';
 end if;
 return (
  with stages as (
   select status,position from unnest(case when p_mode='lost' then array['LOST'] else
    array['NEW_LEAD','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON']
   end) with ordinality as s(status,position)
  ), filtered as materialized (
  select c.*,s.presentation_count,s.last_contact,s.next_followup,s.last_activity,s.has_replied,s.visits,s.seconds,s.clicks,s.last_visit,s.engagement,s.presentation_status from public.crm_companies c join public.crm_company_signals s on s.id=c.id
  where c.owner_id=(select auth.uid())
    and c.archived_at is null
    and c.pipeline_status in (select status from stages)
    and (coalesce(p_filters->>'q','')='' or strpos(lower(c.company_name||' '||c.website||' '||c.short_description),lower(p_filters->>'q'))>0 or exists(select 1 from public.crm_contacts ct where ct.company_id=c.id and ct.owner_id=c.owner_id and strpos(lower(ct.full_name||' '||ct.email),lower(p_filters->>'q'))>0))
    and (coalesce(p_filters->>'country_category','')='' or c.country_category=p_filters->>'country_category')
    and (coalesce(p_filters->>'fit','')='' or c.fit=p_filters->>'fit') and (coalesce(p_filters->>'priority','')='' or c.priority=p_filters->>'priority')
    and (coalesce(p_filters->>'lead_source','')='' or c.lead_source=p_filters->>'lead_source')
    and (coalesce(p_filters->>'industry','')='' or lower(c.industry)=lower(p_filters->>'industry'))
    and (coalesce(p_filters->>'service','')='' or (p_filters->>'service')=any(c.services))
    and (coalesce(p_filters->>'presentation_status','')='' or s.presentation_status=p_filters->>'presentation_status')
    and (coalesce(p_filters->>'engagement','')='' or s.engagement=p_filters->>'engagement')
    and (coalesce(p_filters->>'has_followup','')='' or (s.next_followup is not null)=(p_filters->>'has_followup'='yes'))
    and (coalesce(p_filters->>'has_replied','')='' or s.has_replied=(p_filters->>'has_replied'='yes'))
    and (coalesce(p_filters->>'last_contacted','')='' or case p_filters->>'last_contacted' when 'never' then s.last_contact is null when '7' then s.last_contact>=now()-interval '7 days' when '30' then s.last_contact>=now()-interval '30 days' when 'older30' then s.last_contact<now()-interval '30 days' else false end)
  ), ranked as (
   select f.*,row_number() over(partition by pipeline_status order by updated_at desc,created_at desc,id) as pipeline_rank
   from filtered f
  ), totals as (
   select pipeline_status,count(*) as total from filtered group by pipeline_status
  ), pages as (
   select pipeline_status,jsonb_agg(to_jsonb(r)-'pipeline_rank' order by pipeline_rank) as companies
   from ranked r where pipeline_rank<=25 group by pipeline_status
  )
  select jsonb_build_object('columns',jsonb_agg(jsonb_build_object(
   'status',s.status,'companies',coalesce(p.companies,'[]'::jsonb),
   'total',coalesce(t.total,0),'page',1,'pageSize',25
  ) order by s.position))
  from stages s left join totals t on t.pipeline_status=s.status left join pages p on p.pipeline_status=s.status
 );
end;$$;
revoke all on function public.crm_pipeline(jsonb,text) from public,anon;
grant execute on function public.crm_pipeline(jsonb,text) to authenticated;
