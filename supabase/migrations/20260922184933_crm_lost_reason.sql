alter table public.crm_companies add column lost_reason text not null default ''
 check (lost_reason in ('','No reply','Not interested','Budget','Timing','Already has supplier','Not a fit','Other'));
grant insert(lost_reason),update(lost_reason) on public.crm_companies to authenticated;
comment on column public.crm_companies.lost_reason is 'Optional retained loss reason. Changing pipeline status does not erase it; empty string explicitly clears it.';
