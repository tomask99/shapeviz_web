import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {configuration,authorization,seal,unseal,grantAad,consentRequest,sourceSession,randomSecret,hash,challenge,requestAad,parseScopes,redirectAllowed} from '../src/oauth/domain.js';

const owner='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const env=()=>({MCP_OAUTH_ENABLED:'true',SITE_URL:'https://shapeviz.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'private',MCP_OAUTH_ENCRYPTION_KEY:randomBytes(32).toString('base64'),MCP_OAUTH_CLIENTS:JSON.stringify([{client_id:'client',name:'ChatGPT',redirect_uris:['https://chatgpt.com/callback']}])});
const status=code=>error=>error.status===code;
const params=()=>new URLSearchParams({client_id:'client',redirect_uri:'https://chatgpt.com/callback',response_type:'code',scope:'research:read crm:read',state:'client-state',code_challenge:challenge('v'.repeat(64)),code_challenge_method:'S256',resource:'https://shapeviz.example/api/mcp'});

test('OAuth requires explicit valid configuration and keeps the production issuer on HTTPS',()=>{
  const base=env();assert.equal(configuration(base).resource,'https://shapeviz.example/api/mcp');
  for(const change of [{MCP_OAUTH_ENABLED:'false'},{SITE_URL:''},{SITE_URL:'http://shapeviz.example'},{SITE_URL:'https://shapeviz.example/path'},{SITE_URL:'https://user:pass@shapeviz.example'},{MCP_OAUTH_ENCRYPTION_KEY:'weak'},{MCP_OAUTH_CLIENTS:'[]'},{MCP_OAUTH_CLIENTS:'invalid'}])assert.throws(()=>configuration({...base,...change}),status(503));
  const local={...base,SITE_URL:'http://127.0.0.1:3000',MCP_OAUTH_ALLOW_LOOPBACK:'true'};assert.equal(configuration(local).secure,false);assert.throws(()=>configuration({...local,VERCEL:'1'}),status(503));
  for(const uri of ['https://chatgpt.com/callback#fragment','https://chatgpt.com/callback?query=1','https://user:pass@chatgpt.com/callback','javascript:alert(1)','http://external.example/callback'])assert.throws(()=>configuration({...base,MCP_OAUTH_CLIENTS:JSON.stringify([{client_id:'client',name:'Client',redirect_uris:[uri]}])}),status(503));
});

test('Native desktop callbacks allow ephemeral ports only for a registered IP literal and exact path',()=>{
  const client={client_id:'desktop',name:'Shapeviz Desktop',application_type:'native',redirect_uris:['http://127.0.0.1/callback','http://[::1]/callback']};
  const config=configuration({...env(),VERCEL:'1',MCP_OAUTH_CLIENTS:JSON.stringify([client])});
  for(const uri of ['http://127.0.0.1:49152/callback','http://127.0.0.1:60001/callback','http://[::1]:49153/callback']){
    assert.equal(redirectAllowed(config.clients[0],uri),true);
    const p=params();p.set('client_id','desktop');p.set('redirect_uri',uri);
    const request=authorization(p,config);assert.equal(request.redirect_uri,uri);
    const binding=randomSecret(),sealed=seal({...request,nonce:randomSecret(),binding_hash:hash(binding),exp:Date.now()+600000},config.key,requestAad(config));
    assert.equal(consentRequest({request:sealed},{headers:{cookie:'sv_oauth_binding='+binding}},config).redirect_uri,uri);
  }
  for(const uri of ['http://localhost:49152/callback','http://127.0.0.2:49152/callback','http://127.0.0.1.evil.example:49152/callback','http://127.1:49152/callback','http://2130706433:49152/callback','http://127.0.0.1:49152/other','http://127.0.0.1:49152/callback/extra','http://127.0.0.1:49152/call%62ack','http://127.0.0.1:49152/callback?x=1','http://127.0.0.1:49152/callback#fragment','http://user:secret@127.0.0.1:49152/callback','https://127.0.0.1:49152/callback']){
    assert.equal(redirectAllowed(client,uri),false,uri);
    const p=params();p.set('client_id','desktop');p.set('redirect_uri',uri);
    assert.throws(()=>authorization(p,config),error=>error.status===400&&!error.redirect);
  }
  for(const change of [{application_type:'web'},{application_type:'unknown'},{redirect_uris:['http://localhost/callback']},{redirect_uris:['http://192.168.1.1/callback']},{redirect_uris:['http://127.0.0.1:49152/callback']}])assert.throws(()=>configuration({...env(),VERCEL:'1',MCP_OAUTH_CLIENTS:JSON.stringify([{...client,...change}])}),status(503));
  assert.throws(()=>configuration({...env(),VERCEL:'1',SITE_URL:'http://127.0.0.1',MCP_OAUTH_ALLOW_LOOPBACK:'true',MCP_OAUTH_CLIENTS:JSON.stringify([client])}),status(503));
  const web={client_id:'web',name:'Web',redirect_uris:['https://chatgpt.com/callback']};
  assert.equal(redirectAllowed(web,'https://chatgpt.com:49152/callback'),false);
});

test('OAuth authorization is bound to an exact callback, resource, S256 challenge and known read scopes',()=>{
  const config=configuration(env());assert.deepEqual(authorization(params(),config).scopes,['crm:read','research:read']);
  for(const [key,value] of [['client_id','attacker'],['redirect_uri','https://chatgpt.com/callback.evil'],['redirect_uri','https://evil.example/']]){const p=params();p.set(key,value);assert.throws(()=>authorization(p,config),error=>!error.redirect&&error.status===400);}
  for(const [key,value,code] of [['resource','https://elsewhere.example','invalid_target'],['scope','crm:write','invalid_scope'],['scope','crm:read crm:read','invalid_scope'],['code_challenge_method','plain','invalid_request'],['code_challenge','','invalid_request'],['response_type','token','unsupported_response_type']]){
    const p=params();p.set(key,value);assert.throws(()=>authorization(p,config),error=>{const redirect=new URL(error.redirect);return redirect.origin==='https://chatgpt.com'&&redirect.searchParams.get('error')===code&&redirect.searchParams.get('iss')===config.issuer&&redirect.searchParams.get('state')==='client-state';});
  }
  const duplicate=params();duplicate.append('scope','crm:write');assert.throws(()=>authorization(duplicate,config),status(400));
  assert.throws(()=>parseScopes('crm:read  research:read'),status(400));
});

test('Encrypted consent requests reject altered data, expiry, cookie swapping, key rotation and changed registrations',()=>{
  const config=configuration(env()),binding=randomSecret(),now=Date.now();
  const data={...authorization(params(),config),nonce:randomSecret(),binding_hash:hash(binding),exp:now+600000};
  const body={request:seal(data,config.key,requestAad(config))},req={headers:{cookie:'sv_oauth_binding='+binding}};
  assert.equal(consentRequest(body,req,config).state,'client-state');assert.doesNotMatch(body.request,/client-state|chatgpt|crm:read/);
  assert.throws(()=>consentRequest(body,req,config,now+600001),status(400));
  for(const cookie of ['', 'sv_oauth_binding=other',req.headers.cookie+'; '+req.headers.cookie])assert.throws(()=>consentRequest(body,{headers:{cookie}},config),status(400));
  assert.throws(()=>consentRequest({request:body.request.slice(0,-4)+'abcd'},req,config),status(400));
  assert.throws(()=>consentRequest(body,req,{...config,key:randomBytes(32)}),status(400));
  assert.throws(()=>consentRequest(body,req,{...config,clients:[]}),status(400));
});

test('The encrypted owner session is authenticated to the exact grant and never becomes the OAuth token',()=>{
  const key=randomBytes(32),g={id:session,owner_id:owner,client_id:'client',resource:'https://shapeviz.example/api/mcp',scopes:['crm:read'],source_session_id:session,expires_at:'2026-09-23T12:00:00.000Z'};
  const sealed=seal({token:'private-user-jwt'},key,grantAad(g));assert.deepEqual(unseal(sealed,key,grantAad(g)),{token:'private-user-jwt'});
  for(const change of [{owner_id:session},{scopes:['catalog:read']},{resource:'https://other.example'},{source_session_id:owner},{expires_at:'2026-09-24T12:00:00.000Z'}])assert.throws(()=>unseal(sealed,key,grantAad({...g,...change})),status(400));
});

test('Only a previously verified owner JWT with a live bounded expiry can back a grant',()=>{
  const config=env(),now=Date.now(),claims={sub:owner,iss:config.SUPABASE_URL+'/auth/v1',aud:'authenticated',role:'authenticated',session_id:session,exp:Math.floor(now/1000)+7200};
  const jwt=value=>'header.'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.signature';
  assert.equal(Date.parse(sourceSession(jwt(claims),{id:owner},config,now).expires_at),now+3600000);
  for(const change of [{sub:session},{aud:'service_role'},{role:'service_role'},{iss:'https://evil.example'},{session_id:'bad'},{exp:Math.floor(now/1000)+30}])assert.throws(()=>sourceSession(jwt({...claims,...change}),{id:owner},config,now),status(401));
});
