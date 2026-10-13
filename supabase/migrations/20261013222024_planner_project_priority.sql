-- One personal project card combines notes, checklist and priority.
-- Existing notes and lists remain intact and can be edited as project cards.
alter table public.workspace_planner add column priority smallint not null default 1 check(priority between 0 and 3);
grant insert(priority),update(priority) on public.workspace_planner to authenticated;
create index workspace_planner_board_priority on public.workspace_planner(owner_id,priority desc,created_at desc,id) where kind in ('note','checklist');
