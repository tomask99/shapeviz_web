-- Rollback-only fixtures. No real leads or research are modified.
begin;
select set_config('research.test_owner',gen_random_uuid()::text,true);
select set_config('research.test_other',gen_random_uuid()::text,true);
select set_config('research.test_nonadmin',gen_random_uuid()::text,true);
select set_config('research.test_candidate',gen_random_uuid()::text,true);
select set_config('research.test_company',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('research.test_owner')::uuid),(current_setting('research.test_other')::uuid),(current_setting('research.test_nonadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('research.test_owner')::uuid,'owner'),(current_setting('research.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.test_other'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name) values(current_setting('research.test_company')::uuid,current_setting('research.test_other')::uuid,'Other-owner research fixture company');

insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,industry,business_type,
  product_categories,secondary_categories,market_segments,short_description,fit,fit_reason,research_confidence,research_status,source_origin,
  potential_services,opportunity_signals,suggested_pitch_angle,sources,field_provenance)
values(current_setting('research.test_candidate')::uuid,current_setting('research.test_owner')::uuid,'Research %_ Fixture',
  'https://research.example','research.example','CZ','Furniture','Manufacturer',array['Sofas'],array['Armchairs'],array['Architects'],
  'Configurable upholstered products','HIGH','Reusable 3D product assets','MEDIUM','NEEDS_REVIEW','CHATGPT',
  '[{"service":"Product CGI","relevance":"HIGH"},{"service":"Animation","relevance":"MEDIUM"}]',
  '[{"signal":"MULTIPLE_FABRICS","confidence":"MEDIUM","evidence":"Several fabrics listed","status":"INFERRED","source_urls":["https://research.example/products"]}]',
  'Build a reusable asset library',
  '[{"url":"https://research.example/products","title":"Private source","source_type":"Product Page","supports":["product_categories"]}]',
  '{"product_categories":{"status":"VERIFIED","source_urls":["https://research.example/products"]}}');
insert into public.crm_research_candidates(owner_id,company_name) select current_setting('research.test_owner')::uuid,'Filler '||n from generate_series(1,26) n;
insert into public.crm_research_candidates(owner_id,company_name,research_summary) values
  (current_setting('research.test_other')::uuid,'Other owner candidate','Secret research'),
  (current_setting('research.test_nonadmin')::uuid,'Non-admin candidate','Unprivileged research');

do $test$
begin
  begin
    update public.crm_research_candidates set duplicate_company_id=current_setting('research.test_company')::uuid where id=current_setting('research.test_candidate')::uuid;
    raise exception 'Cross-owner duplicate link allowed';
  exception when foreign_key_violation then null; end;
  begin
    update public.crm_research_candidates set owner_id=current_setting('research.test_other')::uuid where id=current_setting('research.test_candidate')::uuid;
    raise exception 'Research owner reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.crm_research_candidates(owner_id,company_name,fit) values(current_setting('research.test_owner')::uuid,'Unexplained Fit','HIGH');
    raise exception 'Unexplained Fit persisted';
  exception when check_violation then null; end;
end;
$test$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare result jsonb; row_data jsonb; first_page jsonb; second_page jsonb; n integer; key text;
begin
  if (select count(*) from public.crm_research_candidates)<>27 then raise exception 'Owner scope failed'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=current_setting('research.test_candidate')::uuid and source_count=1 and signal_count=1 and country_category='CZ') then raise exception 'Derived fields failed'; end if;
  result:=public.crm_research_list('{"q":"%_","country":"CZ","country_category":"CZ","industry":"furniture","business_type":"Manufacturer","product_category":"Armchairs","market_segment":"Architects","fit":"HIGH","research_confidence":"MEDIUM","research_status":"NEEDS_REVIEW","potential_service":"Product CGI","opportunity_signal":"MULTIPLE_FABRICS","source_origin":"CHATGPT","duplicate_status":"unchecked","last_researched":"never"}',1);
  if (result->>'total')::int<>1 then raise exception 'Combined filters / literal search failed: %',result; end if;
  row_data:=result->'items'->0;
  if row_data->>'id'<>current_setting('research.test_candidate') then raise exception 'Wrong filtered candidate'; end if;
  if row_data ?| array['owner_id','sources','field_provenance','opportunity_signals','research_summary','search_text'] then raise exception 'List loads private detail payloads unnecessarily'; end if;
  if row_data->'best_services'<>'["Product CGI"]'::jsonb or row_data->'top_signals'<>'["MULTIPLE_FABRICS"]'::jsonb then raise exception 'Card projection failed'; end if;
  foreach key in array array['research.example','upholstered','Sofas','Furniture','asset library','Product CGI'] loop
    if (public.crm_research_list(jsonb_build_object('q',key),1)->>'total')::int<>1 then raise exception 'Search failed for %',key; end if;
  end loop;
  foreach key in array array['fit','confidence','signals'] loop
    if public.crm_research_list(jsonb_build_object('sort',key),1)->'items'->0->>'id'<>current_setting('research.test_candidate') then raise exception 'Sorting failed for %',key; end if;
  end loop;
  first_page:=public.crm_research_list('{}',1); second_page:=public.crm_research_list('{}',2);
  if jsonb_array_length(first_page->'items')<>25 or jsonb_array_length(second_page->'items')<>2 or (first_page->>'total')::int<>27 then raise exception 'Pagination failed'; end if;
  select count(distinct r->>'id') into n from jsonb_array_elements((first_page->'items')||(second_page->'items')) r;
  if n<>27 then raise exception 'Pagination overlaps'; end if;
  if public.crm_research_list('{}',3)->'items'<>'[]'::jsonb then raise exception 'Empty page failed'; end if;
  if (public.crm_research_list('{"duplicate_status":"clear"}',1)->>'total')::int<>0 then raise exception 'Unchecked data presented as duplicate-free'; end if;
  if (public.crm_research_list('{"q":"does not exist"}',1)->>'total')::int<>0 then raise exception 'Empty search failed'; end if;
  if (public.crm_research_list('{"q":"Other owner candidate"}',1)->>'total')::int<>0 then raise exception 'Search leaks another owner'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=current_setting('research.test_candidate')::uuid and sources->0->>'title'='Private source') then raise exception 'Owner detail inaccessible'; end if;
  begin
    perform public.crm_research_list('{"owner_id":"spoof"}',1); raise exception 'Unknown filter accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.crm_research_list('{"fit":42}',1); raise exception 'Wrong filter type accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.crm_research_list('{}',0); raise exception 'Invalid page accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.crm_research_candidates(owner_id,company_name) values(auth.uid(),'Bypass'); raise exception 'Direct user insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.crm_research_candidates set research_status='APPROVED' where id=current_setting('research.test_candidate')::uuid; raise exception 'Direct user approval allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.crm_research_candidates where id=current_setting('research.test_candidate')::uuid; raise exception 'Direct user deletion allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.test_other'),'role','authenticated')::text,true);
do $test$
begin
  if (public.crm_research_list('{}',1)->>'total')::int<>1 then raise exception 'Other owner listing failed'; end if;
  if exists(select 1 from public.crm_research_candidates where id=current_setting('research.test_candidate')::uuid) then raise exception 'Cross-owner detail exposed'; end if;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.test_nonadmin'),'role','authenticated')::text,true);
do $test$
begin
  if exists(select 1 from public.crm_research_candidates) or (public.crm_research_list('{}',1)->>'total')::int<>0 then raise exception 'Non-admin research access allowed'; end if;
end;
$test$;
reset role;
delete from public.presentation_admins where user_id=current_setting('research.test_owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
begin
  if exists(select 1 from public.crm_research_candidates) or (public.crm_research_list('{}',1)->>'total')::int<>0 then raise exception 'Removed admin retains research access'; end if;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform count(*) from public.crm_research_candidates; raise exception 'Anonymous detail access allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.crm_research_list('{}',1); raise exception 'Anonymous research RPC allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
select 'Research RLS, read-only grants, source privacy, filters, sorting and pagination passed; fixtures rolled back' as result;
