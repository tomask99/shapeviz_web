create table public.crm_saved_views (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 80),view_type text not null default 'LEADS' check(view_type='LEADS'),
 filter_config jsonb not null default '{}' check(jsonb_typeof(filter_config)='object' and octet_length(filter_config::text)<=4000),
 is_default boolean not null default false,version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_saved_views_owner_idx on public.crm_saved_views(owner_id,created_at,id);
create unique index crm_saved_views_one_default on public.crm_saved_views(owner_id) where is_default;
alter table public.crm_saved_views enable row level security;
revoke all on public.crm_saved_views from public,anon,authenticated;
grant select,delete on public.crm_saved_views to authenticated;
grant insert(owner_id,name,filter_config),update(name,filter_config,is_default) on public.crm_saved_views to authenticated;
create policy crm_saved_views_owner on public.crm_saved_views for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create function crm_private.saved_view_before() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then new.version:=old.version+1;new.updated_at:=now();else
 perform pg_advisory_xact_lock(hashtextextended('crm-views:'||new.owner_id::text,0));
 if (select count(*) from public.crm_saved_views where owner_id=new.owner_id)>=100 then raise exception 'Maximum 100 saved views' using errcode='23514';end if;
 end if;return new;
end;$$;
revoke all on function crm_private.saved_view_before() from public,anon,authenticated;
create trigger crm_saved_view_before before insert or update on public.crm_saved_views for each row execute function crm_private.saved_view_before();
create function public.crm_default_view(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-views:'||auth.uid()::text,0));
 if p_id is not null and not exists(select 1 from public.crm_saved_views where id=p_id and owner_id=auth.uid()) then raise exception 'View unavailable' using errcode='42501';end if;
 update public.crm_saved_views set is_default=false where owner_id=auth.uid() and is_default;
 update public.crm_saved_views set is_default=true where owner_id=auth.uid() and id=p_id;
end;$$;
revoke all on function public.crm_default_view(uuid) from public,anon;
grant execute on function public.crm_default_view(uuid) to authenticated;
