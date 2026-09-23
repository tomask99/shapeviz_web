-- Phase 3A.4: reviewed edits, rejection and atomic approval. Browser roles still
-- cannot mutate research rows or call the service-only business transactions.
alter table public.crm_companies drop constraint crm_companies_services_check;
alter table public.crm_companies add constraint crm_companies_services_check check (
  cardinality(services)<=14 and array_position(services,null) is null and services <@
  array['Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation']::text[]);
alter table public.crm_companies drop constraint crm_companies_won_service_check;
alter table public.crm_companies add constraint crm_companies_won_service_check check (
  won_service in ('','Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation'));
alter table public.crm_companies drop constraint crm_companies_lead_source_check;
alter table public.crm_companies add constraint crm_companies_lead_source_check check (
  lead_source in ('Google','Instagram','LinkedIn','Referral','Existing contact','Trade fair / event','Inbound','Manual research','Other','AI Research'));

alter table public.crm_research_candidates add column approved_company_id uuid,
  add column manual_fields text[] not null default '{}';
alter table public.crm_research_candidates add constraint crm_research_approved_company_fk
  foreign key(approved_company_id,owner_id) references public.crm_companies(id,owner_id);
create unique index crm_research_approved_company_idx on public.crm_research_candidates(approved_company_id,owner_id) where approved_company_id is not null;
alter table public.crm_research_candidates add constraint crm_research_approval_consistency check (
  (research_status='APPROVED')=(approved_company_id is not null) and (approved_company_id is null)=(approved_at is null));

create table public.crm_research_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  candidate_id uuid not null,
  event_type text not null check(event_type in ('candidate_updated','candidate_rejected','candidate_restored','candidate_approved')),
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=50000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(candidate_id,owner_id) references public.crm_research_candidates(id,owner_id) on delete cascade
);
create index crm_research_events_candidate_idx on public.crm_research_events(candidate_id,owner_id,created_at desc,id);
alter table public.crm_research_events enable row level security;
revoke all on public.crm_research_events from public,anon,authenticated,service_role;
grant select on public.crm_research_events to authenticated;
grant select,insert on public.crm_research_events to service_role;
create policy crm_research_events_read on public.crm_research_events for select to authenticated using (
  owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));

create table crm_private.research_review_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,id)
);
alter table crm_private.research_review_operations enable row level security;
revoke all on crm_private.research_review_operations from public,anon,authenticated;
grant select,insert on crm_private.research_review_operations to service_role;

-- Share the same matching implementation. Exclude the current candidate inside
-- the full set, before ranking, count, display limit and fingerprint calculation.
do $$
declare definition text;
begin
  select pg_get_functiondef('crm_private.research_duplicate_rows(uuid,jsonb)'::regprocedure) into definition;
  if strpos(definition,'research_duplicate_rows(p_owner uuid, p_rows jsonb)')=0
    or strpos(definition,'from inputs i join public.crm_research_candidates c on c.owner_id=p_owner and (')=0 then
    raise exception 'Unexpected duplicate helper definition';
  end if;
  definition:=replace(definition,'research_duplicate_rows(p_owner uuid, p_rows jsonb)',
    'research_duplicate_matches(p_owner uuid, p_rows jsonb, p_exclude uuid)');
  definition:=replace(definition,'from inputs i join public.crm_research_candidates c on c.owner_id=p_owner and (',
    'from inputs i join public.crm_research_candidates c on c.owner_id=p_owner and c.id is distinct from p_exclude and (');
  definition:=replace(definition,'''match_count'',(select count(*) from matches m where m.row_num=i.row_num),',
    '''match_count'',(select count(*) from matches m where m.row_num=i.row_num), ''company_match_count'',(select count(*) from matches m where m.row_num=i.row_num and kind=''company''),');
  if strpos(definition,'''company_match_count''')=0 then raise exception 'Missing full company match count'; end if;
  execute definition;
end;
$$;
revoke all on function crm_private.research_duplicate_matches(uuid,jsonb,uuid) from public,anon;
grant execute on function crm_private.research_duplicate_matches(uuid,jsonb,uuid) to authenticated,service_role;
create or replace function crm_private.research_duplicate_rows(p_owner uuid,p_rows jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select coalesce(jsonb_agg(x.value-'company_match_count' order by x.ord),'[]')
  from jsonb_array_elements(crm_private.research_duplicate_matches(p_owner,p_rows,null)) with ordinality x(value,ord);
$$;

create function crm_private.research_review_matches(p_owner uuid,p_id uuid,p_version integer) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.crm_research_candidates; result jsonb;
begin
  if p_owner is null or (current_user<>'service_role' and p_owner is distinct from auth.uid())
    or not exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner') then
    raise exception 'Research access denied' using errcode='42501';
  end if;
  select * into c from public.crm_research_candidates where id=p_id and owner_id=p_owner;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if p_version is null or c.version<>p_version then raise exception 'Candidate changed' using errcode='PT409'; end if;
  result:=crm_private.research_duplicate_matches(p_owner,jsonb_build_array(jsonb_build_object('row',1,
    'normalized_domain',c.normalized_domain,'normalized_company_name',c.normalized_company_name,'country',c.country)),p_id);
  return (result->0)-'row';
end;
$$;
revoke all on function crm_private.research_review_matches(uuid,uuid,integer) from public,anon;
grant execute on function crm_private.research_review_matches(uuid,uuid,integer) to authenticated,service_role;
create function public.crm_research_review_duplicates(p_id uuid,p_version integer) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select crm_private.research_review_matches(auth.uid(),p_id,p_version);
$$;
revoke all on function public.crm_research_review_duplicates(uuid,integer) from public,anon,service_role;
grant execute on function public.crm_research_review_duplicates(uuid,integer) to authenticated;

create function public.crm_research_review(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_action text,p_version integer,p_candidate jsonb,p_reason text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.crm_research_candidates; d public.crm_research_candidates; previous crm_private.research_review_operations;
  changes text[]; identity_changed boolean; result jsonb; event_name text; details jsonb;
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_id is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or p_version is null or p_version<1 or coalesce(p_action,'') not in ('save','reject','restore')
    or p_reason is null or length(p_reason)>3000 then raise exception 'Invalid review request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Review operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into c from public.crm_research_candidates where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if c.version<>p_version or c.research_status='APPROVED' then raise exception 'Candidate changed or already approved' using errcode='PT409'; end if;
  if (p_action='restore') is distinct from (c.research_status='REJECTED') then raise exception 'Candidate state changed' using errcode='PT409'; end if;
  if p_action='save' then
    if p_candidate is null or jsonb_typeof(p_candidate)<>'object' or octet_length(p_candidate::text)>2000000 then raise exception 'Invalid candidate' using errcode='22023'; end if;
    select * into d from jsonb_populate_record(null::public.crm_research_candidates,p_candidate);
    select coalesce(array_agg(e.key order by e.key),'{}') into changes from jsonb_each(p_candidate) e
      where e.key<>'normalized_domain' and e.value is distinct from to_jsonb(c)->e.key;
    identity_changed:=changes && array['company_name','website','country'];
    if cardinality(changes)>0 then
      update public.crm_research_candidates set company_name=d.company_name,website=d.website,normalized_domain=d.normalized_domain,
        country=d.country,city=d.city,industry=d.industry,business_type=d.business_type,
        product_categories=d.product_categories,secondary_categories=d.secondary_categories,market_segments=d.market_segments,
        positioning=d.positioning,short_description=d.short_description,research_summary=d.research_summary,
        potential_services=d.potential_services,opportunity_signals=d.opportunity_signals,suggested_pitch_angle=d.suggested_pitch_angle,
        fit=d.fit,fit_reason=d.fit_reason,research_confidence=d.research_confidence,sources=d.sources,field_provenance=d.field_provenance,
        source_origin=d.source_origin,last_researched_at=d.last_researched_at,
        manual_fields=array(select distinct value from unnest(c.manual_fields||changes) value order by value),
        research_status=case when c.research_status='DUPLICATE' and not identity_changed then 'DUPLICATE' else 'NEEDS_REVIEW' end,
        duplicate_checked_at=case when identity_changed then null else c.duplicate_checked_at end,
        duplicate_company_id=case when identity_changed then null else c.duplicate_company_id end,
        duplicate_candidate_id=case when identity_changed then null else c.duplicate_candidate_id end
      where id=p_id and owner_id=p_owner returning * into d;
      event_name:='candidate_updated';
      details:=jsonb_build_object('changed_fields',changes,'from_fit',c.fit,'to_fit',d.fit);
    else d:=c; end if;
  elsif p_action='reject' then
    update public.crm_research_candidates set research_status='REJECTED',rejected_at=clock_timestamp(),rejection_reason=btrim(p_reason)
      where id=p_id and owner_id=p_owner returning * into d;
    event_name:='candidate_rejected'; details:=jsonb_build_object('reason',d.rejection_reason,'from_status',c.research_status);
  else
    update public.crm_research_candidates set research_status='NEEDS_REVIEW',rejected_at=null,rejection_reason=''
      where id=p_id and owner_id=p_owner returning * into d;
    event_name:='candidate_restored'; details:=jsonb_build_object('reason',c.rejection_reason,'from_status',c.research_status);
  end if;
  if event_name is not null then
    insert into public.crm_research_events(owner_id,candidate_id,event_type,metadata) values(p_owner,p_id,event_name,details);
  end if;
  result:=jsonb_build_object('candidate_id',p_id,'version',d.version);
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_review(uuid,uuid,uuid,text,text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_research_review(uuid,uuid,uuid,text,text,integer,jsonb,text) to service_role;

alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
  'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
  'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed',
  'presentation_assigned','presentation_unassigned','presentation_sent','reply_received','presentation_viewed','website_clicked','presentation_returned','ai_research_approved'));
create unique index crm_research_approval_activity_once on public.crm_activities(owner_id,(metadata->>'candidate_id')) where event_type='ai_research_approved';

create function public.crm_research_approve(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_lead jsonb,p_expected jsonb,p_acknowledge_duplicates boolean) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.crm_research_candidates; lead public.crm_companies; previous crm_private.research_review_operations;
  matches jsonb; snapshot jsonb; company_id uuid; duplicate_id uuid; next_version integer; result jsonb;
  old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_id is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is null or p_version<1
    or p_lead is null or jsonb_typeof(p_lead)<>'object' or octet_length(p_lead::text)>30000
    or p_expected is null or jsonb_typeof(p_expected)<>'object' or p_acknowledge_duplicates is null then
    raise exception 'Invalid approval request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Approval operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into c from public.crm_research_candidates where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if c.version<>p_version or c.research_status in ('APPROVED','REJECTED') then raise exception 'Candidate changed or closed' using errcode='PT409'; end if;
  matches:=crm_private.research_review_matches(p_owner,p_id,p_version);
  snapshot:=matches-'matches';
  if snapshot is distinct from p_expected then raise exception 'Duplicate review changed' using errcode='PT409'; end if;
  if (matches->>'company_match_count')::int>0 then raise exception 'Company already exists' using errcode='PT409'; end if;
  if (matches->>'match_count')::int>0 and not p_acknowledge_duplicates then raise exception 'Research duplicates need review' using errcode='PT409'; end if;
  select * into lead from jsonb_populate_record(null::public.crm_companies,p_lead);
  if lead.company_name is distinct from c.company_name or lead.website is distinct from c.website or lead.country is distinct from c.country
    or lead.city is distinct from c.city or lead.industry is distinct from c.industry or lead.short_description is distinct from c.short_description
    or lead.fit is distinct from c.fit or lead.lead_source is distinct from 'AI Research' or lead.pipeline_status is distinct from 'NEW_LEAD' then
    raise exception 'Reviewed Lead mapping differs from candidate' using errcode='22023'; end if;
  -- Existing company audit triggers require the owner identity. Set it narrowly
  -- after verified membership, then restore BOTH claim locations; do not weaken
  -- those triggers or allow ordinary callers to establish an identity.
  perform set_config('request.jwt.claim.sub',p_owner::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',p_owner,'role','authenticated')::text,true);
  insert into public.crm_companies(owner_id,company_name,website,country,city,industry,short_description,fit,services,priority,lead_source,pipeline_status)
    values(p_owner,c.company_name,c.website,c.country,c.city,c.industry,c.short_description,c.fit,lead.services,lead.priority,'AI Research','NEW_LEAD') returning id into company_id;
  insert into public.crm_activities(owner_id,company_id,event_type,metadata)
    values(p_owner,company_id,'ai_research_approved',jsonb_build_object('candidate_id',p_id,'name',c.company_name,'fit',c.fit,'source_origin',c.source_origin));
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  select (m->>'id')::uuid into duplicate_id from jsonb_array_elements(matches->'matches') m where m->>'kind'='candidate' limit 1;
  update public.crm_research_candidates set research_status='APPROVED',approved_company_id=company_id,approved_at=clock_timestamp(),
    duplicate_checked_at=clock_timestamp(),duplicate_company_id=null,duplicate_candidate_id=duplicate_id
    where id=p_id and owner_id=p_owner returning version into next_version;
  insert into public.crm_research_events(owner_id,candidate_id,event_type,metadata)
    values(p_owner,p_id,'candidate_approved',jsonb_build_object('company_id',company_id,'services',lead.services,'priority',lead.priority,'fit',c.fit));
  result:=jsonb_build_object('candidate_id',p_id,'company_id',company_id,'version',next_version);
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_approve(uuid,uuid,uuid,text,integer,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.crm_research_approve(uuid,uuid,uuid,text,integer,jsonb,jsonb,boolean) to service_role;

-- Include candidate duplicate links consistently in inbox metadata and filters.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_research_list(jsonb,integer)'::regprocedure) into definition;
  definition:=replace(definition,'c.duplicate_company_id,c.duplicate_checked_at',
    'c.duplicate_company_id,c.duplicate_candidate_id,c.duplicate_checked_at,c.approved_company_id');
  definition:=replace(definition,'c.duplicate_company_id is not null','(c.duplicate_company_id is not null or c.duplicate_candidate_id is not null)');
  definition:=replace(definition,'c.duplicate_company_id is null','c.duplicate_company_id is null and c.duplicate_candidate_id is null');
  execute definition;
end;
$$;
