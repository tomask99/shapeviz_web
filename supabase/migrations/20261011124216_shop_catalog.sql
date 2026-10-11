-- Product content and payments remain on Gumroad. One snapshot makes launch
-- and product visibility checks atomic; version supports compare-and-swap.
create table public.shop_catalog (
  id integer primary key default 1 check (id = 1),
  launched boolean not null default false,
  version integer not null default 1 check (version > 0),
  categories jsonb not null check (jsonb_typeof(categories) = 'array'),
  products jsonb not null default '[]'::jsonb check (jsonb_typeof(products) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.shop_catalog enable row level security;
revoke all on public.shop_catalog from public, anon, authenticated;
grant select, insert, update, delete on public.shop_catalog to service_role;
-- Server access only; admin operations verify the existing owner session.
insert into public.shop_catalog (categories) values ('[
  {"id":"3d-models","name":"3D Models"},
  {"id":"blender-addons","name":"Blender Add-ons"},
  {"id":"3ds-max-scripts","name":"3ds Max Scripts"}
]'::jsonb);
