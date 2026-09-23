-- Rollback-only coverage for reviewed research updates; never seed persistent data.
begin;
select set_config('refresh.owner',gen_random_uuid()::text,true);
select set_config('refresh.other',gen_random_uuid()::text,true);
select set_config('refresh.noadmin',gen_random_uuid()::text,true);
select set_config('refresh.candidate',gen_random_uuid()::text,true);
select set_config('refresh.other_candidate',gen_random_uuid()::text,true);
select set_config('refresh.duplicate',gen_random_uuid()::text,true);
select set_config('refresh.approved',gen_random_uuid()::text,true);
select set_config('refresh.rejected',gen_random_uuid()::text,true);
select set_config('refresh.company',gen_random_uuid()::text,true);
select set_config('refresh.operation',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('refresh.owner')::uuid),(current_setting('refresh.other')::uuid),(current_setting('refresh.noadmin')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('refresh.owner')::uuid,'owner'),(current_setting('refresh.other')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('refresh.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('refresh.owner'),'role','authenticated')::text,true);
insert into public.crm_companies(id,owner_id,company_name,website,country)
values(current_setting('refresh.company')::uuid,current_setting('refresh.owner')::uuid,'Retained approved Lead','https://approved-refresh.example/','CZ');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,city,industry,fit,fit_reason,
  research_summary,sources,field_provenance,source_origin,last_researched_at,manual_fields)
values(current_setting('refresh.candidate')::uuid,current_setting('refresh.owner')::uuid,'Refresh fixture','https://refresh.example/','refresh.example','CZ','Prague','Furniture','HIGH','Manual Fit decision',
  'Preserve unselected research.',
  '[{"url":"https://refresh.example/about","title":"Original evidence","source_type":"About Page","retrieved_at":"2025-01-01T10:00:00Z","supports":["industry","city"]}]',
  '{"industry":{"status":"VERIFIED","confidence":"HIGH","evidence":"Listed products","source_urls":["https://refresh.example/about"]},"city":{"status":"VERIFIED","confidence":"HIGH","evidence":"Public office","source_urls":["https://refresh.example/about"]}}',
  'CHATGPT','2025-01-01T10:00:00Z',array['industry','fit_reason','field_provenance','sources']),
  (current_setting('refresh.other_candidate')::uuid,current_setting('refresh.other')::uuid,'Other private research','https://other-refresh.example/','other-refresh.example','SK','','',null,'',
  'Other owner information','[]','{}','IMPORT',null,'{}');
insert into public.crm_research_candidates(id,owner_id,company_name,website,normalized_domain,country,research_status,duplicate_company_id,duplicate_checked_at)
values(current_setting('refresh.duplicate')::uuid,current_setting('refresh.owner')::uuid,'Known duplicate','https://duplicate-refresh.example/','duplicate-refresh.example','CZ','DUPLICATE',current_setting('refresh.company')::uuid,now());
insert into public.crm_research_candidates(id,owner_id,company_name,research_status,approved_company_id,approved_at)
values(current_setting('refresh.approved')::uuid,current_setting('refresh.owner')::uuid,'Approved research','APPROVED',current_setting('refresh.company')::uuid,now());
insert into public.crm_research_candidates(id,owner_id,company_name,research_status,rejected_at,rejection_reason)
values(current_setting('refresh.rejected')::uuid,current_setting('refresh.owner')::uuid,'Rejected research','REJECTED',now(),'Wrong market');
select set_config('refresh.candidate_count',(select count(*)::text from public.crm_research_candidates where owner_id=current_setting('refresh.owner')::uuid),true);
select set_config('refresh.company_snapshot',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id),'[]')::text) from public.crm_companies c where owner_id=current_setting('refresh.owner')::uuid),true);
select set_config('refresh.activity_count',(select count(*)::text from public.crm_activities where owner_id=current_setting('refresh.owner')::uuid),true);

create function pg_temp.refresh_data(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_object_agg(e.key,e.value) from public.crm_research_candidates c cross join lateral jsonb_each(to_jsonb(c)) e
  where c.id=p_id and e.key=any(array['company_name','website','normalized_domain','country','city','industry','business_type',
    'product_categories','secondary_categories','market_segments','positioning','short_description','research_summary','potential_services',
    'opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence','sources','field_provenance','source_origin','last_researched_at']);
$$;
create function pg_temp.refresh_rejected(p_label text,p_owner uuid,p_id uuid,p_version integer,p_data jsonb,p_selected text[],
  p_overrides text[] default '{}',p_mode text default 'deeper',p_codes text[] default array['22023','PT409']) returns void
language plpgsql security invoker set search_path='' as $$
declare failure text;
begin
  begin
    perform public.crm_research_refresh(p_owner,p_id,gen_random_uuid(),repeat('a',64),p_version,p_data,p_mode,p_selected,p_overrides);
    raise exception 'Refresh unexpectedly accepted: %',p_label;
  exception when others then
    get stacked diagnostics failure=returned_sqlstate;
    if not failure=any(p_codes) then raise; end if;
  end;
end;
$$;

set local role authenticated;
do $test$ begin
  perform pg_temp.refresh_rejected('authenticated RPC',current_setting('refresh.owner')::uuid,current_setting('refresh.candidate')::uuid,1,null,array['research_summary'],'{}','deeper',array['42501']);
  begin update public.crm_research_candidates set research_summary='Direct browser update'; raise exception 'Browser changed research directly'; exception when insufficient_privilege then null; end;
  begin insert into public.crm_research_events(owner_id,candidate_id,event_type) values(current_setting('refresh.owner')::uuid,current_setting('refresh.candidate')::uuid,'candidate_refreshed'); raise exception 'Browser forged refresh history'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;

set local role service_role;
do $test$
declare own uuid:=current_setting('refresh.owner')::uuid; fixture uuid:=current_setting('refresh.candidate')::uuid;
  data jsonb; before_data jsonb; result jsonb; original jsonb; stored public.crm_research_candidates; event jsonb;
begin
  before_data:=pg_temp.refresh_data(fixture);
  result:=public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('0',64),1,before_data,'deeper',array['research_summary'],'{}');
  if result->>'version'<>'1' or exists(select 1 from public.crm_research_events where candidate_id=fixture) then raise exception 'No-op refresh changed version/history'; end if;
  -- Equivalent timestamps and default UNKNOWN evidence are not material edits.
  data:=jsonb_set(before_data||'{"last_researched_at":"2025-01-01T11:00:00+01:00"}','{field_provenance,country}',
    '{"status":"UNKNOWN","confidence":null,"evidence":"","source_urls":[]}');
  result:=public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('0',64),1,data,'deeper',array['research_summary'],'{}');
  if result->>'version'<>'1' or pg_temp.refresh_data(fixture) is distinct from before_data
    or exists(select 1 from public.crm_research_events where candidate_id=fixture) then raise exception 'Equivalent date/evidence normalization wrote an unselected field'; end if;
  perform pg_temp.refresh_rejected('missing selected group',own,fixture,1,before_data,'{}');
  perform pg_temp.refresh_rejected('unknown selected group',own,fixture,1,before_data,array['owner_id']);
  perform pg_temp.refresh_rejected('repeated selected group',own,fixture,1,before_data,array['research_summary','research_summary']);
  perform pg_temp.refresh_rejected('unknown mode',own,fixture,1,before_data,array['research_summary'],'{}','automatic');
  perform pg_temp.refresh_rejected('unselected change',own,fixture,1,before_data||'{"city":"Brno"}',array['research_summary']);
  perform pg_temp.refresh_rejected('unselected normalized domain changed',own,fixture,1,before_data||'{"research_summary":"Allowed summary change","normalized_domain":"forged-refresh.example"}',array['research_summary']);
  perform pg_temp.refresh_rejected('website and normalized domain disagree',own,fixture,1,before_data||'{"website":"https://new-refresh.example/","normalized_domain":"forged-refresh.example"}',array['website'],array['website']);
  perform pg_temp.refresh_rejected('origin changed',own,fixture,1,before_data||'{"source_origin":"ENRICHMENT"}',array['research_summary']);
  perform pg_temp.refresh_rejected('extra override',own,fixture,1,before_data,array['research_summary'],array['industry']);
  perform pg_temp.refresh_rejected('repeated override',own,fixture,1,before_data,array['industry'],array['industry','industry']);

  data:=jsonb_set(before_data||'{"industry":"Lighting"}','{field_provenance,industry}',
    '{"status":"INFERRED","confidence":"MEDIUM","evidence":"New reviewed product interpretation","source_urls":["https://refresh.example/about"]}');
  perform pg_temp.refresh_rejected('manual industry without override',own,fixture,1,data,array['industry']);
  perform pg_temp.refresh_rejected('coarse provenance protection',own,fixture,1,before_data||'{"city":"Brno"}',array['city']);
  perform pg_temp.refresh_rejected('fit_reason protects complete Fit',own,fixture,1,before_data||'{"fit":"MEDIUM","fit_reason":"Updated research judgment"}',array['fit']);
  perform pg_temp.refresh_rejected('unselected provenance changed',own,fixture,1,jsonb_set(data,'{field_provenance,city,evidence}','"Overwritten office evidence"'),array['industry'],array['industry']);

  result:=public.crm_research_refresh(own,fixture,current_setting('refresh.operation')::uuid,repeat('1',64),1,data,'deeper',array['industry'],array['industry']);
  original:=result;
  if result->>'version'<>'2' then raise exception 'Material refresh did not increment version once'; end if;
  select * into stored from public.crm_research_candidates where id=fixture;
  if stored.industry<>'Lighting' or stored.research_status<>'NEEDS_REVIEW' or stored.source_origin<>'CHATGPT'
    or stored.manual_fields<>array['industry','fit_reason','field_provenance','sources']
    or stored.sources is distinct from before_data->'sources' or stored.field_provenance->'city' is distinct from before_data->'field_provenance'->'city'
    or stored.research_summary<>'Preserve unselected research.' or stored.fit<>'HIGH' or stored.fit_reason<>'Manual Fit decision' then
    raise exception 'Refresh lost unselected data, manual markers or original entry source';
  end if;
  if (select count(*) from public.crm_research_events where candidate_id=fixture and event_type='candidate_refreshed')<>1 then raise exception 'Refresh history missing or noisy'; end if;
  select metadata into event from public.crm_research_events where candidate_id=fixture;
  if event->>'mode' is distinct from 'deeper' or event->'selected_fields' is distinct from '["industry"]'::jsonb
    or event->'manual_overrides' is distinct from '["industry"]'::jsonb
    or (event->'changed_fields' @> '["industry","field_provenance"]'::jsonb) is distinct from true
    or event->>'from_fit' is distinct from 'HIGH' or event->>'to_fit' is distinct from 'HIGH'
    or (event->>'previous_researched_at')::timestamptz is distinct from '2025-01-01T10:00:00Z'::timestamptz
    or (event->>'last_researched_at')::timestamptz is distinct from '2025-01-01T10:00:00Z'::timestamptz then raise exception 'Refresh audit metadata lost review context: %',event; end if;
  result:=public.crm_research_refresh(own,fixture,current_setting('refresh.operation')::uuid,repeat('1',64),1,null,'deeper',array['industry'],array['industry']);
  if result-'replayed'<>original or result->>'replayed'<>'true' then raise exception 'Refresh replay failed after stored version changed'; end if;
  begin perform public.crm_research_refresh(own,fixture,current_setting('refresh.operation')::uuid,repeat('2',64),1,null,'deeper',array['industry'],array['industry']); raise exception 'Changed operation reused'; exception when sqlstate 'PT409' then null; end;
  perform pg_temp.refresh_rejected('stale request without ledger',own,fixture,1,null,array['research_summary'],'{}','deeper',array['PT409']);

  before_data:=pg_temp.refresh_data(fixture);
  perform pg_temp.refresh_rejected('drop retained source',own,fixture,2,before_data||'{"sources":[]}',array['sources'],array['sources']);
  perform pg_temp.refresh_rejected('rewrite retained source metadata',own,fixture,2,jsonb_set(before_data,'{sources,0,title}','"Replacement title"'),array['sources'],array['sources']);
  perform pg_temp.refresh_rejected('duplicate retained URL',own,fixture,2,jsonb_set(before_data,'{sources}',(before_data->'sources')||(before_data->'sources')),array['sources'],array['sources']);
  data:=jsonb_set(before_data,'{sources}',(before_data->'sources')||
    '[{"url":"https://refresh.example/products","title":"New catalogue evidence","source_type":"Product Page","retrieved_at":"2025-02-01T12:00:00Z","supports":["product_categories"]}]');
  perform pg_temp.refresh_rejected('protected source list without override',own,fixture,2,data,array['sources']);
  result:=public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('3',64),2,data,'refresh',array['sources'],array['sources']);
  if result->>'version'<>'3' or (select sources->0 from public.crm_research_candidates where id=fixture) is distinct from before_data->'sources'->0
    or (select source_count from public.crm_research_candidates where id=fixture)<>2 then raise exception 'Additive sources did not preserve original evidence'; end if;
  before_data:=pg_temp.refresh_data(fixture);
  perform pg_temp.refresh_rejected('reorder source prefix',own,fixture,3,jsonb_set(before_data,'{sources}',jsonb_build_array(before_data->'sources'->1,before_data->'sources'->0)),array['sources'],array['sources']);
  perform pg_temp.refresh_rejected('older researched date',own,fixture,3,before_data||'{"last_researched_at":"2024-12-31T00:00:00Z"}',array['last_researched_at']);
  perform pg_temp.refresh_rejected('clear known researched date',own,fixture,3,before_data||'{"last_researched_at":null}',array['last_researched_at']);
  perform pg_temp.refresh_rejected('future researched date',own,fixture,3,before_data||jsonb_build_object('last_researched_at',clock_timestamp()+interval '1 day'),array['last_researched_at']);
  data:=before_data||'{"last_researched_at":"2025-02-01T12:00:00Z","fit":"MEDIUM","fit_reason":"Current catalogue suggests narrower opportunity"}';
  result:=public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('4',64),3,data,'refresh',array['fit','last_researched_at'],array['fit']);
  if result->>'version'<>'4' or not exists(select 1 from public.crm_research_candidates where id=fixture and fit='MEDIUM'
    and fit_reason='Current catalogue suggests narrower opportunity' and last_researched_at='2025-02-01T12:00:00Z'::timestamptz) then raise exception 'Grouped Fit/date update failed'; end if;
  if (select count(*) from public.crm_research_events where candidate_id=fixture and event_type='candidate_refreshed')<>3 then raise exception 'Failed updates or retries wrote history'; end if;

  perform pg_temp.refresh_rejected('other owner candidate',current_setting('refresh.other')::uuid,fixture,4,null,array['research_summary'],'{}','deeper',array['PT404']);
  perform pg_temp.refresh_rejected('non-admin owner',current_setting('refresh.noadmin')::uuid,fixture,4,null,array['research_summary'],'{}','deeper',array['42501']);
  perform pg_temp.refresh_rejected('approved record frozen',own,current_setting('refresh.approved')::uuid,1,null,array['research_summary'],'{}','refresh',array['PT409']);
  perform pg_temp.refresh_rejected('rejected record needs restore',own,current_setting('refresh.rejected')::uuid,1,null,array['research_summary'],'{}','refresh',array['PT409']);
end;
$test$;
reset role;

-- Duplicate state survives non-identity research; identity corrections invalidate it.
set local role service_role;
do $test$
declare own uuid:=current_setting('refresh.owner')::uuid; fixture uuid:=current_setting('refresh.duplicate')::uuid; data jsonb;
begin
  data:=pg_temp.refresh_data(fixture)||'{"research_summary":"Deeper research of the retained duplicate"}';
  perform public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('5',64),1,data,'deeper',array['research_summary'],'{}');
  if not exists(select 1 from public.crm_research_candidates where id=fixture and research_status='DUPLICATE' and duplicate_company_id=current_setting('refresh.company')::uuid and duplicate_checked_at is not null) then raise exception 'Non-identity refresh cleared duplicate warning'; end if;
  data:=pg_temp.refresh_data(fixture)||'{"website":"https://corrected-refresh.example/","normalized_domain":"corrected-refresh.example"}';
  perform public.crm_research_refresh(own,fixture,gen_random_uuid(),repeat('6',64),2,data,'refresh',array['website'],'{}');
  if not exists(select 1 from public.crm_research_candidates where id=fixture and research_status='NEEDS_REVIEW' and duplicate_company_id is null and duplicate_candidate_id is null and duplicate_checked_at is null and normalized_domain='corrected-refresh.example') then raise exception 'Identity refresh retained obsolete duplicate check'; end if;
  if (select count(*)::text from public.crm_research_candidates where owner_id=own)<>current_setting('refresh.candidate_count') then raise exception 'Refresh created or deleted a candidate'; end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(c) order by id),'[]')::text) from public.crm_companies c where owner_id=own)<>current_setting('refresh.company_snapshot') then raise exception 'Refresh changed CRM Leads'; end if;
  if (select count(*)::text from public.crm_activities where owner_id=own)<>current_setting('refresh.activity_count')
    or exists(select 1 from public.crm_contacts where owner_id=own) or exists(select 1 from public.crm_notes where owner_id=own) then raise exception 'Refresh wrote CRM activity, contact or note'; end if;
end;
$test$;
reset role;

set local role authenticated;
do $test$ begin
  if (select count(*) from public.crm_research_events where event_type='candidate_refreshed')<>5 then raise exception 'Owner cannot read refresh history'; end if;
end; $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('refresh.other'),true);
set local role authenticated;
do $test$ begin
  if exists(select 1 from public.crm_research_events) then raise exception 'Other owner can read refresh history'; end if;
  if exists(select 1 from public.crm_research_candidates where id=current_setting('refresh.candidate')::uuid) then raise exception 'Other owner can read refreshed candidate'; end if;
end; $test$;
reset role;

delete from public.presentation_admins where user_id=current_setting('refresh.owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('refresh.owner'),true);
set local role authenticated;
do $test$ begin
  if exists(select 1 from public.crm_research_events) or exists(select 1 from public.crm_research_candidates) then raise exception 'Removed owner can read refreshed research'; end if;
end; $test$;
reset role;
set local role service_role;
do $test$ begin
  perform pg_temp.refresh_rejected('removed owner fresh write',current_setting('refresh.owner')::uuid,current_setting('refresh.candidate')::uuid,4,null,array['research_summary'],'{}','refresh',array['42501']);
  begin perform public.crm_research_refresh(current_setting('refresh.owner')::uuid,current_setting('refresh.candidate')::uuid,current_setting('refresh.operation')::uuid,repeat('1',64),1,null,'deeper',array['industry'],array['industry']); raise exception 'Removed owner replayed protected operation'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
set local role anon;
do $test$ begin
  perform pg_temp.refresh_rejected('anonymous RPC',current_setting('refresh.owner')::uuid,current_setting('refresh.candidate')::uuid,4,null,array['research_summary'],'{}','refresh',array['42501']);
  begin perform 1 from public.crm_research_events; raise exception 'Anonymous refresh history exposed'; exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select 'Research refresh ownership, review, evidence, dates, replay and preservation checks passed' result;
rollback;
