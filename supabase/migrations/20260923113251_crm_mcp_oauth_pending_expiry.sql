-- A consent awaiting code exchange expires with its authorization code.
create or replace function public.crm_mcp_oauth_list(p_owner uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc,g.id),'[]'::jsonb) from (
    select id,client_id,client_name,scopes,created_at,expires_at,revoked_at,
      case when revoked_at is not null then 'revoked'
        when expires_at<=now() or (code_used_at is null and code_expires_at<=now())
          or not crm_private.mcp_session_active(owner_id,source_session_id) then 'expired'
        when code_used_at is null then 'pending' else 'active' end as status
    from crm_private.mcp_oauth_grants where owner_id=p_owner
      and exists(select 1 from public.presentation_admins where user_id=p_owner and role='owner')
    order by created_at desc,id limit 100
  ) g;
$$;
