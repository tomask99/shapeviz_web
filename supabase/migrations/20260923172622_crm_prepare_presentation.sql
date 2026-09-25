-- Retire the redundant qualification stage, preserving companies and history.
alter table public.crm_companies disable trigger crm_company_before;
alter table public.crm_companies disable trigger crm_company_after;
with moved as (
 update public.crm_companies set pipeline_status='NEW_LEAD',version=version+1,updated_at=clock_timestamp()
 where pipeline_status='QUALIFIED' returning id,owner_id
)
insert into public.crm_activities(company_id,owner_id,event_type,metadata)
select id,owner_id,'status_changed',jsonb_build_object('from_status','QUALIFIED','to_status','NEW_LEAD','reason','Qualification stage retired') from moved;
alter table public.crm_companies enable trigger crm_company_before;
alter table public.crm_companies enable trigger crm_company_after;
alter table public.crm_companies drop constraint crm_companies_pipeline_status_check;
alter table public.crm_companies add constraint crm_companies_pipeline_status_check check(pipeline_status in ('NEW_LEAD','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'));
update public.crm_saved_views set filter_config=jsonb_set(filter_config,'{pipeline_status}','"NEW_LEAD"'::jsonb) where filter_config->>'pipeline_status'='QUALIFIED';

-- Preserve the latest search implementation; only retire its status choice.
do $$declare definition text;begin
 select pg_get_functiondef('public.crm_tool_search_leads(jsonb,integer)'::regprocedure) into definition;
 execute replace(definition,'''NEW_LEAD'',''QUALIFIED'',''PRESENTATION_READY''','''NEW_LEAD'',''PRESENTATION_READY''');
 select pg_get_functiondef('public.crm_suggestion_rule(text,jsonb,boolean,timestamptz)'::regprocedure) into definition;
 execute replace(definition,'when p_status=''QUALIFIED'' and p_contacted=false then ''QUALIFIED_NOT_CONTACTED''','');
end;$$;

-- Linking and the stage change either both succeed or both roll back. Storage
-- preparation precedes this transaction; the stable deck slug makes retry safe.
create function public.crm_finish_prepared_presentation(p_company uuid,p_deck text,p_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.crm_companies; p public.presentation_projects; l public.crm_presentation_links;
begin
 if auth.uid() is null or not exists(select 1 from public.presentation_admins where user_id=auth.uid() and role='owner') then
  raise exception 'Owner access required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731903));
 select * into c from public.crm_companies where id=p_company and owner_id=auth.uid() for update;
 if not found then raise exception 'Company not found' using errcode='PT404';end if;
 if c.archived_at is not null then raise exception 'Company archived' using errcode='PT409';end if;
 select * into p from public.presentation_projects where deck_slug=p_deck for share;
 if not found or p.is_template or p.status<>'published' or
  p.content->>'_prepareOwner' is distinct from auth.uid()::text or
  p.content->>'_prepareCompany' is distinct from c.id::text or
  p.content->>'_prepareVersion' is distinct from p_version::text then
  raise exception 'Prepared presentation not available' using errcode='PT409';
 end if;
 select * into l from public.crm_presentation_links where deck_slug=p_deck and company_id=c.id and owner_id=auth.uid();
 if found then return jsonb_build_object('company',to_jsonb(c),'replayed',true);end if;
 if p_version is null or c.version<>p_version or p.client<>c.company_name then
  raise exception 'Company changed during preparation' using errcode='PT409';
 end if;
 insert into public.crm_presentation_links(company_id,owner_id,deck_slug) values(c.id,auth.uid(),p_deck);
 update public.crm_companies set pipeline_status='PRESENTATION_READY' where id=c.id and owner_id=auth.uid() and pipeline_status<>'PRESENTATION_READY' returning * into c;
 if not found then select * into c from public.crm_companies where id=p_company and owner_id=auth.uid();end if;
 return jsonb_build_object('company',to_jsonb(c),'replayed',false);
end;$$;
revoke all on function public.crm_finish_prepared_presentation(uuid,text,integer) from public,anon;
grant execute on function public.crm_finish_prepared_presentation(uuid,text,integer) to authenticated;
