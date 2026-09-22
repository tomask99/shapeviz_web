-- Rollback-only fixtures. No existing company or contact is touched.
begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; c2 public.crm_companies; ct public.crm_contacts; f public.crm_followups; result jsonb; affected integer;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Follow-up fixture') returning * into c;
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Other company') returning * into c2;
 insert into public.crm_contacts(company_id,owner_id,full_name) values(c.id,auth.uid(),'Contact fixture') returning * into ct;
 insert into public.crm_followups(company_id,owner_id,contact_id,title,due_at)
 values(c.id,auth.uid(),ct.id,'Send proposal','2026-10-25 01:30Z') returning * into f;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='followup_created') then raise exception 'Creation history missing';end if;
 begin
  insert into public.crm_followups(company_id,owner_id,contact_id,title,due_at) values(c2.id,auth.uid(),ct.id,'Wrong contact',now());
  raise exception 'Cross-company contact accepted';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.crm_followups(company_id,owner_id,title,due_at) values(c.id,current_setting('crm.other_owner')::uuid,'Wrong owner',now());
  raise exception 'Cross-owner insert accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.crm_activities(company_id,owner_id,event_type) values(c.id,auth.uid(),'followup_completed');
  raise exception 'Forged event accepted';
 exception when insufficient_privilege then null;end;
 result:=public.crm_list_followups('2026-10-24 22:00Z','2026-10-25 23:00Z',c.id,'today',1);
 if (result->'groups'->0->>'total')::int<>1 then raise exception 'DST day grouping failed';end if;
 if public.crm_next_actions(array[c.id])->c.id::text->>'id'<>f.id::text then raise exception 'Next action missing';end if;
 update public.crm_followups set due_at='2026-10-26 08:00Z' where id=f.id and version=1;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='followup_rescheduled') then raise exception 'Reschedule history missing';end if;
 update public.crm_followups set completed_at=now() where id=f.id and version=1;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Stale version accepted';end if;
 update public.crm_followups set completed_at=now() where id=f.id and version=2 and completed_at is null;
 update public.crm_followups set completed_at=now() where id=f.id and version=2 and completed_at is null;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='followup_completed')<>1 then raise exception 'Completion not atomic/deduplicated';end if;
 if public.crm_next_actions(array[c.id])<>'{}'::jsonb then raise exception 'Completed next action visible';end if;
 delete from public.crm_contacts where id=ct.id;
 if exists(select 1 from public.crm_followups where id=f.id and contact_id is not null) then raise exception 'Deleted contact not detached';end if;
 insert into public.crm_followups(company_id,owner_id,title,due_at) values(c.id,auth.uid(),'Future action','2026-10-26 08:00Z');
 insert into public.crm_followups(company_id,owner_id,title,due_at) values(c.id,auth.uid(),'Overdue action','2026-10-23 08:00Z');
 result:=public.crm_next_actions(array[c.id]);if result->c.id::text->>'title'<>'Overdue action' then raise exception 'Earliest incomplete not selected';end if;
 result:=public.crm_list_followups('2026-10-24 22:00Z','2026-10-25 23:00Z');
 if (result->'groups'->0->>'total')::int<>1 or (result->'groups'->2->>'total')::int<>1 or (result->'groups'->3->>'total')::int<>1 then raise exception 'Group counts incorrect';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
 if exists(select 1 from public.crm_followups where company_id=c.id) then raise exception 'Other owner read follow-ups';end if;
 update public.crm_followups set title='Stolen' where company_id=c.id;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Other owner wrote follow-ups';end if;
 if public.crm_next_actions(array[c.id])<>'{}'::jsonb then raise exception 'Other owner read next action';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
 update public.crm_companies set archived_at=now() where id=c.id;
 if public.crm_next_actions(array[c.id])<>'{}'::jsonb then raise exception 'Archived next action visible';end if;
 result:=public.crm_list_followups('2026-10-24 22:00Z','2026-10-25 23:00Z',c.id);
 if exists(select 1 from jsonb_array_elements(result->'groups') g where (g->>'total')::int<>0) then raise exception 'Archived follow-ups visible';end if;
 update public.crm_followups set title='Archived edit' where company_id=c.id;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Archived follow-up edited';end if;
 begin
  insert into public.crm_followups(company_id,owner_id,title,due_at) values(c.id,auth.uid(),'Archived create',now());
  raise exception 'Archived follow-up created';
 exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
rollback;
select 'Follow-ups ownership, contact integrity, history, versions, grouping and archive passed; fixtures rolled back' as result;
