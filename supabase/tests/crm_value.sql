begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare c public.crm_companies; bad numeric; n integer;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Value fixture') returning * into c;
 perform set_config('crm.test_company',c.id::text,true);
 if c.estimated_value is not null or c.value_type<>'UNKNOWN' then raise exception 'Legacy default failed'; end if;
 update public.crm_companies set estimated_value=1500.25,value_type='MONTHLY' where id=c.id and version=c.version;
 select * into c from public.crm_companies where id=c.id;
 if c.estimated_value<>1500.25 or c.value_type<>'MONTHLY' or c.version<>2 then raise exception 'Save failed'; end if;
 update public.crm_companies set estimated_value=5 where id=c.id and version=1;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Stale update allowed'; end if;
 update public.crm_companies set company_name='Legacy edit' where id=c.id;
 if (select estimated_value from public.crm_companies where id=c.id)<>1500.25 then raise exception 'Legacy edit erased amount'; end if;
 foreach bad in array array[-1,1.001,1000000000,'NaN'::numeric,'Infinity'::numeric] loop
  begin
   update public.crm_companies set estimated_value=bad where id=c.id;
   raise exception 'Invalid amount allowed: %',bad;
  exception when check_violation then null; end;
 end loop;
 begin
  update public.crm_companies set value_type='WEEKLY' where id=c.id;
  raise exception 'Invalid type allowed';
 exception when check_violation then null; end;
 begin
  update public.crm_companies set estimated_value=null where id=c.id;
  raise exception 'Missing value with monthly frequency allowed';
 exception when check_violation then null; end;
 update public.crm_companies set estimated_value=0,value_type='ONE_TIME' where id=c.id;
 if (select estimated_value from public.crm_companies where id=c.id) is distinct from 0::numeric then raise exception 'Zero lost'; end if;
 update public.crm_companies set estimated_value=null,value_type='UNKNOWN' where id=c.id;
 if (public.crm_list_companies('{}',1)->'companies'->0->>'estimated_value') is not null then raise exception 'Clear failed'; end if;
 insert into public.crm_companies(owner_id,company_name,estimated_value,value_type) values(auth.uid(),'Create with value',999999999.99,'UNKNOWN');
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
 if exists(select 1 from public.crm_companies) then raise exception 'Cross-owner read'; end if;
 update public.crm_companies set estimated_value=99 where id=current_setting('crm.test_company')::uuid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross-owner write'; end if;
end;
$$;
set local role anon;
do $$
begin
 begin
  perform estimated_value from public.crm_companies;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'Opportunity value checks passed; fixtures rolled back' as result;
