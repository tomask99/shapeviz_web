-- Public website only. Existing visits are not retroactively labelled consented.
alter table public.website_sessions
  add column consent_version text,
  add column consent_chosen_at timestamptz,
  add column consent_recorded_at timestamptz;

create function public.record_consented_website_visit(
  p_id uuid, p_seconds integer, p_device text, p_location text, p_source text,
  p_consent_version text, p_consent_chosen_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare fresh boolean;
begin
  if p_consent_version is distinct from '1' or p_consent_chosen_at is null
     or p_consent_chosen_at > now() + interval '1 minute'
     or p_consent_chosen_at <= now() - interval '180 days' then
    raise exception 'Valid analytics consent required';
  end if;
  fresh := public.record_website_visit(p_id,p_seconds,p_device,p_location,p_source);
  update public.website_sessions set
    consent_version=p_consent_version,
    consent_chosen_at=p_consent_chosen_at,
    consent_recorded_at=now()
  where id=p_id and consent_recorded_at is null;
  return fresh;
end;
$$;
revoke all on function public.record_consented_website_visit(uuid,integer,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_consented_website_visit(uuid,integer,text,text,text,text,timestamptz) to service_role;

create index website_sessions_retention_idx on public.website_sessions(last_seen_at);
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('website-analytics-retention','25 3 * * *',
  $$delete from public.website_sessions where last_seen_at < now() - interval '180 days'$$);
