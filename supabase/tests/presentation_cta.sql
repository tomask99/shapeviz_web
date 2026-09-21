-- Test with an existing published deck, without retaining synthetic traffic.
begin;
do $$
declare
  deck text; visit uuid:=gen_random_uuid(); other_visit uuid:=gen_random_uuid(); event uuid:=gen_random_uuid();
  before_stats jsonb; after_stats jsonb; detail jsonb;
begin
  select deck_slug into deck from public.presentation_projects where status='published' and analytics_enabled limit 1;
  if deck is null then raise exception 'Test requires a published presentation'; end if;
  before_stats:=public.presentation_admin_stats(deck,30);
  perform public.record_presentation_event(visit,event,deck,'website_clicked');
  perform public.record_presentation_event(visit,event,deck,'website_clicked'); -- same delivery: count once
  perform public.record_presentation_event(visit,gen_random_uuid(),deck,'website_clicked');
  perform public.record_presentation_event(other_visit,gen_random_uuid(),deck,'session_started');
  after_stats:=public.presentation_admin_stats(deck,30);
  if (after_stats->'summary'->>'website_clicks')::integer<>(before_stats->'summary'->>'website_clicks')::integer+2 then raise exception 'Click total incorrect'; end if;
  if (after_stats->'summary'->>'website_click_sessions')::integer<>(before_stats->'summary'->>'website_click_sessions')::integer+1 then raise exception 'Unique visits incorrect'; end if;
  select value into detail from jsonb_array_elements(after_stats->'sessions') where value->>'id'=visit::text;
  if (detail->>'website_clicks')::integer<>2 then raise exception 'Session click total incorrect'; end if;
  if (after_stats->'decks'->0->>'website_clicks')::integer<>(after_stats->'summary'->>'website_clicks')::integer then raise exception 'Deck total incorrect'; end if;
  delete from public.presentation_sessions where id in (visit,other_visit);
  if public.presentation_admin_stats(deck,30)->'summary'<>before_stats->'summary' then raise exception 'Reset did not clear click events'; end if;
  if has_function_privilege('anon','public.presentation_admin_stats(text,integer)','EXECUTE') or
     has_function_privilege('authenticated','public.record_presentation_event(uuid,uuid,text,text,integer,text,double precision,integer,text)','EXECUTE') then raise exception 'RPC permissions exposed'; end if;
end;
$$;
rollback;
