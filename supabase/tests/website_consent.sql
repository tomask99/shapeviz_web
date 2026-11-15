begin;
do $$
declare visit uuid := gen_random_uuid(); fresh boolean;
begin
  if has_function_privilege('anon','public.record_consented_website_visit(uuid,integer,text,text,text,text,timestamptz)','EXECUTE') or
     has_function_privilege('authenticated','public.record_consented_website_visit(uuid,integer,text,text,text,text,timestamptz)','EXECUTE') then
    raise exception 'Public analytics write exposed';
  end if;
  fresh := public.record_consented_website_visit(visit,0,'Test','Test','test.invalid','1',now());
  if not fresh or not exists(select 1 from public.website_sessions where id=visit and consent_version='1' and consent_recorded_at is not null) then
    raise exception 'Consent evidence missing';
  end if;
  if public.record_consented_website_visit(visit,0,'Test','Test','test.invalid','1',now()) then raise exception 'Duplicate visit'; end if;
  begin
    perform public.record_consented_website_visit(gen_random_uuid(),0,'Test','Test','test.invalid','1',now()-interval '181 days');
    raise exception 'Expired consent accepted';
  exception when raise_exception then
    if sqlerrm <> 'Valid analytics consent required' then raise; end if;
  end;
  update public.website_sessions set last_seen_at=now()-interval '181 days' where id=visit;
  -- Restrict this test delete to its own fixture. Production uses the scheduled predicate.
  delete from public.website_sessions where id=visit and last_seen_at < now()-interval '180 days';
  if exists(select 1 from public.website_sessions where id=visit) then raise exception 'Expired visit retained'; end if;
  if not exists(select 1 from cron.job where jobname='website-analytics-retention' and active and schedule='25 3 * * *') then raise exception 'Retention schedule missing'; end if;
end;
$$;
rollback;
