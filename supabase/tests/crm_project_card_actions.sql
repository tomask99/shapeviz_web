begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c uuid; p uuid; sibling uuid; affected int;
begin
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Project action fixture','WON') returning id into c;
 insert into public.crm_clients(company_id,owner_id) values(c,auth.uid());
 insert into public.crm_projects(company_id,owner_id,name,status,monthly_value,brief) values(c,auth.uid(),'Monthly fixture','ACTIVE',650,'Keep this brief') returning id into p;
 insert into public.crm_projects(company_id,owner_id,name,status,project_value) values(c,auth.uid(),'Sibling fixture','COMPLETED',350) returning id into sibling;
 insert into public.crm_project_tasks(project_id,company_id,owner_id,title) values(p,c,auth.uid(),'Target task'),(sibling,c,auth.uid(),'Sibling task');
 insert into public.crm_project_notes(project_id,company_id,owner_id,content) values(p,c,auth.uid(),'Target note'),(sibling,c,auth.uid(),'Sibling note');
 perform set_config('crm.action_company',c::text,true);perform set_config('crm.action_project',p::text,true);perform set_config('crm.action_sibling',sibling::text,true);
 update public.crm_projects set status='ON_HOLD' where id=p and version=1;
 if (public.crm_project_revenue()->'monthly'->>'amount')::numeric<>0 then raise exception 'Paused monthly revenue counted';end if;
 update public.crm_projects set status='ACTIVE' where id=p and version=2;
 if (public.crm_project_revenue()->'monthly'->>'amount')::numeric<>650 then raise exception 'Resumed monthly revenue missing';end if;
 update public.crm_projects set status='COMPLETED' where id=p and version=3;
 if (public.crm_project_revenue()->'monthly'->>'amount')::numeric<>0 or (public.crm_project_revenue()->'one_time'->>'amount')::numeric<>350 then raise exception 'Completed revenue incorrect';end if;
 if not exists(select 1 from public.crm_projects where id=p and version=4 and monthly_value=650 and brief='Keep this brief') then raise exception 'Status action changed price or brief';end if;
 delete from public.crm_projects where id=p and version=1;get diagnostics affected=row_count;
 if affected<>0 or not exists(select 1 from public.crm_project_notes where project_id=p) then raise exception 'Stale delete removed data';end if;
end;
$test$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
do $test$
declare affected int;
begin
 update public.crm_projects set status='ACTIVE' where id=current_setting('crm.action_project')::uuid;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner changed status';end if;
 delete from public.crm_projects where id=current_setting('crm.action_project')::uuid;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner deleted project';end if;
 if exists(select 1 from public.crm_project_notes where project_id=current_setting('crm.action_project')::uuid) then raise exception 'Other owner read notes';end if;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
 begin delete from public.crm_projects where id=current_setting('crm.action_project')::uuid;raise exception 'Anonymous deletion allowed';exception when insufficient_privilege then null;end;
end;
$test$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c uuid:=current_setting('crm.action_company')::uuid;p uuid:=current_setting('crm.action_project')::uuid;sibling uuid:=current_setting('crm.action_sibling')::uuid;affected int;
begin
 update public.crm_companies set archived_at=now() where id=c;
 delete from public.crm_projects where id=p;get diagnostics affected=row_count;
 if affected<>0 or not exists(select 1 from public.crm_project_tasks where project_id=p) then raise exception 'Archived project deleted';end if;
 update public.crm_companies set archived_at=null where id=c;
 delete from public.crm_projects where id=p and version=4;get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Own project deletion failed';end if;
 if exists(select 1 from public.crm_project_tasks where project_id=p) or exists(select 1 from public.crm_project_notes where project_id=p) then raise exception 'Project children not deleted';end if;
 if not exists(select 1 from public.crm_clients where company_id=c) or not exists(select 1 from public.crm_project_tasks where project_id=sibling) or not exists(select 1 from public.crm_project_notes where project_id=sibling) then raise exception 'Unrelated client or project records deleted';end if;
end;
$test$;
reset role;
rollback;
select 'Project status, revenue, scoped deletion, cascade, archive and anonymous checks passed; fixtures rolled back' as result;
