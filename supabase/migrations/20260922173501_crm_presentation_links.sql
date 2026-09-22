-- Private sales metadata, separate from the shared/public presentation registry.
create table public.crm_presentation_links (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 owner_id uuid not null,
 deck_slug text not null unique references public.presentation_projects(deck_slug) on delete cascade,
 sent_at timestamptz check(sent_at is null or isfinite(sent_at)),
 sent_to_contact_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id),
 foreign key(sent_to_contact_id,company_id,owner_id) references public.crm_contacts(id,company_id,owner_id) on delete set null(sent_to_contact_id)
);
create index crm_presentation_links_company_owner_idx on public.crm_presentation_links(company_id,owner_id,created_at desc);
create index crm_presentation_links_owner_idx on public.crm_presentation_links(owner_id);
create index crm_presentation_links_contact_idx on public.crm_presentation_links(sent_to_contact_id,company_id,owner_id);
alter table public.crm_presentation_links enable row level security;
revoke all on public.crm_presentation_links from public,anon,authenticated;
grant select,delete on public.crm_presentation_links to authenticated;
grant insert(company_id,owner_id,deck_slug) on public.crm_presentation_links to authenticated;
grant update(sent_at,sent_to_contact_id) on public.crm_presentation_links to authenticated;
create policy crm_presentation_links_read on public.crm_presentation_links for select to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_presentation_links_insert on public.crm_presentation_links for insert to authenticated with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null)
 and exists(select 1 from public.presentation_projects p where p.deck_slug=crm_presentation_links.deck_slug and not p.is_template and p.status<>'archived'));
create policy crm_presentation_links_update on public.crm_presentation_links for update to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null)) with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));
create policy crm_presentation_links_delete on public.crm_presentation_links for delete to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));
create trigger crm_presentation_links_stamp before insert or update on public.crm_presentation_links for each row execute function crm_private.child_stamp();

alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
 'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
 'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed',
 'presentation_assigned','presentation_unassigned','presentation_sent'
));
create function crm_private.presentation_link_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; event text; presentation_title text;
begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 -- The existing server-only delete workflow cascades only this association, never CRM history.
 -- It has no user JWT. Previous audit events already preserve the slug/title/sent metadata.
 if tg_op='DELETE' and pg_trigger_depth()>1 and not exists(select 1 from public.presentation_projects where deck_slug=old.deck_slug) then return old;end if;
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
revoke all on function crm_private.presentation_link_activity() from public,anon,authenticated,service_role;
create trigger crm_presentation_links_activity after insert or update or delete on public.crm_presentation_links for each row execute function crm_private.presentation_link_activity();

create function public.crm_presentation_catalog(p_q text default '',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
with candidates as (
 select p.deck_slug,p.client,p.title,p.status,p.slide_count from public.presentation_projects p
 where not p.is_template and p.status<>'archived'
 and strpos(lower(p.client||' '||p.title||' '||p.deck_slug),lower(coalesce(p_q,'')))>0
 and not exists(select 1 from public.crm_presentation_links l where l.deck_slug=p.deck_slug)
 order by p.updated_at desc,p.deck_slug limit 26 offset (least(greatest(p_page,1),10000)-1)*25
), items as (select * from candidates limit 25)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)) from items i),'[]'::jsonb),'hasMore',(select count(*)>25 from candidates),'page',least(greatest(p_page,1),10000));
$$;
revoke all on function public.crm_presentation_catalog(text,integer) from public,anon;
grant execute on function public.crm_presentation_catalog(text,integer) to authenticated;
