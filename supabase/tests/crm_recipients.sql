begin;
select set_config('crm.test_owner',gen_random_uuid()::text,true);
select set_config('crm.test_other',gen_random_uuid()::text,true);
select set_config('crm.test_deck','recipient-test-'||gen_random_uuid(),true);
insert into auth.users(id) values(current_setting('crm.test_owner')::uuid),(current_setting('crm.test_other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('crm.test_owner')::uuid,'owner'),(current_setting('crm.test_other')::uuid,'owner');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare c uuid;l uuid;r uuid;begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Recipient fixture') returning id into c;
 insert into public.presentation_projects(deck_slug,client,title,presentation_date,description,locale,status,source_type,template_key,access_mode,analytics_enabled,content)
 values(current_setting('crm.test_deck'),'Fixture','Fixture','2026','Fixture','en','published','template','test-template','unlisted',true,'{}');
 insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c,auth.uid(),current_setting('crm.test_deck')) returning id into l;
 insert into public.crm_presentation_recipients(association_id,company_id,owner_id,deck_slug,recipient_name,token_hash)
 values(l,c,auth.uid(),current_setting('crm.test_deck'),'Private name',repeat('a',64)) returning id into r;
 perform set_config('crm.test_recipient',r::text,true);perform set_config('crm.test_company',c::text,true);perform set_config('crm.test_link',l::text,true);
 update public.crm_presentation_recipients set sent_at=now() where id=r;
 update public.crm_presentation_recipients set sent_at=now() where id=r;
 if (select count(*) from public.crm_activities where metadata->>'recipient_id'=r::text and event_type='presentation_sent')<>1 then raise exception 'Duplicate/missing recipient sent event';end if;
 if (select sent_at from public.crm_presentation_links where id=l) is not null then raise exception 'Company sent timestamp overwritten';end if;
 begin update public.crm_presentation_recipients set sent_at=now()-interval '1 day' where id=r;raise exception 'Sent record overwritten';exception when check_violation then null;end;
 if (public.crm_recipient_stats(r)->>'visits')::int<>0 then raise exception 'Empty metrics fabricated';end if;
 begin perform public.crm_resolve_recipient(current_setting('crm.test_deck'),repeat('a',64));raise exception 'Authenticated public resolver';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_other'),'role','authenticated')::text,true);
 if exists(select 1 from public.crm_presentation_recipients) then raise exception 'Other owner read';end if;
 begin perform public.crm_recipient_stats(r);raise exception 'Other owner analytics';exception when insufficient_privilege then null;end;
 update public.crm_presentation_recipients set revoked_at=now() where id=r;
 if found then raise exception 'Other owner update';end if;
 begin insert into public.crm_presentation_recipients(association_id,company_id,owner_id,deck_slug,recipient_name,token_hash) values(l,c,auth.uid(),current_setting('crm.test_deck'),'Spoof',repeat('b',64));raise exception 'Cross-owner insert';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare s uuid:=gen_random_uuid();e uuid:=gen_random_uuid();g uuid:=gen_random_uuid();r uuid:=current_setting('crm.test_recipient')::uuid;r2 uuid;deck text:=current_setting('crm.test_deck');begin
 if public.crm_resolve_recipient(deck,repeat('a',64)) is distinct from r then raise exception 'Resolution';end if;
 if public.crm_resolve_recipient('wrong-deck',repeat('a',64)) is not null then raise exception 'Cross deck';end if;
 perform public.record_presentation_attributed_event(s,e,deck,'slide_viewed',2,null,null,5,'desktop',repeat('a',64),true);
 perform public.record_presentation_attributed_event(s,gen_random_uuid(),deck,'website_clicked',null,null,null,0,'desktop',repeat('a',64),true);
 perform public.record_presentation_attributed_event(s,e,deck,'slide_viewed',2,null,null,5,'desktop',repeat('a',64),true);
 if not exists(select 1 from public.presentation_sessions where id=s and recipient_id=r and crm_verified and active_seconds=5) then raise exception 'Attribution or deduplication';end if;
 insert into public.crm_presentation_recipients(association_id,company_id,owner_id,deck_slug,recipient_name,token_hash)
 select association_id,company_id,owner_id,deck_slug,'Second recipient',repeat('b',64) from public.crm_presentation_recipients where id=r returning id into r2;
 begin perform public.record_presentation_attributed_event(s,gen_random_uuid(),deck,'session_started',null,null,null,0,'desktop',repeat('b',64),true);raise exception 'Recipient steals other session';exception when insufficient_privilege then null;end;
 perform public.record_presentation_attributed_event(gen_random_uuid(),gen_random_uuid(),deck,'session_started',null,null,null,0,'desktop',repeat('b',64),true);
 if not exists(select 1 from public.presentation_sessions where recipient_id=r2) then raise exception 'Second recipient attribution';end if;
 begin perform public.record_presentation_attributed_event(s,gen_random_uuid(),deck,'session_started');raise exception 'Generic writes into recipient session';exception when insufficient_privilege then null;end;
 perform public.record_presentation_attributed_event(g,gen_random_uuid(),deck,'session_started');
 begin perform public.record_presentation_attributed_event(g,gen_random_uuid(),deck,'session_started',null,null,null,0,'desktop',repeat('a',64),true);raise exception 'Recipient steals generic session';exception when insufficient_privilege then null;end;
 update public.crm_presentation_recipients set revoked_at=now() where id=r;
 if public.crm_resolve_recipient(deck,repeat('a',64)) is not null then raise exception 'Revoked resolver';end if;
 begin perform public.record_presentation_attributed_event(s,gen_random_uuid(),deck,'session_heartbeat',null,null,null,5,'desktop',repeat('a',64),true);raise exception 'Revoked write';exception when insufficient_privilege then null;end;
 if (select active_seconds from public.presentation_sessions where id=s)<>5 then raise exception 'Revocation changed analytics';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('crm.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare result jsonb;begin
 result:=public.crm_recipient_stats(current_setting('crm.test_recipient')::uuid);
 if (result->>'visits')::int<>1 or (result->>'seconds')::int<>5 or (result->>'slides_viewed')::int<>1 or (result->>'website_clicks')::int<>1 then raise exception 'Recipient metrics include another recipient or duplicate events';end if;
 begin perform public.crm_recipient_stats(current_setting('crm.test_recipient')::uuid,365);raise exception 'Invalid period';exception when invalid_parameter_value then null;end;
end $$;
delete from public.crm_presentation_links where id=current_setting('crm.test_link')::uuid;
reset role;
set local role service_role;
do $$ begin
 if public.crm_resolve_recipient(current_setting('crm.test_deck'),repeat('b',64)) is not null then raise exception 'Unassigned link valid';end if;
 if (select count(*) from public.presentation_sessions where deck_slug=current_setting('crm.test_deck'))<>3 then raise exception 'Unassign erased analytics';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.crm_presentation_recipients;raise exception 'Anonymous read';exception when insufficient_privilege then null;end;
 begin perform public.crm_resolve_recipient('x',repeat('a',64));raise exception 'Anonymous resolution';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Recipient ownership, resolution, atomic attribution, session isolation, deduplication and revocation passed' result;
