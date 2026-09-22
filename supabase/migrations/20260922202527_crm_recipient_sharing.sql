alter table public.crm_presentation_recipients add column sent_at timestamptz check(sent_at is null or isfinite(sent_at));
revoke insert on public.crm_presentation_recipients from authenticated;
grant insert(association_id,company_id,owner_id,deck_slug,contact_id,recipient_name,recipient_email,token_hash) on public.crm_presentation_recipients to authenticated;
grant update(sent_at) on public.crm_presentation_recipients to authenticated;
create function crm_private.recipient_sent_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.sent_at is not distinct from old.sent_at then return new;end if;
 if old.sent_at is not null then raise exception 'Sent record is immutable' using errcode='23514';end if;
 if new.sent_at>now()+interval '1 minute' then raise exception 'Sent date is in the future' using errcode='22023';end if;
 if auth.uid() is null or new.owner_id<>auth.uid() or not exists(select 1 from public.presentation_admins where user_id=auth.uid() and role='owner')
 or new.revoked_at is not null or not exists(
  select 1 from public.crm_presentation_links l join public.crm_companies c on c.id=l.company_id join public.presentation_projects p on p.deck_slug=l.deck_slug
  where l.id=new.association_id and l.company_id=new.company_id and l.owner_id=new.owner_id and l.deck_slug=new.deck_slug
  and c.archived_at is null and p.status='published' and not p.is_template and p.access_mode='unlisted'
 ) then raise exception 'Recipient unavailable' using errcode='42501';end if;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 values(new.company_id,new.owner_id,'presentation_sent',jsonb_build_object('recipient_id',new.id,'deck_slug',new.deck_slug,'name',new.recipient_name,'sent_at',new.sent_at,'source','recipient'));
 return new;
end;$$;
revoke all on function crm_private.recipient_sent_activity() from public,anon,authenticated,service_role;
create trigger crm_recipient_sent_activity after update of sent_at on public.crm_presentation_recipients for each row execute function crm_private.recipient_sent_activity();

create function public.crm_recipient_stats(p_recipient uuid,p_days integer default 30) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r public.crm_presentation_recipients; slide_count integer; enabled boolean;
begin
 if p_days is null or p_days not in (7,30,90) then raise exception 'Invalid period' using errcode='22023';end if;
 select * into r from public.crm_presentation_recipients where id=p_recipient and owner_id=(select auth.uid());
 if not found then raise exception 'Recipient unavailable' using errcode='42501';end if;
 select p.slide_count,p.analytics_enabled into slide_count,enabled from public.presentation_projects p where p.deck_slug=r.deck_slug;
 return (
  with sessions as materialized (
   select id,active_seconds,started_at from public.presentation_sessions where recipient_id=r.id and deck_slug=r.deck_slug and crm_verified and started_at>=now()-make_interval(days=>p_days)
  ), events as (
   select e.event_type,e.slide_index from public.presentation_events e join sessions s on s.id=e.session_id where e.deck_slug=r.deck_slug
  )
  select jsonb_build_object('visits',count(*),'seconds',coalesce(sum(active_seconds),0),'last_viewed_at',max(started_at),'slide_count',slide_count,'analytics_enabled',enabled,
   'slides_viewed',(select count(distinct slide_index) from events where event_type='slide_viewed'),
   'website_clicks',(select count(*) from events where event_type='website_clicked')) from sessions
 );
end;$$;
revoke all on function public.crm_recipient_stats(uuid,integer) from public,anon;
grant execute on function public.crm_recipient_stats(uuid,integer) to authenticated;
