alter table public.crm_companies add column fit text check(fit in ('LOW','MEDIUM','HIGH'));
grant insert(fit),update(fit) on public.crm_companies to authenticated;
create function public.crm_normalized_domain(v text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(regexp_replace(lower(split_part(split_part(regexp_replace(coalesce(v,''),'^https?://','','i'),'/',1),':',1)),'^www\.',''),'\.$','');
$$;
revoke all on function public.crm_normalized_domain(text) from public,anon;
grant execute on function public.crm_normalized_domain(text) to authenticated;
create index crm_companies_domain_idx on public.crm_companies(owner_id,public.crm_normalized_domain(website));
create function public.crm_duplicates(p_domain text,p_name text,p_country text) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (
 select id,company_name,country,website,pipeline_status,archived_at from public.crm_companies
 where owner_id=(select auth.uid()) and ((p_domain<>'' and public.crm_normalized_domain(website)=p_domain) or (p_name<>'' and lower(regexp_replace(btrim(company_name),'\s+',' ','g'))=p_name and country=p_country))
 order by created_at desc,id limit 25) d;
$$;
revoke all on function public.crm_duplicates(text,text,text) from public,anon;
grant execute on function public.crm_duplicates(text,text,text) to authenticated;
-- Extend the current query rather than maintaining a second company-list implementation.
do $$declare definition text;begin
 select pg_get_functiondef('public.crm_list_companies(jsonb,integer)'::regprocedure) into definition;
 if strpos(definition,'and (coalesce(p_filters->>''priority''')=0 then raise exception 'Unexpected company list definition';end if;
 definition:=replace(definition,'and (coalesce(p_filters->>''priority''','and (coalesce(p_filters->>''fit'','''')='''' or c.fit=p_filters->>''fit'') and (coalesce(p_filters->>''priority''');execute definition;
 select pg_get_functiondef('public.crm_create_company_contact(jsonb,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'won_monthly_value,won_notes)','won_monthly_value,won_notes,fit)');
 definition:=replace(definition,'coalesce(d.won_notes,''''))','coalesce(d.won_notes,''''),d.fit)');execute definition;
end;$$;
