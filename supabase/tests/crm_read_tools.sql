-- Rollback-only fixtures for the authenticated, read-only tool RPCs.
begin;
select set_config('read_tools.owner',gen_random_uuid()::text,true);
select set_config('read_tools.other',gen_random_uuid()::text,true);
select set_config('read_tools.nonadmin',gen_random_uuid()::text,true);
select set_config('read_tools.company',gen_random_uuid()::text,true);
select set_config('read_tools.unconverted',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('read_tools.owner')::uuid),(current_setting('read_tools.other')::uuid),(current_setting('read_tools.nonadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('read_tools.owner')::uuid,'owner'),(current_setting('read_tools.other')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('read_tools.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name,website,country,city,industry,short_description,services,fit,pipeline_status,
  priority,lead_source,estimated_value,value_type,won_project_value,won_monthly_value,won_notes,instagram)
values(current_setting('read_tools.company')::uuid,current_setting('read_tools.owner')::uuid,'Acme %_ Furniture','https://website-only.example/','SK','Bratislava','Furniture','descriptiononlyneedle',
  array['Product visualization','Product CGI'],'HIGH','WON','HIGH','Referral',765432.10,'ONE_TIME',654321.09,4321.09,'wonnotesonlyneedle','https://instagram.com/socialonlyneedle');
insert into public.crm_clients(company_id,owner_id,account_notes)
values(current_setting('read_tools.company')::uuid,current_setting('read_tools.owner')::uuid,'clientnotesonlyneedle');
insert into public.crm_contacts(company_id,owner_id,full_name,email,notes)
values(current_setting('read_tools.company')::uuid,current_setting('read_tools.owner')::uuid,'Contactonlyneedle','emailonlyneedle@example.test','contactnotesonlyneedle');
insert into public.crm_notes(company_id,owner_id,content)
values(current_setting('read_tools.company')::uuid,current_setting('read_tools.owner')::uuid,'privatenotesonlyneedle');
insert into public.crm_companies(owner_id,company_name,country,industry)
select current_setting('read_tools.owner')::uuid,'Paged '||lpad(n::text,2,'0'),'CZ','Other' from generate_series(1,26) n;
insert into public.crm_companies(id,owner_id,company_name,pipeline_status)
values(current_setting('read_tools.unconverted')::uuid,current_setting('read_tools.owner')::uuid,'Won without Client','WON');
insert into public.crm_companies(owner_id,company_name,country,archived_at)
values(current_setting('read_tools.owner')::uuid,'Archived Company','AT',now());
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,research_status,rejection_reason)
select current_setting('read_tools.owner')::uuid,'Rejected '||n,'https://rejected-'||lpad(n::text,3,'0')||'.example/',
  'rejected-'||lpad(n::text,3,'0')||'.example','REJECTED','Never expose this rejection text' from generate_series(1,102) n;
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,research_status) values
  (current_setting('read_tools.owner')::uuid,'Duplicate rejected domain','https://rejected-001.example/','rejected-001.example','REJECTED'),
  (current_setting('read_tools.owner')::uuid,'Open candidate','https://pending.example/','pending.example','NEW'),
  (current_setting('read_tools.owner')::uuid,'Rejected without domain','','','REJECTED');
select set_config('request.jwt.claim.sub',current_setting('read_tools.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.other'),'role','authenticated')::text,true);
insert into public.crm_companies(owner_id,company_name,country,industry,fit)
values(current_setting('read_tools.other')::uuid,'Other owner private company','SK','Furniture','HIGH');
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,research_status)
values(current_setting('read_tools.other')::uuid,'Other rejected','https://private-other.example/','private-other.example','REJECTED');

create function pg_temp.read_tools_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'companies',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_companies c where owner_id in (current_setting('read_tools.owner')::uuid,current_setting('read_tools.other')::uuid)),
    'contacts',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_contacts c where owner_id=current_setting('read_tools.owner')::uuid),
    'notes',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_notes c where owner_id=current_setting('read_tools.owner')::uuid),
    'clients',(select jsonb_agg(to_jsonb(c) order by company_id) from public.crm_clients c where owner_id=current_setting('read_tools.owner')::uuid),
    'research',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_research_candidates c where owner_id in (current_setting('read_tools.owner')::uuid,current_setting('read_tools.other')::uuid)),
    'activities',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_activities c where owner_id in (current_setting('read_tools.owner')::uuid,current_setting('read_tools.other')::uuid)),
    'events',(select jsonb_agg(to_jsonb(c) order by id) from public.crm_research_events c where owner_id in (current_setting('read_tools.owner')::uuid,current_setting('read_tools.other')::uuid))
  );
$$;
select set_config('read_tools.before',pg_temp.read_tools_snapshot()::text,true);

create function pg_temp.assert_read_tools_denied() returns void language plpgsql security invoker set search_path='' as $$
begin
  begin perform public.crm_tool_search_leads('{}',1); raise exception 'Unauthorized company tool allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.crm_tool_rejected_domains(1); raise exception 'Unauthorized rejected-domain tool allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('read_tools.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare result jsonb; first_page jsonb; second_page jsonb; item jsonb; term text; bad jsonb; page_number integer; distinct_count integer;
begin
  result:=public.crm_tool_search_leads('{"q":"%_","country":"SK","industry":"furniture","fit":"HIGH","service":"Product visualization","pipeline_status":"WON"}',1);
  if result->>'total'<>'1' or result->'items'->0->>'id'<>current_setting('read_tools.company') then raise exception 'Combined filters or literal name search failed'; end if;
  item:=result->'items'->0;
  if item->>'is_client'<>'true' or item->>'fit'<>'HIGH' or item->>'short_description'<>'descriptiononlyneedle' then raise exception 'Company projection failed'; end if;
  if (select count(*) from jsonb_object_keys(item))<>13 or item ?| array['owner_id','estimated_value','value_type','won_project_value','won_monthly_value','won_notes','notes','contacts','priority','lead_source','instagram','updated_at','presentation_status','engagement'] then raise exception 'Tool exposed private or extra fields'; end if;
  if public.crm_tool_search_leads('{"q":"Won without Client"}',1)->'items'->0->>'is_client'<>'false' then raise exception 'WON mistaken for Client'; end if;
  if (public.crm_tool_search_leads('{"industry":"Furn"}',1)->>'total')::int<>0 then raise exception 'Industry was not an exact match'; end if;
  if (public.crm_tool_search_leads('{"country":"CZ"}',1)->>'total')::int<>26 then raise exception 'Exact country failed'; end if;
  foreach term in array array['Contactonlyneedle','emailonlyneedle','contactnotesonlyneedle','privatenotesonlyneedle','clientnotesonlyneedle','wonnotesonlyneedle','website-only','descriptiononlyneedle','socialonlyneedle','Other owner private'] loop
    if (public.crm_tool_search_leads(jsonb_build_object('q',term),1)->>'total')::int<>0 then raise exception 'Company-name search leaked another field or owner: %',term; end if;
  end loop;
  first_page:=public.crm_tool_search_leads('{}',1); second_page:=public.crm_tool_search_leads('{}',2);
  if first_page->>'total'<>'28' or first_page->>'pageSize'<>'25' or first_page->>'page'<>'1' or first_page->>'hasMore'<>'true'
    or jsonb_array_length(first_page->'items')<>25 or jsonb_array_length(second_page->'items')<>3 or second_page->>'hasMore'<>'false' then raise exception 'Lead pagination failed'; end if;
  select count(distinct r->>'id') into distinct_count from jsonb_array_elements((first_page->'items')||(second_page->'items')) r;
  if distinct_count<>28 or public.crm_tool_search_leads('{}',1)<>first_page then raise exception 'Lead paging unstable or overlapping'; end if;
  if public.crm_tool_search_leads('{}',3)->'items'<>'[]'::jsonb or public.crm_tool_search_leads('{}',10000)->>'hasMore'<>'false' then raise exception 'Empty lead page failed'; end if;
  if public.crm_tool_search_leads('{"sort":"updated"}',1)<>public.crm_tool_search_leads('{"sort":"updated"}',1) then raise exception 'Updated sort unstable'; end if;
  if public.crm_tool_search_leads('{"archived":"all"}',1)->>'total'<>'29' or public.crm_tool_search_leads('{"archived":"archived"}',1)->>'total'<>'1' then raise exception 'Archive scope failed'; end if;
  if public.crm_tool_search_leads('{"service":"Product CGI"}',1)->>'total'<>'1' then raise exception 'Service membership failed'; end if;
  foreach bad in array array[
    'null'::jsonb,'[]'::jsonb,'{"owner_id":"spoof"}'::jsonb,'{"country_category":"SK"}'::jsonb,'{"q":12}'::jsonb,'{"fit":null}'::jsonb,
    '{"country":"sk"}'::jsonb,'{"country":"SVK"}'::jsonb,'{"fit":"BEST"}'::jsonb,'{"service":"Product Visualization"}'::jsonb,
    '{"pipeline_status":"CLIENT"}'::jsonb,'{"archived":"yes"}'::jsonb,'{"sort":"engagement"}'::jsonb,
    jsonb_build_object('q',repeat('x',161)),jsonb_build_object('industry',repeat('x',121)),jsonb_build_object('q',E'invalid\nquery')
  ] loop
    begin perform public.crm_tool_search_leads(bad,1); raise exception 'Invalid filter accepted: %',bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.crm_tool_search_leads(null,1); raise exception 'SQL null filters accepted'; exception when invalid_parameter_value then null; end;
  foreach page_number in array array[0,-1,10001,null::integer] loop
    begin perform public.crm_tool_search_leads('{}',page_number); raise exception 'Invalid company page accepted'; exception when invalid_parameter_value then null; end;
    begin perform public.crm_tool_rejected_domains(page_number); raise exception 'Invalid domain page accepted'; exception when invalid_parameter_value then null; end;
  end loop;
  first_page:=public.crm_tool_rejected_domains(1); second_page:=public.crm_tool_rejected_domains(2);
  if first_page->>'total'<>'102' or first_page->>'pageSize'<>'100' or first_page->>'page'<>'1' or first_page->>'hasMore'<>'true'
    or jsonb_array_length(first_page->'domains')<>100 or jsonb_array_length(second_page->'domains')<>2 or second_page->>'hasMore'<>'false' then raise exception 'Domain pagination or distinct count failed'; end if;
  if first_page->'domains'->>0<>'rejected-001.example' or first_page->'domains'->>99<>'rejected-100.example' or second_page->'domains'->>0<>'rejected-101.example' then raise exception 'Domain ordering failed'; end if;
  select count(distinct r) into distinct_count from jsonb_array_elements_text((first_page->'domains')||(second_page->'domains')) r;
  if distinct_count<>102 or public.crm_tool_rejected_domains(1)<>first_page then raise exception 'Domain pagination overlaps or is unstable'; end if;
  if public.crm_tool_rejected_domains(3)->'domains'<>'[]'::jsonb or public.crm_tool_rejected_domains(10000)->>'hasMore'<>'false' then raise exception 'Empty domain page failed'; end if;
  if (select count(*) from jsonb_object_keys(first_page))<>5 or (first_page::text like '%Never expose%' or first_page::text like '%private-other%' or first_page::text like '%pending.example%') then raise exception 'Domain result leaked private data or non-rejected records'; end if;
end;
$test$;

select set_config('request.jwt.claim.sub',current_setting('read_tools.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.other'),'role','authenticated')::text,true);
do $test$ begin
  if public.crm_tool_search_leads('{}',1)->>'total'<>'1' or public.crm_tool_search_leads('{"q":"Acme"}',1)->>'total'<>'0' then raise exception 'Second owner company isolation failed'; end if;
  if public.crm_tool_rejected_domains(1)->'domains'<>'["private-other.example"]'::jsonb then raise exception 'Second owner domain isolation failed'; end if;
end; $test$;
select set_config('request.jwt.claim.sub',current_setting('read_tools.nonadmin'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.nonadmin'),'role','authenticated')::text,true);
select pg_temp.assert_read_tools_denied();
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_read_tools_denied();
reset role;
select set_config('request.jwt.claim.sub',current_setting('read_tools.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('read_tools.owner'),'role','authenticated')::text,true);
set local role anon;
select pg_temp.assert_read_tools_denied();
reset role;
set local role service_role;
select pg_temp.assert_read_tools_denied();
reset role;

do $test$ begin
  if pg_temp.read_tools_snapshot()<>current_setting('read_tools.before')::jsonb then raise exception 'Read tools mutated business records'; end if;
  if exists(select 1 from pg_proc where oid in ('public.crm_tool_search_leads(jsonb,integer)'::regprocedure,'public.crm_tool_rejected_domains(integer)'::regprocedure) and (prosecdef or provolatile<>'s')) then raise exception 'Read tools must be stable invoker functions'; end if;
end; $test$;
delete from public.presentation_admins where user_id=current_setting('read_tools.owner')::uuid;
set local role authenticated;
select pg_temp.assert_read_tools_denied();
reset role;
rollback;
select 'Read tools: owner isolation, revoked membership, strict filters, literal company search, projection, stable pagination, rejected domains and no business mutations passed; fixtures rolled back' as result;
