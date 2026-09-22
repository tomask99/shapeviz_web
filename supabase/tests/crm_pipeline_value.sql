begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare d jsonb; c uuid;
begin
 d:=public.crm_business_overview(now(),now()+interval '1 day')->'pipeline_value';
 if d is null or (d->'one_time'->>'count')::int<>0 or (d->'monthly'->>'amount')::numeric<>0 or (d->>'missing_count')::int<>0 then raise exception 'Empty incorrect: %',d;end if;
 insert into public.crm_companies(owner_id,company_name,pipeline_status,estimated_value,value_type) values
 (auth.uid(),'One A','REPLIED',1000.10,'ONE_TIME'),
 (auth.uid(),'One B','MEETING',2000.20,'ONE_TIME'),
 (auth.uid(),'Monthly','PROPOSAL',1500.25,'MONTHLY'),
 (auth.uid(),'Zero','REPLIED',0,'MONTHLY'),
 (auth.uid(),'Unknown frequency','MEETING',500,'UNKNOWN'),
 (auth.uid(),'Missing','PROPOSAL',null,'UNKNOWN'),
 (auth.uid(),'Won','WON',999,'ONE_TIME'),
 (auth.uid(),'Lost','LOST',999,'MONTHLY'),
 (auth.uid(),'Early','CONTACTED',999,'ONE_TIME');
 insert into public.crm_companies(owner_id,company_name,pipeline_status,estimated_value,value_type) values(auth.uid(),'Archived','MEETING',999,'ONE_TIME') returning id into c;
 update public.crm_companies set archived_at=now() where id=c;
 d:=public.crm_business_overview(now(),now()+interval '1 day')->'pipeline_value';
 if d->>'currency'<>'EUR' or (d->'one_time'->>'amount')::numeric<>3000.30 or (d->'one_time'->>'count')::int<>2 or (d->'monthly'->>'amount')::numeric<>1500.25 or (d->'monthly'->>'count')::int<>2 or (d->>'missing_count')::int<>1 or (d->>'unknown_frequency_count')::int<>1 then raise exception 'Split/exclusions incorrect: %',d;end if;
 if jsonb_typeof(d->'one_time'->'amount')<>'string' then raise exception 'Amount must be decimal string';end if;
 update public.crm_companies set pipeline_status='WON' where company_name='One A';
 update public.crm_companies set estimated_value=null,value_type='UNKNOWN' where company_name='Monthly';
 d:=public.crm_business_overview(now(),now()+interval '1 day')->'pipeline_value';
 if (d->'one_time'->>'amount')::numeric<>2000.20 or (d->'monthly'->>'amount')::numeric<>0 or (d->'monthly'->>'count')::int<>1 or (d->>'missing_count')::int<>2 then raise exception 'Updates not reflected: %',d;end if;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
do $$
declare d jsonb;
begin
 d:=public.crm_business_overview(now(),now()+interval '1 day')->'pipeline_value';
 if (d->'one_time'->>'amount')::numeric<>0 or (d->'monthly'->>'count')::int<>0 or (d->>'missing_count')::int<>0 or (d->>'unknown_frequency_count')::int<>0 then raise exception 'Cross-owner leak: %',d;end if;
end;
$$;
reset role;
-- A signed-in non-admin must not gain visibility through the invoker RPC.
delete from public.presentation_admins where user_id=current_setting('crm.test_owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
begin
 if (public.crm_business_overview(now(),now()+interval '1 day')->'pipeline_value'->'one_time'->>'count')::int<>0 then raise exception 'Non-admin leak';end if;
end;
$$;
set local role anon;
do $$
begin
 begin perform public.crm_business_overview(now(),now()+interval '1 day');raise exception 'Anonymous execute allowed';exception when insufficient_privilege then null;end;
end;
$$;
rollback;
select 'Split totals, precision, zero/missing, closed/archive exclusion, updates and isolation passed; fixtures rolled back' as result;
