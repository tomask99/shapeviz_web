-- Do not retain diagnostic sessions or send any real messages.
begin;
do $$
declare
  deck text; visit uuid:=gen_random_uuid(); click uuid:=gen_random_uuid(); claimed integer;
begin
  select deck_slug into deck from public.presentation_projects where status='published' and analytics_enabled limit 1;
  if deck is null then raise exception 'Test requires a published presentation'; end if;
  perform public.record_presentation_event(visit,click,deck,'website_clicked');
  update public.presentation_sessions set telegram_claimed_at=now() where id=visit;
  update public.presentation_events set telegram_claimed_at=now()
    where event_id=click and session_id=visit and deck_slug=deck and event_type='website_clicked' and telegram_claimed_at is null;
  get diagnostics claimed=row_count;
  if claimed<>1 then raise exception 'First click was not claimed independently of session'; end if;
  perform public.record_presentation_event(visit,click,deck,'website_clicked');
  update public.presentation_events set telegram_claimed_at=now()
    where event_id=click and session_id=visit and deck_slug=deck and event_type='website_clicked' and telegram_claimed_at is null;
  get diagnostics claimed=row_count;
  if claimed<>0 then raise exception 'Duplicate click was claimed twice'; end if;
  if not (select relrowsecurity from pg_class where oid='public.presentation_events'::regclass) then raise exception 'Event RLS disabled'; end if;
  if has_table_privilege('anon','public.presentation_events','UPDATE') or has_table_privilege('authenticated','public.presentation_events','UPDATE') then raise exception 'Claims exposed to clients'; end if;
end;
$$;
rollback;
