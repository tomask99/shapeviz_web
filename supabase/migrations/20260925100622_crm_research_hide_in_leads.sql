-- Filter before counting and pagination; preserve invoker security and owner scope.
CREATE OR REPLACE FUNCTION public.crm_research_list(p_filters jsonb DEFAULT '{}'::jsonb, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare f record; sort_by text:=coalesce(nullif(p_filters->>'sort',''),'newest'); result jsonb;
begin
  if p_page is null or p_page<1 or p_page>10000 or p_filters is null or jsonb_typeof(p_filters)<>'object' then
    raise exception 'Invalid research filters or page' using errcode='22023';
  end if;
  for f in select key,value from jsonb_each(p_filters) loop
    if f.key not in ('q','country','country_category','industry','business_type','product_category','market_segment','fit',
      'research_confidence','research_status','potential_service','opportunity_signal','source_origin','duplicate_status','last_researched','hide_in_leads','sort')
      or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>(case when f.key='q' then 160 else 120 end) then
      raise exception 'Invalid research filter' using errcode='22023';
    end if;
  end loop;
  if sort_by not in ('newest','fit','researched','name','country','confidence','signals')
    or coalesce(p_filters->>'hide_in_leads','') not in ('','true','false')
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
      c.duplicate_company_id,c.duplicate_candidate_id,c.duplicate_checked_at,c.approved_company_id,
      left(coalesce(nullif(c.short_description,''),c.research_summary),260) as summary,
      array(select s->>'service' from jsonb_array_elements(c.potential_services) s
        where s->>'relevance'='HIGH' or (s->>'relevance'='MEDIUM' and not c.potential_services @> '[{"relevance":"HIGH"}]')
        order by s->>'service' limit 3) as best_services,
      array(select s.value->>'signal' from jsonb_array_elements(c.opportunity_signals) with ordinality s(value,ord)
        order by s.ord limit 3) as top_signals
    from public.crm_research_candidates c
    where c.owner_id=(select auth.uid())
      and (coalesce(p_filters->>'hide_in_leads','')<>'true' or c.approved_company_id is null)
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
        (p_filters->>'duplicate_status'='unchecked' and c.duplicate_checked_at is null and c.duplicate_company_id is null and c.duplicate_candidate_id is null and c.research_status<>'DUPLICATE') or
        (p_filters->>'duplicate_status'='possible' and ((c.duplicate_company_id is not null or c.duplicate_candidate_id is not null) or c.research_status='DUPLICATE')) or
        (p_filters->>'duplicate_status'='clear' and c.duplicate_checked_at is not null and c.duplicate_company_id is null and c.duplicate_candidate_id is null and c.research_status<>'DUPLICATE'))
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
$function$;
