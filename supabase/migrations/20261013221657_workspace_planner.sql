-- Personal workspace data: independent of client CRM tasks and follow-ups.
create table public.workspace_planner (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('note','checklist','event')),
 title text not null check(length(btrim(title)) between 1 and 160),
 content text not null default '' check(length(content)<=5000),
 checklist jsonb not null default '[]'::jsonb check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=80),
 color text not null default 'sand' check(color in ('sand','sage','blue','rose')),
 planned_date date,
 planned_time text check(planned_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 completed boolean not null default false,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((kind='event' and planned_date is not null and planned_date between date '1900-01-01' and date '9999-12-31') or (kind<>'event' and planned_date is null and planned_time is null)),
 check(kind='checklist' or checklist='[]'::jsonb)
);
create index workspace_planner_owner_kind_date on public.workspace_planner(owner_id,kind,planned_date,created_at,id);
alter table public.workspace_planner enable row level security;
revoke all on public.workspace_planner from public,anon,authenticated;
grant select,delete on public.workspace_planner to authenticated;
grant insert(id,owner_id,kind,title,content,checklist,color,planned_date,planned_time,completed),update(title,content,checklist,color,planned_date,planned_time,completed,kind) on public.workspace_planner to authenticated;
create policy workspace_planner_owner on public.workspace_planner for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));
create schema if not exists planner_private;
revoke all on schema planner_private from public,anon,authenticated;
create function planner_private.item_before() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if tg_op='UPDATE' then
  new.id:=old.id; new.owner_id:=old.owner_id; new.created_at:=old.created_at; new.version:=old.version+1;
 else new.version:=1; new.created_at:=now(); end if;
 new.updated_at:=now();
 for item in select value from jsonb_array_elements(new.checklist) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'text') is distinct from 'string' or length(btrim(item->>'text')) not between 1 and 240
   or jsonb_typeof(item->'done') is distinct from 'boolean' or coalesce(item->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  then raise exception 'Invalid checklist item' using errcode='23514'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(new.checklist)) then raise exception 'Duplicate checklist item' using errcode='23514'; end if;
 return new;
end;
$$;
revoke all on function planner_private.item_before() from public,anon,authenticated;
create trigger workspace_planner_before before insert or update on public.workspace_planner for each row execute function planner_private.item_before();
