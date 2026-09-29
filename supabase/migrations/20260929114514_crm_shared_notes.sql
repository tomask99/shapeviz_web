-- Research notes keep their identity when a candidate becomes a CRM company.
create table public.crm_research_notes (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null,
 owner_id uuid not null,
 content text not null check(length(btrim(content)) between 1 and 5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 foreign key(candidate_id,owner_id) references public.crm_research_candidates(id,owner_id)
);
create index crm_research_notes_candidate_owner_idx on public.crm_research_notes(candidate_id,owner_id,created_at desc);
create index crm_research_notes_owner_idx on public.crm_research_notes(owner_id);
alter table public.crm_research_notes enable row level security;
revoke all on public.crm_research_notes from public,anon,authenticated;
grant select,delete on public.crm_research_notes to authenticated;
grant insert(candidate_id,owner_id,content) on public.crm_research_notes to authenticated;
grant update(content) on public.crm_research_notes to authenticated;
create policy crm_research_notes_owner on public.crm_research_notes for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.crm_research_candidates c where c.id=candidate_id and c.owner_id=(select auth.uid())))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.crm_research_candidates c where c.id=candidate_id and c.owner_id=(select auth.uid())));

create function crm_private.research_note_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.owner_id is distinct from auth.uid() then raise exception 'CRM access denied' using errcode='42501'; end if;
 if tg_op='INSERT' then
  new.version:=1;new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 else
  if new.id<>old.id or new.owner_id<>old.owner_id or new.candidate_id<>old.candidate_id then
   raise exception 'Record identity is immutable' using errcode='42501';
  end if;
  new.version:=old.version+1;new.created_at:=old.created_at;new.updated_at:=clock_timestamp();
 end if;
 return new;
end;
$$;
revoke all on function crm_private.research_note_stamp() from public,anon,authenticated,service_role;
create trigger crm_research_notes_stamp before insert or update on public.crm_research_notes
 for each row execute function crm_private.research_note_stamp();

-- RLS on both source tables still applies. Approval links existing notes without
-- copying them, so concurrent note creation and approval cannot lose a note.
create view public.crm_all_notes with (security_invoker=true) as
 select n.id,n.owner_id,n.company_id,null::uuid as candidate_id,n.content,n.created_at,n.updated_at,n.version
 from public.crm_notes n
 union all
 select n.id,n.owner_id,c.approved_company_id,n.candidate_id,n.content,n.created_at,n.updated_at,n.version
 from public.crm_research_notes n join public.crm_research_candidates c on c.id=n.candidate_id and c.owner_id=n.owner_id;
revoke all on public.crm_all_notes from public,anon,authenticated;
grant select on public.crm_all_notes to authenticated;

create function public.crm_note_summaries(p_company_ids uuid[] default '{}',p_candidate_ids uuid[] default '{}')
returns table(kind text,id uuid,note_count bigint,latest_note text)
language sql stable security invoker set search_path='' as $$
 with targets as (
  select 'company'::text as kind,c.id,c.id as company_id,null::uuid as candidate_id
  from public.crm_companies c where c.owner_id=auth.uid() and c.id=any(p_company_ids[1:200])
  union all
  select 'candidate',c.id,c.approved_company_id,c.id
  from public.crm_research_candidates c where c.owner_id=auth.uid() and c.id=any(p_candidate_ids[1:200])
 )
 select t.kind,t.id,s.note_count,s.latest_note from targets t
 cross join lateral (
  select count(*) as note_count,(array_agg(left(n.content,180) order by n.created_at desc,n.id))[1] as latest_note
  from public.crm_all_notes n where n.owner_id=auth.uid() and
   (case when t.company_id is not null then n.company_id=t.company_id else n.candidate_id=t.candidate_id end)
 ) s;
$$;
revoke all on function public.crm_note_summaries(uuid[],uuid[]) from public,anon;
grant execute on function public.crm_note_summaries(uuid[],uuid[]) to authenticated;
