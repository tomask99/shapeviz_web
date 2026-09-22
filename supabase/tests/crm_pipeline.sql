-- Pipeline uses existing company/RLS/audit infrastructure. All fixtures roll back.
begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; affected integer; result jsonb;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Pipeline fixture') returning * into c;
 update public.crm_companies set pipeline_status='QUALIFIED'
 where id=c.id and owner_id=auth.uid() and version=c.version and archived_at is null;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Active move failed';end if;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='status_changed'
  and metadata->>'from_status'='NEW_LEAD' and metadata->>'to_status'='QUALIFIED') then raise exception 'Move history missing';end if;
 update public.crm_companies set pipeline_status='WON' where id=c.id and version=1 and archived_at is null;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale move overwrote current status';end if;
 result:=public.crm_list_companies('{"pipeline_status":"QUALIFIED","archived":"active","sort":"updated"}',1);
 if (result->>'total')::int<>1 then raise exception 'Stage query missing company';end if;
 update public.crm_companies set pipeline_status='LOST' where id=c.id and version=2 and archived_at is null;
 if (public.crm_list_companies('{"pipeline_status":"LOST","archived":"active"}',1)->>'total')::int<>1 then raise exception 'Lost view failed';end if;
 update public.crm_companies set archived_at=now() where id=c.id;
 select * into c from public.crm_companies where id=c.id;
 update public.crm_companies set pipeline_status='NEW_LEAD' where id=c.id and version=c.version and archived_at is null;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Archived company moved';end if;
 if (public.crm_list_companies('{"pipeline_status":"LOST","archived":"active"}',1)->>'total')::int<>0 then raise exception 'Archived company visible in pipeline';end if;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='status_changed')<>2 then raise exception 'Unexpected move audit count';end if;
end;
$test$;
reset role;
rollback;
select 'Pipeline persistence, atomic history, stale version and archived exclusion passed; fixture rolled back' as result;
