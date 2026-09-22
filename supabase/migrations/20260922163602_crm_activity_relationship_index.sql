-- Cover both columns of the activity-to-company ownership foreign key.
create index crm_activities_company_owner_idx on public.crm_activities(company_id,owner_id);
