alter table public.presentation_sessions add column crm_verified boolean not null default false;
create index presentation_sessions_crm_verified_idx on public.presentation_sessions(deck_slug,started_at desc) where crm_verified;
alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
 'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
 'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed',
 'presentation_assigned','presentation_unassigned','presentation_sent','reply_received','presentation_viewed','website_clicked'
));
create unique index crm_engagement_event_once on public.crm_activities(company_id,event_type,(metadata->>'deck_slug')) where event_type in ('presentation_viewed','website_clicked');

-- Only the server calls this after verifying a signed non-admin visit proof.
-- Invoker/service-only: restore caller claims after the narrow owner-scoped update.
create function public.crm_record_verified_visit(p_session uuid,p_deck text) returns void
language plpgsql security invoker set search_path='' as $$
declare c record; old_claims text:=current_setting('request.jwt.claims',true);
begin
 update public.presentation_sessions set crm_verified=true where id=p_session and deck_slug=p_deck and started_at>=now()-interval '1 hour';
 if not found then return;end if;
 select l.company_id,l.owner_id into c from public.crm_presentation_links l
 join public.crm_companies co on co.id=l.company_id and co.owner_id=l.owner_id
 where l.deck_slug=p_deck and co.archived_at is null
 and exists(select 1 from public.presentation_admins where user_id=l.owner_id and role='owner');
 if not found then return;end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 values(c.company_id,c.owner_id,'presentation_viewed',jsonb_build_object('deck_slug',p_deck,'name',p_deck,'source','verified_visit')) on conflict do nothing;
 update public.crm_companies set pipeline_status='PRESENTATION_VIEWED' where id=c.company_id and owner_id=c.owner_id and archived_at is null and pipeline_status in ('PRESENTATION_READY','CONTACTED');
 if exists(select 1 from public.presentation_events where session_id=p_session and deck_slug=p_deck and event_type='website_clicked') then
  insert into public.crm_activities(company_id,owner_id,event_type,metadata)
  values(c.company_id,c.owner_id,'website_clicked',jsonb_build_object('deck_slug',p_deck,'name',p_deck,'source','verified_visit')) on conflict do nothing;
 end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
end;$$;
revoke all on function public.crm_record_verified_visit(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_record_verified_visit(uuid,text) to service_role;

-- Thresholds live in one place. Scores are simple signals, never manual priority.
create function public.crm_engagement_level(visits bigint,seconds bigint,clicks bigint) returns text
language sql immutable security invoker set search_path='' as $$
 select case when visits>=3 or seconds>=180 or clicks>=1 then 'HOT' when visits>=1 then 'ACTIVE' else 'COLD' end;
$$;
revoke all on function public.crm_engagement_level(bigint,bigint,bigint) from public,anon;
grant execute on function public.crm_engagement_level(bigint,bigint,bigint) to authenticated;

create view public.crm_company_signals with (security_invoker=true) as
with links as (
 select l.* from public.crm_presentation_links l where l.owner_id=(select auth.uid())
), sessions as (
 select s.*,l.company_id from links l join public.presentation_sessions s on s.deck_slug=l.deck_slug
 where s.crm_verified and s.started_at>=now()-interval '30 days'
), clicks as (
 select s.company_id,count(*) total from sessions s join public.presentation_events e on e.session_id=s.id where e.event_type='website_clicked' group by s.company_id
), engagement as (
 select company_id,count(*) visits,sum(active_seconds)::bigint seconds,max(started_at) last_visit from sessions group by company_id
), presentations as (
 select company_id,count(*) presentation_count,max(sent_at) last_contact from links group by company_id
), tasks as (
 select company_id,min(due_at) next_followup from public.crm_followups where owner_id=(select auth.uid()) and completed_at is null group by company_id
), activities as (
 select company_id,max(created_at) last_activity,bool_or(event_type='reply_received') has_replied from public.crm_activities where owner_id=(select auth.uid()) group by company_id
)
select c.id,c.owner_id,coalesce(p.presentation_count,0) presentation_count,p.last_contact,t.next_followup,a.last_activity,coalesce(a.has_replied,false) has_replied,
 coalesce(e.visits,0) visits,coalesce(e.seconds,0) seconds,coalesce(k.total,0) clicks,e.last_visit,
 public.crm_engagement_level(coalesce(e.visits,0),coalesce(e.seconds,0),coalesce(k.total,0)) engagement,
 case when coalesce(e.visits,0)>0 then 'VIEWED' when p.last_contact is not null then 'SENT' when coalesce(p.presentation_count,0)>0 then 'ASSIGNED' else 'NONE' end presentation_status
from public.crm_companies c left join presentations p on p.company_id=c.id left join tasks t on t.company_id=c.id
left join activities a on a.company_id=c.id left join engagement e on e.company_id=c.id left join clicks k on k.company_id=c.id
where c.owner_id=(select auth.uid());
revoke all on public.crm_company_signals from public,anon;
grant select on public.crm_company_signals to authenticated;

create or replace function public.crm_list_companies(p_filters jsonb default '{}',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
with filtered as (
  select c.*,s.presentation_count,s.last_contact,s.next_followup,s.last_activity,s.has_replied,s.visits,s.seconds,s.clicks,s.last_visit,s.engagement,s.presentation_status from public.crm_companies c join public.crm_company_signals s on s.id=c.id
  where c.owner_id=(select auth.uid())
    and (case coalesce(p_filters->>'archived','active') when 'all' then true when 'archived' then c.archived_at is not null else c.archived_at is null end)
    and (coalesce(p_filters->>'q','')='' or strpos(lower(c.company_name||' '||c.website||' '||c.short_description),lower(p_filters->>'q'))>0 or exists(select 1 from public.crm_contacts ct where ct.company_id=c.id and ct.owner_id=c.owner_id and strpos(lower(ct.full_name||' '||ct.email),lower(p_filters->>'q'))>0))
    and (coalesce(p_filters->>'country_category','')='' or c.country_category=p_filters->>'country_category')
    and (coalesce(p_filters->>'pipeline_status','')='' or c.pipeline_status=p_filters->>'pipeline_status')
    and (coalesce(p_filters->>'priority','')='' or c.priority=p_filters->>'priority')
    and (coalesce(p_filters->>'lead_source','')='' or c.lead_source=p_filters->>'lead_source')
    and (coalesce(p_filters->>'industry','')='' or lower(c.industry)=lower(p_filters->>'industry'))
    and (coalesce(p_filters->>'service','')='' or (p_filters->>'service')=any(c.services))
    and (coalesce(p_filters->>'presentation_status','')='' or s.presentation_status=p_filters->>'presentation_status')
    and (coalesce(p_filters->>'engagement','')='' or s.engagement=p_filters->>'engagement')
    and (coalesce(p_filters->>'has_followup','')='' or (s.next_followup is not null)=(p_filters->>'has_followup'='yes'))
    and (coalesce(p_filters->>'has_replied','')='' or s.has_replied=(p_filters->>'has_replied'='yes'))
    and (coalesce(p_filters->>'last_contacted','')='' or case p_filters->>'last_contacted' when 'never' then s.last_contact is null when '7' then s.last_contact>=now()-interval '7 days' when '30' then s.last_contact>=now()-interval '30 days' when 'older30' then s.last_contact<now()-interval '30 days' else false end)
), page as (
  select * from filtered order by
    case when p_filters->>'sort'='name' then lower(company_name) end asc,
    case when p_filters->>'sort'='updated' then updated_at end desc,
    case when p_filters->>'sort'='priority' then case priority when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end end asc,
    case when p_filters->>'sort'='last_activity' then last_activity end desc nulls last,
    case when p_filters->>'sort'='last_contact' then last_contact end desc nulls last,
    case when p_filters->>'sort'='next_followup' then next_followup end asc nulls last,
    case when p_filters->>'sort'='engagement' then case engagement when 'HOT' then 2 when 'ACTIVE' then 1 else 0 end end desc,
    case when p_filters->>'sort'='engagement' then visits end desc,
    created_at desc,id
  limit 25 offset (least(greatest(p_page,1),10000)-1)*25
)
select jsonb_build_object('companies',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',least(greatest(p_page,1),10000),'pageSize',25);
$$;
revoke all on function public.crm_list_companies(jsonb,integer) from public,anon;
grant execute on function public.crm_list_companies(jsonb,integer) to authenticated;

create or replace function public.crm_business_overview(p_today timestamptz,p_tomorrow timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_today is null or p_tomorrow is null or not isfinite(p_today) or not isfinite(p_tomorrow)
 or p_tomorrow-p_today not between interval '22 hours' and interval '26 hours'
 then raise exception 'Invalid local day boundaries' using errcode='22023';end if;
 return (
  with companies as materialized (
   select id,owner_id,company_name,pipeline_status,estimated_value,value_type,lead_source,won_project_value,won_monthly_value from public.crm_companies
   where owner_id=(select auth.uid()) and archived_at is null
  ), opportunities as materialized (
   select estimated_value,value_type from companies where pipeline_status in ('REPLIED','MEETING','PROPOSAL')
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
   'source_report',coalesce((select jsonb_agg(to_jsonb(r) order by r.lead_source) from (
    select lead_source,count(*) leads,count(*) filter(where pipeline_status='WON') won,count(*) filter(where pipeline_status='LOST') lost,
    count(*) filter(where pipeline_status in ('REPLIED','MEETING','PROPOSAL')) open,
    coalesce(sum(won_project_value) filter(where pipeline_status='WON'),0)::text won_project,
    coalesce(sum(won_monthly_value) filter(where pipeline_status='WON'),0)::text won_monthly
    from companies group by lead_source
   ) r),'[]'::jsonb),
   'pipeline_value',(select jsonb_build_object(
    'currency','EUR',
    'one_time',jsonb_build_object('amount',coalesce(sum(estimated_value) filter(where value_type='ONE_TIME'),0)::text,'count',count(*) filter(where value_type='ONE_TIME' and estimated_value is not null)),
    'monthly',jsonb_build_object('amount',coalesce(sum(estimated_value) filter(where value_type='MONTHLY'),0)::text,'count',count(*) filter(where value_type='MONTHLY' and estimated_value is not null)),
    'missing_count',count(*) filter(where estimated_value is null),
    'unknown_frequency_count',count(*) filter(where estimated_value is not null and value_type='UNKNOWN')
   ) from opportunities),
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
