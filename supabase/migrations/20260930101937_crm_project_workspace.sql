alter table public.crm_projects
 add column brief text not null default '' check(length(brief)<=50000),
 add column creation_request_id uuid,
 add constraint crm_projects_record_scope unique(id,company_id,owner_id),
 add constraint crm_projects_creation_request unique(owner_id,company_id,creation_request_id);
grant insert(brief,creation_request_id),update(brief) on public.crm_projects to authenticated;

create table public.crm_project_tasks (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,company_id uuid not null,owner_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),completed boolean not null default false,
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id)
);
create table public.crm_project_notes (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,company_id uuid not null,owner_id uuid not null,
 content text not null check(length(btrim(content)) between 1 and 5000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id)
);
create index crm_project_tasks_scope_idx on public.crm_project_tasks(owner_id,company_id,project_id,completed,created_at desc,id);
create index crm_project_notes_scope_idx on public.crm_project_notes(owner_id,company_id,project_id,created_at desc,id);
alter table public.crm_project_tasks enable row level security;
alter table public.crm_project_notes enable row level security;
revoke all on public.crm_project_tasks,public.crm_project_notes from public,anon,authenticated;
grant select,delete on public.crm_project_tasks,public.crm_project_notes to authenticated;
grant insert(project_id,company_id,owner_id,title,completed),update(title,completed) on public.crm_project_tasks to authenticated;
grant insert(project_id,company_id,owner_id,content),update(content) on public.crm_project_notes to authenticated;
create policy crm_project_tasks_owner on public.crm_project_tasks for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy crm_project_notes_owner on public.crm_project_notes for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create trigger crm_project_task_before before insert or update on public.crm_project_tasks for each row execute function crm_private.client_project_before();
create trigger crm_project_note_before before insert or update on public.crm_project_notes for each row execute function crm_private.client_project_before();
create policy crm_project_tasks_delete_active on public.crm_project_tasks as restrictive for delete to authenticated
 using(exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=crm_project_tasks.owner_id and c.archived_at is null));
create policy crm_project_notes_delete_active on public.crm_project_notes as restrictive for delete to authenticated
 using(exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=crm_project_notes.owner_id and c.archived_at is null));

-- Project agreements are the sole source of these totals. Never add the parent
-- company's WON amounts again, or treat a monthly rate as a one-time amount.
create function public.crm_project_revenue() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('currency','EUR',
  'one_time',jsonb_build_object('amount',coalesce(sum(p.project_value) filter(where p.status<>'CANCELLED'),0)::text,'count',count(*) filter(where p.status<>'CANCELLED' and p.project_value is not null)),
  'monthly',jsonb_build_object('amount',coalesce(sum(p.monthly_value) filter(where p.status='ACTIVE'),0)::text,'count',count(*) filter(where p.status='ACTIVE' and p.monthly_value is not null)))
 from public.crm_projects p join public.crm_companies c on c.id=p.company_id and c.owner_id=p.owner_id
 where p.owner_id=(select auth.uid()) and c.archived_at is null;
$$;
revoke all on function public.crm_project_revenue() from public,anon;
grant execute on function public.crm_project_revenue() to authenticated;
do $$declare definition text;begin
 select pg_get_functiondef('public.crm_business_overview(timestamptz,timestamptz)'::regprocedure) into definition;
 if strpos(definition,'''source_report'',')=0 then raise exception 'Overview extension point missing';end if;
 definition:=replace(definition,'''source_report'',','''revenue'',public.crm_project_revenue(),''source_report'',');
 execute definition;
end;$$;
