begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; other_c public.crm_companies; ct public.crm_contacts; wrong_ct public.crm_contacts; r public.crm_activities; n integer;
begin
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Reply fixture','WON') returning * into c;
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Other reply company') returning * into other_c;
 insert into public.crm_contacts(company_id,owner_id,full_name) values(c.id,auth.uid(),'Original name') returning * into ct;
 insert into public.crm_contacts(company_id,owner_id,full_name) values(other_c.id,auth.uid(),'Wrong company') returning * into wrong_ct;
 insert into public.crm_activities(id,company_id,owner_id,event_type,metadata) values(gen_random_uuid(),c.id,auth.uid(),'reply_received',jsonb_build_object('content',' Interested ','received_at','2026-01-15T09:30:00.000Z','contact_id',ct.id,'contact_name','spoof','extra','ignored')) returning * into r;
 perform set_config('crm.reply_id',r.id::text,true);perform set_config('crm.reply_company',c.id::text,true);
 if r.metadata->>'contact_name'<>'Original name' or r.metadata->>'content'<>'Interested' or r.metadata?'extra' then raise exception 'Reply metadata not normalized';end if;
 if (select pipeline_status from public.crm_companies where id=c.id)<>'WON' then raise exception 'Pipeline changed';end if;
 begin
  insert into public.crm_activities(id,company_id,owner_id,event_type,metadata) values(r.id,c.id,auth.uid(),'reply_received',r.metadata);
  raise exception 'Duplicate accepted';
 exception when unique_violation then null;end;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'reply_received',r.metadata||jsonb_build_object('contact_id',wrong_ct.id));
  raise exception 'Wrong company contact accepted';
 exception when check_violation then null;end;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'reply_received',r.metadata||'{"received_at":"2099-01-01T00:00:00.000Z"}');
  raise exception 'Future accepted';
 exception when check_violation then null;end;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'reply_received','{"content":"","received_at":"2026-01-01T00:00:00.000Z"}');
  raise exception 'Empty accepted';
 exception when check_violation then null;end;
 begin
  update public.crm_activities set metadata='{}' where id=r.id;
  raise exception 'Reply edit accepted';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.crm_activities where id=r.id;
  raise exception 'Reply delete accepted';
 exception when insufficient_privilege then null;end;
 delete from public.crm_contacts where id=ct.id;
 if (select metadata->>'contact_name' from public.crm_activities where id=r.id)<>'Original name' then raise exception 'Contact delete lost history';end if;
 update public.crm_companies set archived_at=now() where id=c.id;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'manual_activity','{"content":"Existing manual activity remains available"}');
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'status_changed','{}');
  raise exception 'Forged system event accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c.id,auth.uid(),'reply_received',r.metadata||'{"contact_id":null}');
  raise exception 'Archived write accepted';
 exception when insufficient_privilege then null;end;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='reply_received')<>1 then raise exception 'Duplicate history';end if;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
do $test$
begin
 if exists(select 1 from public.crm_activities where id=current_setting('crm.reply_id')::uuid) then raise exception 'Other owner saw reply';end if;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(current_setting('crm.reply_company')::uuid,auth.uid(),'reply_received','{"content":"Spoof","received_at":"2026-01-01T00:00:00.000Z"}');
  raise exception 'Other owner wrote reply';
 exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
 begin perform 1 from public.crm_activities;raise exception 'Anon read accepted';exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
rollback;
select 'Reply validation, immutable history, ownership, archive, contact deletion and deduplication passed; fixtures rolled back' as result;
