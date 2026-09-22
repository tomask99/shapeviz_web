-- All fixture users and records are transaction-local and rolled back.
begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare company uuid; a public.crm_contacts; b public.crm_contacts; n public.crm_notes; count_before integer; affected integer;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Stage 2 fixture') returning id into company;
 perform set_config('crm.test_company',company::text,true);
 a:=public.crm_save_contact(company,null,null,'{"full_name":"Jane Unique","email":"jane.unique@example.test","primary_contact":true}');
 b:=public.crm_save_contact(company,null,null,'{"full_name":"Second Person","primary_contact":true}');
 if (select count(*) from public.crm_contacts where company_id=company and primary_contact)<>1 then raise exception 'Primary invariant failed';end if;
 if (select primary_contact from public.crm_contacts where id=a.id) then raise exception 'Old primary was not cleared';end if;
 select count(*) into count_before from public.crm_activities where company_id=company;
 a:=public.crm_save_contact(company,a.id,1,'{"full_name":"Stale overwrite","primary_contact":true}');
 if a.id is not null then raise exception 'Stale RPC update accepted';end if;
 if (select count(*) from public.crm_activities where company_id=company)<>count_before then raise exception 'Conflict changed audit';end if;
 if (public.crm_list_companies('{"q":"jane.unique@example.test"}',1)->>'total')::int<>1 then raise exception 'Contact email search failed';end if;
 if (public.crm_list_companies('{"q":"Jane Unique"}',1)->>'total')::int<>1 then raise exception 'Contact name search failed';end if;
 begin
  insert into public.crm_contacts(company_id,owner_id,full_name,primary_contact) values(company,auth.uid(),'Duplicate',true);
  raise exception 'Two primary contacts allowed';
 exception when unique_violation then null;end;
 begin
  perform public.crm_save_contact(company,null,null,'{"full_name":"","primary_contact":true}');
  raise exception 'Empty name accepted';
 exception when check_violation then null;end;
 if not (select primary_contact from public.crm_contacts where id=b.id) then raise exception 'Failed insert cleared primary';end if;
 insert into public.crm_notes(company_id,owner_id,content) values(company,auth.uid(),'Initial note') returning * into n;
 update public.crm_notes set content='Edited note' where id=n.id and version=1;
 update public.crm_notes set content='Stale note' where id=n.id and version=1;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale note overwrite';end if;
 if (select content from public.crm_notes where id=n.id)<>'Edited note' then raise exception 'Note update failed';end if;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata)
 values(company,auth.uid(),'manual_activity','{"content":"Called the marketing manager."}');
 begin
  insert into public.crm_activities(company_id,owner_id,event_type) values(company,auth.uid(),'contact_added');
  raise exception 'Automatic event forgery allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.crm_notes(company_id,owner_id,content) values(company,current_setting('crm.test_other')::uuid,'Cross owner');
  raise exception 'Spoofed owner allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.crm_contacts set company_id=gen_random_uuid() where id=b.id;
  raise exception 'Contact reassignment allowed';
 exception when insufficient_privilege then null;end;
 delete from public.crm_contacts where id=b.id and version=b.version;
 if not exists(select 1 from public.crm_companies where id=company) then raise exception 'Deleting contact removed company';end if;
 if not exists(select 1 from public.crm_activities where company_id=company and event_type='contact_removed' and metadata->>'name'='Second Person') then raise exception 'Removed contact audit missing';end if;
 delete from public.crm_notes where id=n.id and version=2;
 if not exists(select 1 from public.crm_activities where company_id=company and event_type='note_removed') then raise exception 'Removed note audit missing';end if;
 insert into public.crm_notes(company_id,owner_id,content) values(company,auth.uid(),'Private remaining note');
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
do $test$
declare result public.crm_contacts; affected integer; own_company uuid;
begin
 if exists(select 1 from public.crm_contacts) or exists(select 1 from public.crm_notes) or exists(select 1 from public.crm_activities) then raise exception 'Cross owner read allowed';end if;
 result:=public.crm_save_contact(current_setting('crm.test_company')::uuid,null,null,'{"full_name":"Intruder"}');
 if result.id is not null then raise exception 'Cross owner RPC allowed';end if;
 update public.crm_contacts set full_name='Intruder' where company_id=current_setting('crm.test_company')::uuid;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Cross owner update allowed';end if;
 delete from public.crm_notes where company_id=current_setting('crm.test_company')::uuid;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Cross owner deletion allowed';end if;
 begin
  insert into public.crm_notes(company_id,owner_id,content) values(current_setting('crm.test_company')::uuid,auth.uid(),'Cross company');
  raise exception 'Cross company note allowed';
 exception when insufficient_privilege then null;end;
 if (public.crm_list_companies('{"q":"Jane Unique"}',1)->>'total')::int<>0 then raise exception 'Contact search leaks another owner';end if;
end;
$test$;
reset role;
delete from public.presentation_admins where user_id=current_setting('crm.test_owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
begin
 if exists(select 1 from public.crm_contacts) or exists(select 1 from public.crm_notes) then raise exception 'Former admin read allowed';end if;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
 begin perform 1 from public.crm_contacts;raise exception 'Anonymous contact read';exception when insufficient_privilege then null;end;
 begin perform 1 from public.crm_notes;raise exception 'Anonymous note read';exception when insufficient_privilege then null;end;
 begin perform public.crm_save_contact(null,null,null,'{}');raise exception 'Anonymous RPC';exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
rollback;
select 'Stage 2 ownership, primary contact, atomic rollback, versioning, deletion, history and search passed; all fixtures rolled back' as result;
