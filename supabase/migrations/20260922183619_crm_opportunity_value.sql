-- Optional EUR estimate; no revenue inference or aggregation across frequencies.
alter table public.crm_companies
 add column estimated_value numeric,
 add column value_type text not null default 'UNKNOWN',
 add constraint crm_company_value_type check (value_type in ('UNKNOWN','ONE_TIME','MONTHLY')),
 add constraint crm_company_estimated_value check (
   estimated_value is null or
   (estimated_value >= 0 and estimated_value <= 999999999.99 and estimated_value=trunc(estimated_value,2))
 ),
 add constraint crm_company_empty_value check (estimated_value is not null or value_type='UNKNOWN');

-- Existing owner/admin RLS and version trigger continue to apply.
grant insert(estimated_value,value_type),update(estimated_value,value_type)
 on public.crm_companies to authenticated;
comment on column public.crm_companies.estimated_value is 'Optional estimated opportunity amount in EUR; not booked revenue. NULL means unknown, zero is explicit.';
comment on column public.crm_companies.value_type is 'ONE_TIME, MONTHLY or UNKNOWN frequency; never sum across frequencies.';
