-- Phase 3B.2c: accepted company Insight revisions and explicitly selected CRM
-- enrichment. Original approved candidates and operational CRM fields are kept.
create function crm_private.insight_evidence_valid(e jsonb,urls text[]) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;
begin
  if e is null or jsonb_typeof(e)<>'object' or not e ?& array['status','confidence','evidence','source_urls']
    or e-array['status','confidence','evidence','source_urls']<>'{}'::jsonb
    or coalesce(e->>'status','') not in ('VERIFIED','INFERRED','UNKNOWN')
    or (e->'confidence'<>'null'::jsonb and coalesce(e->>'confidence','') not in ('LOW','MEDIUM','HIGH'))
    or jsonb_typeof(e->'evidence') is distinct from 'string' or length(e->>'evidence')>3000
    or jsonb_typeof(e->'source_urls') is distinct from 'array' then return false; end if;
  if jsonb_array_length(e->'source_urls')>30 or (e->>'status'='VERIFIED' and jsonb_array_length(e->'source_urls')=0)
    or (e->>'status'='INFERRED' and btrim(e->>'evidence')='') then return false; end if;
  for v in select value from jsonb_array_elements(e->'source_urls') loop
    if jsonb_typeof(v)<>'string' or not (v#>>'{}'=any(urls)) then return false; end if;
  end loop;
  return (select count(*)=count(distinct value) from jsonb_array_elements(e->'source_urls'));
end;
$$;
revoke all on function crm_private.insight_evidence_valid(jsonb,text[]) from public,anon,authenticated;
grant execute on function crm_private.insight_evidence_valid(jsonb,text[]) to service_role;

create function crm_private.insight_research_valid(r jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare fields text[]:=array['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','positioning','short_description','research_summary','potential_services','opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence','sources','field_provenance','last_researched_at','source_origin'];
  facts text[]:=array['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','short_description'];
  f text; max_size integer; s jsonb; v jsonb; e jsonb; urls text[]:='{}'; seen text[]:='{}';
begin
  if r is null or jsonb_typeof(r)<>'object' or octet_length(r::text)>500000 or not r ?& fields or r-fields<>'{}'::jsonb
    or r->>'source_origin' is distinct from 'ENRICHMENT' then return false; end if;
  foreach f in array array['company_name','website','country','city','industry','business_type','short_description','research_summary','suggested_pitch_angle','fit_reason'] loop
    max_size:=case f when 'company_name' then 160 when 'website' then 2048 when 'country' then 2 when 'short_description' then 3000 when 'research_summary' then 12000 when 'suggested_pitch_angle' then 6000 when 'fit_reason' then 3000 else 120 end;
    if jsonb_typeof(r->f) is distinct from 'string' or length(r->>f)>max_size or r->>f<>btrim(r->>f) then return false; end if;
  end loop;
  if r->>'company_name'='' or (r->>'website'<>'' and r->>'website' !~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$')
    or (r->>'country'<>'' and r->>'country' !~ '^[A-Z]{2}$')
    or (r->'fit'<>'null'::jsonb and coalesce(r->>'fit','') not in ('LOW','MEDIUM','HIGH'))
    or ((r->'fit'='null'::jsonb)<>(r->>'fit_reason'=''))
    or (r->'research_confidence'<>'null'::jsonb and coalesce(r->>'research_confidence','') not in ('LOW','MEDIUM','HIGH'))
    or jsonb_typeof(r->'last_researched_at') not in ('string','null') then return false; end if;
  if r->>'last_researched_at' is not null and not isfinite((r->>'last_researched_at')::timestamptz) then return false; end if;
  foreach f in array array['product_categories','secondary_categories','market_segments'] loop
    if jsonb_typeof(r->f) is distinct from 'array' then return false; end if;
    if jsonb_array_length(r->f)>30 then return false; end if;
    seen:='{}';
    for v in select value from jsonb_array_elements(r->f) loop
      if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120 or lower(v#>>'{}')=any(seen) then return false; end if;
      seen:=array_append(seen,lower(v#>>'{}'));
    end loop;
  end loop;
  if jsonb_typeof(r->'sources') is distinct from 'array' then return false; end if;
  if jsonb_array_length(r->'sources') not between 1 and 50 then return false; end if;
  for s in select value from jsonb_array_elements(r->'sources') loop
    if jsonb_typeof(s)<>'object' or not s ?& array['url','title','source_type','retrieved_at','supports']
      or s-array['url','title','source_type','retrieved_at','supports']<>'{}'::jsonb
      or jsonb_typeof(s->'url') is distinct from 'string' or length(s->>'url') not between 1 and 2048
      or s->>'url' !~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$' or s->>'url'=any(urls)
      or jsonb_typeof(s->'title') is distinct from 'string' or length(s->>'title')>300
      or coalesce(s->>'source_type','') not in ('Company Website','About Page','Product Page','Contact Page','Professional / Architect Page','Download Page','Instagram','LinkedIn','Press Article','Other Public Source')
      or jsonb_typeof(s->'supports') is distinct from 'array' or jsonb_typeof(s->'retrieved_at') not in ('string','null') then return false; end if;
    if jsonb_array_length(s->'supports')>30 then return false; end if;
    if s->>'retrieved_at' is not null and not isfinite((s->>'retrieved_at')::timestamptz) then return false; end if;
    for v in select value from jsonb_array_elements(s->'supports') loop
      if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120 then return false; end if;
    end loop;
    urls:=array_append(urls,s->>'url');
  end loop;
  e:=r->'positioning';
  if jsonb_typeof(e) is distinct from 'object' or not e ? 'value' or jsonb_typeof(e->'value') is distinct from 'string'
    or length(e->>'value')>120 or not crm_private.insight_evidence_valid(e-'value',urls)
    or ((e->>'value'='')<>(e->>'status'='UNKNOWN')) then return false; end if;
  if jsonb_typeof(r->'field_provenance') is distinct from 'object' or not (r->'field_provenance') ?& facts
    or (r->'field_provenance')-facts<>'{}'::jsonb then return false; end if;
  foreach f in array facts loop
    e:=r->'field_provenance'->f;
    if not crm_private.insight_evidence_valid(e,urls)
      or (e->>'status'<>'UNKNOWN' and r->f in ('""'::jsonb,'[]'::jsonb)) then return false; end if;
  end loop;
  if jsonb_typeof(r->'potential_services') is distinct from 'array' or jsonb_typeof(r->'opportunity_signals') is distinct from 'array' then return false; end if;
  if jsonb_array_length(r->'potential_services')>14 or jsonb_array_length(r->'opportunity_signals')>25 then return false; end if;
  seen:='{}';
  for s in select value from jsonb_array_elements(r->'potential_services') loop
    if jsonb_typeof(s)<>'object' or not s ?& array['service','relevance','reason'] or s-array['service','relevance','reason']<>'{}'::jsonb
      or coalesce(s->>'service','') not in ('Product CGI','Archviz','Product Visualization','3D Modelling','3D Models for Architects','Social Content','Art Direction','AI Content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation')
      or coalesce(s->>'relevance','') not in ('LOW','MEDIUM','HIGH') or jsonb_typeof(s->'reason') is distinct from 'string'
      or length(btrim(s->>'reason')) not between 1 and 3000 or s->>'service'=any(seen) then return false; end if;
    seen:=array_append(seen,s->>'service');
  end loop;
  seen:='{}';
  for s in select value from jsonb_array_elements(r->'opportunity_signals') loop
    if jsonb_typeof(s)<>'object' or not s ? 'signal' or coalesce(s->>'signal','') not in (
      'LARGE_PRODUCT_CATALOG','PREMIUM_BRAND','DESIGN_FOCUSED','ACTIVE_INSTAGRAM','ACTIVE_SOCIAL_MEDIA','WEAK_PRODUCT_VISUALS','INCONSISTENT_VISUAL_IDENTITY','ARCHITECT_AUDIENCE','DESIGNER_AUDIENCE','MULTIPLE_SHOWROOMS','ECOMMERCE','CUSTOM_PRODUCTS','MULTIPLE_FINISHES','MULTIPLE_FABRICS','FREQUENT_COLLECTIONS','INTERNATIONAL_MARKET','NEW_COLLECTION','DOWNLOAD_SECTION','NO_3D_DOWNLOADS_FOUND','HAS_3D_DOWNLOADS','HAS_CAD_BIM_SECTION','PRODUCT_CONFIGURATOR','STRONG_VISUAL_CONTENT','VIDEO_CONTENT','OTHER')
      or coalesce(s->>'status','') not in ('VERIFIED','INFERRED') or coalesce(s->>'confidence','') not in ('LOW','MEDIUM','HIGH')
      or btrim(coalesce(s->>'evidence',''))='' or not crm_private.insight_evidence_valid(s-'signal',urls) or s->>'signal'=any(seen) then return false; end if;
    seen:=array_append(seen,s->>'signal');
  end loop;
  return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end;
$$;
revoke all on function crm_private.insight_research_valid(jsonb) from public,anon,authenticated;
grant execute on function crm_private.insight_research_valid(jsonb) to service_role;

create table public.crm_company_research (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  company_id uuid not null,
  company_version integer not null check(company_version>0),
  research jsonb not null check(crm_private.insight_research_valid(research)),
  selected_fields text[] not null default '{}' check(cardinality(selected_fields)<=5 and array_position(selected_fields,null) is null and selected_fields<@array['city','industry','short_description','services','fit']::text[]),
  overwritten_fields text[] not null default '{}' check(cardinality(overwritten_fields)<=5 and array_position(overwritten_fields,null) is null and overwritten_fields<@selected_fields),
  before_values jsonb not null default '{}' check(jsonb_typeof(before_values)='object' and before_values-array['city','industry','short_description','services','fit']='{}'::jsonb),
  after_values jsonb not null default '{}' check(jsonb_typeof(after_values)='object' and after_values-array['city','industry','short_description','services','fit']='{}'::jsonb),
  created_at timestamptz not null default clock_timestamp(),
  unique(company_id,company_version),
  foreign key(company_id,owner_id) references public.crm_companies(id,owner_id) on delete cascade
);
create index crm_company_research_history_idx on public.crm_company_research(company_id,owner_id,company_version desc,id);
alter table public.crm_company_research enable row level security;
revoke all on public.crm_company_research from public,anon,authenticated,service_role;
grant select on public.crm_company_research to authenticated;
grant select,insert,delete on public.crm_company_research to service_role;
create policy crm_company_research_read on public.crm_company_research for select to authenticated using(
  owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function crm_private.company_research_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Accepted company research is immutable' using errcode='42501'; end;
$$;
revoke all on function crm_private.company_research_immutable() from public,anon,authenticated,service_role;
create trigger crm_company_research_immutable before update on public.crm_company_research for each row execute function crm_private.company_research_immutable();

alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
  'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
  'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed',
  'presentation_assigned','presentation_unassigned','presentation_sent','reply_received','presentation_viewed','website_clicked','presentation_returned','ai_research_approved','ai_research_enriched'));
create unique index crm_research_enriched_activity_once on public.crm_activities(owner_id,(metadata->>'insight_id')) where event_type='ai_research_enriched';

create function public.crm_research_enrich(p_owner uuid,p_company uuid,p_operation uuid,p_hash text,p_version integer,p_research jsonb,p_patch jsonb,p_overrides text[]) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.crm_companies; previous crm_private.research_review_operations; latest public.crm_company_research;
  f text; expected jsonb; e jsonb; selected text[]; protected text[]:='{}'; before_data jsonb:='{}'; after_data jsonb:='{}';
  mapped_services jsonb; new_version integer; insight_id uuid; result jsonb;
  old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_company is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is null or p_version<1 then
    raise exception 'Invalid company enrichment request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Enrichment operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into c from public.crm_companies where id=p_company and owner_id=p_owner for update;
  if not found then raise exception 'Company not found' using errcode='PT404'; end if;
  if c.version<>p_version or c.archived_at is not null then raise exception 'Company changed or was archived; preview again' using errcode='PT409'; end if;
  if not crm_private.insight_research_valid(p_research) or p_patch is null or jsonb_typeof(p_patch)<>'object'
    or p_patch-array['city','industry','short_description','services','fit']<>'{}'::jsonb
    or p_overrides is null or cardinality(p_overrides)>5 or array_position(p_overrides,null) is not null
    or (select count(*) from unnest(p_overrides))<>(select count(distinct v) from unnest(p_overrides) v) then
    raise exception 'Invalid enrichment evidence or field selection' using errcode='22023'; end if;
  if p_research->>'company_name' is distinct from c.company_name or p_research->>'country' is distinct from c.country
    or public.crm_normalized_domain(p_research->>'website') is distinct from public.crm_normalized_domain(c.website) then
    raise exception 'Research identity does not match the current company' using errcode='22023'; end if;
  if p_research->>'last_researched_at' is not null and (p_research->>'last_researched_at')::timestamptz>clock_timestamp()+interval '5 minutes' then
    raise exception 'Last researched cannot be in the future' using errcode='22023'; end if;
  select coalesce(array_agg(key order by key),'{}'::text[]) into selected from jsonb_object_keys(p_patch) key;
  -- Ordered mapping is deliberately identical to the canonical service catalog.
  select coalesce(jsonb_agg(to_jsonb(case s->>'service'
    when 'Product Visualization' then 'Product visualization' when '3D Modelling' then '3D modelling'
    when '3D Models for Architects' then '3D models for architects' when 'Social Content' then 'Social content'
    when 'Art Direction' then 'Art direction' when 'AI Content' then 'AI content' else s->>'service' end) order by n),'[]'::jsonb)
    into mapped_services from jsonb_array_elements(p_research->'potential_services') with ordinality x(s,n);
  foreach f in array selected loop
    expected:=case when f='services' then mapped_services else p_research->f end;
    if expected in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) or p_patch->f is distinct from expected
      or to_jsonb(c)->f is not distinct from expected then raise exception 'Select only changed, populated research values' using errcode='22023'; end if;
    if f in ('city','industry','short_description') then
      e:=p_research->'field_provenance'->f;
      if e->>'status' is distinct from 'VERIFIED' or jsonb_array_length(e->'source_urls')=0 then
        raise exception 'Copied company facts require verified public evidence' using errcode='22023'; end if;
    end if;
    if to_jsonb(c)->f not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) then protected:=array_append(protected,f); end if;
    before_data:=before_data||jsonb_build_object(f,to_jsonb(c)->f); after_data:=after_data||jsonb_build_object(f,expected);
  end loop;
  if (select coalesce(array_agg(v order by v),'{}'::text[]) from unnest(p_overrides) v) is distinct from protected then
    raise exception 'Explicit replacement is required for exactly the selected occupied fields' using errcode='PT409'; end if;
  select * into latest from public.crm_company_research where company_id=p_company and owner_id=p_owner order by company_version desc,id desc limit 1;
  if found and cardinality(selected)=0 and latest.research=p_research then
    result:=jsonb_build_object('company_id',p_company,'version',c.version,'insight_id',latest.id,'no_change',true);
  else
    -- A report-only acceptance is still a material company-research revision.
    -- Advance the same version so every later company/report review detects it.
    perform set_config('request.jwt.claim.sub',p_owner::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',p_owner,'role','authenticated')::text,true);
    update public.crm_companies set
      city=case when p_patch ? 'city' then p_patch->>'city' else c.city end,
      industry=case when p_patch ? 'industry' then p_patch->>'industry' else c.industry end,
      short_description=case when p_patch ? 'short_description' then p_patch->>'short_description' else c.short_description end,
      services=case when p_patch ? 'services' then array(select jsonb_array_elements_text(p_patch->'services')) else c.services end,
      fit=case when p_patch ? 'fit' then p_patch->>'fit' else c.fit end
      where id=p_company and owner_id=p_owner returning version into new_version;
    perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
    perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
    insert into public.crm_company_research(owner_id,company_id,company_version,research,selected_fields,overwritten_fields,before_values,after_values)
      values(p_owner,p_company,new_version,p_research,selected,protected,before_data,after_data) returning id into insight_id;
    insert into public.crm_activities(owner_id,company_id,event_type,metadata) values(p_owner,p_company,'ai_research_enriched',
      jsonb_build_object('insight_id',insight_id,'changed_fields',selected,'overwritten_fields',protected,'previous_version',c.version,'company_version',new_version));
    result:=jsonb_build_object('company_id',p_company,'version',new_version,'insight_id',insight_id);
  end if;
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_enrich(uuid,uuid,uuid,text,integer,jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.crm_research_enrich(uuid,uuid,uuid,text,integer,jsonb,jsonb,text[]) to service_role;
