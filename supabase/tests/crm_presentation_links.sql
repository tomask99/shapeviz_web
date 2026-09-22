begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.other_owner',gen_random_uuid()::text,true);
select set_config('crm.test_slug','crm-test-'||gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.other_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.other_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c public.crm_companies; other_c public.crm_companies; ct public.crm_contacts; l public.crm_presentation_links; affected integer; slug text:=current_setting('crm.test_slug');
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Presentation link fixture') returning * into c;
 perform set_config('crm.test_company',c.id::text,true);
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Other company') returning * into other_c;
 insert into public.crm_contacts(company_id,owner_id,full_name) values(other_c.id,auth.uid(),'Wrong-company contact') returning * into ct;
 insert into public.presentation_projects(deck_slug,client,title,presentation_date,description,source_type,source_bucket,source_path,status,is_template)
 values(slug,'Fixture','Pitch','2026-09-22','Fixture','standalone','presentation-source','test-only/not-uploaded','published',false),
 (slug||'-template','Fixture','Template','2026-09-22','Fixture','standalone','presentation-source','test-only/not-uploaded','draft',true);
 begin
  insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c.id,auth.uid(),slug||'-template');
  raise exception 'Template assignment accepted';
 exception when insufficient_privilege then null;end;
 insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c.id,auth.uid(),slug) returning * into l;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='presentation_assigned') then raise exception 'Assignment history missing';end if;
 if jsonb_array_length(public.crm_presentation_catalog(slug,1)->'items')<>0 then raise exception 'Catalog includes linked/template deck';end if;
 begin
  insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(other_c.id,auth.uid(),slug);
  raise exception 'Duplicate assignment accepted';
 exception when unique_violation then null;end;
 begin
  update public.crm_presentation_links set sent_at=now(),sent_to_contact_id=ct.id where id=l.id;
  raise exception 'Wrong company contact accepted';
 exception when foreign_key_violation then null;end;
 update public.crm_presentation_links set sent_at=now() where id=l.id and version=1 and sent_at is null;
 update public.crm_presentation_links set sent_at=now() where id=l.id and version=1 and sent_at is null;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Stale sent write accepted';end if;
 if (select count(*) from public.crm_activities where company_id=c.id and event_type='presentation_sent')<>1 then raise exception 'Sent history duplicated/missing';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.other_owner'),'role','authenticated')::text,true);
 if exists(select 1 from public.crm_presentation_links where id=l.id) then raise exception 'Other owner reads private association';end if;
 delete from public.crm_presentation_links where id=l.id;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner removed association';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
 delete from public.crm_presentation_links where id=l.id and version=2;
 if not exists(select 1 from public.presentation_projects where deck_slug=slug) then raise exception 'Unassign deleted presentation';end if;
 if not exists(select 1 from public.crm_activities where company_id=c.id and event_type='presentation_unassigned') then raise exception 'Unassignment history missing';end if;
 insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c.id,auth.uid(),slug);
end;
$test$;
reset role;
-- Existing server-side delete uses service_role without a user JWT. Its FK cleanup must work.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $test$
declare session_id uuid:=gen_random_uuid(); stats jsonb; slug text:=current_setting('crm.test_slug');
begin
 insert into public.presentation_sessions(id,deck_slug,active_seconds,max_slide) values(session_id,slug,268,8);
 insert into public.presentation_events(event_id,session_id,deck_slug,event_type,slide_index)
 values(gen_random_uuid(),session_id,slug,'slide_viewed',1),(gen_random_uuid(),session_id,slug,'slide_viewed',1),
 (gen_random_uuid(),session_id,slug,'slide_viewed',2),(gen_random_uuid(),session_id,slug,'website_clicked',null);
 stats:=public.presentation_admin_stats(slug,30);
 if (stats->'summary'->>'visits')::int<>1 or (stats->'summary'->>'seconds')::int<>268 or (stats->'summary'->>'website_clicks')::int<>1 then raise exception 'Existing analytics summary differs';end if;
 if (select count(*) from jsonb_array_elements(stats->'slides') s where (s->>'views')::int>0)<>2 then raise exception 'Distinct slides differs from max slide';end if;
 delete from public.presentation_sessions where deck_slug=slug;
 if not exists(select 1 from public.crm_presentation_links where deck_slug=slug) then raise exception 'Analytics reset removed link';end if;
 if not exists(select 1 from public.crm_activities where company_id=current_setting('crm.test_company')::uuid and event_type='presentation_sent') then raise exception 'Analytics reset removed sales history';end if;
end;
$test$;
delete from public.presentation_projects where deck_slug=current_setting('crm.test_slug');
reset role;
do $test$
begin
 if exists(select 1 from public.crm_presentation_links where deck_slug=current_setting('crm.test_slug')) then raise exception 'Deleted deck link remained';end if;
 if not exists(select 1 from public.crm_companies where id=current_setting('crm.test_company')::uuid) then raise exception 'Deck delete removed company';end if;
 if (select count(*) from public.crm_activities where company_id=current_setting('crm.test_company')::uuid and event_type='presentation_sent')<>1 then raise exception 'Deck delete removed sales history';end if;
end;
$test$;
rollback;
select 'Presentation links, ownership, contacts, sent history and service-role deck deletion passed; fixtures rolled back' as result;
