begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare c public.crm_companies; n integer;
begin
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Lost fixture','LOST') returning * into c;
 perform set_config('crm.test_company',c.id::text,true);
 if c.lost_reason<>'' then raise exception 'Optional default failed';end if;
 update public.crm_companies set lost_reason='Budget' where id=c.id and version=1;
 update public.crm_companies set lost_reason='Timing' where id=c.id and version=1;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Stale write allowed';end if;
 update public.crm_companies set pipeline_status='REPLIED' where id=c.id;
 if (select lost_reason from public.crm_companies where id=c.id)<>'Budget' then raise exception 'Reopen erased reason';end if;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='status_changed' and metadata->>'to_status'='REPLIED') then raise exception 'Status history lost';end if;
 begin
  update public.crm_companies set lost_reason='Invalid' where id=c.id;
  raise exception 'Invalid reason allowed';
 exception when check_violation then null;end;
 update public.crm_companies set lost_reason='' where id=c.id;
 if (select lost_reason from public.crm_companies where id=c.id)<>'' then raise exception 'Clear failed';end if;
 insert into public.crm_companies(owner_id,company_name,pipeline_status,lost_reason) values(auth.uid(),'With reason','LOST','No reply');
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
 if exists(select 1 from public.crm_companies) then raise exception 'Cross-owner read';end if;
 update public.crm_companies set lost_reason='Timing' where id=current_setting('crm.test_company')::uuid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross-owner write';end if;
end;
$$;
set local role anon;
do $$ begin
 begin perform lost_reason from public.crm_companies;raise exception 'Anonymous read';exception when insufficient_privilege then null;end;
end;$$;
rollback;
select 'Lost reason validation, optional default, retention, history, version and isolation passed; fixtures rolled back' as result;
