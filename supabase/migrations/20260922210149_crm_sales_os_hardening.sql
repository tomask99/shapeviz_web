do $$declare d text;begin
 select pg_get_functiondef('public.crm_record_verified_visit(uuid,text)'::regprocedure) into d;
 d:=replace(d,'where deck_slug=p_deck and crm_verified and id<>p_session','where deck_slug=p_deck and crm_verified and (started_at,id)<(select started_at,id from public.presentation_sessions where id=p_session and deck_slug=p_deck)');execute d;
 select pg_get_viewdef('public.crm_company_signals'::regclass,true) into d;
 -- Keep original first-send values while considering explicit recipient sends as contact signals.
 d:=replace(d,'max(links.sent_at) AS last_contact','greatest(max(links.sent_at),(select max(r.sent_at) from public.crm_presentation_recipients r where r.company_id=links.company_id and r.owner_id=auth.uid())) AS last_contact');
 execute 'create or replace view public.crm_company_signals with(security_invoker=true) as '||d;
end;$$;
