-- Phase 3C.1: bounded read tools. These invoker functions use the caller's
-- current owner membership and existing RLS; they never read contacts or notes.
create function public.crm_tool_search_leads(p_filters jsonb default '{}',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  tool_owner uuid:=auth.uid();
  filter record;
  query_text text;
  sort_by text;
  archive_mode text;
  result jsonb;
begin
  if tool_owner is null or not exists(select 1 from public.presentation_admins where user_id=tool_owner and role='owner') then
    raise exception 'Read-tool access denied' using errcode='42501';
  end if;
  if p_page is null or p_page<1 or p_page>10000 or p_filters is null or jsonb_typeof(p_filters)<>'object' then
    raise exception 'Invalid read-tool filters or page' using errcode='22023';
  end if;
  for filter in select key,value from jsonb_each(p_filters) loop
    if filter.key not in ('q','country','industry','fit','service','pipeline_status','archived','sort')
      or jsonb_typeof(filter.value)<>'string'
      or length(filter.value#>>'{}')>(case when filter.key='q' then 160 when filter.key='country' then 2 else 120 end)
      or (filter.value#>>'{}') ~ '[[:cntrl:]]' then
      raise exception 'Invalid read-tool filter' using errcode='22023';
    end if;
  end loop;
  if (p_filters ? 'country' and (p_filters->>'country') !~ '^[A-Z]{2}$')
    or (p_filters ? 'fit' and p_filters->>'fit' not in ('LOW','MEDIUM','HIGH'))
    or (p_filters ? 'service' and p_filters->>'service' not in ('Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation'))
    or (p_filters ? 'pipeline_status' and p_filters->>'pipeline_status' not in ('NEW_LEAD','QUALIFIED','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'))
    or (p_filters ? 'archived' and p_filters->>'archived' not in ('active','archived','all'))
    or (p_filters ? 'sort' and p_filters->>'sort' not in ('name','updated')) then
    raise exception 'Invalid read-tool filter value' using errcode='22023';
  end if;
  query_text:=lower(btrim(coalesce(p_filters->>'q','')));
  sort_by:=coalesce(p_filters->>'sort','name');
  archive_mode:=coalesce(p_filters->>'archived','active');
  with matched as materialized (
    select c.id,c.company_name,c.website,c.country,c.city,c.industry,c.short_description,
      c.services,c.fit,c.pipeline_status,c.archived_at,c.version,c.updated_at
    from public.crm_companies c
    where c.owner_id=tool_owner
      and (case archive_mode when 'all' then true when 'archived' then c.archived_at is not null else c.archived_at is null end)
      -- Literal company-name search avoids contact/email and free-text side channels.
      and (query_text='' or strpos(lower(c.company_name),query_text)>0)
      and (not p_filters ? 'country' or c.country=p_filters->>'country')
      and (coalesce(btrim(p_filters->>'industry'),'')='' or lower(c.industry)=lower(btrim(p_filters->>'industry')))
      and (not p_filters ? 'fit' or c.fit=p_filters->>'fit')
      and (not p_filters ? 'service' or (p_filters->>'service')=any(c.services))
      and (not p_filters ? 'pipeline_status' or c.pipeline_status=p_filters->>'pipeline_status')
  ), paged as (
    select * from matched order by
      case when sort_by='name' then lower(company_name) end asc,
      case when sort_by='updated' then updated_at end desc,
      id asc
    limit 25 offset (p_page-1)*25
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg((to_jsonb(p)-'updated_at')||jsonb_build_object('is_client',
      exists(select 1 from public.crm_clients cl where cl.company_id=p.id and cl.owner_id=tool_owner))
      order by case when sort_by='name' then lower(p.company_name) end asc,
        case when sort_by='updated' then p.updated_at end desc,p.id asc) from paged p),'[]'::jsonb),
    'total',(select count(*) from matched),'page',p_page,'pageSize',25,
    'hasMore',(select count(*) from matched)>p_page*25) into result;
  return result;
end;
$$;
revoke all on function public.crm_tool_search_leads(jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_tool_search_leads(jsonb,integer) to authenticated;

create function public.crm_tool_rejected_domains(p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare tool_owner uuid:=auth.uid(); result jsonb;
begin
  if tool_owner is null or not exists(select 1 from public.presentation_admins where user_id=tool_owner and role='owner') then
    raise exception 'Read-tool access denied' using errcode='42501';
  end if;
  if p_page is null or p_page<1 or p_page>10000 then
    raise exception 'Invalid rejected-domain page' using errcode='22023';
  end if;
  with domains as materialized (
    select distinct c.normalized_domain as domain from public.crm_research_candidates c
    where c.owner_id=tool_owner and c.research_status='REJECTED' and c.normalized_domain<>''
  ), paged as (
    select domain from domains order by domain collate "C" limit 100 offset (p_page-1)*100
  )
  select jsonb_build_object(
    'domains',coalesce((select jsonb_agg(domain order by domain collate "C") from paged),'[]'::jsonb),
    'total',(select count(*) from domains),'page',p_page,'pageSize',100,
    'hasMore',(select count(*) from domains)>p_page*100) into result;
  return result;
end;
$$;
revoke all on function public.crm_tool_rejected_domains(integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_tool_rejected_domains(integer) to authenticated;
