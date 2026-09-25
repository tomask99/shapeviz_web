begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; stale public.crm_companies; slug text:='prepare-test-'||gen_random_uuid(); result jsonb; v integer;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Prepare fixture') returning * into c;
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Stale fixture') returning * into stale;
 insert into public.presentation_projects(deck_slug,client,title,presentation_date,description,source_type,source_bucket,source_path,status,is_template,content)
 values(slug,c.company_name,'Pitch',current_date,'Fixture','standalone','presentation-source','test-only/not-uploaded','published',false,jsonb_build_object('_prepareOwner',auth.uid(),'_prepareCompany',c.id,'_prepareVersion',c.version)),
 (slug||'-stale',stale.company_name,'Pitch',current_date,'Fixture','standalone','presentation-source','test-only/not-uploaded','published',false,jsonb_build_object('_prepareOwner',auth.uid(),'_prepareCompany',stale.id,'_prepareVersion',stale.version));
 result:=public.crm_finish_prepared_presentation(c.id,slug,c.version);
 if result->'company'->>'pipeline_status'<>'PRESENTATION_READY' then raise exception 'Stage not updated';end if;
 if (select count(*) from public.crm_presentation_links where company_id=c.id)<>1 then raise exception 'Link missing';end if;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='status_changed')<>1 then raise exception 'Status history missing';end if;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='presentation_assigned')<>1 then raise exception 'Assignment history missing';end if;
 update public.crm_companies set pipeline_status='CONTACTED' where id=c.id returning version into v;
 result:=public.crm_finish_prepared_presentation(c.id,slug,c.version);
 if not (result->>'replayed')::boolean or result->'company'->>'pipeline_status'<>'CONTACTED' or (result->'company'->>'version')::int<>v then raise exception 'Retry regressed company or repeated write';end if;
 update public.crm_companies set company_name='Changed' where id=stale.id;
 begin
  perform public.crm_finish_prepared_presentation(stale.id,slug||'-stale',stale.version);raise exception 'Stale write accepted';
 exception when sqlstate 'PT409' then null;end;
 if exists(select 1 from public.crm_presentation_links where company_id=stale.id) then raise exception 'Partial link persisted';end if;
 begin
  update public.crm_companies set pipeline_status='QUALIFIED' where id=c.id;raise exception 'Retired stage accepted';
 exception when check_violation then null;end;
 update public.crm_companies set archived_at=now() where id=c.id;
 begin
  perform public.crm_finish_prepared_presentation(c.id,slug,c.version);raise exception 'Archived company accepted';
 exception when sqlstate 'PT409' then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
 begin
  perform public.crm_finish_prepared_presentation(c.id,slug,c.version);raise exception 'Other owner accepted';
 exception when sqlstate 'PT404' then null;end;
end;
$test$;
reset role;
select 'prepare presentation assertions passed' as result;
rollback;
