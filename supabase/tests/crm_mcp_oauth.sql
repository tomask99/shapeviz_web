begin;
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','oauth-sql-owner@example.test'),
 ('a1000000-0000-4000-8000-000000000002','oauth-sql-other@example.test');
insert into public.presentation_admins(user_id,role) values
 ('a1000000-0000-4000-8000-000000000001','owner'),('a1000000-0000-4000-8000-000000000002','owner');
insert into auth.sessions(id,user_id) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002');

set local role anon;
do $$ begin
  begin perform public.crm_mcp_oauth_list('a1000000-0000-4000-8000-000000000001');raise exception 'anon RPC access';exception when insufficient_privilege then null;end;
  begin perform * from crm_private.mcp_oauth_grants;raise exception 'anon private access';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$ begin
  begin perform public.crm_mcp_oauth_resolve(repeat('a',64),'https://shapeviz.example/api/mcp');raise exception 'authenticated RPC access';exception when insufficient_privilege then null;end;
  begin perform crm_private.mcp_session_active('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001');raise exception 'session oracle access';exception when insufficient_privilege then null;end;
  begin perform * from crm_private.mcp_oauth_decisions;raise exception 'authenticated private access';exception when insufficient_privilege then null;end;
end $$;

set local role service_role;
do $$
declare
  owner_id uuid:='a1000000-0000-4000-8000-000000000001';
  other_id uuid:='a1000000-0000-4000-8000-000000000002';
  resource text:='https://shapeviz.example/api/mcp';
  redirect_uri text:='https://client.example/callback';
  g jsonb:=jsonb_build_object('id','a3000000-0000-4000-8000-000000000001','client_id','fixture','client_name','Fixture','resource',resource,'redirect_uri',redirect_uri,
    'scopes',jsonb_build_array('crm:read'),'source_session_id','a2000000-0000-4000-8000-000000000001','encrypted_session','authenticated-ciphertext-only',
    'expires_at',now()+interval '45 minutes','code_hash',repeat('a',64),'code_challenge',repeat('x',43));
  result jsonb;
begin
  if not crm_private.mcp_session_active(owner_id,'a2000000-0000-4000-8000-000000000001') then raise exception 'valid source session';end if;
  if crm_private.mcp_session_active(other_id,'a2000000-0000-4000-8000-000000000001') then raise exception 'cross-owner session';end if;
  result:=public.crm_mcp_oauth_decide(repeat('1',64),owner_id,null);
  if result->>'denied'<>'true' then raise exception 'denial';end if;
  result:=public.crm_mcp_oauth_decide(repeat('1',64),owner_id,g);
  if result->>'error'<>'request_used' then raise exception 'denial replay';end if;
  result:=public.crm_mcp_oauth_decide(repeat('2',64),owner_id,g);
  if result->>'approved'<>'true' then raise exception 'approval';end if;
  result:=public.crm_mcp_oauth_decide(repeat('2',64),other_id,g);
  if result->>'error'<>'request_used' then raise exception 'cross-owner consent replay';end if;
  if public.crm_mcp_oauth_resolve(repeat('b',64),resource) is not null then raise exception 'unexchanged code';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('a',64),repeat('z',43),'fixture',redirect_uri,resource,repeat('b',64));
  if result->>'error'<>'invalid_grant' then raise exception 'PKCE bypass';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('a',64),repeat('x',43),'other',redirect_uri,resource,repeat('b',64));
  if result->>'error'<>'invalid_grant' then raise exception 'client substitution';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('a',64),repeat('x',43),'fixture',redirect_uri||'/wrong',resource,repeat('b',64));
  if result->>'error'<>'invalid_grant' then raise exception 'redirect substitution';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('a',64),repeat('x',43),'fixture',redirect_uri,resource||'/wrong',repeat('b',64));
  if result->>'error'<>'invalid_grant' then raise exception 'audience substitution';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('a',64),repeat('x',43),'fixture',redirect_uri,resource,repeat('b',64));
  if result ? 'error' then raise exception 'exchange';end if;
  result:=public.crm_mcp_oauth_resolve(repeat('b',64),resource);
  if result->>'owner_id'<>owner_id::text or result->'scopes'<>jsonb_build_array('crm:read') then raise exception 'resolved scope';end if;
  if public.crm_mcp_oauth_resolve(repeat('b',64),resource||'/wrong') is not null then raise exception 'wrong resource';end if;
  if public.crm_mcp_oauth_revoke(other_id,(g->>'id')::uuid,null,null) then raise exception 'cross-owner revoke';end if;
  if public.crm_mcp_oauth_revoke(null,null,repeat('b',64),'other') then raise exception 'cross-client revoke';end if;
  result:=public.crm_mcp_oauth_list(owner_id);
  if result::text ~ 'encrypted_session|code_hash|token_hash|source_session_id' then raise exception 'credential exposure';end if;
  if public.crm_mcp_oauth_list(other_id)<>'[]'::jsonb then raise exception 'cross-owner listing';end if;
  perform public.crm_mcp_oauth_exchange(repeat('a',64),repeat('x',43),'fixture',redirect_uri,resource,repeat('c',64));
  if public.crm_mcp_oauth_resolve(repeat('b',64),resource) is not null then raise exception 'code replay did not revoke';end if;
  if exists(select 1 from crm_private.mcp_oauth_grants where id=(g->>'id')::uuid and encrypted_session is not null) then raise exception 'revocation retained credential';end if;
  g:=g||jsonb_build_object('id','a3000000-0000-4000-8000-000000000002','code_hash',repeat('d',64));
  perform public.crm_mcp_oauth_decide(repeat('3',64),owner_id,g);
  update crm_private.mcp_oauth_grants set code_expires_at=now()-interval '1 second' where id=(g->>'id')::uuid;
  if not exists(select 1 from jsonb_array_elements(public.crm_mcp_oauth_list(owner_id)) item where item->>'id'=g->>'id' and item->>'status'='expired') then raise exception 'expired code still shown pending';end if;
  result:=public.crm_mcp_oauth_exchange(repeat('d',64),repeat('x',43),'fixture',redirect_uri,resource,repeat('e',64));
  if result->>'error'<>'invalid_grant' then raise exception 'expired code';end if;
  update crm_private.mcp_oauth_grants set code_expires_at=now()+interval '60 seconds' where id=(g->>'id')::uuid;
  perform public.crm_mcp_oauth_exchange(repeat('d',64),repeat('x',43),'fixture',redirect_uri,resource,repeat('e',64));
  if not public.crm_mcp_oauth_revoke(owner_id,(g->>'id')::uuid,null,null) then raise exception 'owner revoke';end if;
  if public.crm_mcp_oauth_resolve(repeat('e',64),resource) is not null then raise exception 'revoked access';end if;
  g:=g||jsonb_build_object('id','a3000000-0000-4000-8000-000000000003','code_hash',repeat('f',64));
  perform public.crm_mcp_oauth_decide(repeat('4',64),owner_id,g);
  perform public.crm_mcp_oauth_exchange(repeat('f',64),repeat('x',43),'fixture',redirect_uri,resource,repeat('0',64));
  delete from public.presentation_admins where user_id=owner_id;
  if public.crm_mcp_oauth_resolve(repeat('0',64),resource) is not null then raise exception 'membership revoke';end if;
  insert into public.presentation_admins(user_id,role) values(owner_id,'owner');
end $$;
reset role;
delete from auth.sessions where id='a2000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  if public.crm_mcp_oauth_resolve(repeat('0',64),'https://shapeviz.example/api/mcp') is not null then raise exception 'source logout';end if;
end $$;
reset role;
rollback;
