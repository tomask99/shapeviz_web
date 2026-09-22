create function public.crm_engagement_config() returns jsonb language sql immutable security invoker set search_path='' as $$select '{"activeSeconds":60,"activeVisits":2,"activeProgress":0.5,"hotSeconds":180,"hotVisits":3,"hotProgress":0.8,"hotSignals":2}'::jsonb;$$;
create function public.crm_engagement_level(visits bigint,seconds bigint,clicks bigint,progress numeric) returns text language sql immutable security invoker set search_path='' as $$
 with cfg as (select public.crm_engagement_config() c) select case when visits=0 then 'NONE'
 when ((visits>=(c->>'hotVisits')::int)::int+(seconds>=(c->>'hotSeconds')::int)::int+(clicks>0)::int+(progress>=(c->>'hotProgress')::numeric)::int)>=(c->>'hotSignals')::int then 'HOT'
 when visits>=(c->>'activeVisits')::int or seconds>=(c->>'activeSeconds')::int or clicks>0 or progress>=(c->>'activeProgress')::numeric then 'ACTIVE' else 'COLD' end from cfg;
$$;
create or replace function public.crm_engagement_level(visits bigint,seconds bigint,clicks bigint) returns text language sql immutable security invoker set search_path='' as $$select public.crm_engagement_level(visits,seconds,clicks,0);$$;
revoke all on function public.crm_engagement_config(),public.crm_engagement_level(bigint,bigint,bigint,numeric) from public,anon;
grant execute on function public.crm_engagement_config(),public.crm_engagement_level(bigint,bigint,bigint,numeric) to authenticated;
create or replace view public.crm_company_signals with(security_invoker=true) as
with links as (select l.* from public.crm_presentation_links l where l.owner_id=(select auth.uid())),
sessions as (select s.*,l.company_id from links l join public.presentation_sessions s on s.deck_slug=l.deck_slug where s.crm_verified and s.started_at>=now()-interval '30 days'),
clicks as (select s.company_id,count(*) total from sessions s join public.presentation_events e on e.session_id=s.id and e.deck_slug=s.deck_slug where e.event_type='website_clicked' group by s.company_id),
engagement as (select company_id,count(*) visits,sum(active_seconds)::bigint seconds,max(started_at) last_visit from sessions group by company_id),
deck_progress as (select s.company_id,s.deck_slug,least(1,count(distinct e.slide_index)::numeric/nullif(p.slide_count,0)) progress from sessions s join public.presentation_projects p on p.deck_slug=s.deck_slug left join public.presentation_events e on e.session_id=s.id and e.deck_slug=s.deck_slug and e.event_type='slide_viewed' group by s.company_id,s.deck_slug,p.slide_count),
progress as (select company_id,max(progress) best_progress from deck_progress group by company_id),
presentations as (select company_id,count(*) presentation_count,max(sent_at) last_contact from links group by company_id),
tasks as (select company_id,min(due_at) next_followup from public.crm_followups where owner_id=(select auth.uid()) and completed_at is null group by company_id),
activities as (select company_id,max(created_at) last_activity,bool_or(event_type='reply_received') has_replied from public.crm_activities where owner_id=(select auth.uid()) group by company_id)
select c.id,c.owner_id,coalesce(p.presentation_count,0) presentation_count,p.last_contact,t.next_followup,a.last_activity,coalesce(a.has_replied,false) has_replied,
coalesce(e.visits,0) visits,coalesce(e.seconds,0) seconds,coalesce(k.total,0) clicks,e.last_visit,
public.crm_engagement_level(coalesce(e.visits,0),coalesce(e.seconds,0),coalesce(k.total,0),coalesce(pr.best_progress,0)) engagement,
case when coalesce(e.visits,0)>0 then 'VIEWED' when p.last_contact is not null then 'SENT' when coalesce(p.presentation_count,0)>0 then 'ASSIGNED' else 'NONE' end presentation_status,pr.best_progress
from public.crm_companies c left join presentations p on p.company_id=c.id left join tasks t on t.company_id=c.id left join activities a on a.company_id=c.id left join engagement e on e.company_id=c.id left join clicks k on k.company_id=c.id left join progress pr on pr.company_id=c.id where c.owner_id=(select auth.uid());

-- Coarse repeat-visit activity: at most one event per checked session, never slide noise.
alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in ('lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed','note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed','presentation_assigned','presentation_unassigned','presentation_sent','reply_received','presentation_viewed','website_clicked','presentation_returned'));
create unique index crm_repeat_session_once on public.crm_activities(company_id,(metadata->>'session_id')) where event_type='presentation_returned';
do $$declare d text;begin
 select pg_get_functiondef('public.crm_record_verified_visit(uuid,text)'::regprocedure) into d;
 d:=replace(d,'update public.crm_companies set pipeline_status=', $inject$
 if exists(select 1 from public.presentation_sessions where deck_slug=p_deck and crm_verified and id<>p_session) then
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 select c.company_id,c.owner_id,'presentation_returned',jsonb_build_object('deck_slug',p_deck,'session_id',p_session,'name',p_deck,'source','verified_visit') on conflict do nothing;
 end if;
 update public.crm_companies set pipeline_status=$inject$);execute d;
end;$$;

-- Integration seams reuse existing entities; no mailbox/calendar connection or messages.
alter table public.crm_followups add column external_calendar_event_id text check(length(external_calendar_event_id)<=512);
comment on column public.crm_followups.external_calendar_event_id is 'Reserved for a future authenticated provider adapter. No browser write grant.';
comment on column public.crm_activities.metadata is 'Structured activity metadata. Future email adapter may attach provider, email_thread_external_id and email_message_external_id; private ownership and deduplication remain mandatory.';
