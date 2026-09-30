-- A stable request key makes retrying a manual client creation safe.
alter table public.crm_clients add column creation_request_id uuid;
create unique index crm_clients_creation_request_idx on public.crm_clients(owner_id,creation_request_id) where creation_request_id is not null;
grant insert(creation_request_id) on public.crm_clients to authenticated;

create function public.crm_create_client(p_request_id uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_company public.crm_companies; v_client public.crm_clients;
begin
 if v_owner is null or not exists(select 1 from public.presentation_admins where user_id=v_owner and role='owner') then
  raise exception 'Access denied' using errcode='42501';
 end if;
 if p_request_id is null or p_data is null or jsonb_typeof(p_data)<>'object' then
  raise exception 'Invalid client request' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||p_request_id::text,0));
 select * into v_client from public.crm_clients where owner_id=v_owner and creation_request_id=p_request_id;
 if found then
  select * into v_company from public.crm_companies where id=v_client.company_id and owner_id=v_owner;
  return jsonb_build_object('company',to_jsonb(v_company),'item',to_jsonb(v_client));
 end if;
 -- An existing client starts directly at the final relationship stage. There are
 -- no intermediate pipeline moves, won date, deal amounts or invented revenue.
 insert into public.crm_companies(owner_id,company_name,website,industry,short_description,lead_source,pipeline_status)
 values(v_owner,btrim(coalesce(p_data->>'company_name','')),btrim(coalesce(p_data->>'website','')),
  btrim(coalesce(p_data->>'industry','')),btrim(coalesce(p_data->>'short_description','')),'Existing contact','WON')
 returning * into v_company;
 insert into public.crm_clients(company_id,owner_id,creation_request_id)
 values(v_company.id,v_owner,p_request_id) returning * into v_client;
 return jsonb_build_object('company',to_jsonb(v_company),'item',to_jsonb(v_client));
end;
$$;
revoke all on function public.crm_create_client(uuid,jsonb) from public,anon;
grant execute on function public.crm_create_client(uuid,jsonb) to authenticated;
