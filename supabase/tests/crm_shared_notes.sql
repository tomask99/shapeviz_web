-- Rollback-only checks: shared history, optimistic concurrency and owner isolation.
begin;
select set_config('notes.owner',gen_random_uuid()::text,true);
select set_config('notes.other',gen_random_uuid()::text,true);
select set_config('notes.candidate',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('notes.owner')::uuid),(current_setting('notes.other')::uuid);
insert into public.presentation_admins(user_id,role) values(current_setting('notes.owner')::uuid,'owner'),(current_setting('notes.other')::uuid,'owner');
insert into public.crm_research_candidates(id,owner_id,company_name)
 values(current_setting('notes.candidate')::uuid,current_setting('notes.owner')::uuid,'Shared notes fixture');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('notes.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare company uuid; note uuid; affected integer;
begin
 insert into public.crm_companies(owner_id,company_name) values(auth.uid(),'Shared notes company') returning id into company;
 perform set_config('notes.company',company::text,true);
 insert into public.crm_research_notes(candidate_id,owner_id,content)
 values(current_setting('notes.candidate')::uuid,auth.uid(),'Research note') returning id into note;
 perform set_config('notes.note',note::text,true);
 if (select note_count from public.crm_note_summaries('{}',array[current_setting('notes.candidate')::uuid]))<>1 then raise exception 'Candidate count failed';end if;
 if (select note_count from public.crm_note_summaries(array[company],'{}'))<>0 then raise exception 'Unlinked notes leaked to company';end if;
 update public.crm_research_notes set content='Edited research note' where id=note and version=1;
 update public.crm_research_notes set content='Stale overwrite' where id=note and version=1;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale note update accepted';end if;
 if (select version from public.crm_research_notes where id=note)<>2 then raise exception 'Note version not incremented';end if;
 begin
  insert into public.crm_research_notes(candidate_id,owner_id,content) values(current_setting('notes.candidate')::uuid,auth.uid(),'   ');
  raise exception 'Blank note accepted';
 exception when check_violation then null;end;
 begin
  update public.crm_research_notes set candidate_id=gen_random_uuid() where id=note;
  raise exception 'Note identity changed';
 exception when insufficient_privilege then null;end;
end;
$$;
reset role;
-- The approval transaction establishes this link. No note copies or moves needed.
update public.crm_research_candidates set approved_company_id=current_setting('notes.company')::uuid,
 research_status='APPROVED',approved_at=clock_timestamp() where id=current_setting('notes.candidate')::uuid;
set local role authenticated;
do $$
declare note uuid;
begin
 insert into public.crm_notes(company_id,owner_id,content) values(current_setting('notes.company')::uuid,auth.uid(),'Latest company note') returning id into note;
 if (select count(*) from public.crm_all_notes where company_id=current_setting('notes.company')::uuid)<>2 then raise exception 'Research note lost on approval';end if;
 if (select count(*) from public.crm_note_summaries(array[current_setting('notes.company')::uuid],array[current_setting('notes.candidate')::uuid]) where note_count=2 and latest_note='Latest company note')<>2 then raise exception 'Candidate and company summaries differ';end if;
 delete from public.crm_notes where id=note;
 if (select latest_note from public.crm_note_summaries(array[current_setting('notes.company')::uuid],'{}'))<>'Edited research note' then raise exception 'Deletion did not reveal older research note';end if;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('notes.other'),'role','authenticated')::text,true);
do $$
declare affected integer;
begin
 if exists(select 1 from public.crm_all_notes where id=current_setting('notes.note')::uuid) then raise exception 'Other owner can read notes';end if;
 if exists(select 1 from public.crm_note_summaries(array[current_setting('notes.company')::uuid],array[current_setting('notes.candidate')::uuid])) then raise exception 'Other owner can read summary';end if;
 update public.crm_research_notes set content='Cross-owner edit' where id=current_setting('notes.note')::uuid;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner can edit note';end if;
 delete from public.crm_research_notes where id=current_setting('notes.note')::uuid;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner can delete note';end if;
 begin
  insert into public.crm_research_notes(candidate_id,owner_id,content) values(current_setting('notes.candidate')::uuid,auth.uid(),'Cross-owner insert');
  raise exception 'Other owner can add a note';
 exception when insufficient_privilege then null;end;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('notes.owner'),'role','authenticated')::text,true);
delete from public.crm_research_notes where id=current_setting('notes.note')::uuid and version=2;
do $$ begin
 if (select note_count from public.crm_note_summaries(array[current_setting('notes.company')::uuid],'{}'))<>0 then raise exception 'Last note deletion count failed';end if;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.crm_all_notes;raise exception 'Anonymous note read allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.crm_note_summaries('{}','{}');raise exception 'Anonymous summary allowed';exception when insufficient_privilege then null;end;
end; $$;
rollback;
