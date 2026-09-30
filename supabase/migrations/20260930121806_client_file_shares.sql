-- MEGA source links stay private. Public access is mediated by /api/files.
create table public.client_file_shares (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null, owner_id uuid not null, request_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=1500),
 mega_url text not null check(mega_url ~ '^https://mega[.]nz/folder/[A-Za-z0-9_-]{8}#[A-Za-z0-9_-]{22}$'),
 public_token text not null unique check(public_token ~ '^[A-Za-z0-9_-]{32}$'),
 active boolean not null default true, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,request_id),
 foreign key(company_id,owner_id) references public.crm_clients(company_id,owner_id)
);
create index client_file_shares_company_idx on public.client_file_shares(company_id,owner_id,created_at desc,id);
alter table public.client_file_shares enable row level security;
revoke all on public.client_file_shares from public,anon,authenticated;
grant select on public.client_file_shares to authenticated;
grant insert(company_id,owner_id,request_id,title,description,mega_url,public_token),update(title,description,active) on public.client_file_shares to authenticated;
grant all on public.client_file_shares to service_role;
create policy client_file_shares_owner on public.client_file_shares for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function crm_private.file_share_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.crm_companies where id=new.company_id and owner_id=new.owner_id and archived_at is null for update;
 if not found then raise exception 'Client unavailable' using errcode='42501'; end if;
 if tg_op='UPDATE' then new.version:=old.version+1;new.updated_at:=now();end if;
 return new;
end;$$;
revoke all on function crm_private.file_share_before() from public,anon,authenticated;
create trigger client_file_share_before before insert or update on public.client_file_shares for each row execute function crm_private.file_share_before();
