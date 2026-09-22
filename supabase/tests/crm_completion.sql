begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare c public.crm_companies; n integer;begin
 c:=public.crm_create_company_contact('{"company_name":"Completion fixture","pipeline_status":"WON","won_date":"2026-09-22","won_project_value":3000.25,"won_monthly_value":100.5,"won_service":"Product CGI","logo_url":"https://example.test/logo.png"}','{"full_name":"First contact","email":"first@example.test"}');
 if c.won_project_value<>3000.25 or c.won_monthly_value<>100.5 or c.owner_id<>auth.uid() then raise exception 'Won metadata not saved';end if;
 if not exists(select 1 from public.crm_contacts where company_id=c.id and primary_contact) then raise exception 'Contact missing';end if;
 select count(*) into n from public.crm_companies;
 begin
  perform public.crm_create_company_contact('{"company_name":"Must roll back"}','{"full_name":""}');
  raise exception 'Invalid contact accepted';
 exception when check_violation then null;end;
 if (select count(*) from public.crm_companies)<>n then raise exception 'Partial company left behind';end if;
 update public.crm_companies set pipeline_status='REPLIED' where id=c.id;
 if (select won_project_value from public.crm_companies where id=c.id)<>3000.25 then raise exception 'Reopen cleared values';end if;
 begin update public.crm_companies set won_monthly_value=-1 where id=c.id;raise exception 'Invalid value';exception when check_violation then null;end;
 update public.crm_companies set won_date=null,won_project_value=null,won_monthly_value=null,won_service='',won_notes='' where id=c.id;
end;$$;
rollback;
select 'Company/contact atomic creation and won fields passed; fixtures rolled back' as result;
