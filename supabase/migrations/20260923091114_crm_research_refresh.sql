-- Selected, reviewed research updates share the existing owner lock and ledger.
-- No new browser write grants, tables, candidate copies or Lead mutations.
alter table public.crm_research_events drop constraint crm_research_events_event_type_check;
alter table public.crm_research_events add constraint crm_research_events_event_type_check
  check(event_type in ('candidate_updated','candidate_rejected','candidate_restored','candidate_approved','candidate_refreshed'));

create function public.crm_research_refresh(
  p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_candidate jsonb,
  p_mode text,p_selected text[],p_overrides text[]
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  c public.crm_research_candidates; d public.crm_research_candidates;
  previous crm_private.research_review_operations; result jsonb; changes text[];
  facts text[]:=array['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','short_description'];
  groups text[]:=facts||array['fit','positioning','research_summary','potential_services','opportunity_signals','suggested_pitch_angle','research_confidence','sources','last_researched_at'];
  fields text[]:=groups||array['fit_reason','field_provenance','source_origin','normalized_domain'];
  unknown_evidence jsonb:='{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}';
  key text; protected_groups text[]:='{}'; identity_changed boolean; old_data jsonb; new_data jsonb;
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_id is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or p_version is null or p_version<1 or coalesce(p_mode,'') not in ('deeper','refresh')
    or p_selected is null or cardinality(p_selected)<1 or cardinality(p_selected)>cardinality(groups)
    or array_position(p_selected,null) is not null or not p_selected<@groups
    or cardinality(p_selected)<>(select count(distinct value) from unnest(p_selected) value)
    or p_overrides is null or array_position(p_overrides,null) is not null or not p_overrides<@p_selected
    or cardinality(p_overrides)<>(select count(distinct value) from unnest(p_overrides) value) then
    raise exception 'Invalid research refresh request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Research operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into c from public.crm_research_candidates where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if c.version<>p_version or c.research_status in ('APPROVED','REJECTED') then
    raise exception 'Candidate changed or is closed for research updates' using errcode='PT409';
  end if;
  if p_candidate is null or jsonb_typeof(p_candidate)<>'object' or octet_length(p_candidate::text)>2000000
    or not p_candidate ?& fields or exists(select 1 from jsonb_object_keys(p_candidate) item where not item=any(fields)) then
    raise exception 'Invalid complete research candidate' using errcode='22023';
  end if;
  select * into d from jsonb_populate_record(null::public.crm_research_candidates,p_candidate);
  if d.normalized_domain is distinct from public.crm_normalized_domain(d.website)
    or (not 'website'=any(p_selected) and d.normalized_domain is distinct from c.normalized_domain) then
    raise exception 'Research domain must match the reviewed website' using errcode='22023';
  end if;
  if d.source_origin is distinct from c.source_origin or jsonb_typeof(d.field_provenance) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(d.field_provenance) item where not item=any(facts)) then
    raise exception 'Research origin or evidence fields changed' using errcode='22023';
  end if;
  old_data:=to_jsonb(c); new_data:=to_jsonb(d);
  foreach key in array groups loop
    if key=any(p_selected) then
      if key=any(c.manual_fields) or (key='fit' and 'fit_reason'=any(c.manual_fields))
        or (key=any(facts) and ('field_provenance'=any(c.manual_fields) or ('field_provenance.'||key)=any(c.manual_fields))) then
        protected_groups:=array_append(protected_groups,key);
      end if;
    else
      if new_data->key is distinct from old_data->key
        or (key='fit' and d.fit_reason is distinct from c.fit_reason)
        or (key=any(facts) and coalesce(d.field_provenance->key,unknown_evidence) is distinct from coalesce(c.field_provenance->key,unknown_evidence)) then
        raise exception 'Unselected research field changed' using errcode='22023';
      end if;
      -- Keep the stored representation of evidence for unselected fields too.
      if key=any(facts) then
        d.field_provenance:=d.field_provenance-key;
        if c.field_provenance ? key then d.field_provenance:=d.field_provenance||jsonb_build_object(key,c.field_provenance->key); end if;
      end if;
    end if;
  end loop;
  if not p_overrides @> protected_groups or not p_overrides <@ protected_groups then
    raise exception 'Explicit confirmation is required for selected manual fields' using errcode='22023';
  end if;
  -- Existing evidence sources are immutable in this workflow, including dates.
  -- New URLs append in order; the explicit source group cannot remove old ones.
  if jsonb_typeof(d.sources) is distinct from 'array' or jsonb_array_length(d.sources)>50
    or jsonb_array_length(d.sources)<jsonb_array_length(c.sources)
    or exists(select 1 from jsonb_array_elements(c.sources) with ordinality source(value,ord)
      where d.sources->(source.ord::integer-1) is distinct from source.value)
    or exists(select 1 from jsonb_array_elements(d.sources) source(value) group by source.value->>'url' having count(*)>1) then
    raise exception 'Keep existing sources and append distinct new source URLs' using errcode='22023';
  end if;
  if d.last_researched_at is distinct from c.last_researched_at and
    ((c.last_researched_at is not null and (d.last_researched_at is null or d.last_researched_at<c.last_researched_at))
      or d.last_researched_at>clock_timestamp()+interval '5 minutes') then
    raise exception 'Research date cannot move backward or into the future' using errcode='22023';
  end if;
  new_data:=to_jsonb(d);
  select coalesce(array_agg(key_name order by key_name),'{}') into changes from unnest(fields) key_name
    where key_name<>'normalized_domain' and new_data->key_name is distinct from old_data->key_name;
  identity_changed:=changes && array['company_name','website','country'];
  if cardinality(changes)>0 then
    update public.crm_research_candidates set company_name=d.company_name,website=d.website,normalized_domain=d.normalized_domain,
      country=d.country,city=d.city,industry=d.industry,business_type=d.business_type,
      product_categories=d.product_categories,secondary_categories=d.secondary_categories,market_segments=d.market_segments,
      positioning=d.positioning,short_description=d.short_description,research_summary=d.research_summary,
      potential_services=d.potential_services,opportunity_signals=d.opportunity_signals,suggested_pitch_angle=d.suggested_pitch_angle,
      fit=d.fit,fit_reason=d.fit_reason,research_confidence=d.research_confidence,sources=d.sources,field_provenance=d.field_provenance,
      last_researched_at=d.last_researched_at,
      research_status=case when c.research_status='DUPLICATE' and not identity_changed then 'DUPLICATE' else 'NEEDS_REVIEW' end,
      duplicate_checked_at=case when identity_changed then null else c.duplicate_checked_at end,
      duplicate_company_id=case when identity_changed then null else c.duplicate_company_id end,
      duplicate_candidate_id=case when identity_changed then null else c.duplicate_candidate_id end
    where id=p_id and owner_id=p_owner returning * into d;
    insert into public.crm_research_events(owner_id,candidate_id,event_type,metadata)
      values(p_owner,p_id,'candidate_refreshed',jsonb_build_object('mode',p_mode,'selected_fields',p_selected,
        'manual_overrides',p_overrides,'changed_fields',changes,'from_fit',c.fit,'to_fit',d.fit,
        'previous_researched_at',c.last_researched_at,'last_researched_at',d.last_researched_at));
  else d:=c; end if;
  result:=jsonb_build_object('candidate_id',p_id,'version',d.version);
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_refresh(uuid,uuid,uuid,text,integer,jsonb,text,text[],text[]) from public,anon,authenticated;
grant execute on function public.crm_research_refresh(uuid,uuid,uuid,text,integer,jsonb,text,text[],text[]) to service_role;
