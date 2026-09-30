-- Client delivery tasks are separate from sales follow-ups and projects.
create table public.crm_client_tasks (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 owner_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 completed boolean not null default false,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,owner_id) references public.crm_clients(company_id,owner_id)
);
create index crm_client_tasks_company_idx on public.crm_client_tasks(owner_id,company_id,completed,created_at desc,id);
alter table public.crm_client_tasks enable row level security;
revoke all on public.crm_client_tasks from public,anon,authenticated;
grant select,delete on public.crm_client_tasks to authenticated;
grant insert(company_id,owner_id,title,completed),update(title,completed) on public.crm_client_tasks to authenticated;
create policy crm_client_tasks_owner on public.crm_client_tasks for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
-- The shared trigger locks the company, rejects archived companies and versions edits.
create trigger crm_client_task_before before insert or update on public.crm_client_tasks
 for each row execute function crm_private.client_project_before();
create policy crm_client_tasks_delete_active on public.crm_client_tasks as restrictive for delete to authenticated
 using(exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=crm_client_tasks.owner_id and c.archived_at is null));
