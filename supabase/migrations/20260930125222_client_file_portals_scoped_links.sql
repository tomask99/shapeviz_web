-- One MEGA-backed portal per client; file contents remain in MEGA.
alter table public.client_file_shares add column slug text,
 add column source_version integer not null default 1 check(source_version>0);
with names as (
 select s.id,coalesce(nullif(trim(both '-' from regexp_replace(lower(c.company_name),'[^a-z0-9]+','-','g')),''),'client') as name
 from public.client_file_shares s join public.crm_companies c on c.id=s.company_id
), numbered as (
 select id,left(name,50) as name,row_number() over(partition by left(name,50) order by id) as n from names
)
update public.client_file_shares s set slug=n.name||case when n.n>1 or n.name in ('share','transfer','vendor','index') then '-'||left(s.id::text,8) else '' end from numbered n where n.id=s.id;
alter table public.client_file_shares alter column slug set not null,
 add constraint client_file_portal_slug check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=80 and slug not in ('share','transfer','vendor','index')),
 add unique(slug), add unique(company_id), add unique(id,company_id,owner_id);
grant insert(slug),update(slug,mega_url) on public.client_file_shares to authenticated;
create or replace function crm_private.file_share_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.crm_companies where id=new.company_id and owner_id=new.owner_id and archived_at is null for update;
 if not found then raise exception 'Client unavailable' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  new.version:=old.version+1;new.updated_at:=now();
  new.source_version:=old.source_version+case when new.mega_url is distinct from old.mega_url then 1 else 0 end;
 end if;
 return new;
end;$$;
create table public.client_file_links (
 id uuid primary key default gen_random_uuid(),
 portal_id uuid not null,company_id uuid not null,owner_id uuid not null,
 mega_node_id text not null check(mega_node_id ~ '^[A-Za-z0-9_-]{8}$'),
 type text not null check(type in ('file','folder')),
 name text not null check(length(name) between 1 and 500),
 token text not null unique check(token ~ '^[A-Za-z0-9_-]{32}$'),
 enabled boolean not null default true,
 source_version integer not null check(source_version>0),
 parent_id uuid,
 ancestor_ids uuid[] not null default '{}' check(cardinality(ancestor_ids)<=8),
 version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,portal_id),
 foreign key(portal_id,company_id,owner_id) references public.client_file_shares(id,company_id,owner_id),
 foreign key(parent_id,portal_id) references public.client_file_links(id,portal_id)
);
create unique index client_file_links_active_node on public.client_file_links(portal_id,source_version,mega_node_id,parent_id) nulls not distinct where enabled;
create index client_file_links_owner on public.client_file_links(company_id,owner_id,created_at desc,id);
create index client_file_links_parent on public.client_file_links(parent_id,portal_id);
alter table public.client_file_links enable row level security;
revoke all on public.client_file_links from public,anon,authenticated;
grant select,update(enabled) on public.client_file_links to authenticated;
grant all on public.client_file_links to service_role;
create policy client_file_links_owner on public.client_file_links for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function crm_private.file_link_before() returns trigger language plpgsql security invoker set search_path='' as $$
declare portal public.client_file_shares; parent public.client_file_links;
begin
 select * into portal from public.client_file_shares where id=new.portal_id for update;
 if not found then raise exception 'Portal unavailable' using errcode='42501';end if;
 if tg_op='INSERT' then
  if not portal.active or portal.source_version<>new.source_version then raise exception 'Portal changed' using errcode='40001';end if;
  if new.parent_id is null then new.ancestor_ids:='{}';else
   select * into parent from public.client_file_links where id=new.parent_id and portal_id=new.portal_id and enabled and source_version=new.source_version;
   if not found or parent.type<>'folder' then raise exception 'Share unavailable' using errcode='42501';end if;
   new.ancestor_ids:=parent.ancestor_ids||parent.id;
  end if;
 else
  if new.enabled and not old.enabled then raise exception 'Create a new link instead of restoring a revoked link' using errcode='42501';end if;
  new.version:=old.version+1;new.updated_at:=now();
 end if;
 return new;
end;$$;
revoke all on function crm_private.file_link_before() from public,anon,authenticated;
create trigger client_file_link_before before insert or update on public.client_file_links for each row execute function crm_private.file_link_before();
