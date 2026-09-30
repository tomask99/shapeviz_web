-- Only the project's owner may delete it, and archived companies stay read-only.
grant delete on public.crm_projects to authenticated;
create policy crm_projects_delete_active on public.crm_projects as restrictive for delete to authenticated
 using(exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=crm_projects.owner_id and c.archived_at is null));

-- Remove child records in the same transaction as the project. The composite
-- keys keep the cascade within this exact project, company and owner.
alter table public.crm_project_tasks
 drop constraint crm_project_tasks_project_id_company_id_owner_id_fkey,
 add constraint crm_project_tasks_project_id_company_id_owner_id_fkey
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id) on delete cascade;
alter table public.crm_project_notes
 drop constraint crm_project_notes_project_id_company_id_owner_id_fkey,
 add constraint crm_project_notes_project_id_company_id_owner_id_fkey
 foreign key(project_id,company_id,owner_id) references public.crm_projects(id,company_id,owner_id) on delete cascade;
