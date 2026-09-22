-- PostgreSQL queues AFTER triggers; depth does not reliably identify FK cascades.
-- A missing parent is the FK-controlled proof that this is association cleanup.
create or replace function crm_private.presentation_link_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; event text; presentation_title text;
begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 -- The existing server-only delete workflow cascades only this association, never CRM history.
 -- It has no user JWT. Previous audit events already preserve the slug/title/sent metadata.
 if tg_op='DELETE' and not exists(select 1 from public.presentation_projects where deck_slug=old.deck_slug) then return old;end if;
 if auth.uid() is null or r.owner_id<>auth.uid() or not exists(select 1 from public.presentation_admins where user_id=auth.uid() and role='owner')
 then raise exception 'CRM access denied' using errcode='42501';end if;
 if tg_op='UPDATE' then
  if new.deck_slug<>old.deck_slug then raise exception 'Presentation identity is immutable' using errcode='42501';end if;
  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then raise exception 'The sent record is immutable' using errcode='23514';end if;
  if new.sent_at is not distinct from old.sent_at then return new;end if;
  if not exists(select 1 from public.presentation_projects where deck_slug=new.deck_slug and status='published' and not is_template)
  then raise exception 'Only a published presentation can be marked sent' using errcode='23514';end if;
 end if;
 select title into presentation_title from public.presentation_projects where deck_slug=r.deck_slug;
 event:=case tg_op when 'INSERT' then 'presentation_assigned' when 'DELETE' then 'presentation_unassigned' else 'presentation_sent' end;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 values(r.company_id,r.owner_id,event,jsonb_build_object('record_id',r.id,'deck_slug',r.deck_slug,'name',presentation_title,'sent_at',r.sent_at,'contact_id',r.sent_to_contact_id));
 if tg_op='DELETE' then return old;else return new;end if;
end;
$$;
