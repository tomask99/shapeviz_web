-- Rollback-only public-contact review coverage. No fixture survives this file.
begin;
select set_config('contact_test.owner',gen_random_uuid()::text,true);
select set_config('contact_test.other',gen_random_uuid()::text,true);
select set_config('contact_test.noadmin',gen_random_uuid()::text,true);
select set_config('contact_test.open',gen_random_uuid()::text,true);
select set_config('contact_test.approved',gen_random_uuid()::text,true);
select set_config('contact_test.rejected',gen_random_uuid()::text,true);
select set_config('contact_test.stale',gen_random_uuid()::text,true);
select set_config('contact_test.other_candidate',gen_random_uuid()::text,true);
select set_config('contact_test.company',gen_random_uuid()::text,true);
select set_config('contact_test.open_company',gen_random_uuid()::text,true);
select set_config('contact_test.stale_company',gen_random_uuid()::text,true);
select set_config('contact_test.import_operation',gen_random_uuid()::text,true);
select set_config('contact_test.create_operation',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('contact_test.owner')::uuid),(current_setting('contact_test.other')::uuid),(current_setting('contact_test.noadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('contact_test.owner')::uuid,'owner'),(current_setting('contact_test.other')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('contact_test.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('contact_test.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name,website,country) values
 (current_setting('contact_test.company')::uuid,current_setting('contact_test.owner')::uuid,'Approved Contact Fixture','https://approved-contact.example/','CZ'),
 (current_setting('contact_test.open_company')::uuid,current_setting('contact_test.owner')::uuid,'Open Contact Fixture','https://open-contact.example/','CZ'),
 (current_setting('contact_test.stale_company')::uuid,current_setting('contact_test.owner')::uuid,'Stale Contact Fixture','https://stale-contact.example/','CZ');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country) values
 (current_setting('contact_test.open')::uuid,current_setting('contact_test.owner')::uuid,'Open Contact Fixture','https://open-contact.example/','open-contact.example','CZ'),
 (current_setting('contact_test.stale')::uuid,current_setting('contact_test.owner')::uuid,'Stale Contact Fixture','https://stale-contact.example/','stale-contact.example','CZ'),
 (current_setting('contact_test.other_candidate')::uuid,current_setting('contact_test.other')::uuid,'Private Contact Fixture','https://private-contact.example/','private-contact.example','SK');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,research_status,approved_company_id,approved_at) values
 (current_setting('contact_test.approved')::uuid,current_setting('contact_test.owner')::uuid,'Approved Contact Fixture','https://approved-contact.example/','approved-contact.example','CZ','APPROVED',current_setting('contact_test.company')::uuid,now());
insert into public.crm_research_candidates(id,owner_id,company_name,research_status,rejected_at,rejection_reason) values
 (current_setting('contact_test.rejected')::uuid,current_setting('contact_test.owner')::uuid,'Rejected Contact Fixture','REJECTED',now(),'Not suitable');
insert into public.crm_contacts(company_id,owner_id,full_name,email,job_title,primary_contact,notes) values
 (current_setting('contact_test.company')::uuid,current_setting('contact_test.owner')::uuid,'Existing Manual','manual@contacts.example','Manual role',true,'Keep manual details');
select set_config('contact_test.baseline_candidates',(select md5(jsonb_agg(to_jsonb(c) order by id)::text) from public.crm_research_candidates c where owner_id=current_setting('contact_test.owner')::uuid),true);
select set_config('contact_test.baseline_companies',(select md5(jsonb_agg(to_jsonb(c) order by id)::text) from public.crm_companies c where owner_id=current_setting('contact_test.owner')::uuid),true);
select set_config('contact_test.baseline_activity',(select count(*)::text from public.crm_activities where owner_id=current_setting('contact_test.owner')::uuid),true);

create function pg_temp.contact_proposal(p_name text,p_email text default '',p_inferred boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; f text; proof jsonb:='{}'; status text;
begin
 result:=jsonb_build_object('full_name',p_name,'job_title','Marketing Manager','email',p_email,'phone','','linkedin','','confidence','HIGH',
  'sources',jsonb_build_array(jsonb_build_object('url','https://contacts.example/team','title','Public team','source_type','Company Website','retrieved_at','2026-01-01T00:00:00.000Z','supports',jsonb_build_array('full_name','job_title','email'))));
 foreach f in array array['full_name','job_title','email','phone','linkedin'] loop
  status:=case when result->>f='' then 'UNKNOWN' when f='job_title' and p_inferred then 'INFERRED' else 'VERIFIED' end;
  proof:=proof||jsonb_build_object(f,case when status='UNKNOWN' then '{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}'::jsonb
   else jsonb_build_object('status',status,'confidence','HIGH','evidence','Public company team page identifies this detail.','source_urls',jsonb_build_array('https://contacts.example/team')) end);
 end loop;
 return result||jsonb_build_object('field_provenance',proof);
end;
$$;
create function pg_temp.contact_import_rejected(p_label text,p_owner uuid,p_id uuid,p_version integer,p_data jsonb,p_code text default 'PT409') returns void
language plpgsql security invoker set search_path='' as $$
declare failure text;
begin
 begin
  perform public.crm_research_contacts_import(p_owner,p_id,gen_random_uuid(),repeat('a',64),p_version,p_data);
  raise exception 'Contact import unexpectedly accepted: %',p_label;
 exception when others then get stacked diagnostics failure=returned_sqlstate; if failure<>p_code then raise; end if; end;
end;
$$;
create function pg_temp.contact_decide_rejected(p_label text,p_owner uuid,p_id uuid,p_version integer,p_decision text default 'create',p_code text default 'PT409') returns void
language plpgsql security invoker set search_path='' as $$
declare failure text;
begin
 begin
  perform public.crm_research_contact_decide(p_owner,p_id,gen_random_uuid(),repeat('b',64),p_version,p_decision);
  raise exception 'Contact decision unexpectedly accepted: %',p_label;
 exception when others then get stacked diagnostics failure=returned_sqlstate; if failure<>p_code then raise; end if; end;
end;
$$;

set local role authenticated;
do $test$ begin
 perform pg_temp.contact_import_rejected('authenticated RPC',current_setting('contact_test.owner')::uuid,current_setting('contact_test.open')::uuid,1,'[]','42501');
 perform pg_temp.contact_decide_rejected('authenticated RPC',current_setting('contact_test.owner')::uuid,gen_random_uuid(),1,'create','42501');
 begin insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity) values(current_setting('contact_test.owner')::uuid,current_setting('contact_test.open')::uuid,'{}','{}'); raise exception 'Browser inserted contact proposals'; exception when insufficient_privilege then null; end;
 begin update public.crm_contacts set research_evidence='{}' where owner_id=auth.uid(); raise exception 'Browser wrote original evidence'; exception when insufficient_privilege then null; end;
 begin insert into public.crm_contacts(company_id,owner_id,full_name,research_evidence) values(current_setting('contact_test.company')::uuid,auth.uid(),'Forged evidence','{}'); raise exception 'Browser forged original evidence'; exception when insufficient_privilege then null; end;
 if public.crm_research_contact_context(current_setting('contact_test.other_candidate')::uuid) is not null then raise exception 'Context leaked other owner'; end if;
end; $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform public.crm_research_contact_context(current_setting('contact_test.open')::uuid); raise exception 'Anonymous context access'; exception when insufficient_privilege then null; end;
 begin perform count(*) from public.crm_research_contacts; raise exception 'Anonymous proposal access'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;

set local role service_role;
do $test$
declare own uuid:=current_setting('contact_test.owner')::uuid; approved uuid:=current_setting('contact_test.approved')::uuid;
 result jsonb; original jsonb; proposal jsonb:=pg_temp.contact_proposal('Alice Evidence','alice@contacts.example');
begin
 perform pg_temp.contact_import_rejected('other owner',current_setting('contact_test.other')::uuid,approved,1,'[]','PT404');
 perform pg_temp.contact_import_rejected('no membership',current_setting('contact_test.noadmin')::uuid,approved,1,'[]','42501');
 perform pg_temp.contact_import_rejected('rejected candidate',own,current_setting('contact_test.rejected')::uuid,1,jsonb_build_array(proposal));
 perform pg_temp.contact_import_rejected('stale candidate',own,approved,2,jsonb_build_array(proposal));
 perform pg_temp.contact_import_rejected('wrong payload type',own,approved,1,'{}','22023');
 perform pg_temp.contact_import_rejected('empty selection',own,approved,1,'[]');
 perform pg_temp.contact_import_rejected('unknown personal notes',own,approved,1,jsonb_build_array(proposal||'{"notes":"Private internal notes"}'),'22023');
 perform pg_temp.contact_import_rejected('unsupported source',own,approved,1,jsonb_build_array(jsonb_set(proposal,'{sources,0,source_type}','"Private contact database"')),'22023');
 perform pg_temp.contact_import_rejected('inferred email',own,approved,1,jsonb_build_array(jsonb_set(proposal,'{field_provenance,email,status}','"INFERRED"')),'22023');
 perform pg_temp.contact_import_rejected('no public source',own,approved,1,jsonb_build_array(proposal||'{"sources":[]}'),'22023');
 perform pg_temp.contact_import_rejected('uncited email',own,approved,1,jsonb_build_array(jsonb_set(proposal,'{field_provenance,email,source_urls}','[]')),'22023');
 perform pg_temp.contact_import_rejected('unknown name',own,approved,1,jsonb_build_array(jsonb_set(proposal,'{field_provenance,full_name,status}','"UNKNOWN"')),'22023');
 perform pg_temp.contact_import_rejected('missing evidence',own,approved,1,jsonb_build_array(jsonb_set(proposal,'{field_provenance,full_name,evidence}','""')),'22023');
 perform pg_temp.contact_import_rejected('name duplicate CRM',own,approved,1,jsonb_build_array(pg_temp.contact_proposal('existing   manual')));
 perform pg_temp.contact_import_rejected('email duplicate CRM',own,approved,1,jsonb_build_array(pg_temp.contact_proposal('Different person','MANUAL@contacts.example')));
 perform pg_temp.contact_import_rejected('batch duplicates atomic',own,approved,1,jsonb_build_array(proposal,pg_temp.contact_proposal('ALICE  EVIDENCE')));
 perform pg_temp.contact_import_rejected('batch email duplicates atomic',own,approved,1,jsonb_build_array(proposal,pg_temp.contact_proposal('Different Batch Name','ALICE@contacts.example')));
 perform pg_temp.contact_import_rejected('too many rows',own,approved,1,(select jsonb_agg(pg_temp.contact_proposal('Count '||n)) from generate_series(1,21) n));
 if exists(select 1 from public.crm_research_contacts where owner_id=own) then raise exception 'Failed import partially persisted'; end if;
 result:=public.crm_research_contacts_import(own,approved,current_setting('contact_test.import_operation')::uuid,repeat('1',64),1,
  jsonb_build_array(proposal,pg_temp.contact_proposal('Bob Inferred','',true),pg_temp.contact_proposal('Dismiss Person')));
 original:=result;
 if result->>'saved'<>'3' or result->>'skipped'<>'0' then raise exception 'Import count incorrect'; end if;
 perform set_config('contact_test.alice',result->'ids'->>0,true);
 perform set_config('contact_test.bob',result->'ids'->>1,true);
 perform set_config('contact_test.dismiss',result->'ids'->>2,true);
 result:=public.crm_research_contacts_import(own,approved,current_setting('contact_test.import_operation')::uuid,repeat('1',64),999,null);
 if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Import replay required current version/payload'; end if;
 begin perform public.crm_research_contacts_import(own,approved,current_setting('contact_test.import_operation')::uuid,repeat('2',64),1,null); raise exception 'Changed import operation reused'; exception when sqlstate 'PT409' then null; end;
 perform pg_temp.contact_import_rejected('saved proposal duplicate',own,approved,1,jsonb_build_array(pg_temp.contact_proposal('alice  evidence')));
 perform pg_temp.contact_import_rejected('saved email duplicate',own,approved,1,jsonb_build_array(pg_temp.contact_proposal('Another Name','ALICE@contacts.example')));
 result:=public.crm_research_contacts_import(own,current_setting('contact_test.open')::uuid,gen_random_uuid(),repeat('3',64),1,jsonb_build_array(pg_temp.contact_proposal('Open Person')));
 perform set_config('contact_test.open_proposal',result->'ids'->>0,true);
 perform pg_temp.contact_decide_rejected('create before approval',own,(result->'ids'->>0)::uuid,1);
 result:=public.crm_research_contacts_import(own,current_setting('contact_test.stale')::uuid,gen_random_uuid(),repeat('4',64),1,jsonb_build_array(pg_temp.contact_proposal('Stale Person')));
 perform set_config('contact_test.stale_proposal',result->'ids'->>0,true);
 if (select md5(jsonb_agg(to_jsonb(c) order by id)::text) from public.crm_research_candidates c where owner_id=own)<>current_setting('contact_test.baseline_candidates')
  or (select md5(jsonb_agg(to_jsonb(c) order by id)::text) from public.crm_companies c where owner_id=own)<>current_setting('contact_test.baseline_companies')
  or (select count(*) from public.crm_contacts where owner_id=own)<>1
  or (select count(*)::text from public.crm_activities where owner_id=own)<>current_setting('contact_test.baseline_activity') then raise exception 'Proposal import changed candidate/CRM/activity'; end if;
 begin update public.crm_research_contacts r set proposal=r.proposal||'{"full_name":"Changed"}' where r.id=current_setting('contact_test.alice')::uuid; raise exception 'Changed immutable proposal'; exception when insufficient_privilege then null; end;
 begin update public.crm_research_contacts set reference_identity='{"company_name":"Changed","website":"","country":""}' where id=current_setting('contact_test.alice')::uuid; raise exception 'Changed immutable reference'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;

set local role authenticated;
do $test$
declare snapshot jsonb;
begin
 snapshot:=public.crm_research_contact_context(current_setting('contact_test.approved')::uuid);
 if jsonb_array_length(snapshot->'items')<>3 or jsonb_array_length(snapshot->'contacts')<>1 or snapshot->>'overflow'<>'false'
  or snapshot->'company'->>'id'<>current_setting('contact_test.company') or snapshot->'company'->>'company_name'<>'Approved Contact Fixture' then raise exception 'Context lost complete owned data'; end if;
 begin update public.crm_research_contacts set status='DISMISSED'; raise exception 'Browser changed proposal status'; exception when insufficient_privilege then null; end;
 begin delete from public.crm_research_contacts; raise exception 'Browser deleted evidence'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('contact_test.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('contact_test.other'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.crm_research_contacts where owner_id=current_setting('contact_test.owner')::uuid)
  or public.crm_research_contact_context(current_setting('contact_test.approved')::uuid) is not null then raise exception 'Cross-owner proposal read'; end if;
end; $test$;
reset role;

-- A stale identity can never silently attach a discovered person to another company.
update public.crm_research_candidates set company_name='Changed Reference',research_status='APPROVED',approved_company_id=current_setting('contact_test.stale_company')::uuid,approved_at=now() where id=current_setting('contact_test.stale')::uuid;
update public.crm_research_candidates set research_status='APPROVED',approved_company_id=current_setting('contact_test.open_company')::uuid,approved_at=now() where id=current_setting('contact_test.open')::uuid;
set local role service_role;
do $test$
declare own uuid:=current_setting('contact_test.owner')::uuid; result jsonb; original jsonb; ct public.crm_contacts; before_claims text:=current_setting('request.jwt.claims'); before_sub text:=current_setting('request.jwt.claim.sub');
begin
 perform pg_temp.contact_decide_rejected('cross owner',current_setting('contact_test.other')::uuid,current_setting('contact_test.alice')::uuid,1,'create','PT404');
 perform pg_temp.contact_decide_rejected('stale proposal version',own,current_setting('contact_test.alice')::uuid,2);
 perform pg_temp.contact_decide_rejected('changed candidate identity',own,current_setting('contact_test.stale_proposal')::uuid,1);
 result:=public.crm_research_contact_decide(own,current_setting('contact_test.alice')::uuid,current_setting('contact_test.create_operation')::uuid,repeat('5',64),1,'create');
 original:=result;
 perform set_config('contact_test.alice_contact',result->>'contact_id',true);
 if result->>'status'<>'CREATED' or result->>'version'<>'2' or result->>'company_id'<>current_setting('contact_test.company') then raise exception 'Create result incorrect'; end if;
 select * into ct from public.crm_contacts where id=(result->>'contact_id')::uuid;
 if ct.full_name<>'Alice Evidence' or ct.email<>'alice@contacts.example' or ct.job_title<>'Marketing Manager' or ct.phone<>'' or ct.linkedin<>'' or ct.primary_contact
  or ct.research_evidence->>'candidate_id'<>current_setting('contact_test.approved')
  or ct.research_evidence->>'proposal_id'<>current_setting('contact_test.alice')
  or ct.research_evidence->'proposal' is distinct from (select proposal from public.crm_research_contacts where id=current_setting('contact_test.alice')::uuid) then raise exception 'Created contact lost verified mapping/evidence'; end if;
 if current_setting('request.jwt.claims')<>before_claims or current_setting('request.jwt.claim.sub')<>before_sub then raise exception 'Service contact creation leaked owner claims'; end if;
 result:=public.crm_research_contact_decide(own,current_setting('contact_test.alice')::uuid,current_setting('contact_test.create_operation')::uuid,repeat('5',64),1,'create');
 if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Create did not replay'; end if;
 begin perform public.crm_research_contact_decide(own,current_setting('contact_test.alice')::uuid,current_setting('contact_test.create_operation')::uuid,repeat('6',64),1,'create'); raise exception 'Changed create operation reused'; exception when sqlstate 'PT409' then null; end;
 perform pg_temp.contact_decide_rejected('second create',own,current_setting('contact_test.alice')::uuid,2);
 perform pg_temp.contact_decide_rejected('created dismiss',own,current_setting('contact_test.alice')::uuid,2,'dismiss');
 result:=public.crm_research_contact_decide(own,current_setting('contact_test.bob')::uuid,gen_random_uuid(),repeat('7',64),1,'create');
 if (select job_title from public.crm_contacts where id=(result->>'contact_id')::uuid)<>'' or
  (select research_evidence->'proposal'->'field_provenance'->'job_title'->>'status' from public.crm_contacts where id=(result->>'contact_id')::uuid)<>'INFERRED' then raise exception 'Inferred role became CRM fact or evidence was dropped'; end if;
 result:=public.crm_research_contact_decide(own,current_setting('contact_test.open_proposal')::uuid,gen_random_uuid(),repeat('8',64),1,'create');
 if result->>'company_id'<>current_setting('contact_test.open_company') then raise exception 'Pre-approval proposal did not create after explicit approval'; end if;
 result:=public.crm_research_contact_decide(own,current_setting('contact_test.dismiss')::uuid,gen_random_uuid(),repeat('9',64),1,'dismiss');
 if result->>'status'<>'DISMISSED' or result->>'contact_id' is not null then raise exception 'Dismiss created a contact'; end if;
 perform pg_temp.contact_decide_rejected('dismissed cannot create',own,current_setting('contact_test.dismiss')::uuid,2);
 if (select count(*) from public.crm_contacts where owner_id=own)<>4
  or (select count(*) from public.crm_activities where owner_id=own and event_type='contact_added')<>4
  or not exists(select 1 from public.crm_contacts where owner_id=own and full_name='Existing Manual' and primary_contact and notes='Keep manual details' and job_title='Manual role' and research_evidence is null) then raise exception 'Create changed existing contact/primary or duplicated audit'; end if;
end; $test$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('contact_test.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('contact_test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare before_evidence jsonb; updated public.crm_contacts;
begin
 select research_evidence into before_evidence from public.crm_contacts where id=current_setting('contact_test.alice_contact')::uuid;
 updated:=public.crm_save_contact(current_setting('contact_test.company')::uuid,current_setting('contact_test.alice_contact')::uuid,1,
  '{"full_name":"Alice Manually Corrected","job_title":"Manual role override","email":"manual-correction@contacts.example","phone":"","linkedin":"","instagram":"","notes":"Reviewed personally","primary_contact":false}');
 if updated.id is null or updated.research_evidence is distinct from before_evidence then raise exception 'Manual save lost original evidence'; end if;
 delete from public.crm_contacts where id=current_setting('contact_test.alice_contact')::uuid;
 if not exists(select 1 from public.crm_research_contacts where id=current_setting('contact_test.alice')::uuid and status='CREATED' and created_contact_id is null and created_company_id=current_setting('contact_test.company')::uuid and proposal=before_evidence->'proposal') then raise exception 'Contact deletion lost evidence/history or reopened proposal'; end if;
end; $test$;
reset role;
set local role service_role;
do $test$ begin
 perform pg_temp.contact_decide_rejected('deleted created contact cannot recreate',current_setting('contact_test.owner')::uuid,current_setting('contact_test.alice')::uuid,3);
end; $test$;
reset role;

-- New duplicate after preview/staging blocks creation; archived companies block it too.
set local role service_role;
do $test$
declare result jsonb;
begin
 result:=public.crm_research_contacts_import(current_setting('contact_test.owner')::uuid,current_setting('contact_test.approved')::uuid,gen_random_uuid(),repeat('a',64),1,jsonb_build_array(pg_temp.contact_proposal('Late Duplicate'),pg_temp.contact_proposal('Archived Proposal'),pg_temp.contact_proposal('Rejected Later')));
 perform set_config('contact_test.late_duplicate',result->'ids'->>0,true);
 perform set_config('contact_test.archived_proposal',result->'ids'->>1,true);
 perform set_config('contact_test.rejected_later',result->'ids'->>2,true);
end; $test$;
reset role;
insert into public.crm_contacts(company_id,owner_id,full_name) values(current_setting('contact_test.company')::uuid,current_setting('contact_test.owner')::uuid,'LATE   DUPLICATE');
set local role service_role;
do $test$ begin
 perform pg_temp.contact_decide_rejected('new manual duplicate',current_setting('contact_test.owner')::uuid,current_setting('contact_test.late_duplicate')::uuid,1);
end; $test$;
reset role;
update public.crm_companies set archived_at=clock_timestamp() where id=current_setting('contact_test.company')::uuid;
set local role service_role;
do $test$ begin
 perform pg_temp.contact_decide_rejected('archived company',current_setting('contact_test.owner')::uuid,current_setting('contact_test.archived_proposal')::uuid,1);
end; $test$;
reset role;
-- Test-only lifecycle transition; ordinary approved candidate writes remain frozen.
update public.crm_research_candidates set research_status='REJECTED',approved_company_id=null,approved_at=null,rejected_at=now() where id=current_setting('contact_test.approved')::uuid;
set local role service_role;
do $test$ begin
 perform pg_temp.contact_decide_rejected('rejected later blocks create',current_setting('contact_test.owner')::uuid,current_setting('contact_test.rejected_later')::uuid,1);
 perform pg_temp.contact_decide_rejected('rejected later blocks dismiss',current_setting('contact_test.owner')::uuid,current_setting('contact_test.rejected_later')::uuid,1,'dismiss');
end; $test$;
reset role;

-- Current owner membership is required even for a previously successful replay.
delete from public.presentation_admins where user_id=current_setting('contact_test.owner')::uuid;
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.crm_research_contacts) or public.crm_research_contact_context(current_setting('contact_test.open')::uuid) is not null then raise exception 'Removed owner retained proposal visibility'; end if;
end; $test$;
reset role;
set local role service_role;
do $test$ begin
 begin perform public.crm_research_contact_decide(current_setting('contact_test.owner')::uuid,current_setting('contact_test.alice')::uuid,current_setting('contact_test.create_operation')::uuid,repeat('5',64),1,'create'); raise exception 'Removed member replayed write'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
insert into public.presentation_admins(user_id,role) values(current_setting('contact_test.owner')::uuid,'owner');

do $test$
declare p jsonb:=pg_temp.contact_proposal('Ownership Fixture'); original_url text:='https://contacts.example/team'; new_url text:='https://contacts.example/@team?email=hello@example.test';
begin
 -- URL userinfo is forbidden, while @ in a public path/query is legitimate.
 p:=replace(p::text,original_url,new_url)::jsonb;
 if not crm_private.research_contact_valid(p) then raise exception 'Valid URL path/query rejected'; end if;
 if crm_private.research_contact_valid(replace(p::text,new_url,'https://user:pass@contacts.example/team')::jsonb) then raise exception 'URL credentials accepted'; end if;
 begin insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity) values(current_setting('contact_test.owner')::uuid,current_setting('contact_test.other_candidate')::uuid,p,'{"company_name":"Private","website":"","country":""}'); raise exception 'Cross-owner candidate FK bypassed'; exception when foreign_key_violation then null; end;
 begin insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity,status,created_company_id,created_contact_id)
  select current_setting('contact_test.owner')::uuid,current_setting('contact_test.open')::uuid,p,'{"company_name":"Open Contact Fixture","website":"https://open-contact.example/","country":"CZ"}',
   'CREATED',current_setting('contact_test.open_company')::uuid,id from public.crm_contacts where full_name='Existing Manual' and owner_id=current_setting('contact_test.owner')::uuid;
  raise exception 'Cross-company contact FK bypassed'; exception when foreign_key_violation then null; end;
end; $test$;

-- History counts toward the hard cap; check the complete context beyond REST limits.
insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity,status)
 select current_setting('contact_test.owner')::uuid,current_setting('contact_test.rejected')::uuid,pg_temp.contact_proposal('Limit person '||n),
 '{"company_name":"Rejected Contact Fixture","website":"","country":""}','DISMISSED' from generate_series(1,100) n;
do $test$ begin
 begin insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity) values(current_setting('contact_test.owner')::uuid,current_setting('contact_test.rejected')::uuid,pg_temp.contact_proposal('Overflow'),'{}'); raise exception 'Proposal history exceeded 100'; exception when sqlstate 'PT409' then null; end;
end; $test$;
insert into public.crm_contacts(company_id,owner_id,full_name)
 select current_setting('contact_test.open_company')::uuid,current_setting('contact_test.owner')::uuid,'Context contact '||n from generate_series(1,1000) n;
set local role authenticated;
do $test$
declare data jsonb;
begin
 data:=public.crm_research_contact_context(current_setting('contact_test.open')::uuid);
 if data->>'overflow'<>'true' or jsonb_array_length(data->'contacts')<>1001 then raise exception 'Large company contacts silently truncated'; end if;
 data:=public.crm_research_contact_context(current_setting('contact_test.rejected')::uuid);
 if jsonb_array_length(data->'items')<>100 or data->>'overflow'<>'false' then raise exception 'Bounded history not fully retained'; end if;
end; $test$;
reset role;
select 'crm_research_contacts rollback checks passed' as result;
rollback;
