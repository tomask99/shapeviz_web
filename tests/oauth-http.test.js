import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createAdminHandler} from '../src/admin/handler.js';
import {createOAuthHandler} from '../src/oauth/handler.js';
import {challenge,hash,seal,grantAad,configuration} from '../src/oauth/domain.js';

const owner='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const grantId='33333333-3333-4333-8333-333333333333',verifier='a'.repeat(64),callback='https://client.example/callback';
async function fixture(run){
  const env={MCP_OAUTH_ENABLED:'true',MCP_OAUTH_ALLOW_LOOPBACK:'true',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'fixture-private-key',MCP_OAUTH_ENCRYPTION_KEY:randomBytes(32).toString('base64'),MCP_OAUTH_CLIENTS:JSON.stringify([{client_id:'fixture',name:'ChatGPT',redirect_uris:[callback]}])};
  const jwt='header.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,iss:env.SUPABASE_URL+'/auth/v1',role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
  const state={calls:[],grant:null,role:'owner',decision:{approved:true},exchange:{scopes:['catalog:read'],expires_at:new Date(Date.now()+1200000).toISOString()},connections:[],preparsed:false,users:new Map([[jwt,{id:owner,email:'owner@example.test'}]]),logoutError:false};
  const send=async(endpoint,options)=>{
    const url=new URL(endpoint),body=options.body?JSON.parse(options.body):null;state.calls.push({path:url.pathname,options,body});
    if(url.pathname==='/auth/v1/user')return state.users.has(options.headers.Authorization?.slice(7))?Response.json(state.users.get(options.headers.Authorization.slice(7))):Response.json({},{status:401});
    if(url.pathname==='/auth/v1/logout')return Response.json({},{status:state.logoutError?500:200});
    if(url.pathname==='/rest/v1/presentation_admins')return Response.json(state.role?[{user_id:owner,role:state.role}]:[]);
    const action=url.pathname.split('/').at(-1).replace('crm_mcp_oauth_','');
    if(action==='decide')return Response.json(body.p_grant?state.decision:{denied:true});
    if(action==='exchange')return Response.json(state.exchange);
    if(action==='resolve')return Response.json(state.grant);
    if(action==='list')return Response.json(state.connections);
    if(action==='revoke')return Response.json(true);
    throw new Error('Unexpected data operation');
  };
  const admin=createAdminHandler({env,send}),oauth=createOAuthHandler({env,send,audit:()=>{}});
  const server=createServer(async(req,res)=>{
    if(state.preparsed&&req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const text=Buffer.concat(chunks).toString('utf8');req.body=req.headers['content-type']?.startsWith('application/json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));}
    await (req.url.startsWith('/api/admin')?admin:oauth)(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));env.SITE_URL='http://127.0.0.1:'+server.address().port;
  const origin=env.SITE_URL,resource=origin+'/api/mcp';
  const get=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
  const adminPost=(action,body,cookie='',headers={})=>fetch(origin+'/api/admin?action='+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'sv_access='+jwt+(cookie?'; '+cookie:''),...headers},body:JSON.stringify(body)});
  const form=(path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:typeof body==='string'?body:new URLSearchParams(body)});
  const start=async(changes={})=>{
    const params=new URLSearchParams({client_id:'fixture',redirect_uri:callback,response_type:'code',scope:'catalog:read',state:'opaque-client-state',code_challenge:challenge(verifier),code_challenge_method:'S256',resource,...changes});
    const response=await get('/oauth/authorize?'+params);return {response,request:new URL(response.headers.get('Location')||origin).hash.slice('#request='.length),binding:response.headers.get('Set-Cookie')?.split(';')[0]};
  };
  const exchange=(code,changes={})=>form('/oauth/token',{grant_type:'authorization_code',client_id:'fixture',redirect_uri:callback,resource,code,code_verifier:verifier,...changes});
  try{await run({env,state,jwt,origin,resource,get,adminPost,form,start,exchange});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('OAuth discovery is accurate, resource-bound and unavailable until explicitly configured',()=>fixture(async({get,env,origin,resource})=>{
  const response=await get('/.well-known/oauth-authorization-server'),metadata=await response.json();assert.equal(metadata.issuer,origin);assert.deepEqual(metadata.grant_types_supported,['authorization_code']);assert.deepEqual(metadata.token_endpoint_auth_methods_supported,['none']);assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);assert.equal(metadata.authorization_response_iss_parameter_supported,true);assert.equal(metadata.registration_endpoint,undefined);assert.match(response.headers.get('Cache-Control'),/no-store/);
  const protectedMetadata=await (await get('/.well-known/oauth-protected-resource/api/mcp')).json();assert.equal(protectedMetadata.resource,resource);assert.deepEqual(protectedMetadata.scopes_supported,['crm:read','research:read','catalog:read']);
  env.MCP_OAUTH_ENABLED='false';for(const path of ['/oauth/authorize','/.well-known/oauth-authorization-server','/api/mcp'])assert.equal((await get(path)).status,503);
}));

test('Authorization and consent bind the browser, current owner and exact registered callback',()=>fixture(async({start,adminPost,state,jwt,origin})=>{
  const flow=await start();assert.equal(flow.response.status,302);assert.match(flow.response.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/admin/);assert.equal(new URL(flow.response.headers.get('Location')).search,'');assert.equal(state.calls.length,0);
  const preview=await adminPost('oauth-preview',{request:flow.request},flow.binding);assert.equal(preview.status,200);const details=await preview.json();assert.equal(details.client_name,'ChatGPT');
  for(const headers of [{Origin:'https://attacker.example'},{Cookie:''},{Authorization:'Bearer '+jwt,Cookie:''}])assert.ok([401,403].includes((await adminPost('oauth-decide',{request:flow.request,approve:true},flow.binding,headers)).status));
  assert.equal((await adminPost('oauth-preview',{request:flow.request},'')).status,400);
  assert.equal((await adminPost('oauth-decide',{request:flow.request,approve:true,owner_id:grantId},flow.binding)).status,400);
  const response=await adminPost('oauth-decide',{request:flow.request,review:details.review,approve:true},flow.binding);assert.equal(response.status,200);
  const location=new URL((await response.json()).redirect);assert.equal(location.origin,'https://client.example');assert.equal(location.searchParams.get('iss'),origin);assert.equal(location.searchParams.get('state'),'opaque-client-state');assert.match(location.searchParams.get('code'),/^sv_code_/);
  const saved=state.calls.find(item=>item.path.endsWith('_decide')).body;assert.equal(saved.p_owner,owner);assert.equal(saved.p_grant.code_hash,hash(location.searchParams.get('code')));assert.doesNotMatch(JSON.stringify(saved),new RegExp(jwt.replaceAll('.','\\.')));assert.equal(saved.p_grant.scopes.join(' '),'catalog:read');
}));

test('Decline echoes state and issuer, consumes the request and creates no grant',()=>fixture(async({start,adminPost,state,origin})=>{
  const flow=await start(),preview=await (await adminPost('oauth-preview',{request:flow.request},flow.binding)).json();
  const response=await adminPost('oauth-decide',{request:flow.request,review:preview.review,approve:false},flow.binding);assert.equal(response.status,200);
  const redirect=new URL((await response.json()).redirect);assert.equal(redirect.searchParams.get('error'),'access_denied');assert.equal(redirect.searchParams.get('state'),'opaque-client-state');assert.equal(redirect.searchParams.get('iss'),origin);assert.equal(state.calls.find(item=>item.path.endsWith('_decide')).body.p_grant,null);
}));

test('Native callbacks retain their exact listener port through consent and the token transaction',()=>fixture(async({env,start,adminPost,state,exchange})=>{
  env.MCP_OAUTH_CLIENTS=JSON.stringify([{client_id:'fixture',name:'Desktop',application_type:'native',redirect_uris:['http://127.0.0.1/callback']}]);
  const redirect='http://127.0.0.1:49152/callback';
  const flow=await start({redirect_uri:redirect});assert.equal(flow.response.status,302);
  const preview=await (await adminPost('oauth-preview',{request:flow.request},flow.binding)).json();
  const decision=await adminPost('oauth-decide',{request:flow.request,review:preview.review,approve:true},flow.binding);assert.equal(decision.status,200);
  const callback=new URL((await decision.json()).redirect);assert.equal(callback.origin+callback.pathname,redirect);
  assert.equal(state.calls.find(item=>item.path.endsWith('_decide')).body.p_grant.redirect_uri,redirect);
  const code=callback.searchParams.get('code');
  assert.equal((await exchange(code,{redirect_uri:'http://localhost:49152/callback'})).status,400);
  assert.equal((await exchange(code,{redirect_uri:'http://127.0.0.1:49152/other'})).status,400);
  assert.equal(state.calls.filter(item=>item.path.endsWith('_exchange')).length,0);
  assert.equal((await exchange(code,{redirect_uri:redirect})).status,200);
  assert.equal(state.calls.find(item=>item.path.endsWith('_exchange')).body.p_redirect_uri,redirect);
}));

test('Consent cannot reuse a different review or silently switch owner/session after preview',()=>fixture(async({start,adminPost,state,jwt})=>{
  const first=await start(),preview=await (await adminPost('oauth-preview',{request:first.request},first.binding)).json();
  assert.equal((await adminPost('oauth-decide',{request:first.request,approve:true},first.binding)).status,400);
  const second=await start();assert.equal((await adminPost('oauth-decide',{request:second.request,review:preview.review,approve:true},second.binding)).status,409);
  const details=await (await adminPost('oauth-preview',{request:second.request},second.binding)).json();
  for(const change of [{sub:session,session_id:grantId},{session_id:grantId}]){
    const claims={...JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')),...change},switched='header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
    state.users.set(switched,{id:claims.sub,email:'switched@example.test'});
    assert.equal((await adminPost('oauth-decide',{request:second.request,review:details.review,approve:true},second.binding,{Cookie:'sv_access='+switched+'; '+second.binding})).status,409);
  }
  assert.equal(state.calls.filter(item=>item.path.endsWith('_decide')).length,0);
}));

test('With external grants enabled, unsuccessful Auth logout never reports successful session revocation',()=>fixture(async({adminPost,state})=>{
  state.logoutError=true;const failed=await adminPost('logout',{});assert.equal(failed.status,502);assert.equal(failed.headers.get('Set-Cookie'),null);
  state.logoutError=false;const success=await adminPost('logout',{});assert.equal(success.status,200);assert.match(success.headers.get('Set-Cookie'),/sv_access=;.*Max-Age=0/);
}));

test('PKCE token exchange returns only opaque scoped access and refuses downgrade, duplicates and unsupported grants',()=>fixture(async({exchange,form,resource,state})=>{
  const code='sv_code_'+'a'.repeat(43),response=await exchange(code),result=await response.json();assert.equal(response.status,200);assert.match(result.access_token,/^sv_mcp_[A-Za-z0-9_-]{43}$/);assert.equal(result.scope,'catalog:read');assert.equal(result.token_type,'Bearer');assert.ok(result.expires_in>0&&result.expires_in<=1200);assert.equal(result.refresh_token,undefined);
  const sent=state.calls.at(-1).body;assert.equal(sent.p_token_hash,hash(result.access_token));assert.equal(sent.p_challenge,challenge(verifier));assert.equal(sent.p_resource,resource);
  for(const change of [{resource:'https://attacker.example'},{client_id:'other'},{redirect_uri:callback+'/'},{code_verifier:'weak'},{grant_type:'refresh_token'}])assert.equal((await exchange(code,change)).status,400);
  assert.equal((await form('/oauth/token','client_id=fixture&client_id=fixture')).status,400);
  assert.equal((await form('/oauth/token','x'.repeat(8193))).status,413);
  state.exchange={error:'invalid_grant'};assert.equal((await exchange(code)).status,400);
}));

test('External MCP refuses admin cookies, audience/query substitution and invalid origins with a discovery challenge',()=>fixture(async({origin,get,jwt,form})=>{
  const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Cookie:'sv_access='+jwt};
  for(const change of [{},{Authorization:'Bearer '+jwt},{Authorization:'Bearer sv_mcp_'+'a'.repeat(43)}]){
    const response=await get('/api/mcp',{method:'POST',headers:{...headers,...change},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})});assert.equal(response.status,401);assert.match(response.headers.get('WWW-Authenticate'),/oauth-protected-resource\/api\/mcp/);assert.match(response.headers.get('Cache-Control'),/no-store/);
  }
  assert.equal((await get('/api/mcp?access_token=private',{method:'POST',headers,body:'{}'})).status,400);
  assert.equal((await get('/api/mcp',{method:'POST',headers:{...headers,Origin:'https://attacker.example'},body:'{}'})).status,403);
  const cors=await get('/api/mcp',{method:'OPTIONS',headers:{Origin:'https://client.example'}});assert.equal(cors.status,204);assert.equal(cors.headers.get('Access-Control-Allow-Origin'),'https://client.example');assert.equal(cors.headers.get('Access-Control-Allow-Credentials'),null);
  assert.equal((await form('/oauth/revoke',{client_id:'fixture',token:'unknown'})).status,200);
}));

test('Official MCP client reads with an opaque grant, advertises OAuth and cannot escalate scopes',()=>fixture(async({env,state,jwt,resource})=>{
  const config=configuration(env),grant={id:grantId,owner_id:owner,client_id:'fixture',resource,scopes:['catalog:read'],source_session_id:session,expires_at:new Date(Date.now()+1200000).toISOString()};
  grant.encrypted_session=seal({token:jwt},config.key,grantAad(grant));state.grant=grant;
  const client=new Client({name:'oauth-fixture',version:'1'});client.onerror=()=>{};
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'bEaReR sv_mcp_'+'a'.repeat(43)}}}));
    const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(tool=>tool.name),['get_research_catalog']);assert.deepEqual(tools[0]._meta.securitySchemes,[{type:'oauth2',scopes:['catalog:read']}]);
    assert.equal((await client.callTool({name:'get_research_catalog'})).isError,false);
    const denied=await client.callTool({name:'get_lead',arguments:{id:grantId}});assert.equal(denied.isError,true);assert.match(denied._meta['mcp/www_authenticate'][0],/insufficient_scope/);assert.match(denied._meta['mcp/www_authenticate'][0],/crm:read research:read/);
    state.role=null;await assert.rejects(client.ping(),error=>error.code===403);
    assert.ok(state.calls.filter(item=>item.path==='/auth/v1/user').every(item=>item.options.headers.Authorization==='Bearer '+jwt));
  }finally{await client.close();}
}));

test('Grant tampering, expiry, configuration removal and envelope corruption fail closed',()=>fixture(async({env,state,jwt,resource,get})=>{
  const config=configuration(env),g={id:grantId,owner_id:owner,client_id:'fixture',resource,scopes:['catalog:read'],source_session_id:session,expires_at:new Date(Date.now()+1200000).toISOString()};g.encrypted_session=seal({token:jwt},config.key,grantAad(g));
  for(const change of [{resource:'https://wrong.example'},{expires_at:new Date(Date.now()-1000).toISOString()},{expires_at:'invalid'},{scopes:['crm:write']},{scopes:['crm:read']},{owner_id:session},{encrypted_session:'tampered'},{client_id:'removed'}]){
    state.grant={...g,...change};const response=await get('/api/mcp',{method:'POST',headers:{Authorization:'Bearer sv_mcp_'+'a'.repeat(43),'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:'{"jsonrpc":"2.0","id":1,"method":"ping"}'});assert.equal(response.status,401);
  }
}));

test('Serverless pre-parsed bodies retain the same code, consent and size validation',()=>fixture(async({state,start,adminPost,exchange})=>{
  state.preparsed=true;const flow=await start();assert.equal((await adminPost('oauth-preview',{request:flow.request},flow.binding)).status,200);assert.equal((await exchange('sv_code_'+'a'.repeat(43))).status,200);
}));
