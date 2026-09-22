begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_slug','crm-signals-'||gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare c uuid; slug text:=current_setting('crm.test_slug');begin
 insert into public.crm_companies(owner_id,company_name,pipeline_status) values(auth.uid(),'Signals fixture','CONTACTED') returning id into c;
 perform set_config('crm.test_company',c::text,true);
 insert into public.presentation_projects(deck_slug,client,title,presentation_date,description,source_type,source_bucket,source_path,status,is_template)
 values(slug,'Fixture','Pitch','2026','Fixture','standalone','presentation-source','test-only/not-uploaded','published',false);
 insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c,auth.uid(),slug);
 if (select engagement from public.crm_company_signals where id=c)<>'COLD' then raise exception 'Expected COLD';end if;
 begin perform public.crm_record_verified_visit(gen_random_uuid(),slug);raise exception 'Authenticated may verify';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare s uuid:=gen_random_uuid();slug text:=current_setting('crm.test_slug');c uuid:=current_setting('crm.test_company')::uuid;begin
 insert into public.presentation_sessions(id,deck_slug,active_seconds) values(s,slug,200);
 perform public.crm_record_verified_visit(s,slug);
 perform public.crm_record_verified_visit(s,slug);
 if (select pipeline_status from public.crm_companies where id=c)<>'PRESENTATION_VIEWED' then raise exception 'Auto viewed failed';end if;
 if (select count(*) from public.crm_activities where company_id=c and event_type='presentation_viewed')<>1 then raise exception 'Duplicate activity';end if;
 update public.crm_companies set pipeline_status='PROPOSAL' where id=c;
 insert into public.presentation_events(event_id,session_id,deck_slug,event_type) values(gen_random_uuid(),s,slug,'website_clicked');
 perform public.crm_record_verified_visit(s,slug);
 if (select pipeline_status from public.crm_companies where id=c)<>'PROPOSAL' then raise exception 'Advanced stage overwritten';end if;
 if not exists(select 1 from public.crm_activities where company_id=c and event_type='website_clicked') then raise exception 'Click activity missing';end if;
end $$;
reset role;
set local role authenticated;
do $$ declare c uuid:=current_setting('crm.test_company')::uuid;r record;begin
 select * into r from public.crm_company_signals where id=c;
 if r.engagement<>'HOT' or r.visits<>1 or r.clicks<>1 then raise exception 'Aggregate incorrect';end if;
 if (public.crm_list_companies('{"engagement":"HOT","presentation_status":"VIEWED","has_replied":"no"}',1)->>'total')::int<>1 then raise exception 'Filters incorrect';end if;
 if public.crm_engagement_level(1,0,0)<>'ACTIVE' or public.crm_engagement_level(3,0,0)<>'HOT' then raise exception 'Thresholds incorrect';end if;
 if jsonb_array_length(public.crm_business_overview(now(),now()+interval '24 hours')->'source_report')<>1 then raise exception 'Source report missing';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 if exists(select 1 from public.crm_company_signals) then raise exception 'Signals leaked';end if;
end $$;
rollback;
select 'Signals, filters, auto VIEWED, advanced stage retention, deduplication and RLS passed' result;
