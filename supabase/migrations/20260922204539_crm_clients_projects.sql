create table public.crm_clients (
 company_id uuid primary key,owner_id uuid not null,client_since date not null default current_date,
 active boolean not null default true,account_notes text not null default '' check(length(account_notes)<=5000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,owner_id),foreign key(company_id,owner_id) references public.crm_companies(id,owner_id)
);
create index crm_clients_owner_idx on public.crm_clients(owner_id,client_since desc,company_id);
create table public.crm_projects (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,owner_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 160),status text not null default 'PLANNED' check(status in ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
 service_type text not null default '' check(length(service_type)<=120),description text not null default '' check(length(description)<=5000),
 start_date date,end_date date,project_value numeric(12,2) check(project_value>=0 and project_value<=999999999.99),monthly_value numeric(12,2) check(monthly_value>=0 and monthly_value<=999999999.99),
 notes text not null default '' check(length(notes)<=5000),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,owner_id) references public.crm_clients(company_id,owner_id),check(end_date is null or start_date is null or end_date>=start_date)
);
create index crm_projects_company_idx on public.crm_projects(company_id,owner_id,created_at desc,id);
create index crm_projects_owner_idx on public.crm_projects(owner_id,status);
alter table public.crm_clients enable row level security;alter table public.crm_projects enable row level security;
revoke all on public.crm_clients,public.crm_projects from public,anon,authenticated;
grant select on public.crm_clients,public.crm_projects to authenticated;
grant insert(company_id,owner_id),update(active,account_notes) on public.crm_clients to authenticated;
grant insert(company_id,owner_id,name,status,service_type,description,start_date,end_date,project_value,monthly_value,notes),update(name,status,service_type,description,start_date,end_date,project_value,monthly_value,notes) on public.crm_projects to authenticated;
create policy crm_clients_owner on public.crm_clients for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy crm_projects_owner on public.crm_projects for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function crm_private.client_project_before() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.crm_companies;
begin
 select * into c from public.crm_companies where id=new.company_id and owner_id=new.owner_id for update;
 if not found or c.archived_at is not null then raise exception 'Company unavailable' using errcode='42501';end if;
 if tg_op='INSERT' and tg_table_name='crm_clients' and c.pipeline_status<>'WON' then raise exception 'Only Won leads can convert to clients' using errcode='23514';end if;
 if tg_op='UPDATE' then new.version:=old.version+1;new.updated_at:=now();end if;
 return new;
end;$$;
revoke all on function crm_private.client_project_before() from public,anon,authenticated;
create trigger crm_client_before before insert or update on public.crm_clients for each row execute function crm_private.client_project_before();
create trigger crm_project_before before insert or update on public.crm_projects for each row execute function crm_private.client_project_before();
create function crm_private.client_project_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.owner_id<>auth.uid() or not exists(select 1 from public.presentation_admins where user_id=auth.uid() and role='owner') then raise exception 'Access denied' using errcode='42501';end if;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(new.company_id,new.owner_id,'manual_activity',jsonb_build_object('source',tg_table_name,'operation',tg_op,'content',case when tg_table_name='crm_clients' then case when tg_op='INSERT' then 'Converted to client' else 'Client profile updated' end else 'Project '||lower(tg_op)||': '||(to_jsonb(new)->>'name') end));return new;
end;$$;
revoke all on function crm_private.client_project_activity() from public,anon,authenticated,service_role;
create trigger crm_client_activity after insert or update on public.crm_clients for each row execute function crm_private.client_project_activity();
create trigger crm_project_activity after insert or update on public.crm_projects for each row execute function crm_private.client_project_activity();
create function public.crm_client_list(p_q text default '',p_active text default '',p_page integer default 1) returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as materialized(select cl.*,c.company_name,c.services,c.archived_at from public.crm_clients cl join public.crm_companies c on c.id=cl.company_id and c.owner_id=cl.owner_id
 where cl.owner_id=(select auth.uid()) and (p_q='' or strpos(lower(c.company_name||' '||c.website),lower(left(p_q,160)))>0) and (p_active='' or cl.active=(p_active='yes'))), paged as (
 select * from filtered order by client_since desc,company_id limit 25 offset (least(greatest(p_page,1),10000)-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('active_projects',(select count(*) from public.crm_projects pr where pr.company_id=p.company_id and pr.status='ACTIVE'),'last_activity',(select max(a.created_at) from public.crm_activities a where a.company_id=p.company_id))) from paged p),'[]'::jsonb),'total',(select count(*) from filtered));
$$;
revoke all on function public.crm_client_list(text,text,integer) from public,anon;grant execute on function public.crm_client_list(text,text,integer) to authenticated;
