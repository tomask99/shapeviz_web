-- OAuth credentials are opaque and never valid as Supabase credentials.
-- Only the application server can execute these state transitions. Business
-- reads continue through the existing authenticated owner-JWT tools and RLS.
create table crm_private.mcp_oauth_decisions (
  request_hash text primary key check (request_hash ~ '^[a-f0-9]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  approved boolean not null
);
create index mcp_oauth_decisions_owner_idx on crm_private.mcp_oauth_decisions(owner_id);
create index mcp_oauth_decisions_created_idx on crm_private.mcp_oauth_decisions(created_at);
create table crm_private.mcp_oauth_grants (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 120),
  client_name text not null check (length(client_name) between 1 and 120),
  resource text not null check (length(resource) between 1 and 2048),
  redirect_uri text not null check (length(redirect_uri) between 1 and 2048),
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['crm:read','research:read','catalog:read']::text[]),
  source_session_id uuid not null,
  encrypted_session text check (length(encrypted_session) between 1 and 20000),
  expires_at timestamptz not null,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  code_expires_at timestamptz not null default now()+interval '60 seconds',
  code_used_at timestamptz,
  token_hash text unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('owner','client','replaced','code_replay'))
);
create index mcp_oauth_grants_owner_client_idx on crm_private.mcp_oauth_grants(owner_id,client_id,created_at desc);
create index mcp_oauth_grants_expires_idx on crm_private.mcp_oauth_grants(expires_at);
alter table crm_private.mcp_oauth_decisions enable row level security;
alter table crm_private.mcp_oauth_grants enable row level security;
revoke all on crm_private.mcp_oauth_decisions,crm_private.mcp_oauth_grants from public,anon,authenticated;
grant usage on schema crm_private to service_role;
grant select,insert,update,delete on crm_private.mcp_oauth_decisions,crm_private.mcp_oauth_grants to service_role;

-- A narrow private definer is necessary because service_role cannot SELECT
-- auth.sessions. It exposes only a boolean to service_role; no Auth table grants
-- or session data are added to the Data API or authenticated user role.
create function crm_private.mcp_session_active(p_owner uuid,p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_owner
    and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function crm_private.mcp_session_active(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function crm_private.mcp_session_active(uuid,uuid) to service_role;

create function public.crm_mcp_oauth_decide(p_request_hash text,p_owner uuid,p_grant jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row_count integer; expiry timestamptz; source_session uuid;
begin
  -- Serializes concurrent replacement grants for this owner, and rechecks role.
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for update;
  if not found then return jsonb_build_object('error','access_denied'); end if;
  delete from crm_private.mcp_oauth_decisions where created_at<now()-interval '1 day';
  update crm_private.mcp_oauth_grants set encrypted_session=null where expires_at<=now() and encrypted_session is not null;
  insert into crm_private.mcp_oauth_decisions(request_hash,owner_id,approved)
    values(p_request_hash,p_owner,p_grant is not null) on conflict do nothing;
  get diagnostics row_count=row_count;
  if row_count=0 then return jsonb_build_object('error','request_used'); end if;
  if p_grant is null then return jsonb_build_object('denied',true); end if;
  expiry:=(p_grant->>'expires_at')::timestamptz;
  source_session:=(p_grant->>'source_session_id')::uuid;
  if expiry is null or expiry<=now()+interval '30 seconds' or expiry>now()+interval '1 hour'
    or not crm_private.mcp_session_active(p_owner,source_session) then
    return jsonb_build_object('error','access_denied');
  end if;
  update crm_private.mcp_oauth_grants set revoked_at=now(),revoked_reason='replaced',encrypted_session=null
    where owner_id=p_owner and client_id=p_grant->>'client_id' and revoked_at is null;
  insert into crm_private.mcp_oauth_grants(id,owner_id,client_id,client_name,resource,redirect_uri,scopes,source_session_id,encrypted_session,expires_at,code_hash,code_challenge)
  values((p_grant->>'id')::uuid,p_owner,p_grant->>'client_id',p_grant->>'client_name',p_grant->>'resource',p_grant->>'redirect_uri',
    array(select jsonb_array_elements_text(p_grant->'scopes')),source_session,p_grant->>'encrypted_session',expiry,p_grant->>'code_hash',p_grant->>'code_challenge');
  return jsonb_build_object('approved',true);
end;
$$;

create function public.crm_mcp_oauth_exchange(p_code_hash text,p_challenge text,p_client_id text,p_redirect_uri text,p_resource text,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g crm_private.mcp_oauth_grants;
begin
  select * into g from crm_private.mcp_oauth_grants where code_hash=p_code_hash for update;
  if not found or g.client_id is distinct from p_client_id or g.redirect_uri is distinct from p_redirect_uri
    or g.resource is distinct from p_resource or g.code_challenge is distinct from p_challenge then
    return jsonb_build_object('error','invalid_grant');
  end if;
  -- Commit replay revocation rather than raising an exception that rolls it back.
  if g.code_used_at is not null then
    update crm_private.mcp_oauth_grants set revoked_at=coalesce(revoked_at,now()),revoked_reason='code_replay',encrypted_session=null where id=g.id;
    return jsonb_build_object('error','invalid_grant');
  end if;
  if g.revoked_at is not null or g.code_expires_at<=now() or g.expires_at<=now()
    or not crm_private.mcp_session_active(g.owner_id,g.source_session_id)
    or not exists(select 1 from public.presentation_admins where user_id=g.owner_id and role='owner') then
    return jsonb_build_object('error','invalid_grant');
  end if;
  update crm_private.mcp_oauth_grants set code_used_at=now(),token_hash=p_token_hash where id=g.id;
  return jsonb_build_object('scopes',g.scopes,'expires_at',g.expires_at);
end;
$$;

create function public.crm_mcp_oauth_resolve(p_token_hash text,p_resource text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',g.id,'owner_id',g.owner_id,'client_id',g.client_id,'resource',g.resource,'scopes',g.scopes,
    'source_session_id',g.source_session_id,'encrypted_session',g.encrypted_session,'expires_at',g.expires_at)
  from crm_private.mcp_oauth_grants g where g.token_hash=p_token_hash and g.resource=p_resource
    and g.code_used_at is not null and g.revoked_at is null and g.expires_at>now() and g.encrypted_session is not null
    and crm_private.mcp_session_active(g.owner_id,g.source_session_id)
    and exists(select 1 from public.presentation_admins where user_id=g.owner_id and role='owner');
$$;

create function public.crm_mcp_oauth_list(p_owner uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc,g.id),'[]'::jsonb) from (
    select id,client_id,client_name,scopes,created_at,expires_at,revoked_at,
      case when revoked_at is not null then 'revoked' when expires_at<=now() or not crm_private.mcp_session_active(owner_id,source_session_id) then 'expired'
        when code_used_at is null then 'pending' else 'active' end as status
    from crm_private.mcp_oauth_grants where owner_id=p_owner
      and exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner')
    order by created_at desc,id limit 100
  ) g;
$$;

create function public.crm_mcp_oauth_revoke(p_owner uuid,p_grant uuid,p_token_hash text,p_client_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_owner is not null and p_grant is not null and p_token_hash is null and p_client_id is null then
    update crm_private.mcp_oauth_grants set revoked_at=coalesce(revoked_at,now()),revoked_reason='owner',encrypted_session=null
      where id=p_grant and owner_id=p_owner and exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner');
  elsif p_owner is null and p_grant is null and p_token_hash is not null and p_client_id is not null then
    update crm_private.mcp_oauth_grants set revoked_at=coalesce(revoked_at,now()),revoked_reason='client',encrypted_session=null
      where token_hash=p_token_hash and client_id=p_client_id;
  else return false;
  end if;
  return found;
end;
$$;
revoke all on function public.crm_mcp_oauth_decide(text,uuid,jsonb),public.crm_mcp_oauth_exchange(text,text,text,text,text,text),
  public.crm_mcp_oauth_resolve(text,text),public.crm_mcp_oauth_list(uuid),public.crm_mcp_oauth_revoke(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_mcp_oauth_decide(text,uuid,jsonb),public.crm_mcp_oauth_exchange(text,text,text,text,text,text),
  public.crm_mcp_oauth_resolve(text,text),public.crm_mcp_oauth_list(uuid),public.crm_mcp_oauth_revoke(uuid,uuid,text,text) to service_role;
