-- One ordered snapshot allows atomic edits with optimistic version checks.
create table public.site_content (
  id integer primary key default 1 check (id = 1),
  companies jsonb not null default '[]'::jsonb
    check (jsonb_typeof(companies) = 'array' and jsonb_array_length(companies) <= 100),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
revoke all on public.site_content from public, anon, authenticated;
grant select, update on public.site_content to service_role;
comment on table public.site_content is 'Server-managed website content. Writes require the existing owner session in /api/admin.';

insert into public.site_content (companies) values ('[
  {"id":"prada","name":"PRADA","url":""},
  {"id":"pucci","name":"PUCCI","url":""},
  {"id":"mazda","name":"MAZDA","url":""},
  {"id":"milenium","name":"MILENIUM","url":""},
  {"id":"mcm","name":"MCM","url":""},
  {"id":"bero","name":"BERO","url":""},
  {"id":"brave-mma","name":"BRAVE MMA","url":""},
  {"id":"tatrabanka","name":"TATRABANKA","url":""},
  {"id":"tolicci","name":"TOLICCI","url":""}
]'::jsonb);
