-- Phase 3A.2: private, read-only research inbox. Writes/approval arrive in later stages.
-- Research sources and provenance stay in the same owner-scoped row.
create table public.crm_research_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  company_name text not null check (length(btrim(company_name)) between 1 and 160),
  normalized_company_name text generated always as (lower(regexp_replace(btrim(company_name),'\s+',' ','g'))) stored,
  website text not null default '' check (length(website)<=2048 and (website='' or website ~ '^https?://')),
  -- Supplied by the shared JS URL parser when a validated proposal is persisted.
  normalized_domain text not null default '' check (length(normalized_domain)<=253 and normalized_domain=lower(normalized_domain)),
  country text not null default '' check (country='' or country ~ '^[A-Z]{2}$'),
  country_category text generated always as (case when country in ('SK','CZ') then country else 'INT' end) stored,
  city text not null default '' check (length(city)<=120),
  industry text not null default '' check (length(industry)<=120),
  business_type text not null default '' check (length(business_type)<=120),
  product_categories text[] not null default '{}' check (cardinality(product_categories)<=30 and array_position(product_categories,null) is null),
  secondary_categories text[] not null default '{}' check (cardinality(secondary_categories)<=30 and array_position(secondary_categories,null) is null),
  market_segments text[] not null default '{}' check (cardinality(market_segments)<=30 and array_position(market_segments,null) is null),
  positioning jsonb not null default '{"value":"","status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}' check (jsonb_typeof(positioning)='object'),
  short_description text not null default '' check (length(short_description)<=3000),
  research_summary text not null default '' check (length(research_summary)<=12000),
  potential_services jsonb not null default '[]' check (jsonb_typeof(potential_services)='array' and jsonb_array_length(potential_services)<=14),
  opportunity_signals jsonb not null default '[]' check (jsonb_typeof(opportunity_signals)='array' and jsonb_array_length(opportunity_signals)<=25),
  signal_count integer generated always as (jsonb_array_length(opportunity_signals)) stored,
  suggested_pitch_angle text not null default '' check (length(suggested_pitch_angle)<=6000),
  fit text check (fit in ('LOW','MEDIUM','HIGH')),
  fit_reason text not null default '' check (length(fit_reason)<=3000),
  research_confidence text check (research_confidence in ('LOW','MEDIUM','HIGH')),
  sources jsonb not null default '[]' check (jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=50),
  source_count integer generated always as (jsonb_array_length(sources)) stored,
  field_provenance jsonb not null default '{}' check (jsonb_typeof(field_provenance)='object'),
  source_origin text not null default 'IMPORT' check (source_origin in ('CHATGPT','MANUAL','IMPORT','SIMILAR_COMPANY','ENRICHMENT','OTHER')),
  last_researched_at timestamptz,
  research_status text not null default 'NEW' check (research_status in ('NEW','RESEARCHED','NEEDS_REVIEW','NEEDS_MORE_RESEARCH','APPROVED','REJECTED','DUPLICATE')),
  duplicate_company_id uuid,
  duplicate_checked_at timestamptz,
  rejection_reason text not null default '' check (length(rejection_reason)<=3000),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  search_text text not null default '',
  unique(id,owner_id),
  foreign key(duplicate_company_id,owner_id) references public.crm_companies(id,owner_id),
  check ((website='')=(normalized_domain='')),
  check ((fit is null and btrim(fit_reason)='') or (fit is not null and btrim(fit_reason)<>''))
);

create index crm_research_owner_created_idx on public.crm_research_candidates(owner_id,created_at desc,id);
create index crm_research_owner_domain_idx on public.crm_research_candidates(owner_id,normalized_domain) where normalized_domain<>'';
create index crm_research_owner_name_country_idx on public.crm_research_candidates(owner_id,normalized_company_name,country);
create index crm_research_owner_status_idx on public.crm_research_candidates(owner_id,research_status);
create index crm_research_owner_fit_idx on public.crm_research_candidates(owner_id,fit);
create index crm_research_owner_country_idx on public.crm_research_candidates(owner_id,country);
create index crm_research_owner_industry_idx on public.crm_research_candidates(owner_id,industry);
create index crm_research_owner_researched_idx on public.crm_research_candidates(owner_id,last_researched_at desc,id);
create index crm_research_duplicate_company_idx on public.crm_research_candidates(duplicate_company_id,owner_id);
create index crm_research_services_idx on public.crm_research_candidates using gin(potential_services jsonb_path_ops);
create index crm_research_signals_idx on public.crm_research_candidates using gin(opportunity_signals jsonb_path_ops);

alter table public.crm_research_candidates enable row level security;
revoke all on public.crm_research_candidates from public,anon,authenticated;
grant select on public.crm_research_candidates to authenticated;
grant select,insert,update,delete on public.crm_research_candidates to service_role;
create policy crm_research_read on public.crm_research_candidates for select to authenticated
using (owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
-- No authenticated INSERT/UPDATE/DELETE grants or policies in this read-only stage.

create function crm_private.research_prepare() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.version:=1; new.created_at:=clock_timestamp(); new.updated_at:=new.created_at;
  else
    if new.id<>old.id or new.owner_id<>old.owner_id then raise exception 'Research identity is immutable' using errcode='42501'; end if;
    new.version:=old.version+1; new.created_at:=old.created_at; new.updated_at:=clock_timestamp();
  end if;
  new.search_text:=lower(new.company_name||' '||new.normalized_domain||' '||new.short_description||' '||new.industry||' '||
    new.business_type||' '||array_to_string(new.product_categories,' ')||' '||array_to_string(new.secondary_categories,' ')||' '||
    array_to_string(new.market_segments,' ')||' '||new.suggested_pitch_angle||' '||
    coalesce((select string_agg(s->>'service',' ') from jsonb_array_elements(new.potential_services) s),''));
  return new;
end;
$$;
revoke all on function crm_private.research_prepare() from public,anon,authenticated,service_role;
create trigger crm_research_before before insert or update on public.crm_research_candidates
for each row execute function crm_private.research_prepare();

-- Read-only invoker RPC; RLS and explicit owner filtering both apply.
create function public.crm_research_list(p_filters jsonb default '{}',p_page integer default 1) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare f record; sort_by text:=coalesce(nullif(p_filters->>'sort',''),'newest'); result jsonb;
begin
  if p_page is null or p_page<1 or p_page>10000 or p_filters is null or jsonb_typeof(p_filters)<>'object' then
    raise exception 'Invalid research filters or page' using errcode='22023';
  end if;
  for f in select key,value from jsonb_each(p_filters) loop
    if f.key not in ('q','country','country_category','industry','business_type','product_category','market_segment','fit',
      'research_confidence','research_status','potential_service','opportunity_signal','source_origin','duplicate_status','last_researched','sort')
      or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>(case when f.key='q' then 160 else 120 end) then
      raise exception 'Invalid research filter' using errcode='22023';
    end if;
  end loop;
  if sort_by not in ('newest','fit','researched','name','country','confidence','signals')
    or coalesce(p_filters->>'fit','') not in ('','LOW','MEDIUM','HIGH')
    or coalesce(p_filters->>'research_confidence','') not in ('','LOW','MEDIUM','HIGH')
    or coalesce(p_filters->>'research_status','') not in ('','NEW','RESEARCHED','NEEDS_REVIEW','NEEDS_MORE_RESEARCH','APPROVED','REJECTED','DUPLICATE')
    or coalesce(p_filters->>'source_origin','') not in ('','CHATGPT','MANUAL','IMPORT','SIMILAR_COMPANY','ENRICHMENT','OTHER')
    or coalesce(p_filters->>'country_category','') not in ('','SK','CZ','INT')
    or coalesce(p_filters->>'country','') !~ '^([A-Z]{2})?$'
    or coalesce(p_filters->>'duplicate_status','') not in ('','unchecked','possible','clear')
    or coalesce(p_filters->>'last_researched','') not in ('','never','last30','older30') then
    raise exception 'Invalid research filter value' using errcode='22023';
  end if;
  with matched as materialized (
    select c.id,c.company_name,c.normalized_domain,c.country,c.country_category,c.city,c.industry,c.business_type,
      c.product_categories,c.market_segments,c.positioning->>'value' as positioning_value,c.positioning->>'status' as positioning_status,
      c.fit,c.research_confidence,c.research_status,c.source_origin,c.source_count,c.signal_count,c.created_at,c.last_researched_at,
      c.duplicate_company_id,c.duplicate_checked_at,
      left(coalesce(nullif(c.short_description,''),c.research_summary),260) as summary,
      array(select s->>'service' from jsonb_array_elements(c.potential_services) s
        where s->>'relevance'='HIGH' or (s->>'relevance'='MEDIUM' and not c.potential_services @> '[{"relevance":"HIGH"}]')
        order by s->>'service' limit 3) as best_services,
      array(select s.value->>'signal' from jsonb_array_elements(c.opportunity_signals) with ordinality s(value,ord)
        order by s.ord limit 3) as top_signals
    from public.crm_research_candidates c
    where c.owner_id=(select auth.uid())
      and (coalesce(p_filters->>'q','')='' or strpos(c.search_text,lower(btrim(p_filters->>'q')))>0)
      and (coalesce(p_filters->>'country','')='' or c.country=p_filters->>'country')
      and (coalesce(p_filters->>'country_category','')='' or c.country_category=p_filters->>'country_category')
      and (coalesce(p_filters->>'industry','')='' or lower(c.industry)=lower(p_filters->>'industry'))
      and (coalesce(p_filters->>'business_type','')='' or lower(c.business_type)=lower(p_filters->>'business_type'))
      and (coalesce(p_filters->>'product_category','')='' or p_filters->>'product_category'=any(c.product_categories||c.secondary_categories))
      and (coalesce(p_filters->>'market_segment','')='' or p_filters->>'market_segment'=any(c.market_segments))
      and (coalesce(p_filters->>'fit','')='' or c.fit=p_filters->>'fit')
      and (coalesce(p_filters->>'research_confidence','')='' or c.research_confidence=p_filters->>'research_confidence')
      and (coalesce(p_filters->>'research_status','')='' or c.research_status=p_filters->>'research_status')
      and (coalesce(p_filters->>'source_origin','')='' or c.source_origin=p_filters->>'source_origin')
      and (coalesce(p_filters->>'potential_service','')='' or c.potential_services @> jsonb_build_array(jsonb_build_object('service',p_filters->>'potential_service')))
      and (coalesce(p_filters->>'opportunity_signal','')='' or c.opportunity_signals @> jsonb_build_array(jsonb_build_object('signal',p_filters->>'opportunity_signal')))
      and (coalesce(p_filters->>'last_researched','')='' or
        (p_filters->>'last_researched'='never' and c.last_researched_at is null) or
        (p_filters->>'last_researched'='last30' and c.last_researched_at>=now()-interval '30 days') or
        (p_filters->>'last_researched'='older30' and c.last_researched_at<now()-interval '30 days'))
      and (coalesce(p_filters->>'duplicate_status','')='' or
        (p_filters->>'duplicate_status'='unchecked' and c.duplicate_checked_at is null and c.duplicate_company_id is null and c.research_status<>'DUPLICATE') or
        (p_filters->>'duplicate_status'='possible' and (c.duplicate_company_id is not null or c.research_status='DUPLICATE')) or
        (p_filters->>'duplicate_status'='clear' and c.duplicate_checked_at is not null and c.duplicate_company_id is null and c.research_status<>'DUPLICATE'))
  ), page_rows as (
    select * from matched order by
      case when sort_by='fit' then case fit when 'HIGH' then 3 when 'MEDIUM' then 2 when 'LOW' then 1 else 0 end end desc,
      case when sort_by='confidence' then case research_confidence when 'HIGH' then 3 when 'MEDIUM' then 2 when 'LOW' then 1 else 0 end end desc,
      case when sort_by='researched' then last_researched_at end desc nulls last,
      case when sort_by='name' then lower(company_name) end asc,
      case when sort_by='country' then nullif(country,'') end asc nulls last,
      case when sort_by='signals' then signal_count end desc,
      created_at desc,id
    limit 25 offset (p_page-1)*25
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page_rows p),'[]'::jsonb),
    'total',(select count(*) from matched),'page',p_page,'pageSize',25) into result;
  return result;
end;
$$;
revoke all on function public.crm_research_list(jsonb,integer) from public,anon;
grant execute on function public.crm_research_list(jsonb,integer) to authenticated;
