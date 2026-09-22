-- Private CRM recipients cannot reuse globally owner-readable legacy share links.
create table public.crm_presentation_recipients (
 id uuid primary key default gen_random_uuid(),
 association_id uuid references public.crm_presentation_links(id) on delete set null,
 company_id uuid not null,
 owner_id uuid not null,
 deck_slug text not null references public.presentation_projects(deck_slug) on delete cascade,
 contact_id uuid,
 recipient_name text not null check(length(btrim(recipient_name)) between 1 and 160),
 recipient_email text not null default '' check(length(recipient_email)<=254),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 revoked_at timestamptz check(revoked_at is null or isfinite(revoked_at)),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id),
 foreign key(contact_id,company_id,owner_id) references public.crm_contacts(id,company_id,owner_id) on delete set null(contact_id)
);
create index crm_recipients_company_idx on public.crm_presentation_recipients(company_id,owner_id,created_at desc,id);
create index crm_recipients_owner_idx on public.crm_presentation_recipients(owner_id);
create index crm_recipients_association_idx on public.crm_presentation_recipients(association_id);
create index crm_recipients_deck_idx on public.crm_presentation_recipients(deck_slug);
create index crm_recipients_contact_idx on public.crm_presentation_recipients(contact_id,company_id,owner_id);
alter table public.crm_presentation_recipients enable row level security;
revoke all on public.crm_presentation_recipients from public,anon,authenticated;
grant select,insert on public.crm_presentation_recipients to authenticated;
grant update(revoked_at) on public.crm_presentation_recipients to authenticated;
grant all on public.crm_presentation_recipients to service_role;
create policy crm_recipients_read on public.crm_presentation_recipients for select to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy crm_recipients_insert on public.crm_presentation_recipients for insert to authenticated with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_presentation_links l join public.crm_companies c on c.id=l.company_id join public.presentation_projects p on p.deck_slug=l.deck_slug
 where l.id=association_id and l.owner_id=(select auth.uid()) and l.company_id=crm_presentation_recipients.company_id and l.deck_slug=crm_presentation_recipients.deck_slug and c.archived_at is null and p.status='published' and not p.is_template and p.access_mode='unlisted'));
create policy crm_recipients_update on public.crm_presentation_recipients for update to authenticated using(
 owner_id=(select auth.uid()) and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()))) with check(owner_id=(select auth.uid()));
create function crm_private.recipient_revoke_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.revoked_at is not null then new.revoked_at:=old.revoked_at;
 elsif new.revoked_at is not null then new.revoked_at:=clock_timestamp();end if;
 return new;
end;$$;
revoke all on function crm_private.recipient_revoke_stamp() from public,anon,authenticated,service_role;
create trigger crm_recipient_revoke_stamp before update on public.crm_presentation_recipients for each row execute function crm_private.recipient_revoke_stamp();

alter table public.presentation_sessions add column recipient_id uuid references public.crm_presentation_recipients(id) on delete set null;
create index presentation_sessions_recipient_idx on public.presentation_sessions(recipient_id,started_at desc) where recipient_id is not null;

-- Service-only, minimal result; locks make revocation/unassignment atomic with event ingest.
create function public.crm_resolve_recipient(p_deck text,p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare found_id uuid;
begin
 select r.id into found_id from public.crm_presentation_recipients r
 join public.crm_presentation_links l on l.id=r.association_id and l.company_id=r.company_id and l.owner_id=r.owner_id and l.deck_slug=r.deck_slug
 join public.crm_companies c on c.id=r.company_id and c.owner_id=r.owner_id
 where r.deck_slug=p_deck and r.token_hash=p_hash and r.revoked_at is null and c.archived_at is null
 and exists(select 1 from public.presentation_admins a where a.user_id=r.owner_id and a.role='owner')
 for share of r,l,c;
 return found_id;
end;$$;

-- Existing ingestion and CRM observation remain the source of metrics/history.
create function public.record_presentation_attributed_event(
 p_session_id uuid,p_event_id uuid,p_deck_slug text,p_event_type text,
 p_slide_index integer default null,p_video_id text default null,p_video_progress double precision default null,
 p_active_seconds integer default 0,p_user_agent_category text default 'unknown',p_recipient_hash text default null,p_verified boolean default false
) returns void language plpgsql security invoker set search_path='' as $$
declare recipient uuid; previous_recipient uuid; previous_deck text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_session_id::text,0));
 if p_recipient_hash is not null then
  if not p_verified then raise exception 'Invalid attribution' using errcode='42501';end if;
  recipient:=public.crm_resolve_recipient(p_deck_slug,p_recipient_hash);
  if recipient is null then raise exception 'Link unavailable' using errcode='42501';end if;
 end if;
 select recipient_id,deck_slug into previous_recipient,previous_deck from public.presentation_sessions where id=p_session_id for update;
 if found and (previous_recipient is distinct from recipient or previous_deck<>p_deck_slug) then raise exception 'Session attribution mismatch' using errcode='42501';end if;
 perform public.record_presentation_event(p_session_id,p_event_id,p_deck_slug,p_event_type,p_slide_index,p_video_id,p_video_progress,p_active_seconds,p_user_agent_category);
 if recipient is not null then update public.presentation_sessions set recipient_id=recipient where id=p_session_id and deck_slug=p_deck_slug;end if;
 if p_verified then perform public.crm_record_verified_visit(p_session_id,p_deck_slug);end if;
end;$$;
revoke all on function public.crm_resolve_recipient(text,text),public.record_presentation_attributed_event(uuid,uuid,text,text,integer,text,double precision,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.crm_resolve_recipient(text,text),public.record_presentation_attributed_event(uuid,uuid,text,text,integer,text,double precision,integer,text,text,boolean) to service_role;
