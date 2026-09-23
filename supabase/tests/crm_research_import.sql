-- Rollback-only stage 3A.3 integration checks; all identities are disposable.
begin;
select set_config('research.owner',gen_random_uuid()::text,true);
select set_config('research.other',gen_random_uuid()::text,true);
select set_config('research.noadmin',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('research.owner')::uuid),(current_setting('research.other')::uuid),(current_setting('research.noadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('research.owner')::uuid,'owner'),(current_setting('research.other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('research.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(owner_id,company_name,website,country,archived_at)
values(current_setting('research.owner')::uuid,'Archived match','https://www.match.example?source=fixture','CZ',now());
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,country,research_status) values
(current_setting('research.owner')::uuid,'Rejected match','https://rejected.example/','rejected.example','SK','REJECTED'),
(current_setting('research.other')::uuid,'Other owner hidden','https://match.example/','match.example','CZ','NEW');
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain)
select current_setting('research.owner')::uuid,'Many matches '||n,'https://many.example/','many.example' from generate_series(1,12) n;
insert into public.crm_research_candidates(owner_id,company_name,country)
select current_setting('research.owner')::uuid,'Strongest match fixture','CZ' from generate_series(1,12);

set local role authenticated;
do $test$
declare matches jsonb; domains jsonb;
begin
  matches:=public.crm_research_duplicates('[{"row":1,"normalized_domain":"match.example","normalized_company_name":"different","country":"CZ"},{"row":2,"normalized_domain":"rejected.example","normalized_company_name":"different","country":"SK"}]');
  if matches->0->>'match_count'<>'1' or matches->0->'matches'->0->>'kind'<>'company' or matches->0->'matches'->0->>'archived_at' is null then raise exception 'Archived company match/owner isolation failed: %',matches; end if;
  if matches->1->'matches'->0->>'status'<>'REJECTED' then raise exception 'Rejected candidate not matched'; end if;
  matches:=public.crm_research_duplicates('[{"row":1,"normalized_domain":"","normalized_company_name":"rejected match","country":"SK"},{"row":2,"normalized_domain":"","normalized_company_name":"many matches 1","country":""}]');
  if matches->0->'matches'->0->>'match'<>'name_country' or matches->1->>'match_count'<>'0' then raise exception 'Name/country matching failed'; end if;
  matches:=public.crm_research_duplicates('[{"row":1,"normalized_domain":"many.example","normalized_company_name":"","country":""}]');
  if matches->0->>'match_count'<>'12' or jsonb_array_length(matches->0->'matches')<>10 then raise exception 'Duplicate result not bounded'; end if;
  matches:=public.crm_research_duplicates('[{"row":1,"normalized_domain":"match.example","normalized_company_name":"strongest match fixture","country":"CZ"}]');
  if matches->0->>'match_count'<>'13' or matches->0->'matches'->0->>'kind'<>'company' or matches->0->'matches'->0->>'match'<>'domain' then raise exception 'Strongest domain/company match hidden beyond preview limit'; end if;
  domains:=public.crm_research_excluded_domains();
  if domains->'domains'<>'["many.example","match.example","rejected.example"]'::jsonb or domains->>'overflow'<>'false' then raise exception 'Excluded domain scope failed: %',domains; end if;
  begin
    perform crm_private.research_duplicate_rows(current_setting('research.other')::uuid,'[]');
    raise exception 'Private helper accepted other owner';
  exception when insufficient_privilege then null; end;
  begin
    perform public.crm_research_import(current_setting('research.owner')::uuid,gen_random_uuid(),repeat('a',64),'[]','[]');
    raise exception 'Browser role can call commit';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.crm_research_candidates(owner_id,company_name,research_status) values(current_setting('research.owner')::uuid,'Bypass','APPROVED');
    raise exception 'Browser role can bypass import';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;

do $test$ begin
  begin
    update public.crm_research_candidates set duplicate_candidate_id=(select id from public.crm_research_candidates where owner_id=current_setting('research.other')::uuid limit 1)
      where owner_id=current_setting('research.owner')::uuid and normalized_domain='rejected.example';
    raise exception 'Cross-owner candidate duplicate link allowed';
  exception when foreign_key_violation then null; end;
end; $test$;

-- Equivalent canonical URL cases produced by the shared JavaScript parser.
do $test$
declare sample text[];
begin
  foreach sample slice 1 in array array[
    array['https://WWW.Example.COM.?q=a#x','example.com'],array['https://example.com:8443/?a=b','example.com'],
    array['https://[2001:db8::1]:443/?q=1','[2001:db8::1]'],array['https://xn--bcher-kva.example/','xn--bcher-kva.example'],
    array['https://studio.example.com/','studio.example.com'],array['https://example.com#x','example.com'],array['','']
  ] loop
    if public.crm_normalized_domain(sample[1]) is distinct from sample[2] then raise exception 'Domain normalization failed for %',sample[1]; end if;
  end loop;
end;
$test$;

set local role service_role;
do $test$
declare fixture_owner uuid:=current_setting('research.owner')::uuid; batch uuid:=gen_random_uuid(); base jsonb; rows jsonb; expected jsonb;
  result jsonb; replay jsonb; matches jsonb; before_count int; imported_id uuid;
begin
  base:='{"company_name":"Imported fixture","website":"https://fresh.example/","normalized_domain":"fresh.example","country":"CZ","city":"","industry":"Furniture","business_type":"","product_categories":[],"secondary_categories":[],"market_segments":[],"positioning":{"value":"","status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]},"short_description":"","research_summary":"Preserved research","potential_services":[],"opportunity_signals":[],"suggested_pitch_angle":"","fit":null,"fit_reason":"","research_confidence":null,"sources":[],"field_provenance":{},"source_origin":"CHATGPT","last_researched_at":null}';
  rows:=jsonb_build_array(jsonb_build_object('row',1,'candidate',base,'decision','import'),jsonb_build_object('row',2,'candidate',base||'{"company_name":"Same batch second"}'::jsonb,'decision','keep'));
  matches:=crm_private.research_duplicate_rows(fixture_owner,'[{"row":1,"normalized_domain":"fresh.example","normalized_company_name":"imported fixture","country":"CZ"},{"row":2,"normalized_domain":"fresh.example","normalized_company_name":"same batch second","country":"CZ"}]');
  select jsonb_agg(m-'matches') into expected from jsonb_array_elements(matches) m;
  select count(*) into before_count from public.crm_companies where crm_companies.owner_id=fixture_owner;
  result:=public.crm_research_import(fixture_owner,batch,repeat('a',64),rows,expected);
  imported_id:=(result->'candidate_ids'->>0)::uuid;
  if result->>'imported'<>'2' then raise exception 'Import count failed'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=imported_id and research_status='NEW' and research_summary='Preserved research' and source_origin='CHATGPT' and duplicate_checked_at is not null) then raise exception 'Candidate mapping failed'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=(result->'candidate_ids'->>1)::uuid and research_status='DUPLICATE' and duplicate_candidate_id=imported_id) then raise exception 'Intra-batch link failed'; end if;
  replay:=public.crm_research_import(fixture_owner,batch,repeat('a',64),rows,expected);
  if replay-'replayed'<>result or replay->>'replayed'<>'true' then raise exception 'Lost-response retry failed'; end if;
  begin
    perform public.crm_research_import(fixture_owner,batch,repeat('b',64),rows,expected);
    raise exception 'Changed retry accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.crm_research_import(fixture_owner,gen_random_uuid(),repeat('a',64),rows,expected);
    raise exception 'Stale duplicate snapshot accepted';
  exception when sqlstate 'PT409' then null; end;
  if (select count(*) from public.crm_companies where crm_companies.owner_id=fixture_owner)<>before_count then raise exception 'Research import created Leads'; end if;

  -- Existing rejected candidate and archived company need explicit keep, with links.
  base:=base||'{"website":"https://rejected.example/","normalized_domain":"rejected.example"}'::jsonb;
  rows:=jsonb_build_array(jsonb_build_object('row',1,'candidate',base,'decision','import'));
  matches:=crm_private.research_duplicate_rows(fixture_owner,'[{"row":1,"normalized_domain":"rejected.example","normalized_company_name":"imported fixture","country":"CZ"}]');
  select jsonb_agg(m-'matches') into expected from jsonb_array_elements(matches) m;
  begin
    perform public.crm_research_import(fixture_owner,gen_random_uuid(),repeat('c',64),rows,expected);
    raise exception 'Duplicate imported without explicit keep';
  exception when sqlstate 'PT409' then null; end;
  rows:=jsonb_set(rows,'{0,decision}','"keep"');
  result:=public.crm_research_import(fixture_owner,gen_random_uuid(),repeat('d',64),rows,expected);
  if not exists(select 1 from public.crm_research_candidates where id=(result->'candidate_ids'->>0)::uuid and research_status='DUPLICATE' and duplicate_candidate_id=(matches->0->'matches'->0->>'id')::uuid) then raise exception 'Rejected duplicate link failed'; end if;

  base:=base||'{"website":"https://match.example/","normalized_domain":"match.example","company_name":"Strongest match fixture"}'::jsonb;
  rows:=jsonb_build_array(jsonb_build_object('row',1,'candidate',base,'decision','keep'));
  matches:=crm_private.research_duplicate_rows(fixture_owner,'[{"row":1,"normalized_domain":"match.example","normalized_company_name":"strongest match fixture","country":"CZ"}]');
  select jsonb_agg(m-'matches') into expected from jsonb_array_elements(matches) m;
  result:=public.crm_research_import(fixture_owner,gen_random_uuid(),repeat('f',64),rows,expected);
  if not exists(select 1 from public.crm_research_candidates c where c.id=(result->'candidate_ids'->>0)::uuid and c.research_status='DUPLICATE'
    and c.duplicate_company_id=(select (m->>'id')::uuid from jsonb_array_elements(matches->0->'matches') m where m->>'kind'='company' limit 1)) then raise exception 'Archived company duplicate link failed'; end if;

  -- Skip earlier proposals: only actually selected rows determine within-batch matches.
  base:=base||'{"website":"https://skip.example/","normalized_domain":"skip.example","company_name":"Skip fixture"}'::jsonb;
  rows:=jsonb_build_array(jsonb_build_object('row',1,'candidate',base,'decision','skip'),jsonb_build_object('row',2,'candidate',base,'decision','import'));
  matches:=crm_private.research_duplicate_rows(fixture_owner,'[{"row":1,"normalized_domain":"skip.example","normalized_company_name":"skip fixture","country":"CZ"},{"row":2,"normalized_domain":"skip.example","normalized_company_name":"skip fixture","country":"CZ"}]');
  select jsonb_agg(m-'matches') into expected from jsonb_array_elements(matches) m;
  result:=public.crm_research_import(fixture_owner,gen_random_uuid(),repeat('e',64),rows,expected);
  if result->>'skipped'<>'1' or result->>'imported'<>'1' or not exists(select 1 from public.crm_research_candidates where id=(result->'candidate_ids'->>0)::uuid and research_status='NEW' and duplicate_candidate_id is null) then raise exception 'Skipped earlier row still treated as imported duplicate'; end if;
  begin
    perform public.crm_research_import(current_setting('research.noadmin')::uuid,gen_random_uuid(),repeat('e',64),rows,expected);
    raise exception 'Non-admin commit allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;

-- Removing admin membership denies later reads and commits, despite a valid JWT.
delete from public.presentation_admins where user_id=current_setting('research.owner')::uuid;
set local role authenticated;
do $test$ begin
  begin perform public.crm_research_excluded_domains(); raise exception 'Removed owner can export domains'; exception when insufficient_privilege then null; end;
  begin perform public.crm_research_duplicates('[]'); raise exception 'Removed owner can check duplicates'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
set local role anon;
do $test$ begin
  begin perform public.crm_research_duplicates('[]'); raise exception 'Anonymous duplicate read'; exception when insufficient_privilege then null; end;
  begin perform public.crm_research_excluded_domains(); raise exception 'Anonymous domain read'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select 'Research import SQL checks passed' result;
rollback;
