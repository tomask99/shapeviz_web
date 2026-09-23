-- Phase 3A.3. Browser roles remain read-only on candidates. The application
-- validates the canonical schema and signed review before this service-only RPC.
-- No Lead, contact, activity, approval or rejection is written by this import.

-- Websites in the CRM are canonicalized by the JS URL parser before storage.
-- Extract canonical authorities (including IPv6), stopping at query/fragment too.
create or replace function public.crm_normalized_domain(v text) returns text
language sql immutable set search_path='' as $$
  with authority as (
    select split_part(regexp_replace(lower(btrim(coalesce(v,''))),'^https?://','','i'),'/',1) value
  ), host as (
    select split_part(split_part(value,'?',1),'#',1) value from authority
  )
  select case when value='' or value ~ '[[:space:]@\\]' then '' else
    regexp_replace(regexp_replace(case when left(value,1)='[' then substring(value from '^\[[^]]+\]')
      else split_part(value,':',1) end,'^www\.',''),'\.$','') end from host;
$$;
reindex index public.crm_companies_domain_idx;
grant execute on function public.crm_normalized_domain(text) to service_role;
create index crm_companies_name_country_idx on public.crm_companies(owner_id,lower(regexp_replace(btrim(company_name),'\s+',' ','g')),country);

alter table public.crm_research_candidates add column duplicate_candidate_id uuid;
alter table public.crm_research_candidates add constraint crm_research_duplicate_candidate_fk
  foreign key(duplicate_candidate_id,owner_id) references public.crm_research_candidates(id,owner_id);
create index crm_research_duplicate_candidate_idx on public.crm_research_candidates(duplicate_candidate_id,owner_id);

create table crm_private.research_import_batches (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,id)
);
alter table crm_private.research_import_batches enable row level security;
revoke all on crm_private.research_import_batches from public,anon,authenticated;
grant select,insert on crm_private.research_import_batches to service_role;

-- Serialize import checks against other imports AND ordinary company/candidate
-- mutations. The volatile commit performs its read AFTER acquiring this lock.
create function crm_private.research_identity_lock() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended((case when tg_op='DELETE' then old.owner_id else new.owner_id end)::text,731903));
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function crm_private.research_identity_lock() from public,anon,authenticated,service_role;
create trigger crm_00_research_identity_lock before insert or update or delete on public.crm_companies
  for each row execute function crm_private.research_identity_lock();
create trigger crm_00_research_identity_lock before insert or update or delete on public.crm_research_candidates
  for each row execute function crm_private.research_identity_lock();

-- The private schema is not exposed by PostgREST. Grant just this invoker helper,
-- which checks the caller identity and retains RLS for authenticated callers.
grant usage on schema crm_private to authenticated,service_role;
create function crm_private.research_duplicate_rows(p_owner uuid,p_rows jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_owner is null or (current_user<>'service_role' and p_owner is distinct from auth.uid())
    or not exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner') then
    raise exception 'Research access denied' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 or octet_length(p_rows::text)>200000 then
    raise exception 'Invalid duplicate check' using errcode='22023';
  end if;
  with inputs as (
    select (r->>'row')::int row_num,r->>'normalized_domain' domain,r->>'normalized_company_name' name,r->>'country' country
    from jsonb_array_elements(p_rows) r
  ), matches as materialized (
    select i.row_num,'company' kind,c.id,c.company_name,c.website,c.country,c.pipeline_status status,c.archived_at,c.version,
      case when i.domain<>'' and public.crm_normalized_domain(c.website)=i.domain then 'domain' else 'name_country' end match
    from inputs i join public.crm_companies c on c.owner_id=p_owner and (
      (i.domain<>'' and public.crm_normalized_domain(c.website)=i.domain) or
      (i.name<>'' and i.country<>'' and lower(regexp_replace(btrim(c.company_name),'\s+',' ','g'))=i.name and c.country=i.country))
    union all
    select i.row_num,'candidate',c.id,c.company_name,c.website,c.country,c.research_status,null::timestamptz,c.version,
      case when i.domain<>'' and c.normalized_domain=i.domain then 'domain' else 'name_country' end
    from inputs i join public.crm_research_candidates c on c.owner_id=p_owner and (
      (i.domain<>'' and c.normalized_domain=i.domain) or
      (i.name<>'' and i.country<>'' and c.normalized_company_name=i.name and c.country=i.country))
  )
  select coalesce(jsonb_agg(jsonb_build_object('row',i.row_num,
    'matches',(select coalesce(jsonb_agg(to_jsonb(l)-'row_num'-'version'),'[]') from
      (select * from matches m where m.row_num=i.row_num order by kind,id limit 10) l),
    'match_count',(select count(*) from matches m where m.row_num=i.row_num),
    'fingerprint',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(m)::text,E'\n' order by kind,id),''),'UTF8')),'hex')
      from matches m where m.row_num=i.row_num)) order by i.row_num),'[]') into result from inputs i;
  return result;
end;
$$;
revoke all on function crm_private.research_duplicate_rows(uuid,jsonb) from public,anon;
grant execute on function crm_private.research_duplicate_rows(uuid,jsonb) to authenticated,service_role;

create function public.crm_research_duplicates(p_rows jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select crm_private.research_duplicate_rows(auth.uid(),p_rows);
$$;
revoke all on function public.crm_research_duplicates(jsonb) from public,anon,service_role;
grant execute on function public.crm_research_duplicates(jsonb) to authenticated;

create function public.crm_research_excluded_domains() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.presentation_admins where user_id=auth.uid() and role='owner') then
    raise exception 'Research access denied' using errcode='42501';
  end if;
  with domains as (
    select public.crm_normalized_domain(website) domain from public.crm_companies where owner_id=(select auth.uid())
    union select normalized_domain from public.crm_research_candidates where owner_id=(select auth.uid())
  ), bounded as (select domain from domains where domain<>'' order by domain limit 10001)
  select jsonb_build_object('domains',coalesce(jsonb_agg(domain order by domain),'[]'),'count',count(*),'overflow',count(*)>10000)
    into result from bounded;
  return result;
end;
$$;
revoke all on function public.crm_research_excluded_domains() from public,anon,service_role;
grant execute on function public.crm_research_excluded_domains() to authenticated;

create function public.crm_research_import(p_owner uuid,p_id uuid,p_hash text,p_rows jsonb,p_expected jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare previous crm_private.research_import_batches; inputs jsonb; actual jsonb; snapshot jsonb;
  r jsonb; d public.crm_research_candidates; match_row jsonb; company_id uuid; candidate_id uuid;
  created_id uuid; row_ids jsonb:='{}'; ids jsonb:='[]'; result jsonb; skipped integer:=0; within_duplicate boolean;
begin
  if current_user<>'service_role' or p_owner is null or not exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner') then
    raise exception 'Research access denied' using errcode='42501';
  end if;
  if p_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_rows is null or jsonb_typeof(p_rows)<>'array'
    or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>2000000
    or p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'Invalid reviewed import' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  -- Lock owner membership until this write finishes, including retries.
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_import_batches where owner_id=p_owner and id=p_id;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Import batch changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select jsonb_agg(jsonb_build_object('row',i.value->'row','normalized_domain',i.value->'candidate'->>'normalized_domain',
    'normalized_company_name',lower(regexp_replace(btrim(i.value->'candidate'->>'company_name'),'\s+',' ','g')),
    'country',i.value->'candidate'->>'country') order by (i.value->>'row')::int) into inputs from jsonb_array_elements(p_rows) i(value);
  actual:=crm_private.research_duplicate_rows(p_owner,inputs);
  select jsonb_agg(jsonb_build_object('row',a->'row','match_count',a->'match_count','fingerprint',a->'fingerprint') order by (a->>'row')::int)
    into snapshot from jsonb_array_elements(actual) a;
  if snapshot is distinct from p_expected then raise exception 'Duplicate check changed' using errcode='PT409'; end if;
  if (select count(distinct i.value->>'row') from jsonb_array_elements(p_rows) i(value))<>jsonb_array_length(p_rows) then
    raise exception 'Repeated import row' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(p_rows) order by (value->>'row')::int loop
    if r->>'decision'='skip' then skipped:=skipped+1; continue; end if;
    if coalesce(r->>'decision','') not in ('import','keep') then raise exception 'Invalid import decision' using errcode='22023'; end if;
    select * into d from jsonb_populate_record(null::public.crm_research_candidates,r->'candidate');
    select a into match_row from jsonb_array_elements(actual) a where a->'row'=r->'row';
    company_id:=null; candidate_id:=null;
    select (m->>'id')::uuid into company_id from jsonb_array_elements(match_row->'matches') m where m->>'kind'='company' limit 1;
    select (m->>'id')::uuid into candidate_id from jsonb_array_elements(match_row->'matches') m where m->>'kind'='candidate' limit 1;
    -- Derive within-batch identity from selected rows, never trust a caller flag.
    select (row_ids->>(prior->>'row'))::uuid into created_id from jsonb_array_elements(p_rows) prior
      where row_ids ? (prior->>'row') and (
        (d.normalized_domain<>'' and prior->'candidate'->>'normalized_domain'=d.normalized_domain) or
        (d.country<>'' and prior->'candidate'->>'country'=d.country and
          lower(regexp_replace(btrim(prior->'candidate'->>'company_name'),'\s+',' ','g'))=lower(regexp_replace(btrim(d.company_name),'\s+',' ','g'))))
      order by (prior->>'row')::int limit 1;
    within_duplicate:=created_id is not null;
    candidate_id:=coalesce(candidate_id,created_id);
    if ((match_row->>'match_count')::int>0 or within_duplicate) and r->>'decision'<>'keep' then
      raise exception 'Duplicate requires explicit review' using errcode='PT409'; end if;
    insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,country,city,industry,business_type,
      product_categories,secondary_categories,market_segments,positioning,short_description,research_summary,potential_services,
      opportunity_signals,suggested_pitch_angle,fit,fit_reason,research_confidence,sources,field_provenance,source_origin,last_researched_at,
      research_status,duplicate_company_id,duplicate_candidate_id,duplicate_checked_at)
    values(p_owner,d.company_name,d.website,d.normalized_domain,d.country,d.city,d.industry,d.business_type,
      d.product_categories,d.secondary_categories,d.market_segments,d.positioning,d.short_description,d.research_summary,d.potential_services,
      d.opportunity_signals,d.suggested_pitch_angle,d.fit,d.fit_reason,d.research_confidence,d.sources,d.field_provenance,d.source_origin,d.last_researched_at,
      case when (match_row->>'match_count')::int>0 or within_duplicate then 'DUPLICATE' else 'NEW' end,company_id,candidate_id,clock_timestamp())
    returning id into created_id;
    ids:=ids||jsonb_build_array(created_id);
    row_ids:=row_ids||jsonb_build_object(r->>'row',created_id);
  end loop;
  result:=jsonb_build_object('imported',jsonb_array_length(ids),'skipped',skipped,'candidate_ids',ids);
  insert into crm_private.research_import_batches(owner_id,id,payload_hash,result) values(p_owner,p_id,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_import(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.crm_research_import(uuid,uuid,text,jsonb,jsonb) to service_role;
