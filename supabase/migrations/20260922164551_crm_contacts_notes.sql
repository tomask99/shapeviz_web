-- Stage 2: company contacts, notes and durable activity.
alter table public.crm_activities alter column created_at set default clock_timestamp();
create table public.crm_contacts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 owner_id uuid not null,
 full_name text not null check(length(btrim(full_name)) between 1 and 160),
 job_title text not null default '' check(length(job_title)<=160),
 email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=80),
 linkedin text not null default '' check(length(linkedin)<=2048 and (linkedin='' or linkedin ~ '^https?://')),
 instagram text not null default '' check(length(instagram)<=2048 and (instagram='' or instagram ~ '^https?://')),
 notes text not null default '' check(length(notes)<=3000),
 primary_contact boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id)
);
create unique index crm_contacts_one_primary_idx on public.crm_contacts(company_id) where primary_contact;
create index crm_contacts_company_owner_idx on public.crm_contacts(company_id,owner_id);
create index crm_contacts_owner_idx on public.crm_contacts(owner_id);
create table public.crm_notes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 owner_id uuid not null,
 content text not null check(length(btrim(content)) between 1 and 5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id)
);
create index crm_notes_company_owner_idx on public.crm_notes(company_id,owner_id);
create index crm_notes_owner_idx on public.crm_notes(owner_id);

alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
 'lead_created','status_changed','lead_archived','lead_restored',
 'contact_added','contact_updated','contact_removed','note_added','note_updated','note_removed','manual_activity'
));
grant insert(company_id,owner_id,event_type,metadata) on public.crm_activities to authenticated;
create policy crm_activity_manual on public.crm_activities for insert to authenticated with check(
 owner_id=(select auth.uid()) and event_type='manual_activity'
 and jsonb_typeof(metadata->'content')='string' and length(btrim(metadata->>'content')) between 1 and 5000
 and (metadata - 'content')='{}'::jsonb
 and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()))
);

alter table public.crm_contacts enable row level security;
revoke all on public.crm_contacts from public,anon,authenticated;
grant select,delete on public.crm_contacts to authenticated;
grant insert(company_id,owner_id,full_name,job_title,email,phone,linkedin,instagram,notes,primary_contact) on public.crm_contacts to authenticated;
grant update(full_name,job_title,email,phone,linkedin,instagram,notes,primary_contact) on public.crm_contacts to authenticated;
create policy crm_contacts_read on public.crm_contacts for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_contacts_insert on public.crm_contacts for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_contacts_update on public.crm_contacts for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()))) with check(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_contacts_delete on public.crm_contacts for delete to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));

alter table public.crm_notes enable row level security;
revoke all on public.crm_notes from public,anon,authenticated;
grant select,delete on public.crm_notes to authenticated;
grant insert(company_id,owner_id,content) on public.crm_notes to authenticated;
grant update(content) on public.crm_notes to authenticated;
create policy crm_notes_read on public.crm_notes for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_notes_insert on public.crm_notes for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_notes_update on public.crm_notes for update to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()))) with check(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_notes_delete on public.crm_notes for delete to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));

-- No privilege escalation is needed to stamp version/timestamps.
create function crm_private.child_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.owner_id is distinct from auth.uid() then raise exception 'CRM access denied' using errcode='42501'; end if;
 if tg_op='INSERT' then
  new.version:=1;new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 else
  if new.id<>old.id or new.owner_id<>old.owner_id or new.company_id<>old.company_id then
   raise exception 'Record identity is immutable' using errcode='42501';
  end if;
  new.version:=old.version+1;new.created_at:=old.created_at;new.updated_at:=clock_timestamp();
 end if;
 return new;
end;
$$;
revoke all on function crm_private.child_stamp() from public,anon,authenticated,service_role;
-- Private trigger alone can append automatic audit events; users can append only manual events.
create function crm_private.child_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; event text; data jsonb;
begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 if auth.uid() is null or r.owner_id<>auth.uid() or not exists(
  select 1 from public.crm_companies c join public.presentation_admins a on a.user_id=c.owner_id
  where c.id=r.company_id and c.owner_id=auth.uid() and a.role='owner'
 ) then raise exception 'CRM access denied' using errcode='42501';end if;
 event:=(case when tg_table_name='crm_contacts' then 'contact_' else 'note_' end)||
  (case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'removed' end);
 data:=jsonb_build_object('record_id',r.id);
 if tg_table_name='crm_contacts' then data:=data||jsonb_build_object('name',r.full_name);end if;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(r.company_id,r.owner_id,event,data);
 if tg_op='DELETE' then return old;else return new;end if;
end;
$$;
revoke all on function crm_private.child_activity() from public,anon,authenticated,service_role;
create trigger crm_contacts_stamp before insert or update on public.crm_contacts for each row execute function crm_private.child_stamp();
create trigger crm_notes_stamp before insert or update on public.crm_notes for each row execute function crm_private.child_stamp();
create trigger crm_contacts_activity after insert or update or delete on public.crm_contacts for each row execute function crm_private.child_activity();
create trigger crm_notes_activity after insert or update or delete on public.crm_notes for each row execute function crm_private.child_activity();

-- Serialize primary-contact changes per company; the partial unique index is the final invariant.
create function public.crm_save_contact(p_company_id uuid,p_contact_id uuid,p_version integer,p_data jsonb)
returns public.crm_contacts language plpgsql security invoker set search_path='' as $$
declare result public.crm_contacts;
begin
 perform 1 from public.crm_companies where id=p_company_id and owner_id=auth.uid() for update;
 if not found then return null;end if;
 if p_contact_id is not null then
  select * into result from public.crm_contacts where id=p_contact_id and company_id=p_company_id
    and owner_id=auth.uid() and version=p_version for update;
  if not found then return null;end if;
 end if;
 if (p_data->>'primary_contact')::boolean then
  update public.crm_contacts set primary_contact=false
   where company_id=p_company_id and owner_id=auth.uid() and primary_contact and id is distinct from p_contact_id;
 end if;
 if p_contact_id is null then
  insert into public.crm_contacts(company_id,owner_id,full_name,job_title,email,phone,linkedin,instagram,notes,primary_contact)
  values(p_company_id,auth.uid(),p_data->>'full_name',coalesce(p_data->>'job_title',''),coalesce(p_data->>'email',''),
   coalesce(p_data->>'phone',''),coalesce(p_data->>'linkedin',''),coalesce(p_data->>'instagram',''),
   coalesce(p_data->>'notes',''),coalesce((p_data->>'primary_contact')::boolean,false)) returning * into result;
 else
  update public.crm_contacts set full_name=p_data->>'full_name',job_title=coalesce(p_data->>'job_title',''),
   email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),linkedin=coalesce(p_data->>'linkedin',''),
   instagram=coalesce(p_data->>'instagram',''),notes=coalesce(p_data->>'notes',''),
   primary_contact=coalesce((p_data->>'primary_contact')::boolean,false)
  where id=p_contact_id and company_id=p_company_id and owner_id=auth.uid() returning * into result;
 end if;
 return result;
end;
$$;
revoke all on function public.crm_save_contact(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.crm_save_contact(uuid,uuid,integer,jsonb) to authenticated;

-- Preserve existing filters/pagination while extending search to contacts.
create or replace function public.crm_list_companies(p_filters jsonb default '{}',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
with filtered as (
  select c.* from public.crm_companies c
  where c.owner_id=(select auth.uid())
    and (case coalesce(p_filters->>'archived','active') when 'all' then true when 'archived' then c.archived_at is not null else c.archived_at is null end)
    and (coalesce(p_filters->>'q','')='' or strpos(lower(c.company_name||' '||c.website||' '||c.short_description),lower(p_filters->>'q'))>0 or exists(select 1 from public.crm_contacts ct where ct.company_id=c.id and ct.owner_id=c.owner_id and strpos(lower(ct.full_name||' '||ct.email),lower(p_filters->>'q'))>0))
    and (coalesce(p_filters->>'country_category','')='' or c.country_category=p_filters->>'country_category')
    and (coalesce(p_filters->>'pipeline_status','')='' or c.pipeline_status=p_filters->>'pipeline_status')
    and (coalesce(p_filters->>'priority','')='' or c.priority=p_filters->>'priority')
    and (coalesce(p_filters->>'lead_source','')='' or c.lead_source=p_filters->>'lead_source')
    and (coalesce(p_filters->>'industry','')='' or lower(c.industry)=lower(p_filters->>'industry'))
    and (coalesce(p_filters->>'service','')='' or (p_filters->>'service')=any(c.services))
), page as (
  select * from filtered order by
    case when p_filters->>'sort'='name' then lower(company_name) end asc,
    case when p_filters->>'sort'='updated' then updated_at end desc,
    case when p_filters->>'sort'='priority' then case priority when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end end asc,
    created_at desc,id
  limit 25 offset (least(greatest(p_page,1),10000)-1)*25
)
select jsonb_build_object('companies',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',least(greatest(p_page,1),10000),'pageSize',25);
$$;
revoke all on function public.crm_list_companies(jsonb,integer) from public,anon;
grant execute on function public.crm_list_companies(jsonb,integer) to authenticated;
