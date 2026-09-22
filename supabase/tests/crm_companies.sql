-- Transaction-only fixtures: every test row is rolled back, including Auth users.
begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
select set_config('crm.test_company',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; n integer; result jsonb;
begin
  insert into public.crm_companies(owner_id,company_name,country,industry,services)
  values(auth.uid(),'CRM regression fixture','SK','Furniture',array['Product CGI']) returning * into c;
  perform set_config('crm.test_company',c.id::text,true);
  if c.country_category<>'SK' or c.version<>1 then raise exception 'Creation defaults failed'; end if;
  if (select count(*) from public.crm_activities where company_id=c.id)<>1 then raise exception 'Creation audit missing'; end if;
  update public.crm_companies set pipeline_status='CONTACTED' where id=c.id and version=1;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Owner update denied'; end if;
  update public.crm_companies set pipeline_status='LOST' where id=c.id and version=1;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Stale version overwrote current version'; end if;
  if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='status_changed' and metadata->>'from_status'='NEW_LEAD' and metadata->>'to_status'='CONTACTED') then raise exception 'Status history missing'; end if;
  result:=public.crm_list_companies('{"country_category":"SK","service":"Product CGI","q":"regression","pipeline_status":"CONTACTED"}',1);
  if (result->>'total')::int<>1 then raise exception 'Combined filters failed'; end if;
  if (public.crm_list_companies('{"q":"no-match"}',1)->>'total')::int<>0 then raise exception 'Search failed'; end if;
  update public.crm_companies set archived_at=now() where id=c.id;
  if (public.crm_list_companies('{}',1)->>'total')::int<>0 then raise exception 'Archive leaked into active list'; end if;
  if (public.crm_list_companies('{"archived":"archived"}',1)->>'total')::int<>1 then raise exception 'Archive filter failed'; end if;
  update public.crm_companies set archived_at=null,country='AT' where id=c.id;
  if (select country_category from public.crm_companies where id=c.id)<>'INT' then raise exception 'Country derivation failed'; end if;
  if (select count(*) from public.crm_activities where company_id=c.id)<>4 then raise exception 'Archive/restore history missing'; end if;
  begin
    update public.crm_companies set owner_id=current_setting('crm.test_other')::uuid where id=c.id;
    raise exception 'Owner reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.crm_companies(owner_id,company_name) values(current_setting('crm.test_other')::uuid,'spoof');
    raise exception 'Spoofed owner allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.crm_companies set pipeline_status='BOGUS' where id=c.id;
    raise exception 'Invalid status allowed';
  exception when check_violation then null; end;
  begin
    delete from public.crm_companies where id=c.id;
    raise exception 'Hard deletion allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.crm_activities(company_id,owner_id,event_type) values(c.id,auth.uid(),'lead_created');
    raise exception 'Forged activity allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
do $test$
declare n integer;
begin
  if exists(select 1 from public.crm_companies) or exists(select 1 from public.crm_activities) then raise exception 'Another owner can read private CRM data'; end if;
  if (public.crm_list_companies('{}',1)->>'total')::int<>0 then raise exception 'RPC leaks another owner'; end if;
  update public.crm_companies set company_name='intruder' where id=current_setting('crm.test_company')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Another owner can update company'; end if;
end;
$test$;
reset role;
delete from public.presentation_admins where user_id=current_setting('crm.test_owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
begin
  if exists(select 1 from public.crm_companies) then raise exception 'Former owner retains access'; end if;
  begin
    insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'not-admin');
    raise exception 'Non-admin can create lead';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform count(*) from public.crm_companies;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.crm_list_companies('{}',1);
    raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
select 'CRM ownership, constraints, filters, concurrency and atomic history checks passed; fixtures rolled back' as result;
