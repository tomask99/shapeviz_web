do $$declare d text;begin
 select pg_get_functiondef('public.crm_client_list(text,text,integer)'::regprocedure) into d;
 d:=replace(d,'''last_activity'',(select max(a.created_at)', $inject$'project_value',(select sum(pr.project_value) from public.crm_projects pr where pr.company_id=p.company_id and pr.status<>'CANCELLED'),'monthly_value',(select sum(pr.monthly_value) from public.crm_projects pr where pr.company_id=p.company_id and pr.status='ACTIVE'),'last_activity',(select max(a.created_at)$inject$);execute d;
end;$$;
create or replace function public.crm_global_search(p_q text) returns jsonb language sql stable security invoker set search_path='' as $$
 with hits as (
 (select case when cl.company_id is null then 'Company' else 'Client' end kind,c.company_name title,'/admin/leads/'||c.id url from public.crm_companies c left join public.crm_clients cl on cl.company_id=c.id where c.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(c.company_name||' '||c.website),lower(left(p_q,160)))>0 order by c.company_name,c.id limit 10)
 union all (select 'Contact',ct.full_name||' · '||ct.email,'/admin/leads/'||ct.company_id||'?tab=contacts' from public.crm_contacts ct where ct.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(ct.full_name||' '||ct.email),lower(left(p_q,160)))>0 order by ct.full_name,ct.id limit 10)
 union all (select 'Project',pr.name,'/admin/leads/'||pr.company_id from public.crm_projects pr where pr.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(pr.name),lower(left(p_q,160)))>0 order by pr.name,pr.id limit 10)
 union all (select 'Presentation',p.title,case when l.company_id is not null then '/admin/leads/'||l.company_id||'?tab=presentations' else '/admin?deck='||p.deck_slug end from public.presentation_projects p left join public.crm_presentation_links l on l.deck_slug=p.deck_slug and l.owner_id=(select auth.uid()) where p_q<>'' and strpos(lower(p.title||' '||p.client),lower(left(p_q,160)))>0 order by p.title,p.deck_slug limit 10))
 select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from hits h;
$$;
