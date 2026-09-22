alter table public.crm_companies
 add column logo_url text not null default '' check(length(logo_url)<=2048 and (logo_url='' or logo_url ~ '^https?://')),
 add column won_date date check(won_date between date '1900-01-01' and date '9999-12-31'),
 add column won_service text not null default '' check(won_service in ('','Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other')),
 add column won_project_value numeric check(won_project_value>=0 and won_project_value<=999999999.99 and won_project_value=trunc(won_project_value,2)),
 add column won_monthly_value numeric check(won_monthly_value>=0 and won_monthly_value<=999999999.99 and won_monthly_value=trunc(won_monthly_value,2)),
 add column won_notes text not null default '' check(length(won_notes)<=3000);
grant insert(logo_url,won_date,won_service,won_project_value,won_monthly_value,won_notes),update(logo_url,won_date,won_service,won_project_value,won_monthly_value,won_notes) on public.crm_companies to authenticated;

create function public.crm_create_company_contact(p_data jsonb,p_contact jsonb)
returns public.crm_companies language plpgsql security invoker set search_path='' as $$
declare d public.crm_companies; result public.crm_companies;
begin
 select * into d from jsonb_populate_record(null::public.crm_companies,p_data);
 insert into public.crm_companies(owner_id,company_name,country,city,industry,short_description,website,instagram,linkedin,services,priority,lead_source,pipeline_status,estimated_value,value_type,lost_reason,logo_url,won_date,won_service,won_project_value,won_monthly_value,won_notes)
 values(auth.uid(),coalesce(d.company_name,''),coalesce(d.country,''),coalesce(d.city,''),coalesce(d.industry,''),coalesce(d.short_description,''),coalesce(d.website,''),coalesce(d.instagram,''),coalesce(d.linkedin,''),coalesce(d.services,'{}'::text[]),coalesce(d.priority,'MEDIUM'),coalesce(d.lead_source,'Manual research'),coalesce(d.pipeline_status,'NEW_LEAD'),d.estimated_value,coalesce(d.value_type,'UNKNOWN'),coalesce(d.lost_reason,''),coalesce(d.logo_url,''),d.won_date,coalesce(d.won_service,''),d.won_project_value,d.won_monthly_value,coalesce(d.won_notes,'')) returning * into result;
 perform public.crm_save_contact(result.id,null,null,p_contact||'{"primary_contact":true}'::jsonb);
 return result;
end;$$;
revoke all on function public.crm_create_company_contact(jsonb,jsonb) from public,anon;
grant execute on function public.crm_create_company_contact(jsonb,jsonb) to authenticated;
