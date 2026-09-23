import {test,expect} from '@playwright/test';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from '../../server.js';

test.use({trace:'off',screenshot:'off'});
test('live OAuth consent, scoped MCP, replay, owner isolation and revocation use real Auth and RLS',async({page,browser})=>{
  test.skip(process.env.LIVE_OAUTH_TEST!=='true','Opt-in isolated OAuth/Auth/MCP fixture; removed in finally');
  test.setTimeout(240000);process.loadEnvFile('.env');
  const deployedOrigin=process.env.LIVE_OAUTH_ORIGIN||'';
  const native=process.env.LIVE_OAUTH_NATIVE==='true';
  // Deliberately restrict the opt-in remote fixture to this project's verified
  // canonical origin. Never send fixture credentials to an arbitrary URL.
  if(deployedOrigin)expect(deployedOrigin).toBe('https://shapevizweb.vercel.app');
  if(native)expect(deployedOrigin).toBe('https://shapevizweb.vercel.app');
  const clientId=native?'shapeviz-desktop':deployedOrigin?'shapeviz-chatgpt':'oauth-fixture';
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',MCP_OAUTH_ENABLED:'true',MCP_OAUTH_ALLOW_LOOPBACK:'true',MCP_OAUTH_ENCRYPTION_KEY:randomBytes(32).toString('base64'),VERCEL:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const users=[],accounts=[],clients=[];let server,origin,redirectUri,otherContext,removedMembership=false,portRejectionChecked=false;
  const sb=async(path,{method='GET',body,jwt,representation=false}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{}),...(representation?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`OAuth fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});const text=await response.text();return text?JSON.parse(text):null;
  };
  const post=(action,body,context=page.request)=>context.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const rpc=(token,method='ping',params={})=>fetch(origin+'/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const exchange=flow=>page.request.post(origin+'/oauth/token',{form:{grant_type:'authorization_code',client_id:clientId,redirect_uri:redirectUri,resource:origin+'/api/mcp',code:flow.code,code_verifier:flow.verifier}});
  const connect=async(scope='crm:read research:read catalog:read',approve=true)=>{
    const verifier=randomBytes(48).toString('base64url'),state=randomUUID();
    const params=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,resource:origin+'/api/mcp',scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    await page.goto(origin+'/oauth/authorize?'+params);
    await expect(page.locator('#connection-consent')).toBeVisible();await expect(page).toHaveURL(origin+'/admin/connections');
    await expect(page.locator('#consent-scopes li')).toHaveCount(scope.split(' ').length);
    await page.getByRole('button',{name:approve?'Allow read access':'Decline',exact:true}).click();
    await page.waitForURL(url=>url.origin+url.pathname===redirectUri);
    const result=new URL(page.url());expect(result.searchParams.get('state')===state).toBe(true);expect(result.searchParams.get('iss')===origin).toBe(true);
    if(!approve){expect(result.searchParams.get('error')).toBe('access_denied');return;}
    expect(result.searchParams.has('code')).toBe(true);return {code:result.searchParams.get('code'),verifier};
  };
  const tokenFor=async(scope)=>{
    const flow=await connect(scope);
    if(native&&!portRejectionChecked){
      const wrongPort=await page.request.post(origin+'/oauth/token',{form:{grant_type:'authorization_code',client_id:clientId,redirect_uri:'http://127.0.0.1:49153/callback',resource:origin+'/api/mcp',code:flow.code,code_verifier:flow.verifier}});
      expect(wrongPort.status()).toBe(400);portRejectionChecked=true;
    }
    const response=await exchange(flow);expect(response.status()).toBe(200);const result=await response.json();
    expect(/^sv_mcp_[A-Za-z0-9_-]{43}$/.test(result.access_token)).toBe(true);expect(result.expires_in).toBeGreaterThan(0);expect(result.expires_in).toBeLessThanOrEqual(3600);expect(result.refresh_token).toBeUndefined();return {...flow,token:result.access_token};
  };
  const clientFor=async token=>{
    const client=new Client({name:'shapeviz-oauth-live-fixture',version:'1'});client.onerror=()=>{};clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));return client;
  };
  try{
    for(let index=0;index<2;index++){
      const email=`oauth-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
      const user=await sb('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});users.push(user);
      await sb('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
      const auth=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});accounts.push({user,email,password,jwt:auth.access_token});
    }
    const [owner,other]=accounts;
    const companies=[];
    for(const account of accounts)companies.push((await sb('/rest/v1/crm_companies',{method:'POST',jwt:account.jwt,representation:true,body:{owner_id:account.user.id,company_name:account===owner?'OAuth fixture owned company':'OAuth fixture other company',website:account===owner?'https://oauth-owner.example/':'https://oauth-other.example/',country:'SK'}}))[0]);
    const snapshot=()=>Promise.all(accounts.flatMap(account=>['crm_companies','crm_activities'].map(table=>sb(`/rest/v1/${table}?owner_id=eq.${account.user.id}&select=*&order=id`))));
    const initial=await snapshot();
    if(deployedOrigin){origin=deployedOrigin;redirectUri=native?'http://127.0.0.1:49152/callback':'https://chatgpt.com/connector_platform_oauth_redirect';}
    else{
      server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
      redirectUri=origin+'/oauth-fixture/callback';
      env.SITE_URL=origin;env.MCP_OAUTH_CLIENTS=JSON.stringify([{client_id:clientId,name:'ChatGPT fixture',redirect_uris:[redirectUri]}]);
    }
    // Intercept the callback locally: no authorization code is sent to ChatGPT.
    // This verifies deployed OAuth, not an actual ChatGPT connection.
    await page.route(url=>url.origin+url.pathname===redirectUri,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture callback</title><p>Returned to the test application.</p>'}));
    const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));
    await page.goto(origin+'/admin/connections');await expect(page.locator('#connection-login')).toBeVisible();
    await page.locator('#connection-signin [name=email]').fill(owner.email);await page.locator('#connection-signin [name=password]').fill(owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.locator('#connection-list')).toContainText('No applications are connected.',{timeout:deployedOrigin?15000:5000});
    await connect('catalog:read',false);let list=await (await page.request.get(origin+'/api/admin?action=oauth-connections')).json();expect(list.connections).toHaveLength(0);

    const first=await tokenFor(),client=await clientFor(first.token);expect((await client.listTools()).tools).toHaveLength(8);
    const search=await client.callTool({name:'search_leads'});expect(search.isError).toBe(false);expect(search.structuredContent.data.items.map(item=>item.id)).toEqual([companies[0].id]);
    expect((await client.callTool({name:'get_lead',arguments:{id:companies[0].id}})).isError).toBe(false);
    const inaccessible=await client.callTool({name:'get_lead',arguments:{id:companies[1].id}});expect(inaccessible.isError).toBe(true);expect(inaccessible._meta['shapeviz/httpStatus']).toBe(404);
    expect((await client.callTool({name:'update_lead',arguments:{id:companies[0].id,fit:'LOW'}})).isError).toBe(true);
    const bypass=await fetch(env.SUPABASE_URL+'/rest/v1/crm_companies?select=id',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+first.token}});expect(bypass.status).toBe(401);
    const adminBypass=await fetch(origin+'/api/admin?action=crm-tools-list',{headers:{Authorization:'Bearer '+first.token}});expect(adminBypass.status).toBe(401);

    const limited=await tokenFor('catalog:read'),limitedClient=await clientFor(limited.token);expect((await rpc(first.token)).status).toBe(401);
    expect((await limitedClient.listTools()).tools.map(tool=>tool.name)).toEqual(['get_research_catalog']);
    const denied=await limitedClient.callTool({name:'search_leads'});expect(denied.isError).toBe(true);expect(denied._meta['mcp/www_authenticate'][0]).toContain('insufficient_scope');
    list=await (await page.request.get(origin+'/api/admin?action=oauth-connections')).json();const active=list.connections.find(item=>item.status==='active');expect(!!active).toBe(true);
    otherContext=await browser.newContext();expect((await post('login',{email:other.email,password:other.password},otherContext.request)).status()).toBe(200);
    expect((await (await otherContext.request.get(origin+'/api/admin?action=oauth-connections')).json()).connections).toHaveLength(0);
    expect((await post('oauth-disconnect',{id:active.id,confirm:true},otherContext.request)).status()).toBe(404);expect((await rpc(limited.token)).status).toBe(200);
    expect((await exchange(limited)).status()).toBe(400);expect((await rpc(limited.token)).status).toBe(401);

    const concurrent=await connect('catalog:read'),races=await Promise.all([exchange(concurrent),exchange(concurrent)]);expect(races.map(response=>response.status()).sort()).toEqual([200,400]);
    const raceToken=(await races.find(response=>response.status()===200).json()).access_token;expect((await rpc(raceToken)).status).toBe(401);

    const removable=await tokenFor('catalog:read');await page.goto(origin+'/admin/connections');await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toHaveCount(1);
    await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.locator('#connection-revoke').getByRole('button',{name:'Cancel',exact:true}).click();expect((await rpc(removable.token)).status).toBe(200);
    await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.locator('#connection-revoke-confirm').click();await expect(page.locator('#connection-revoke')).not.toBeVisible();expect((await rpc(removable.token)).status).toBe(401);
    const publicRevoke=await tokenFor('catalog:read');expect((await page.request.post(origin+'/oauth/revoke',{form:{client_id:clientId,token:publicRevoke.token,token_type_hint:'access_token'}})).status()).toBe(200);expect((await rpc(publicRevoke.token)).status).toBe(401);

    const last=await tokenFor('catalog:read');await sb(`/rest/v1/presentation_admins?user_id=eq.${owner.user.id}`,{method:'DELETE'});removedMembership=true;expect((await rpc(last.token)).status).toBe(401);
    await sb('/rest/v1/presentation_admins',{method:'POST',body:{user_id:owner.user.id,role:'owner'}});removedMembership=false;expect((await rpc(last.token)).status).toBe(200);
    expect(await snapshot()).toEqual(initial);
    await page.goto(origin+'/admin/connections');await expect(page.locator('#connection-account')).toBeVisible();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#connection-login')).toBeVisible();expect((await rpc(last.token)).status).toBe(401);expect(browserErrors).toEqual([]);
    console.info(`OAuth ${deployedOrigin?'production':'local'}${native?' desktop':''} assertions passed: eight tools, owner isolation, scopes, replay, disconnect and logout.`);
  }finally{
    const failures=[];await Promise.all(clients.map(client=>client.close()));
    if(removedMembership&&accounts[0])try{await sb('/rest/v1/presentation_admins',{method:'POST',body:{user_id:accounts[0].user.id,role:'owner'}});}catch{failures.push('Owner membership restoration');}
    if(origin)for(const context of [page.request,otherContext?.request].filter(Boolean))try{await post('logout',{},context);}catch{failures.push('Session cleanup');}
    await otherContext?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    // Browser logout already revokes all sessions; a second logout can reject
    // the old token. Only already-unauthorized responses are benign here.
    for(const account of accounts)try{await sb('/auth/v1/logout?scope=global',{method:'POST',jwt:account.jwt});}catch(error){if(![401,403].includes(error.status))failures.push('Fixture account session cleanup');}
    for(const user of users)for(const path of [`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`])try{await sb(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
    if(failures.length)throw new Error('OAuth fixture cleanup failed: '+failures.join('; '));
  }
});
