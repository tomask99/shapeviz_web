-- Lifetime aggregates. Portal removal/replacement never deletes these totals.
create table public.client_file_trackers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null, owner_id uuid not null,
 portal_id uuid references public.client_file_shares(id) on delete set null,
 source_version integer not null check(source_version>0),
 mega_node_id text not null check(mega_node_id ~ '^[A-Za-z0-9_-]{8}$'),
 folder_name text not null check(length(folder_name) between 1 and 500),
 folder_path text not null check(length(folder_path)<=4000),
 active boolean not null default true,
 total_downloads bigint not null default 0 check(total_downloads>=0),
 created_at timestamptz not null default now(),
 foreign key(company_id,owner_id) references public.crm_companies(id,owner_id) on delete cascade,
 unique(portal_id,source_version,mega_node_id)
);
create index client_file_trackers_owner on public.client_file_trackers(company_id,owner_id,created_at,id);
create function crm_private.file_tracker_before_insert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.client_file_shares where id=new.portal_id and company_id=new.company_id
  and owner_id=new.owner_id and source_version=new.source_version and active for update;
 if not found then raise exception 'Portal changed' using errcode='40001';end if;
 if (select count(*) from public.client_file_trackers where company_id=new.company_id)>=100
  and not exists(select 1 from public.client_file_trackers where portal_id=new.portal_id and source_version=new.source_version and mega_node_id=new.mega_node_id) then
  raise exception 'Too many tracked folders' using errcode='22023';
 end if;
 return new;
end;$$;
revoke all on function crm_private.file_tracker_before_insert() from public,anon,authenticated;
create trigger client_file_tracker_before_insert before insert on public.client_file_trackers for each row execute function crm_private.file_tracker_before_insert();
create table public.client_file_download_counts (
 tracker_id uuid not null references public.client_file_trackers(id) on delete cascade,
 mega_node_id text not null check(mega_node_id ~ '^[A-Za-z0-9_-]{8}$'),
 file_name text not null check(length(file_name) between 1 and 500),
 file_path text not null check(length(file_path)<=4000),
 download_count bigint not null default 1 check(download_count>0),
 last_download_at timestamptz not null default now(),
 primary key(tracker_id,mega_node_id)
);
create index client_file_download_ranking on public.client_file_download_counts(tracker_id,download_count desc,mega_node_id);
-- Short-lived replay protection only; deleting expired receipts NEVER changes aggregates.
create table public.client_file_download_receipts (
 event_id uuid primary key, expires_at timestamptz not null
);
create index client_file_download_receipt_expiry on public.client_file_download_receipts(expires_at);
alter table public.client_file_trackers enable row level security;
alter table public.client_file_download_counts enable row level security;
alter table public.client_file_download_receipts enable row level security;
revoke all on public.client_file_trackers,public.client_file_download_counts,public.client_file_download_receipts from public,anon,authenticated;
grant select on public.client_file_trackers,public.client_file_download_counts to authenticated;
grant all on public.client_file_trackers,public.client_file_download_counts,public.client_file_download_receipts to service_role;
create policy client_file_trackers_owner_read on public.client_file_trackers for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create policy client_file_download_counts_owner_read on public.client_file_download_counts for select to authenticated
 using(exists(select 1 from public.client_file_trackers t where t.id=tracker_id and t.owner_id=(select auth.uid())));
-- Called only by the server after checking a signed, scoped completion receipt.
-- INVOKER: no privilege escalation; browsers have no execute or write grants.
create function public.record_client_file_download(
 p_event_id uuid,p_portal_id uuid,p_source_version integer,p_node_id text,
 p_name text,p_targets jsonb,p_expires_at timestamptz
) returns integer language plpgsql security invoker set search_path='' as $$
declare target record; affected integer:=0;
begin
 if p_expires_at<=now() or p_expires_at>now()+interval '49 hours'
    or jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets) not between 1 and 100 then
  raise exception 'Invalid download receipt' using errcode='22023';
 end if;
 perform 1 from public.client_file_shares where id=p_portal_id and active and source_version=p_source_version for share;
 if not found then return 0;end if;
 delete from public.client_file_download_receipts where expires_at<now();
 insert into public.client_file_download_receipts(event_id,expires_at) values(p_event_id,p_expires_at) on conflict do nothing;
 if not found then return 0;end if;
 for target in
  select t.id,x.path from public.client_file_trackers t
  join jsonb_to_recordset(p_targets) as x(id uuid,path text) on x.id=t.id
  where t.portal_id=p_portal_id and t.source_version=p_source_version and t.active
  order by t.id for update of t
 loop
  insert into public.client_file_download_counts(tracker_id,mega_node_id,file_name,file_path)
   values(target.id,p_node_id,p_name,target.path)
   on conflict(tracker_id,mega_node_id) do update set
    download_count=public.client_file_download_counts.download_count+1,
    file_name=excluded.file_name,file_path=excluded.file_path,last_download_at=now();
  update public.client_file_trackers set total_downloads=total_downloads+1 where id=target.id;
  affected:=affected+1;
 end loop;
 return affected;
end;$$;
revoke all on function public.record_client_file_download(uuid,uuid,integer,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.record_client_file_download(uuid,uuid,integer,text,text,jsonb,timestamptz) to service_role;
