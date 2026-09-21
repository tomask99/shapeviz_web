-- Non-destructive verification: all test records roll back.
begin;
do $$
declare visit uuid := gen_random_uuid(); fresh boolean; seconds integer;
begin
  if has_table_privilege('anon','public.website_sessions','SELECT') or
     has_table_privilege('authenticated','public.website_sessions','INSERT') or
     has_function_privilege('anon','public.record_website_visit(uuid,integer,text,text,text)','EXECUTE') or
     has_function_privilege('authenticated','public.website_admin_stats(integer)','EXECUTE') then
    raise exception 'Website analytics exposed to public roles';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.website_sessions'::regclass) then raise exception 'RLS missing'; end if;
  fresh := public.record_website_visit(visit,0,'Test device','Test location','test.invalid');
  if not fresh then raise exception 'First visit must be new'; end if;
  update public.website_sessions set started_at=now()-interval '2 minutes' where id=visit;
  fresh := public.record_website_visit(visit,30,'Changed','Changed','changed.invalid');
  if fresh then raise exception 'Duplicate visit'; end if;
  perform public.record_website_visit(visit,10,'Changed','Changed','changed.invalid');
  select active_seconds into seconds from public.website_sessions where id=visit;
  if seconds<>30 then raise exception 'Cumulative time was double counted or reduced'; end if;
  if (select source from public.website_sessions where id=visit)<>'test.invalid' then raise exception 'Original source changed'; end if;
  if (public.website_admin_stats(7)->'summary'->>'visits')::integer<1 then raise exception 'Visit missing from stats'; end if;
end;
$$;
rollback;
