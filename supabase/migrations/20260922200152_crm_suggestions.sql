-- Additive, owner-scoped recommendation preferences; no CRM history is deleted.
create table public.crm_suggestion_state (
 company_id uuid not null,
 owner_id uuid not null,
 rule text not null check(rule in ('MEETING_NEEDS_ACTION','REPLIED_NEEDS_ACTION','HOT_LEAD_IDLE','VIEWED_NO_REPLY','QUALIFIED_NOT_CONTACTED')),
 dismissed_at timestamptz,
 dismissed_until timestamptz,
 primary key(company_id,owner_id,rule),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id) on delete cascade,
 check(dismissed_at is null or (isfinite(dismissed_at) and dismissed_until is null)),
 check(dismissed_until is null or isfinite(dismissed_until))
);
create index crm_suggestion_state_owner_idx on public.crm_suggestion_state(owner_id);
alter table public.crm_suggestion_state enable row level security;
revoke all on public.crm_suggestion_state from public,anon,authenticated;
grant select,insert on public.crm_suggestion_state to authenticated;
grant update(dismissed_at,dismissed_until) on public.crm_suggestion_state to authenticated;
create policy crm_suggestion_state_read on public.crm_suggestion_state for select to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_suggestion_state_insert on public.crm_suggestion_state for insert to authenticated with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));
create policy crm_suggestion_state_update on public.crm_suggestion_state for update to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null)) with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));

-- One configuration source. Engagement thresholds remain in crm_engagement_level.
create function public.crm_suggestion_config() returns jsonb
language sql immutable security invoker set search_path='' as $$
 select '{"viewedNoReplyDays":3,"snoozeHours":24,"pageSize":10}'::jsonb;
$$;
create function public.crm_suggestion_rule(p_status text,p_signals jsonb,p_contacted boolean,p_now timestamptz) returns text
language sql immutable security invoker set search_path='' as $$
 select case
 when p_status in ('WON','LOST') or p_signals->>'next_followup' is not null then null
 when p_status='MEETING' then 'MEETING_NEEDS_ACTION'
 when p_status='REPLIED' then 'REPLIED_NEEDS_ACTION'
 when p_signals->>'engagement'='HOT' then 'HOT_LEAD_IDLE'
 when p_status in ('CONTACTED','PRESENTATION_VIEWED','PRESENTATION_READY')
  and (p_signals->>'has_replied')::boolean=false
  and (p_signals->>'last_visit')::timestamptz<=p_now-make_interval(days=>(public.crm_suggestion_config()->>'viewedNoReplyDays')::int)
  then 'VIEWED_NO_REPLY'
 when p_status='QUALIFIED' and p_contacted=false then 'QUALIFIED_NOT_CONTACTED'
 else null end;
$$;

create function public.crm_suggestions(p_page integer default 1,p_hidden boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare config jsonb:=public.crm_suggestion_config();page_size int:=(config->>'pageSize')::int;
begin
 if p_page is null or p_page<1 or p_page>10000 or p_hidden is null then raise exception 'Invalid page' using errcode='22023';end if;
 return (
 with candidates as materialized (
  select c.id company_id,c.company_name,c.pipeline_status,s.visits,s.seconds,s.clicks,s.last_visit,
   public.crm_suggestion_rule(c.pipeline_status,to_jsonb(s),s.last_contact is not null or s.has_replied or s.visits>0 or exists(
    select 1 from public.crm_activities a where a.company_id=c.id and a.owner_id=c.owner_id and (
     a.event_type in ('presentation_sent','reply_received','presentation_viewed') or
     (a.event_type='status_changed' and a.metadata->>'to_status' in ('CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'))
    )),now()) rule
  from public.crm_companies c join public.crm_company_signals s on s.id=c.id and s.owner_id=c.owner_id
  where c.owner_id=(select auth.uid()) and c.archived_at is null and c.pipeline_status not in ('WON','LOST')
 ), filtered as materialized (
  select c.*,st.dismissed_at,st.dismissed_until,
   case c.rule when 'MEETING_NEEDS_ACTION' then 1 when 'REPLIED_NEEDS_ACTION' then 2 when 'HOT_LEAD_IDLE' then 3 when 'VIEWED_NO_REPLY' then 4 else 5 end rank
  from candidates c left join public.crm_suggestion_state st on st.company_id=c.company_id and st.owner_id=(select auth.uid()) and st.rule=c.rule
  where c.rule is not null and (st.dismissed_at is not null or coalesce(st.dismissed_until>now(),false))=p_hidden
 ), page as (select * from filtered order by rank,company_id limit page_size offset (p_page-1)*page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'rank' order by rank,company_id) from page p),'[]'::jsonb),'total',(select count(*) from filtered),'page',p_page,'pageSize',page_size,'config',config)
 );
end;$$;

create function public.crm_set_suggestion_state(p_company uuid,p_rule text,p_action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare until_at timestamptz;
begin
 if p_rule is null or p_rule not in ('MEETING_NEEDS_ACTION','REPLIED_NEEDS_ACTION','HOT_LEAD_IDLE','VIEWED_NO_REPLY','QUALIFIED_NOT_CONTACTED')
 or p_action is null or p_action not in ('snooze','dismiss','restore') then raise exception 'Invalid suggestion action' using errcode='22023';end if;
 if not exists(select 1 from public.crm_companies where id=p_company and owner_id=(select auth.uid()) and archived_at is null) then raise exception 'Company not available' using errcode='42501';end if;
 until_at:=case when p_action='snooze' then now()+make_interval(hours=>(public.crm_suggestion_config()->>'snoozeHours')::int) end;
 insert into public.crm_suggestion_state(company_id,owner_id,rule,dismissed_at,dismissed_until)
 values(p_company,auth.uid(),p_rule,case when p_action='dismiss' then now() end,until_at)
 on conflict(company_id,owner_id,rule) do update set dismissed_at=excluded.dismissed_at,dismissed_until=excluded.dismissed_until;
 return jsonb_build_object('ok',true,'dismissed_until',until_at);
end;$$;
revoke all on function public.crm_suggestion_config(),public.crm_suggestion_rule(text,jsonb,boolean,timestamptz),public.crm_suggestions(integer,boolean),public.crm_set_suggestion_state(uuid,text,text) from public,anon;
grant execute on function public.crm_suggestion_config(),public.crm_suggestion_rule(text,jsonb,boolean,timestamptz),public.crm_suggestions(integer,boolean),public.crm_set_suggestion_state(uuid,text,text) to authenticated;
