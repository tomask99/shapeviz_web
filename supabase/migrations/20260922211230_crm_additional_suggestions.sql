create or replace function public.crm_suggestion_config() returns jsonb language sql immutable security invoker set search_path='' as $$
 select '{"viewedNoReplyDays":3,"contactedNoViewDays":7,"repeatVisits":3,"snoozeHours":24,"pageSize":10}'::jsonb;
$$;
alter table public.crm_suggestion_state drop constraint crm_suggestion_state_rule_check;
alter table public.crm_suggestion_state add constraint crm_suggestion_state_rule_check check(rule in ('MEETING_NEEDS_ACTION','REPLIED_NEEDS_ACTION','HOT_LEAD_IDLE','VIEWED_NO_REPLY','QUALIFIED_NOT_CONTACTED','MULTIPLE_VIEWS','CONTACTED_NOT_VIEWED'));
do $$declare d text;begin
 select pg_get_functiondef('public.crm_suggestion_rule(text,jsonb,boolean,timestamptz)'::regprocedure) into d;
 d:=replace(d,'when p_status=''QUALIFIED''',$inject$
 when (p_signals->>'visits')::int>=(public.crm_suggestion_config()->>'repeatVisits')::int then 'MULTIPLE_VIEWS'
 when p_status in ('CONTACTED','PRESENTATION_READY') and (p_signals->>'has_replied')::boolean=false
 and (p_signals->>'has_checked_visit')::boolean=false and (p_signals->>'tracking_enabled')::boolean=true
 and (p_signals->>'last_contact')::timestamptz<=p_now-make_interval(days=>(public.crm_suggestion_config()->>'contactedNoViewDays')::int)
 then 'CONTACTED_NOT_VIEWED'
 when p_status='QUALIFIED'$inject$);execute d;
 select pg_get_functiondef('public.crm_suggestions(integer,boolean)'::regprocedure) into d;
 d:=replace(d,'to_jsonb(s),s.last_contact', $inject$to_jsonb(s)||jsonb_build_object(
 'has_checked_visit',exists(select 1 from public.crm_presentation_links l join public.presentation_sessions ps on ps.deck_slug=l.deck_slug where l.company_id=c.id and l.owner_id=c.owner_id and ps.crm_verified),
 'tracking_enabled',exists(select 1 from public.crm_presentation_links l join public.presentation_projects p on p.deck_slug=l.deck_slug where l.company_id=c.id and l.owner_id=c.owner_id and p.analytics_enabled and p.status='published')),
 s.last_contact$inject$);execute d;
 select pg_get_functiondef('public.crm_set_suggestion_state(uuid,text,text)'::regprocedure) into d;
 d:=replace(d,'''QUALIFIED_NOT_CONTACTED'')','''QUALIFIED_NOT_CONTACTED'',''MULTIPLE_VIEWS'',''CONTACTED_NOT_VIEWED'')');execute d;
end;$$;
