-- Stage 1: additive CRM tables. Existing presentation tables remain untouched.
create table public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  company_name text not null check (length(btrim(company_name)) between 1 and 160),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  country_category text generated always as (case when country in ('SK','CZ') then country else 'INT' end) stored,
  city text not null default '' check (length(city) <= 120),
  industry text not null default '' check (length(industry) <= 120),
  short_description text not null default '' check (length(short_description) <= 3000),
  website text not null default '' check (length(website) <= 2048 and (website = '' or website ~ '^https?://')),
  instagram text not null default '' check (length(instagram) <= 2048 and (instagram = '' or instagram ~ '^https?://')),
  linkedin text not null default '' check (length(linkedin) <= 2048 and (linkedin = '' or linkedin ~ '^https?://')),
  services text[] not null default '{}' check (cardinality(services) <= 12 and array_position(services,null) is null and services <@ array['Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other']::text[]),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH')),
  lead_source text not null default 'Manual research' check (lead_source in ('Google','Instagram','LinkedIn','Referral','Existing contact','Trade fair / event','Inbound','Manual research','Other')),
  pipeline_status text not null default 'NEW_LEAD' check (pipeline_status in ('NEW_LEAD','QUALIFIED','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id,owner_id)
);
create index crm_companies_owner_created_idx on public.crm_companies(owner_id,created_at desc,id);
create index crm_companies_owner_status_idx on public.crm_companies(owner_id,pipeline_status);
create index crm_companies_owner_country_idx on public.crm_companies(owner_id,country_category);

-- Minimal durable history for the actions implemented in this stage.
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  owner_id uuid not null,
  event_type text not null check (event_type in ('lead_created','status_changed','lead_archived','lead_restored')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(company_id,owner_id) references public.crm_companies(id,owner_id)
);
create index crm_activities_company_idx on public.crm_activities(company_id,created_at desc);
create index crm_activities_owner_idx on public.crm_activities(owner_id);
alter table public.crm_companies enable row level security;
alter table public.crm_activities enable row level security;
revoke all on public.crm_companies,public.crm_activities from public,anon,authenticated;
grant select on public.crm_companies,public.crm_activities to authenticated;
grant insert(owner_id,company_name,country,city,industry,short_description,website,instagram,linkedin,services,priority,lead_source,pipeline_status) on public.crm_companies to authenticated;
grant update(company_name,country,city,industry,short_description,website,instagram,linkedin,services,priority,lead_source,pipeline_status,archived_at) on public.crm_companies to authenticated;
create policy crm_companies_read on public.crm_companies for select to authenticated
using (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy crm_companies_create on public.crm_companies for insert to authenticated
with check (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy crm_companies_update on public.crm_companies for update to authenticated
using (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
with check (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy crm_activities_read on public.crm_activities for select to authenticated
using (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));

create schema if not exists crm_private;
revoke all on schema crm_private from public,anon,authenticated;
-- A private trigger writes immutable audit events in the same transaction.
-- Definer is limited to this trigger; no public RPC or direct history writes.
create function crm_private.company_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or new.owner_id <> auth.uid() or not exists (
    select 1 from public.presentation_admins where user_id=auth.uid() and role='owner'
  ) then raise exception 'CRM access denied' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.version:=1; new.created_at:=clock_timestamp(); new.updated_at:=new.created_at;
  else
    if new.owner_id<>old.owner_id or new.id<>old.id then
      raise exception 'Company identity is immutable' using errcode='42501';
    end if;
    new.version:=old.version+1; new.created_at:=old.created_at; new.updated_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function crm_private.company_audit() from public,anon,authenticated,service_role;
create trigger crm_company_before before insert or update on public.crm_companies
for each row execute function crm_private.company_audit();

create function crm_private.company_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or new.owner_id<>auth.uid() or not exists (
    select 1 from public.presentation_admins where user_id=auth.uid() and role='owner'
  ) then raise exception 'CRM access denied' using errcode='42501'; end if;
  if tg_op='INSERT' then
    insert into public.crm_activities(company_id,owner_id,event_type) values(new.id,new.owner_id,'lead_created');
  else
    if old.pipeline_status is distinct from new.pipeline_status then
      insert into public.crm_activities(company_id,owner_id,event_type,metadata)
      values(new.id,new.owner_id,'status_changed',jsonb_build_object('from_status',old.pipeline_status,'to_status',new.pipeline_status));
    end if;
    if (old.archived_at is null) is distinct from (new.archived_at is null) then
      insert into public.crm_activities(company_id,owner_id,event_type)
      values(new.id,new.owner_id,case when new.archived_at is null then 'lead_restored' else 'lead_archived' end);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function crm_private.company_activity() from public,anon,authenticated,service_role;
create trigger crm_company_after after insert or update on public.crm_companies
for each row execute function crm_private.company_activity();

create function public.crm_list_companies(p_filters jsonb default '{}',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
with filtered as (
  select c.* from public.crm_companies c
  where c.owner_id=(select auth.uid())
    and (case coalesce(p_filters->>'archived','active') when 'all' then true when 'archived' then c.archived_at is not null else c.archived_at is null end)
    and (coalesce(p_filters->>'q','')='' or strpos(lower(c.company_name||' '||c.website||' '||c.short_description),lower(p_filters->>'q'))>0)
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
