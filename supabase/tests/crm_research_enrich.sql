-- Rollback-only checks for immutable company Insight and selected enrichment.
begin;
select set_config('enrich.owner',gen_random_uuid()::text,true);
select set_config('enrich.other',gen_random_uuid()::text,true);
select set_config('enrich.noadmin',gen_random_uuid()::text,true);
select set_config('enrich.company',gen_random_uuid()::text,true);
select set_config('enrich.other_company',gen_random_uuid()::text,true);
select set_config('enrich.empty_company',gen_random_uuid()::text,true);
select set_config('enrich.candidate',gen_random_uuid()::text,true);
select set_config('enrich.operation',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('enrich.owner')::uuid),(current_setting('enrich.other')::uuid),(current_setting('enrich.noadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('enrich.owner')::uuid,'owner'),(current_setting('enrich.other')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('enrich.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name,website,country,city,industry,short_description,services,fit,priority,lead_source,pipeline_status,
 estimated_value,value_type,lost_reason,logo_url,instagram,linkedin,won_date,won_service,won_project_value,won_monthly_value,won_notes)
 values(current_setting('enrich.company')::uuid,current_setting('enrich.owner')::uuid,'Insight Fixture','https://insight.example/','CZ','Manual city','Manual industry','Manual description',
 array['Web'],'LOW','HIGH','Referral','WON',9000,'ONE_TIME','','https://insight.example/logo.png','https://instagram.com/insightfixture','https://linkedin.com/company/insightfixture',
 '2026-01-01','Web',15000,450,'Keep sales notes');
insert into public.crm_companies(id,owner_id,company_name,website,country)
 values(current_setting('enrich.empty_company')::uuid,current_setting('enrich.owner')::uuid,'Empty Insight Fixture','https://empty-insight.example/','SK');
insert into public.crm_clients(company_id,owner_id,account_notes) values(current_setting('enrich.company')::uuid,current_setting('enrich.owner')::uuid,'Keep client notes');
insert into public.crm_contacts(company_id,owner_id,full_name,email,primary_contact) values(current_setting('enrich.company')::uuid,current_setting('enrich.owner')::uuid,'Manual Contact','manual@insight.example',true);
insert into public.crm_notes(company_id,owner_id,content) values(current_setting('enrich.company')::uuid,current_setting('enrich.owner')::uuid,'Private notes never enter research');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,research_status,approved_company_id,approved_at,fit,fit_reason,
 research_summary,sources,source_origin,last_researched_at,manual_fields)
 values(current_setting('enrich.candidate')::uuid,current_setting('enrich.owner')::uuid,'Original Approved Identity','https://original-insight.example/','original-insight.example','CZ','APPROVED',current_setting('enrich.company')::uuid,now(),
 'LOW','Original manual Fit','Original immutable approved research','[{"url":"https://original-insight.example/about","title":"Original source","source_type":"About Page","retrieved_at":null,"supports":[]}]','CHATGPT','2025-01-01T00:00:00Z',array['fit']);
select set_config('enrich.approved_before',(select to_jsonb(c)::text from public.crm_research_candidates c where id=current_setting('enrich.candidate')::uuid),true);
select set_config('enrich.company_before',(select to_jsonb(c)::text from public.crm_companies c where id=current_setting('enrich.company')::uuid),true);
select set_config('enrich.contacts_before',(select jsonb_agg(to_jsonb(c) order by id)::text from public.crm_contacts c where owner_id=current_setting('enrich.owner')::uuid),true);
select set_config('enrich.notes_before',(select jsonb_agg(to_jsonb(c) order by id)::text from public.crm_notes c where owner_id=current_setting('enrich.owner')::uuid),true);
select set_config('enrich.clients_before',(select jsonb_agg(to_jsonb(c) order by company_id)::text from public.crm_clients c where owner_id=current_setting('enrich.owner')::uuid),true);
select set_config('request.jwt.claim.sub',current_setting('enrich.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.other'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name,website,country) values(current_setting('enrich.other_company')::uuid,current_setting('enrich.other')::uuid,'Private Other Insight','https://other-insight.example/','AT');

create function pg_temp.enrich_report(p_company uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.crm_companies; proof jsonb:='{}'; f text;
begin
 select * into c from public.crm_companies where id=p_company;
 foreach f in array array['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','short_description'] loop
  proof:=proof||jsonb_build_object(f,case when f in ('city','industry','short_description') then
   '{"status":"VERIFIED","confidence":"HIGH","evidence":"The official about page documents this fact.","source_urls":["https://insight.example/about"]}'::jsonb
   else '{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}'::jsonb end);
 end loop;
 return jsonb_build_object('company_name',c.company_name,'website',c.website,'country',c.country,'city','Brno','industry','Furniture','business_type','Manufacturer',
  'product_categories',jsonb_build_array('Chairs'),'secondary_categories','[]'::jsonb,'market_segments',jsonb_build_array('Architects'),
  'positioning','{"value":"Design-Focused","status":"INFERRED","confidence":"MEDIUM","evidence":"The catalogue emphasizes design collaborations.","source_urls":["https://insight.example/about"]}'::jsonb,
  'short_description','Documented furniture manufacturer.','research_summary','New reviewed Insight with public evidence.',
  'potential_services','[{"service":"Product Visualization","relevance":"HIGH","reason":"Public product catalogue"},{"service":"3D Modelling","relevance":"MEDIUM","reason":"Configurable products"},{"service":"3D Models for Architects","relevance":"HIGH","reason":"Architect audience"},{"service":"Social Content","relevance":"MEDIUM","reason":"Reusable product assets"},{"service":"Art Direction","relevance":"MEDIUM","reason":"Portfolio consistency"},{"service":"AI Content","relevance":"LOW","reason":"Reviewed creative experiments"}]'::jsonb,
  'opportunity_signals','[{"signal":"ARCHITECT_AUDIENCE","status":"INFERRED","confidence":"MEDIUM","evidence":"The page addresses design professionals.","source_urls":["https://insight.example/about"]}]'::jsonb,
  'suggested_pitch_angle','A reusable product-asset library.','fit','HIGH','fit_reason','The public catalogue suggests a relevant Shapeviz opportunity.','research_confidence','HIGH',
  'sources','[{"url":"https://insight.example/about","title":"Current official about page","source_type":"About Page","retrieved_at":"2026-01-01T00:00:00.000Z","supports":["industry","city","short_description"]}]'::jsonb,
  'field_provenance',proof,'last_researched_at','2026-01-01T00:00:00.000Z','source_origin','ENRICHMENT');
end;
$$;
create function pg_temp.enrich_rejected(p_label text,p_owner uuid,p_company uuid,p_version integer,p_research jsonb,p_patch jsonb default '{}',p_overrides text[] default '{}',p_code text default '22023') returns void
language plpgsql security invoker set search_path='' as $$
declare failure text;
begin
 begin
  perform public.crm_research_enrich(p_owner,p_company,gen_random_uuid(),repeat('a',64),p_version,p_research,p_patch,p_overrides);
  raise exception 'Enrichment unexpectedly accepted: %',p_label;
 exception when others then get stacked diagnostics failure=returned_sqlstate; if failure<>p_code then raise; end if; end;
end;
$$;

select set_config('request.jwt.claim.sub',current_setting('enrich.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 perform pg_temp.enrich_rejected('authenticated RPC',current_setting('enrich.owner')::uuid,current_setting('enrich.company')::uuid,1,null,'{}','{}','42501');
 begin insert into public.crm_company_research(owner_id,company_id,company_version,research) values(auth.uid(),current_setting('enrich.company')::uuid,1,'{}'); raise exception 'Browser forged insight'; exception when insufficient_privilege then null; end;
 begin update public.crm_company_research set research='{}'; raise exception 'Browser changed insight'; exception when insufficient_privilege then null; end;
 begin delete from public.crm_company_research; raise exception 'Browser deleted insight'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform count(*) from public.crm_company_research; raise exception 'Anonymous Insight read'; exception when insufficient_privilege then null; end;
 perform pg_temp.enrich_rejected('anonymous RPC',current_setting('enrich.owner')::uuid,current_setting('enrich.company')::uuid,1,null,'{}','{}','42501');
end; $test$;
reset role;

-- Start with another JWT subject to verify narrow claim restoration after writes.
select set_config('request.jwt.claim.sub',current_setting('enrich.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.other'),'role','authenticated')::text,true);
set local role service_role;
do $test$
declare own uuid:=current_setting('enrich.owner')::uuid; company uuid:=current_setting('enrich.company')::uuid;
 report jsonb:=pg_temp.enrich_report(company); changed jsonb; result jsonb; original jsonb; c public.crm_companies; saved public.crm_company_research;
 services jsonb:='["Product visualization","3D modelling","3D models for architects","Social content","Art direction","AI content"]';
 old_claims text:=current_setting('request.jwt.claims'); old_sub text:=current_setting('request.jwt.claim.sub');
begin
 perform pg_temp.enrich_rejected('cross owner',current_setting('enrich.other')::uuid,company,1,report,'{}','{}','PT404');
 perform pg_temp.enrich_rejected('no membership',current_setting('enrich.noadmin')::uuid,company,1,report,'{}','{}','42501');
 perform pg_temp.enrich_rejected('stale company',own,company,2,report,'{}','{}','PT409');
 perform pg_temp.enrich_rejected('missing report',own,company,1,null);
 perform pg_temp.enrich_rejected('unknown internal property',own,company,1,report||'{"notes":"Private CRM notes"}');
 perform pg_temp.enrich_rejected('internal normalized key',own,company,1,report||'{"normalized_domain":"insight.example"}');
 perform pg_temp.enrich_rejected('missing canonical property',own,company,1,report-'positioning');
 perform pg_temp.enrich_rejected('wrong origin',own,company,1,report||'{"source_origin":"CHATGPT"}');
 perform pg_temp.enrich_rejected('no source',own,company,1,report||'{"sources":[]}');
 perform pg_temp.enrich_rejected('future research',own,company,1,report||jsonb_build_object('last_researched_at',clock_timestamp()+interval '1 day'));
 perform pg_temp.enrich_rejected('identity name',own,company,1,report||'{"company_name":"Different Company"}');
 perform pg_temp.enrich_rejected('identity website',own,company,1,report||'{"website":"https://different.example/"}');
 perform pg_temp.enrich_rejected('identity country',own,company,1,report||'{"country":"AT"}');
 perform pg_temp.enrich_rejected('credential source',own,company,1,jsonb_set(report,'{sources,0,url}','"https://user:pass@insight.example/about"'));
 perform pg_temp.enrich_rejected('source-less verified proof',own,company,1,jsonb_set(report,'{field_provenance,industry,source_urls}','[]'));
 perform pg_temp.enrich_rejected('recommendation without reason',own,company,1,jsonb_set(report,'{potential_services,0,reason}','""'));
 perform pg_temp.enrich_rejected('fit without reason',own,company,1,report||'{"fit_reason":""}');
 perform pg_temp.enrich_rejected('CRM operational key',own,company,1,report,'{"pipeline_status":"QUALIFIED"}');
 perform pg_temp.enrich_rejected('CRM identity key',own,company,1,report,'{"website":"https://insight.example/"}');
 perform pg_temp.enrich_rejected('value does not match report',own,company,1,report,'{"city":"Prague"}',array['city']);
 perform pg_temp.enrich_rejected('scalar manual value without override',own,company,1,report,'{"city":"Brno"}','{}','PT409');
 perform pg_temp.enrich_rejected('array manual value without override',own,company,1,report,jsonb_build_object('services',services),'{}','PT409');
 perform pg_temp.enrich_rejected('extra override',own,company,1,report,'{}',array['city'],'PT409');
 perform pg_temp.enrich_rejected('duplicate override',own,company,1,report,'{"city":"Brno"}',array['city','city']);
 perform pg_temp.enrich_rejected('inferred field copied',own,company,1,jsonb_set(report,'{field_provenance,city,status}','"INFERRED"'),'{"city":"Brno"}',array['city']);
 perform pg_temp.enrich_rejected('noncanonical CRM services',own,company,1,report,'{"services":["Product Visualization"]}',array['services']);
 changed:=jsonb_set(report||'{"city":""}','{field_provenance,city}','{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}');
 perform pg_temp.enrich_rejected('empty clears manual field',own,company,1,changed,'{"city":""}',array['city']);
 if exists(select 1 from public.crm_company_research where company_id=company) or (select version from public.crm_companies where id=company)<>1 then raise exception 'Rejected request wrote data'; end if;
 -- First report-only acceptance advances the company version without CRM edits.
 result:=public.crm_research_enrich(own,company,current_setting('enrich.operation')::uuid,repeat('1',64),1,report,'{}','{}');
 original:=result; perform set_config('enrich.first_insight',result->>'insight_id',true); perform set_config('enrich.original_result',result::text,true);
 if result->>'version'<>'2' then raise exception 'Report-only acceptance did not advance version'; end if;
 select * into c from public.crm_companies where id=company;
 if to_jsonb(c)-array['version','updated_at'] is distinct from current_setting('enrich.company_before')::jsonb-array['version','updated_at'] then raise exception 'Report-only acceptance changed company fields'; end if;
 if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_sub then raise exception 'Enrichment leaked owner JWT claims'; end if;
 result:=public.crm_research_enrich(own,company,current_setting('enrich.operation')::uuid,repeat('1',64),1,null,null,null);
 if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Exact retry did not precede stale/payload checks'; end if;
 begin perform public.crm_research_enrich(own,company,current_setting('enrich.operation')::uuid,repeat('2',64),1,null,null,null); raise exception 'Changed operation reused'; exception when sqlstate 'PT409' then null; end;
 perform pg_temp.enrich_rejected('competing stale report',own,company,1,report,'{}','{}','PT409');
 result:=public.crm_research_enrich(own,company,gen_random_uuid(),repeat('3',64),2,report,'{}','{}');
 if result->>'version'<>'2' or result->>'no_change'<>'true' or result->>'insight_id'<>current_setting('enrich.first_insight')
  or (select count(*) from public.crm_company_research where company_id=company)<>1
  or (select count(*) from public.crm_activities where company_id=company and event_type='ai_research_enriched')<>1 then raise exception 'Identical empty patch was noisy'; end if;
 result:=public.crm_research_enrich(own,company,gen_random_uuid(),repeat('4',64),2,report,jsonb_build_object('city','Brno','industry','Furniture','services',services,'fit','HIGH'),array['services','fit','industry','city']);
 if result->>'version'<>'3' then raise exception 'Selected fields did not advance exactly once'; end if;
 select * into saved from public.crm_company_research where id=(result->>'insight_id')::uuid;
 if saved.selected_fields<>array['city','fit','industry','services'] or saved.overwritten_fields<>saved.selected_fields
  or saved.before_values is distinct from '{"city":"Manual city","industry":"Manual industry","services":["Web"],"fit":"LOW"}'::jsonb
  or saved.after_values is distinct from jsonb_build_object('city','Brno','industry','Furniture','services',services,'fit','HIGH')
  or saved.research is distinct from report then raise exception 'Revision lost exact selection/before/after/evidence'; end if;
 select * into c from public.crm_companies where id=company;
 if c.city<>'Brno' or c.industry<>'Furniture' or c.fit<>'HIGH' or to_jsonb(c.services)<>services or c.short_description<>'Manual description'
  or to_jsonb(c)-array['version','updated_at','city','industry','services','fit'] is distinct from current_setting('enrich.company_before')::jsonb-array['version','updated_at','city','industry','services','fit'] then raise exception 'Selected enrichment changed operational or unselected fields'; end if;
 perform pg_temp.enrich_rejected('unchanged selected group',own,company,3,report,'{"city":"Brno"}',array['city']);
 result:=public.crm_research_enrich(own,company,gen_random_uuid(),repeat('5',64),3,report,'{"short_description":"Documented furniture manufacturer."}',array['short_description']);
 if result->>'version'<>'4' then raise exception 'Same report with a real CRM change was incorrectly skipped'; end if;
 -- Fresh evidence may revisit the same URL; the previous immutable report stays intact.
 changed:=jsonb_set(report,'{sources,0,title}','"Revisited official page"')||'{"last_researched_at":null}';
 result:=public.crm_research_enrich(own,company,gen_random_uuid(),repeat('6',64),4,changed,'{}','{}');
 if result->>'version'<>'5' or (select research->'sources'->0->>'title' from public.crm_company_research where id=current_setting('enrich.first_insight')::uuid)<>'Current official about page'
  or (select research->'last_researched_at' from public.crm_company_research where id=(result->>'insight_id')::uuid) is distinct from 'null'::jsonb then raise exception 'Fresh receipt changed history or fabricated a date'; end if;
 -- Empty fields need no override; normalized host identity permits equivalent website spelling.
 changed:=pg_temp.enrich_report(current_setting('enrich.empty_company')::uuid)||'{"website":"http://www.empty-insight.example/catalogue"}';
 result:=public.crm_research_enrich(own,current_setting('enrich.empty_company')::uuid,gen_random_uuid(),repeat('7',64),1,changed,'{"city":"Brno","industry":"Furniture","short_description":"Documented furniture manufacturer.","fit":"HIGH"}','{}');
 if result->>'version'<>'2' or (select website from public.crm_companies where id=current_setting('enrich.empty_company')::uuid)<>'https://empty-insight.example/' then raise exception 'Empty field population or fixed website identity failed'; end if;
 begin update public.crm_company_research set research='{}' where company_id=company; raise exception 'Service modified append-only evidence'; exception when insufficient_privilege then null; end;
 if (select to_jsonb(candidate_row) from public.crm_research_candidates candidate_row where id=current_setting('enrich.candidate')::uuid) is distinct from current_setting('enrich.approved_before')::jsonb
  or (select jsonb_agg(to_jsonb(contact_row) order by id) from public.crm_contacts contact_row where owner_id=own) is distinct from current_setting('enrich.contacts_before')::jsonb
  or (select jsonb_agg(to_jsonb(note_row) order by id) from public.crm_notes note_row where owner_id=own) is distinct from current_setting('enrich.notes_before')::jsonb
  or (select jsonb_agg(to_jsonb(client_row) order by company_id) from public.crm_clients client_row where owner_id=own) is distinct from current_setting('enrich.clients_before')::jsonb then raise exception 'Enrichment touched approved Research or operational relations'; end if;
 if (select count(*) from public.crm_company_research where company_id=company)<>4 or (select count(*) from public.crm_activities where company_id=company and event_type='ai_research_enriched')<>4 then raise exception 'Revision/activity counts not atomic'; end if;
end; $test$;
reset role;

-- Evidence remains readable to its owner, including after archiving.
select set_config('request.jwt.claim.sub',current_setting('enrich.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 if (select count(*) from public.crm_company_research where company_id=current_setting('enrich.company')::uuid)<>4 then raise exception 'Owner lost Insight history'; end if;
 update public.crm_companies set city='Later manual correction',archived_at=clock_timestamp() where id=current_setting('enrich.company')::uuid;
 if (select count(*) from public.crm_company_research where company_id=current_setting('enrich.company')::uuid)<>4 then raise exception 'Archived Insight history disappeared'; end if;
end; $test$;
reset role;
set local role service_role;
do $test$
declare result jsonb;
begin
 perform pg_temp.enrich_rejected('archived current company',current_setting('enrich.owner')::uuid,current_setting('enrich.company')::uuid,6,pg_temp.enrich_report(current_setting('enrich.company')::uuid),'{}','{}','PT409');
 result:=public.crm_research_enrich(current_setting('enrich.owner')::uuid,current_setting('enrich.company')::uuid,current_setting('enrich.operation')::uuid,repeat('1',64),1,null,null,null);
 if result-'replayed' is distinct from current_setting('enrich.original_result')::jsonb or result->>'replayed'<>'true'
  or (select city from public.crm_companies where id=current_setting('enrich.company')::uuid)<>'Later manual correction' then raise exception 'Retry after manual edit/archive was not quiet'; end if;
end; $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('enrich.other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.other'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.crm_company_research where company_id=current_setting('enrich.company')::uuid) then raise exception 'Other owner read Insight history'; end if;
end; $test$;
reset role;
do $test$ begin
 begin insert into public.crm_company_research(owner_id,company_id,company_version,research) values(current_setting('enrich.other')::uuid,current_setting('enrich.company')::uuid,999,pg_temp.enrich_report(current_setting('enrich.company')::uuid)); raise exception 'Cross-owner Insight FK allowed'; exception when foreign_key_violation then null; end;
 begin update public.crm_company_research set created_at=now() where id=current_setting('enrich.first_insight')::uuid; raise exception 'Immutable receipt trigger missing'; exception when insufficient_privilege then null; end;
end; $test$;

delete from public.presentation_admins where user_id=current_setting('enrich.owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('enrich.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enrich.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.crm_company_research) then raise exception 'Removed owner read Insight'; end if;
end; $test$;
reset role;
set local role service_role;
do $test$ begin
 begin perform public.crm_research_enrich(current_setting('enrich.owner')::uuid,current_setting('enrich.company')::uuid,current_setting('enrich.operation')::uuid,repeat('1',64),1,null,null,null); raise exception 'Removed owner replayed operation'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select 'Company Insight enrichment ownership, immutable evidence, selected fields, protection, versions, retries and preservation passed' as result;
rollback;
