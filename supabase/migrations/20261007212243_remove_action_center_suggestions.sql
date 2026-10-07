-- Retire only the Action Center and automated suggestion feature.
-- Shared follow-ups, company signals and business overview remain available.
drop function if exists public.crm_action_center(timestamptz,timestamptz,text,integer);
drop function if exists public.crm_suggestions(integer,boolean);
drop function if exists public.crm_set_suggestion_state(uuid,text,text);
drop function if exists public.crm_suggestion_rule(text,jsonb,boolean,timestamptz);
drop function if exists public.crm_suggestion_config();
drop table if exists public.crm_suggestion_state;
notify pgrst,'reload schema';
