-- Rollback-only fixtures for reviewed edits, lifecycle, ownership and approval.
begin;
select set_config('review.owner',gen_random_uuid()::text,true);
select set_config('review.other',gen_random_uuid()::text,true);
select set_config('review.noadmin',gen_random_uuid()::text,true);
select set_config('review.candidate',gen_random_uuid()::text,true);
select set_config('review.other_candidate',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('review.owner')::uuid),(current_setting('review.other')::uuid),(current_setting('review.noadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('review.owner')::uuid,'owner'),(current_setting('review.other')::uuid,'owner');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,industry,research_summary,sources,field_provenance)
values(current_setting('review.candidate')::uuid,current_setting('review.owner')::uuid,'Review fixture','https://review.example/','review.example','CZ','Furniture','Keep the complete research.',
  '[{"url":"https://review.example/about","title":"Public source","source_type":"About Page","retrieved_at":null,"supports":["industry"]}]',
  '{"industry":{"status":"VERIFIED","confidence":"HIGH","evidence":"Listed products","source_urls":["https://review.example/about"]}}'),
  (current_setting('review.other_candidate')::uuid,current_setting('review.other')::uuid,'Private other fixture','https://review.example/','review.example','CZ','Furniture','Other owner private evidence','[]','{}');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('review.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare matches jsonb;
begin
  matches:=public.crm_research_review_duplicates(current_setting('review.candidate')::uuid,1);
  if matches->>'match_count'<>'0' or matches->>'company_match_count'<>'0' then raise exception 'Self/other owner exclusion failed: %',matches; end if;
  begin perform public.crm_research_review_duplicates(current_setting('review.other_candidate')::uuid,1); raise exception 'Other candidate visible'; exception when sqlstate 'PT404' then null; end;
  begin perform public.crm_research_review(current_setting('review.owner')::uuid,current_setting('review.candidate')::uuid,gen_random_uuid(),repeat('a',64),'save',1,'{}',''); raise exception 'Browser review RPC exposed'; exception when insufficient_privilege then null; end;
  begin perform public.crm_research_approve(current_setting('review.owner')::uuid,current_setting('review.candidate')::uuid,gen_random_uuid(),repeat('a',64),1,'{}','{}',false); raise exception 'Browser approval RPC exposed'; exception when insufficient_privilege then null; end;
  begin insert into public.crm_research_events(owner_id,candidate_id,event_type) values(current_setting('review.owner')::uuid,current_setting('review.candidate')::uuid,'candidate_approved'); raise exception 'Browser history forge allowed'; exception when insufficient_privilege then null; end;
end;
$test$;
reset role;

-- Test helper projects exactly the editable contract from the stored record.
create function pg_temp.review_data(candidate_id uuid) returns jsonb language sql as $$
  select jsonb_object_agg(e.key,e.value) from public.crm_research_candidates c cross join lateral jsonb_each(to_jsonb(c)) e
  where c.id=candidate_id and e.key=any(array['company_name','website','normalized_domain','country','city','industry','business_type',
    'product_categories','secondary_categories','market_segments','positioning','short_description','research_summary','potential_services',
    'opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence','sources','field_provenance','source_origin','last_researched_at']);
$$;

set local role service_role;
do $test$
declare own uuid:=current_setting('review.owner')::uuid; fixture_candidate uuid:=current_setting('review.candidate')::uuid;
  edit_op uuid:=gen_random_uuid(); reject_op uuid:=gen_random_uuid(); approve_op uuid:=gen_random_uuid(); data jsonb; result jsonb; original jsonb;
  matches jsonb; lead jsonb; fixture_company uuid; stored public.crm_research_candidates; count_before int;
begin
  data:=pg_temp.review_data(fixture_candidate)||'{"industry":"Lighting","fit":"HIGH","fit_reason":"Manually reviewed product range","field_provenance":{"industry":{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}}}'::jsonb;
  result:=public.crm_research_review(own,fixture_candidate,edit_op,repeat('a',64),'save',1,data,'');
  if result->>'version'<>'2' then raise exception 'Edit version failed'; end if;
  select * into stored from public.crm_research_candidates where id=fixture_candidate;
  if stored.industry<>'Lighting' or stored.fit<>'HIGH' or not stored.manual_fields @> array['industry','fit','fit_reason','field_provenance'] then raise exception 'Manual edit mapping failed'; end if;
  if stored.field_provenance->'industry'->>'status'<>'UNKNOWN' or stored.research_summary<>'Keep the complete research.' then raise exception 'Evidence or research was lost'; end if;
  original:=result;
  result:=public.crm_research_review(own,fixture_candidate,edit_op,repeat('a',64),'save',1,null,'');
  if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Edit replay failed'; end if;
  begin perform public.crm_research_review(own,fixture_candidate,edit_op,repeat('b',64),'save',1,null,''); raise exception 'Changed operation reused'; exception when sqlstate 'PT409' then null; end;
  begin perform public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('b',64),'save',1,null,''); raise exception 'Stale edit allowed'; exception when sqlstate 'PT409' then null; end;
  result:=public.crm_research_review(own,fixture_candidate,reject_op,repeat('b',64),'reject',2,null,'Wrong Market');
  if result->>'version'<>'3' then raise exception 'Reject version failed'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=fixture_candidate and research_status='REJECTED' and rejection_reason='Wrong Market' and rejected_at is not null) then raise exception 'Rejected history not preserved'; end if;
  perform public.crm_research_review(own,fixture_candidate,reject_op,repeat('b',64),'reject',2,null,'Wrong Market');
  begin perform public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('c',64),'save',3,data,''); raise exception 'Rejected candidate silently reopened'; exception when sqlstate 'PT409' then null; end;
  begin perform public.crm_research_approve(own,fixture_candidate,gen_random_uuid(),repeat('c',64),3,'{}','{}',false); raise exception 'Rejected candidate approved'; exception when sqlstate 'PT409' then null; end;
  perform public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('c',64),'restore',3,null,'');
  if not exists(select 1 from public.crm_research_candidates where id=fixture_candidate and research_status='NEEDS_REVIEW' and rejection_reason='' and rejected_at is null and version=4) then raise exception 'Restore failed'; end if;
  select count(*) into count_before from public.crm_research_events where crm_research_events.candidate_id=fixture_candidate;
  result:=public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('e',64),'save',4,pg_temp.review_data(fixture_candidate),'');
  if result->>'version'<>'4' or (select count(*) from public.crm_research_events where crm_research_events.candidate_id=fixture_candidate)<>count_before then raise exception 'No-op edit created noisy history'; end if;

  matches:=crm_private.research_review_matches(own,fixture_candidate,4);
  select * into stored from public.crm_research_candidates where id=fixture_candidate;
  lead:=jsonb_build_object('company_name',stored.company_name,'website',stored.website,'country',stored.country,'city',stored.city,
    'industry',stored.industry,'short_description',stored.short_description,'fit',stored.fit,'priority','MEDIUM','lead_source','AI Research','pipeline_status','NEW_LEAD',
    'services',array['Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation']);
  -- A conflicting legacy claim must neither break owner audit nor survive changed.
  perform set_config('request.jwt.claim.sub',current_setting('review.other'),true);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('review.other'),'role','service_role')::text,true);
  result:=public.crm_research_approve(own,fixture_candidate,approve_op,repeat('d',64),4,lead,matches-'matches',false);
  if auth.uid()<>current_setting('review.other')::uuid or current_setting('request.jwt.claims')::jsonb->>'role'<>'service_role'
    or current_setting('request.jwt.claims')::jsonb->>'sub'<>current_setting('review.other') then raise exception 'Approval did not restore both claim locations'; end if;
  fixture_company:=(result->>'company_id')::uuid;
  perform set_config('review.company',fixture_company::text,true);
  if not exists(select 1 from public.crm_companies where id=fixture_company and owner_id=own and lead_source='AI Research' and pipeline_status='NEW_LEAD' and priority='MEDIUM' and fit='HIGH' and cardinality(services)=14) then raise exception 'Lead mapping lost values or services'; end if;
  if not exists(select 1 from public.crm_research_candidates where id=fixture_candidate and approved_company_id=fixture_company and research_status='APPROVED' and version=5 and source_count=1) then raise exception 'Approved research association lost'; end if;
  original:=result;
  result:=public.crm_research_approve(own,fixture_candidate,approve_op,repeat('d',64),4,lead,matches-'matches',false);
  if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Approval retry is not idempotent'; end if;
  begin perform public.crm_research_approve(own,fixture_candidate,gen_random_uuid(),repeat('d',64),4,lead,matches-'matches',false); raise exception 'Approved candidate created another Lead'; exception when sqlstate 'PT409' then null; end;
  begin perform public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('f',64),'reject',5,null,''); raise exception 'Approved candidate can be rejected'; exception when sqlstate 'PT409' then null; end;
  begin perform public.crm_research_review(own,fixture_candidate,gen_random_uuid(),repeat('f',64),'save',5,data,''); raise exception 'Approved research can be overwritten'; exception when sqlstate 'PT409' then null; end;
  if (select count(*) from public.crm_activities where crm_activities.company_id=fixture_company and event_type='ai_research_approved')<>1 then raise exception 'Approval activity duplicated'; end if;
  if (select count(*) from public.crm_activities where crm_activities.company_id=fixture_company and event_type='lead_created')<>1 then raise exception 'Company audit creation broken'; end if;
  if (select count(*) from public.crm_research_events where crm_research_events.candidate_id=fixture_candidate and event_type='candidate_approved')<>1 then raise exception 'Approval history duplicated'; end if;
  if (select count(*) from public.crm_research_events where crm_research_events.candidate_id=fixture_candidate and event_type='candidate_rejected')<>1 then raise exception 'Rejection history duplicated'; end if;
  -- Old edit retry still returns its recorded result after subsequent lifecycle changes.
  if public.crm_research_review(own,fixture_candidate,edit_op,repeat('a',64),'save',1,null,'')->>'replayed'<>'true' then raise exception 'Late edit retry failed'; end if;
end;
$test$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('review.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('review.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
  if (select count(*) from public.crm_research_events)<>4 then raise exception 'Owner event visibility failed'; end if;
  update public.crm_companies set won_service='Lifestyle CGI' where id=current_setting('review.company')::uuid;
  update public.crm_companies set won_service='Product Animation',industry='Manual Lead correction' where id=current_setting('review.company')::uuid;
  if (select industry from public.crm_research_candidates where id=current_setting('review.candidate')::uuid)<>'Lighting' then raise exception 'Lead edit overwrote approved research'; end if;
  begin update public.crm_research_events set metadata='{}'; raise exception 'Browser edited audit history'; exception when insufficient_privilege then null; end;
  begin insert into public.crm_activities(owner_id,company_id,event_type,metadata) values(current_setting('review.owner')::uuid,current_setting('review.company')::uuid,'ai_research_approved',jsonb_build_object('candidate_id',gen_random_uuid())); raise exception 'Browser forged approval activity'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;

-- Block an existing company even when it lies beyond ten stronger research hits.
insert into public.crm_companies(owner_id,company_name,website,country,archived_at) values(current_setting('review.owner')::uuid,'Hidden CRM match','https://already-known.example/','CZ',now());
insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,country)
select current_setting('review.owner')::uuid,'Hidden CRM match','https://many-review.example/','many-review.example','CZ' from generate_series(1,13);
set local role service_role;
do $test$
declare own uuid:=current_setting('review.owner')::uuid; c public.crm_research_candidates; matches jsonb; lead jsonb; before_count integer;
begin
  select * into c from public.crm_research_candidates where owner_id=own and normalized_domain='many-review.example' limit 1;
  matches:=crm_private.research_review_matches(own,c.id,1);
  if matches->>'match_count'<>'13' or matches->>'company_match_count'<>'1' or exists(select 1 from jsonb_array_elements(matches->'matches') m where m->>'kind'='company') then raise exception 'Full company count/self exclusion across display cap failed: %',matches; end if;
  select count(*) into before_count from public.crm_companies where owner_id=own;
  begin perform public.crm_research_approve(own,c.id,gen_random_uuid(),repeat('1',64),1,'{}',matches-'matches',true); raise exception 'Hidden archived duplicate allowed'; exception when sqlstate 'PT409' then null; end;
  if (select count(*) from public.crm_companies where owner_id=own)<>before_count then raise exception 'Duplicate rejection wrote partial Lead'; end if;
  -- A new matching candidate after preview invalidates the full snapshot.
  insert into public.crm_research_candidates(owner_id,company_name,website,normalized_domain,country)
    values(own,'Late duplicate','https://many-review.example/','many-review.example','CZ');
  begin perform public.crm_research_approve(own,c.id,gen_random_uuid(),repeat('2',64),1,'{}',matches-'matches',true); raise exception 'Changed duplicate snapshot accepted'; exception when sqlstate 'PT409' then null; end;
  -- Cross-owner and removed-member calls cannot write even using the service RPC.
  begin perform public.crm_research_review(current_setting('review.other')::uuid,c.id,gen_random_uuid(),repeat('3',64),'reject',1,null,''); raise exception 'Cross-owner review allowed'; exception when sqlstate 'PT404' then null; end;
  begin perform public.crm_research_review(current_setting('review.noadmin')::uuid,c.id,gen_random_uuid(),repeat('3',64),'reject',1,null,''); raise exception 'Non-admin review allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crm_research_approve(current_setting('review.noadmin')::uuid,c.id,gen_random_uuid(),repeat('3',64),1,'{}','{}',false); raise exception 'Non-admin approval allowed'; exception when insufficient_privilege then null; end;
end;
$test$;
reset role;

do $test$ begin
  begin update public.crm_research_candidates set approved_company_id=current_setting('review.company')::uuid,research_status='APPROVED',approved_at=now() where id=current_setting('review.other_candidate')::uuid; raise exception 'Cross-owner approved association allowed'; exception when foreign_key_violation then null; end;
  begin insert into public.crm_research_events(owner_id,candidate_id,event_type) values(current_setting('review.other')::uuid,current_setting('review.candidate')::uuid,'candidate_updated'); raise exception 'Cross-owner history allowed'; exception when foreign_key_violation then null; end;
end; $test$;
select set_config('request.jwt.claim.sub',current_setting('review.other'),true);
set local role authenticated;
do $test$ begin
  if exists(select 1 from public.crm_research_events) then raise exception 'Another owner can read private history'; end if;
end; $test$;
reset role;
delete from public.presentation_admins where user_id=current_setting('review.owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('review.owner'),true);
set local role authenticated;
do $test$ begin
  if exists(select 1 from public.crm_research_events) then raise exception 'Removed owner can read private history'; end if;
  begin perform public.crm_research_review_duplicates(current_setting('review.candidate')::uuid,5); raise exception 'Removed owner preview allowed'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
set local role service_role;
do $test$ begin
  begin perform public.crm_research_review(current_setting('review.owner')::uuid,current_setting('review.candidate')::uuid,gen_random_uuid(),repeat('4',64),'reject',5,null,''); raise exception 'Removed member service write allowed'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
set local role anon;
do $test$ begin
  begin perform public.crm_research_review_duplicates(current_setting('review.candidate')::uuid,5); raise exception 'Anonymous preview exposed'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.crm_research_events; raise exception 'Anonymous events exposed'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select 'Research review, lifecycle, approval, ownership and audit checks passed' result;
rollback;
