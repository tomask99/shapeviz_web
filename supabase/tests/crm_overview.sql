begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c uuid; archived uuid; f uuid; d jsonb; start_day timestamptz:='2026-03-28T23:00:00Z'; end_day timestamptz:='2026-03-29T22:00:00Z';
begin
 d:=public.crm_business_overview(start_day,end_day);
 if (d->>'total_leads')::int<>0 or jsonb_array_length(d->'next_tasks')<>0 then raise exception 'Empty state incorrect';end if;
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Contacted','CONTACTED') returning id into c;
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Meeting','MEETING'),(auth.uid(),'Won','WON'),(auth.uid(),'Lost','LOST');
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Archived') returning id into archived;
 insert into public.crm_activities(company_id,owner_id,event_type,metadata) values(c,auth.uid(),'reply_received','{"received_at":"2026-01-01T00:00:00.000Z","content":"One"}'),(c,auth.uid(),'reply_received','{"received_at":"2026-01-02T00:00:00.000Z","content":"Two"}');
 insert into public.crm_followups(company_id,owner_id,title,due_at) values(c,auth.uid(),'Overdue',start_day-interval '1 second'),(c,auth.uid(),'Today start',start_day),(c,auth.uid(),'Today end',end_day-interval '1 second'),(c,auth.uid(),'Tomorrow',end_day),(archived,auth.uid(),'Excluded archive',start_day);
 insert into public.crm_followups(company_id,owner_id,title,due_at) values(c,auth.uid(),'Completed',start_day) returning id into f;
 update public.crm_followups set completed_at=now() where id=f;
 update public.crm_companies set archived_at=now() where id=archived;
 d:=public.crm_business_overview(start_day,end_day);
 if (d->>'total_leads')::int<>4 or (d->>'replies_recorded')::int<>1 or (d->'stages'->>'WON')::int<>1 or (d->'stages'->>'LOST')::int<>1 then raise exception 'Lead counts incorrect: %',d;end if;
 if d->'followups'<>'{"overdue":1,"today":2,"upcoming":1}'::jsonb or jsonb_array_length(d->'next_tasks')<>4 or d->'next_tasks'->0->>'title'<>'Overdue' then raise exception 'Task counts/boundaries incorrect: %',d;end if;
 insert into public.crm_followups(company_id,owner_id,title,due_at) select c,auth.uid(),'Future '||i,end_day+make_interval(days=>i) from generate_series(1,8) i;
 if jsonb_array_length(public.crm_business_overview(start_day,end_day)->'next_tasks')<>5 then raise exception 'Task list unbounded';end if;
 begin perform public.crm_business_overview(start_day,start_day);raise exception 'Invalid day accepted';exception when invalid_parameter_value then null;end;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
do $test$
declare d jsonb;
begin
 d:=public.crm_business_overview('2026-03-28T23:00:00Z','2026-03-29T22:00:00Z');
 if (d->>'total_leads')::int<>0 or (d->>'replies_recorded')::int<>0 or jsonb_array_length(d->'next_tasks')<>0 then raise exception 'Other owner data leak';end if;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
 begin perform public.crm_business_overview(now(),now()+interval '1 day');raise exception 'Anon allowed';exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
rollback;
select 'Overview counts, ownership, archive, distinct replies, DST boundaries and bounded tasks passed; fixtures rolled back' as result;
