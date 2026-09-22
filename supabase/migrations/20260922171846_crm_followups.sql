-- Stage 4: additive follow-ups. Existing presentations and analytics are untouched.
alter table public.crm_contacts add constraint crm_contacts_identity_key unique(id,company_id,owner_id);
create table public.crm_followups (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 owner_id uuid not null,
 contact_id uuid,
 title text not null check(length(btrim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=5000),
 due_at timestamptz not null check(isfinite(due_at)),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id),
 foreign key(contact_id,company_id,owner_id) references public.crm_contacts(id,company_id,owner_id) on delete set null (contact_id)
);
create index crm_followups_company_owner_idx on public.crm_followups(company_id,owner_id);
create index crm_followups_contact_idx on public.crm_followups(contact_id,company_id,owner_id);
create index crm_followups_owner_due_idx on public.crm_followups(owner_id,due_at,id) where completed_at is null;
create index crm_followups_owner_completed_idx on public.crm_followups(owner_id,completed_at desc,id) where completed_at is not null;
create index crm_followups_next_idx on public.crm_followups(company_id,owner_id,due_at,id) where completed_at is null;
alter table public.crm_followups enable row level security;
revoke all on public.crm_followups from public,anon,authenticated;
grant select on public.crm_followups to authenticated;
grant insert(company_id,owner_id,contact_id,title,description,due_at) on public.crm_followups to authenticated;
grant update(contact_id,title,description,due_at,completed_at) on public.crm_followups to authenticated;
create policy crm_followups_read on public.crm_followups for select to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_followups_insert on public.crm_followups for insert to authenticated with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));
create policy crm_followups_update on public.crm_followups for update to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null)) with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null));
alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
 'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
 'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed'
));
create trigger crm_followups_stamp before insert or update on public.crm_followups for each row execute function crm_private.child_stamp();
create function crm_private.followup_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.completed_at:=null;
 elsif old.completed_at is not null then
  new.completed_at:=old.completed_at;
 elsif new.completed_at is not null then new.completed_at:=clock_timestamp();
 end if;
 return new;
end;
$$;
revoke all on function crm_private.followup_completion() from public,anon,authenticated,service_role;
create trigger crm_followups_completion before insert or update on public.crm_followups for each row execute function crm_private.followup_completion();
-- Only this private trigger can append automatic events; public inserts remain manual-only.
create function crm_private.followup_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare event text;
begin
 if auth.uid() is null or new.owner_id<>auth.uid() or not exists(
  select 1 from public.presentation_admins where user_id=auth.uid() and role='owner'
 ) then raise exception 'CRM access denied' using errcode='42501';end if;
 event:=case when tg_op='INSERT' then 'followup_created'
  when old.completed_at is null and new.completed_at is not null then 'followup_completed'
  when new.due_at is distinct from old.due_at then 'followup_rescheduled' else 'followup_updated' end;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 values(new.company_id,new.owner_id,event,jsonb_build_object('record_id',new.id,'name',new.title,'due_at',new.due_at));
 return new;
end;
$$;
revoke all on function crm_private.followup_activity() from public,anon,authenticated,service_role;
create trigger crm_followups_activity after insert or update on public.crm_followups for each row execute function crm_private.followup_activity();

-- Local-midnight boundaries are supplied as UTC instants by the browser (not 24h arithmetic).
create function public.crm_list_followups(p_today timestamptz,p_tomorrow timestamptz,p_company_id uuid default null,p_group text default null,p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
with filtered as (
 select f.*,c.company_name,c.pipeline_status,ct.full_name as contact_name,
  case when f.completed_at is not null then 'completed' when f.due_at<p_today then 'overdue'
   when f.due_at<p_tomorrow then 'today' else 'upcoming' end as bucket
 from public.crm_followups f join public.crm_companies c on c.id=f.company_id and c.owner_id=f.owner_id
 left join public.crm_contacts ct on ct.id=f.contact_id and ct.company_id=f.company_id and ct.owner_id=f.owner_id
 where f.owner_id=(select auth.uid()) and c.archived_at is null and (p_company_id is null or c.id=p_company_id)
), ranked as (
 select *,row_number() over(partition by bucket order by
  case when bucket='completed' then completed_at end desc,due_at,id) as position from filtered
), groups as (
 select bucket,ordinality from unnest(array['overdue','today','upcoming','completed']) with ordinality as g(bucket,ordinality)
 where p_group is null or bucket=p_group
)
select jsonb_build_object('groups',coalesce(jsonb_agg(jsonb_build_object(
 'key',g.bucket,'total',(select count(*) from filtered f where f.bucket=g.bucket),
 'page',least(greatest(p_page,1),10000),'pageSize',25,
 'items',coalesce((select jsonb_agg(to_jsonb(r)-'position'-'bucket' order by position) from ranked r
  where r.bucket=g.bucket and r.position between (least(greatest(p_page,1),10000)-1)*25+1 and least(greatest(p_page,1),10000)*25),'[]'::jsonb)
) order by g.ordinality),'[]'::jsonb)) from groups g;
$$;
revoke all on function public.crm_list_followups(timestamptz,timestamptz,uuid,text,integer) from public,anon;
grant execute on function public.crm_list_followups(timestamptz,timestamptz,uuid,text,integer) to authenticated;

-- A single bounded batch for the visible Leads page / all visible Kanban cards.
create function public.crm_next_actions(p_company_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_object_agg(company_id,to_jsonb(n)),'{}'::jsonb) from (
 select distinct on(f.company_id) f.company_id,f.id,f.title,f.due_at
 from public.crm_followups f join public.crm_companies c on c.id=f.company_id and c.owner_id=f.owner_id
 where f.owner_id=(select auth.uid()) and f.company_id=any(p_company_ids[1:250])
  and f.completed_at is null and c.archived_at is null
 order by f.company_id,f.due_at,f.id
) n;
$$;
revoke all on function public.crm_next_actions(uuid[]) from public,anon;
grant execute on function public.crm_next_actions(uuid[]) to authenticated;
