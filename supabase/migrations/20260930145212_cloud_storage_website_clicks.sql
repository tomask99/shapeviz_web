-- Server-only idempotency ledger. Files remain in MEGA; no access tokens or
-- personal visitor identifiers are persisted here.
create table public.client_file_website_clicks (
 event_id uuid primary key,
 portal_id uuid not null references public.client_file_shares(id) on delete cascade,
 source text not null check(source in ('logo','visual_studio')),
 created_at timestamptz not null default now()
);
create index client_file_website_clicks_portal_idx on public.client_file_website_clicks(portal_id);
alter table public.client_file_website_clicks enable row level security;
revoke all on public.client_file_website_clicks from public,anon,authenticated;
grant select,insert,delete on public.client_file_website_clicks to service_role;
comment on table public.client_file_website_clicks is 'Server-only claims for Cloud storage website click notifications. Client roles have no access.';
