-- Rollback-only fixtures; no real leads or research are modified.
begin;
select set_config('hide_leads.owner',gen_random_uuid()::text,true);
select set_config('hide_leads.other',gen_random_uuid()::text,true);
select set_config('hide_leads.company',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('hide_leads.owner')::uuid),(current_setting('hide_leads.other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('hide_leads.owner')::uuid,'owner'),(current_setting('hide_leads.other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('hide_leads.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name) values(current_setting('hide_leads.company')::uuid,current_setting('hide_leads.owner')::uuid,'Hide Leads fixture');
insert into public.crm_research_candidates(owner_id,company_name,industry,research_status,approved_company_id,approved_at)
values(current_setting('hide_leads.owner')::uuid,'Approved fixture','Furniture','APPROVED',current_setting('hide_leads.company')::uuid,now());
insert into public.crm_research_candidates(owner_id,company_name,industry)
select current_setting('hide_leads.owner')::uuid,'Shoes fixture '||n,'Shoes' from generate_series(1,25) n;
insert into public.crm_research_candidates(owner_id,company_name,industry,duplicate_company_id)
values(current_setting('hide_leads.owner')::uuid,'Possible duplicate fixture','Furniture',current_setting('hide_leads.company')::uuid);
insert into public.crm_research_candidates(owner_id,company_name) values(current_setting('hide_leads.other')::uuid,'Other owner fixture');
set local role authenticated;
do $test$
declare first_page jsonb; second_page jsonb; invalid jsonb;
begin
  if (public.crm_research_list('{}',1)->>'total')::int<>27 then raise exception 'Default must include approved'; end if;
  if (public.crm_research_list('{"hide_in_leads":"false"}',1)->>'total')::int<>27 then raise exception 'Disabled filter must include approved'; end if;
  first_page:=public.crm_research_list('{"hide_in_leads":"true"}',1);
  second_page:=public.crm_research_list('{"hide_in_leads":"true"}',2);
  if (first_page->>'total')::int<>26 or (second_page->>'total')::int<>26 or jsonb_array_length(first_page->'items')<>25 or jsonb_array_length(second_page->'items')<>1 then raise exception 'Filter must run before count and pagination'; end if;
  if exists(select 1 from jsonb_array_elements((first_page->'items')||(second_page->'items')) item where item->>'approved_company_id' is not null) then raise exception 'Approved candidate leaked'; end if;
  if (select count(distinct item->>'id') from jsonb_array_elements((first_page->'items')||(second_page->'items')) item)<>26 then raise exception 'Pagination overlaps'; end if;
  if (public.crm_research_list('{"hide_in_leads":"true","industry":"Shoes"}',1)->>'total')::int<>25 then raise exception 'Industry combination failed'; end if;
  if (public.crm_research_list('{"hide_in_leads":"true","duplicate_status":"possible"}',1)->>'total')::int<>1 then raise exception 'Possible duplicate must remain visible'; end if;
  if (public.crm_research_list('{"hide_in_leads":"true","research_status":"APPROVED"}',1)->>'total')::int<>0 then raise exception 'Conflicting filters must be empty'; end if;
  foreach invalid in array array['{"hide_in_leads":true}'::jsonb,'{"hide_in_leads":"yes"}'::jsonb] loop
    begin
      perform public.crm_research_list(invalid,1); raise exception 'Invalid hide filter accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('hide_leads.other'),'role','authenticated')::text,true);
do $test$
begin
  if (public.crm_research_list('{"hide_in_leads":"true"}',1)->>'total')::int<>1 then raise exception 'Owner isolation failed'; end if;
end;
$test$;
rollback;
