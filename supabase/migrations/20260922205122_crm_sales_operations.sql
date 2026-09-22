create table public.crm_import_batches(id uuid primary key,owner_id uuid not null references auth.users(id),payload_hash text not null check(length(payload_hash)=64),result jsonb not null,created_at timestamptz not null default now());
create index crm_import_batches_owner_idx on public.crm_import_batches(owner_id,created_at);
alter table public.crm_import_batches enable row level security;revoke all on public.crm_import_batches from public,anon,authenticated;
grant select,insert on public.crm_import_batches to authenticated;
create policy crm_import_batch_owner on public.crm_import_batches for all to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner')) with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function public.crm_import(p_id uuid,p_hash text,p_rows jsonb,p_duplicates text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.crm_import_batches;r jsonb;d public.crm_companies;c public.crm_companies;duplicates jsonb;imported integer:=0;skipped integer:=0;result jsonb;
begin
 if auth.uid() is null or p_id is null or p_hash is null or length(p_hash)<>64 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 or p_duplicates not in ('skip','create') then raise exception 'Invalid import' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-import:'||auth.uid()::text,0));
 select * into prior from public.crm_import_batches where id=p_id and owner_id=auth.uid();
 if found then if prior.payload_hash<>p_hash then raise exception 'Import ID reused with different content' using errcode='22023';end if;return prior.result;end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 select * into d from jsonb_populate_record(null::public.crm_companies,r->'company');
 duplicates:=public.crm_duplicates(public.crm_normalized_domain(d.website),lower(regexp_replace(btrim(d.company_name),'\s+',' ','g')),coalesce(d.country,''));
 if jsonb_array_length(duplicates)>0 and p_duplicates='skip' then skipped:=skipped+1;continue;end if;
 if r->'contact' is not null and r->'contact'<>'null'::jsonb then c:=public.crm_create_company_contact(r->'company',r->'contact');
 else
 insert into public.crm_companies(owner_id,company_name,website,country,city,industry,short_description,instagram,linkedin,services,priority,fit,lead_source,pipeline_status)
 values(auth.uid(),d.company_name,coalesce(d.website,''),coalesce(d.country,''),coalesce(d.city,''),coalesce(d.industry,''),coalesce(d.short_description,''),coalesce(d.instagram,''),coalesce(d.linkedin,''),coalesce(d.services,'{}'::text[]),coalesce(d.priority,'MEDIUM'),d.fit,coalesce(d.lead_source,'Manual research'),coalesce(d.pipeline_status,'NEW_LEAD')) returning * into c;
 end if;imported:=imported+1;
 end loop;
 result:=jsonb_build_object('imported',imported,'skipped',skipped);insert into public.crm_import_batches(id,owner_id,payload_hash,result) values(p_id,auth.uid(),p_hash,result);return result;
end;$$;
revoke all on function public.crm_import(uuid,text,jsonb,text) from public,anon;grant execute on function public.crm_import(uuid,text,jsonb,text) to authenticated;

create function public.crm_duplicate_batch(p_rows jsonb) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('row',i,'matches',public.crm_duplicates(public.crm_normalized_domain(r->'company'->>'website'),lower(regexp_replace(btrim(r->'company'->>'company_name'),'\s+',' ','g')),coalesce(r->'company'->>'country','')))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(p_rows)='array' and jsonb_array_length(p_rows)<=200 then p_rows else '[]'::jsonb end) with ordinality t(r,i);
$$;
revoke all on function public.crm_duplicate_batch(jsonb) from public,anon;grant execute on function public.crm_duplicate_batch(jsonb) to authenticated;

create function public.crm_sales_report(p_start date,p_end date,p_country text default '',p_industry text default '',p_source text default '') returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<p_start or p_end-p_start>3660 then raise exception 'Invalid date range' using errcode='22023';end if;
 return (with cohort as materialized(select * from public.crm_companies where owner_id=(select auth.uid()) and created_at>=p_start::timestamp at time zone 'UTC' and created_at<(p_end+1)::timestamp at time zone 'UTC' and (p_country='' or country=p_country) and (p_industry='' or lower(industry)=lower(p_industry)) and (p_source='' or lead_source=p_source)),
 events as materialized(select a.* from public.crm_activities a join cohort c on c.id=a.company_id),
 stages as (select * from (values('CONTACTED'),('PRESENTATION_SENT'),('PRESENTATION_VIEWED'),('REPLIED'),('MEETING'),('PROPOSAL'),('WON')) s(stage)),
 milestones as (select stage,(select count(distinct company_id) from events where metadata->>'to_status'=stage or event_type=case stage when 'PRESENTATION_SENT' then 'presentation_sent' when 'PRESENTATION_VIEWED' then 'presentation_viewed' when 'REPLIED' then 'reply_received' else '' end) companies from stages),
 losses as (select coalesce(nullif(lost_reason,''),'UNSPECIFIED') reason,count(*) companies from cohort where pipeline_status='LOST' group by 1)
 select jsonb_build_object('cohort_size',(select count(*) from cohort),'milestones',(select jsonb_agg(to_jsonb(m)) from milestones m),'losses',coalesce((select jsonb_agg(to_jsonb(l)) from losses l),'[]'::jsonb),
 'values',jsonb_build_object('open_one_time',(select sum(estimated_value) from cohort where pipeline_status not in ('WON','LOST') and archived_at is null and value_type='ONE_TIME'),'open_monthly',(select sum(estimated_value) from cohort where pipeline_status not in ('WON','LOST') and archived_at is null and value_type='MONTHLY'),'won_one_time',(select sum(won_project_value) from cohort where pipeline_status='WON'),'won_monthly',(select sum(won_monthly_value) from cohort where pipeline_status='WON'))));
end;$$;
revoke all on function public.crm_sales_report(date,date,text,text,text) from public,anon;grant execute on function public.crm_sales_report(date,date,text,text,text) to authenticated;

create function public.crm_global_search(p_q text) returns jsonb language sql stable security invoker set search_path='' as $$
 with hits as (
 (select case when cl.company_id is null then 'Company' else 'Client' end kind,c.company_name title,'/admin/leads/'||c.id url from public.crm_companies c left join public.crm_clients cl on cl.company_id=c.id where c.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(c.company_name||' '||c.website),lower(left(p_q,160)))>0 order by c.company_name,c.id limit 10)
 union all (select 'Contact',ct.full_name||' · '||ct.email,'/admin/leads/'||ct.company_id||'?tab=contacts' from public.crm_contacts ct where ct.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(ct.full_name||' '||ct.email),lower(left(p_q,160)))>0 order by ct.full_name,ct.id limit 10)
 union all (select 'Project',pr.name,'/admin/leads/'||pr.company_id from public.crm_projects pr where pr.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(pr.name),lower(left(p_q,160)))>0 order by pr.name,pr.id limit 10)
 union all (select 'Presentation',p.title,'/admin/leads/'||l.company_id||'?tab=presentations' from public.presentation_projects p join public.crm_presentation_links l on l.deck_slug=p.deck_slug where l.owner_id=(select auth.uid()) and p_q<>'' and strpos(lower(p.title||' '||p.client),lower(left(p_q,160)))>0 order by p.title,p.deck_slug limit 10))
 select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from hits h;
$$;
revoke all on function public.crm_global_search(text) from public,anon;grant execute on function public.crm_global_search(text) to authenticated;
