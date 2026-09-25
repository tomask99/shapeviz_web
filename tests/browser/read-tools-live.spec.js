import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';
import {candidateProposal} from '../../src/research/refresh-domain.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// The fixture creates only confirmed synthetic accounts and never sends email.
test.use({trace:'off',screenshot:'off'});
test('live read tools enforce owner scope, complete pagination and immutable business data',async({page})=>{
  test.skip(process.env.LIVE_READ_TOOLS_TEST!=='true','Opt-in isolated Auth/API/Supabase fixture; cleaned in finally');
  test.setTimeout(240000);process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const users=[],accounts=[];let server,origin,mcp,signedOut=false,removedMembership=null;
  const request=async(path,{method='GET',body,jwt,representation=false}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{ }),...(representation?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Read-tool fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const invoke=(tool,args={})=>appPost('crm-tools-call',{tool,arguments:args});
  const run=async(tool,args={})=>{
    const response=await invoke(tool,args);expect(response.status(),`${tool} returns a successful read`).toBe(200);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const envelope=await response.json();expect(envelope).toMatchObject({schema_version:1,tool,meta:{read_only:true,untrusted_data:true}});
    expect(envelope.request_id).toMatch(/^[a-f0-9-]{36}$/i);return envelope.data;
  };
  const research=(name,domain,overrides={})=>validateResearchCandidate({
    company_name:name,website:`https://${domain}/`,country:'SK',industry:'Furniture',business_type:'Manufacturer',product_categories:['Sofas'],market_segments:['Architects'],
    short_description:'Synthetic catalogue company for the isolated read-tool fixture.',research_summary:'Synthetic evidence is retained as stored research, never an instruction.',
    fit:'HIGH',fit_reason:'The synthetic product catalogue benefits from consistent visuals.',research_confidence:'MEDIUM',
    potential_services:[{service:'Product Visualization',relevance:'HIGH',reason:'Illustrative catalogue materials.'}],
    sources:[{url:`https://${domain}/catalogue`,title:'Synthetic catalogue',source_type:'Product Page',retrieved_at:null,supports:['industry']}],
    field_provenance:{industry:{status:'VERIFIED',confidence:'HIGH',evidence:'The synthetic catalogue describes furniture.',source_urls:[`https://${domain}/catalogue`]}},
    source_origin:'CHATGPT',...overrides,
  }).candidate;
  try{
    for(let index=0;index<2;index++){
      const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
      const user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});users.push(user);
      await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
      const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});accounts.push({user,email,password,jwt:auth.access_token});
    }
    const [owner,other]=accounts;
    const company=async(account,name,domain,overrides={})=>(await request('/rest/v1/crm_companies',{method:'POST',jwt:account.jwt,representation:true,body:{
      owner_id:account.user.id,company_name:name,website:`https://${domain}/`,country:'SK',industry:'Furniture',city:'Bratislava',fit:'HIGH',services:['Product visualization'],
      short_description:'Synthetic current CRM description.',pipeline_status:'PRESENTATION_READY',priority:'HIGH',lead_source:'Referral',estimated_value:'12345.67',value_type:'ONE_TIME',...overrides,
    }}))[0];
    const main=await company(owner,'Read tools Product studio','tools-main.example');
    const fallback=await company(owner,'Read tools Original studio','tools-original.example',{fit:'LOW',services:['Product CGI']});
    const client=await company(owner,'Read tools Client studio','tools-client.example',{pipeline_status:'WON',services:['Product CGI']});
    await request('/rest/v1/crm_clients',{method:'POST',jwt:owner.jwt,body:{owner_id:owner.user.id,company_id:client.id}});
    const won=await company(owner,'Read tools Won lead','tools-won.example',{pipeline_status:'WON',industry:'Lighting'});
    const archived=await company(owner,'Read tools Archived studio','tools-duplicates.example');
    await request(`/rest/v1/crm_companies?id=eq.${archived.id}&owner_id=eq.${owner.user.id}`,{method:'PATCH',jwt:owner.jwt,body:{archived_at:new Date().toISOString()}});
    const foreign=await company(owner,'Read tools Foreign studio','tools-foreign.example',{country:'CZ'});
    const privateCompany=await company(other,'Other owner private company','tools-private-company.example');
    const contactNeedle='HiddenContactNeedle',noteNeedle='HiddenNoteNeedle';
    await request('/rest/v1/crm_contacts',{method:'POST',jwt:owner.jwt,body:{owner_id:owner.user.id,company_id:main.id,full_name:contactNeedle,email:'synthetic-contact@example.test',notes:'Private synthetic contact note.'}});
    await request('/rest/v1/crm_notes',{method:'POST',jwt:owner.jwt,body:{owner_id:owner.user.id,company_id:main.id,content:noteNeedle}});
    const candidate=(account,name,domain,workflow={},details={})=>{
      const {normalized_company_name,...record}=research(name,domain,details);
      return {...record,id:randomUUID(),owner_id:account.user.id,research_status:'NEEDS_REVIEW',...workflow};
    };
    const original=candidate(owner,main.company_name,'tools-main.example',{research_status:'APPROVED',approved_company_id:main.id,approved_at:new Date().toISOString()},{suggested_pitch_angle:'Original immutable main pitch.',fit:'MEDIUM'});
    const originalFallback=candidate(owner,fallback.company_name,'tools-original.example',{research_status:'APPROVED',approved_company_id:fallback.id,approved_at:new Date().toISOString()},{suggested_pitch_angle:'Original fallback pitch.'});
    const pending=candidate(owner,'Read tools Research reference','tools-pending.example',{}, {suggested_pitch_angle:'Research detail retains all cited evidence.'});
    const privateCandidate=candidate(other,'Other owner private research','tools-private-research.example');
    for(const record of [original,originalFallback,pending,privateCandidate])await request('/rest/v1/crm_research_candidates',{method:'POST',body:record});
    const rejected=Array.from({length:105},(_,index)=>candidate(owner,`Read tools Rejected ${String(index).padStart(3,'0')}`,`tools-rejected-${String(index).padStart(3,'0')}.example`,{
      research_status:'REJECTED',rejected_at:new Date().toISOString(),rejection_reason:'Private synthetic rejection reason.',
    }));
    const duplicates=Array.from({length:12},(_,index)=>candidate(owner,`Read tools Duplicate ${index}`,'tools-duplicates.example',{
      research_status:'REJECTED',rejected_at:new Date().toISOString(),rejection_reason:'Private duplicate rejection reason.',
    }));
    await request('/rest/v1/crm_research_candidates',{method:'POST',body:[...rejected,...duplicates]});
    const older=candidateProposal(research(main.company_name,'tools-main.example',{source_origin:'ENRICHMENT',suggested_pitch_angle:'Older accepted enrichment pitch.'}));
    const latest={...older,suggested_pitch_angle:'Latest accepted enrichment pitch.'};
    await request('/rest/v1/crm_company_research',{method:'POST',body:{owner_id:owner.user.id,company_id:main.id,company_version:main.version,research:older}});
    await request(`/rest/v1/crm_companies?id=eq.${main.id}&owner_id=eq.${owner.user.id}`,{method:'PATCH',jwt:owner.jwt,body:{city:'Trnava'}});
    await request('/rest/v1/crm_company_research',{method:'POST',body:{owner_id:owner.user.id,company_id:main.id,company_version:main.version+1,research:latest}});

    const tables=['crm_companies','crm_clients','crm_contacts','crm_notes','crm_activities','crm_research_candidates','crm_research_events','crm_company_research'];
    const snapshots=async()=>{
      const rows=await Promise.all(accounts.flatMap(account=>tables.map(async table=>({owner:account.user.id,table,rows:await request(`/rest/v1/${table}?owner_id=eq.${account.user.id}&select=*&order=${table==='crm_clients'?'company_id':'id'}`)}))));
      return rows;
    };
    const initial=await snapshots();
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/admin/leads');await page.locator('#signin [name=email]').fill(owner.email);await page.locator('#signin [name=password]').fill(owner.password);await page.locator('#signin button').click();
    await expect(page.locator('#crm')).toBeVisible();await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
    const listResponse=await page.request.get(origin+'/api/admin?action=crm-tools-list');expect(listResponse.status()).toBe(200);
    const catalog=await listResponse.json();expect(catalog.schema_version).toBe(1);
    expect(catalog.tools.map(tool=>tool.name).sort()).toEqual(['check_company_duplicates','get_existing_domains','get_lead','get_rejected_domains','get_research_candidate','get_research_candidates','get_research_catalog','search_leads','validate_research_import']);
    for(const tool of catalog.tools){expect(tool.read_only).toBe(true);expect(tool.required_scopes.length).toBeGreaterThan(0);expect(tool.inputSchema.additionalProperties).toBe(false);}

    const filtered=await run('search_leads',{filters:{country:'sk',industry:'Furniture',fit:'HIGH',service:'Product Visualization'}});
    expect(filtered).toMatchObject({total:1,page:1,pageSize:25,hasMore:false});expect(filtered.items.map(item=>item.id)).toEqual([main.id]);expect(filtered.items[0].services).toEqual(['Product visualization']);
    expect((await run('search_leads',{filters:{country:'CZ'}})).items.map(item=>item.id)).toEqual([foreign.id]);
    const active=await run('search_leads');expect(active.total).toBe(5);expect(active.items.some(item=>item.id===archived.id)).toBe(false);
    expect(active.items.find(item=>item.id===client.id).is_client).toBe(true);expect(active.items.find(item=>item.id===won.id).is_client).toBe(false);
    const archivedSearch=await run('search_leads',{filters:{archived:'archived'}});expect(archivedSearch.total).toBe(1);expect(archivedSearch.items[0].id).toBe(archived.id);
    expect((await run('search_leads',{filters:{archived:'all'}})).total).toBe(6);
    expect((await run('search_leads',{filters:{pipeline_status:'WON'}})).items.map(item=>item.id).sort()).toEqual([client.id,won.id].sort());
    expect((await run('search_leads',{filters:{q:'Product studio'}})).items.map(item=>item.id)).toEqual([main.id]);
    for(const q of [contactNeedle,noteNeedle,'tools-main.example','%','_'])expect((await run('search_leads',{filters:{q}})).total).toBe(0);
    const detail=await run('get_lead',{id:main.id});expect(detail.company).toMatchObject({id:main.id,city:'Trnava',is_client:false});
    expect(detail.insight).toMatchObject({kind:'enrichment',company_version:main.version+1,research:latest});expect(detail.approved_candidate).toEqual({id:original.id,company_name:original.company_name});
    const fallbackDetail=await run('get_lead',{id:fallback.id});expect(fallbackDetail.insight).toMatchObject({kind:'approved_candidate',research:candidateProposal(originalFallback)});
    expect((await run('get_lead',{id:client.id})).company.is_client).toBe(true);expect((await run('get_lead',{id:archived.id})).company.archived_at).toBeTruthy();
    for(const value of [active,detail,fallbackDetail]){
      const serialized=JSON.stringify(value);for(const privateText of [contactNeedle,noteNeedle,'12345.67','synthetic-contact@example.test',owner.user.id,other.user.id,'estimated_value','priority','lead_source','crm_clients'])expect(serialized).not.toContain(privateText);
    }

    const duplicate=await run('check_company_duplicates',{website:'www.tools-duplicates.example/catalogue'});
    expect(duplicate).toMatchObject({match_count:13,truncated:true});expect(duplicate.matches).toHaveLength(10);expect(duplicate.matches.some(item=>item.status==='REJECTED')).toBe(true);expect(JSON.stringify(duplicate)).not.toContain('fingerprint');
    const identityDuplicate=await run('check_company_duplicates',{company_name:'  Read   tools Product studio  ',country:'sk'});expect(identityDuplicate.match_count).toBe(2);expect(identityDuplicate.matches.every(item=>item.match==='name_country')).toBe(true);
    expect((await run('check_company_duplicates',{website:'no-existing-fixture.example'})).match_count).toBe(0);
    const pendingList=await run('get_research_candidates',{filters:{research_status:'NEEDS_REVIEW',country:'SK',industry:'Furniture',fit:'HIGH',potential_service:'Product Visualization'}});
    expect(pendingList).toMatchObject({total:1,pageSize:25,hasMore:false});expect(pendingList.items.map(item=>item.id)).toEqual([pending.id]);
    const candidateDetail=await run('get_research_candidate',{id:pending.id});expect(candidateDetail.candidate).toMatchObject(candidateProposal(pending));
    expect(candidateDetail.candidate.sources).toEqual(pending.sources);expect(candidateDetail.candidate.field_provenance).toEqual(pending.field_provenance);
    const rejectedDetail=await run('get_research_candidate',{id:rejected[0].id});expect(rejectedDetail.candidate.research_status).toBe('REJECTED');
    for(const value of [pendingList,candidateDetail,rejectedDetail])for(const privateField of ['owner_id','rejection_reason','manual_fields','duplicate_company_id','duplicate_candidate_id'])expect(JSON.stringify(value)).not.toContain(`"${privateField}"`);

    const expectedRejected=[...new Set([...rejected,...duplicates].map(item=>item.normalized_domain))].sort();
    const expectedExisting=[...new Set([...expectedRejected,'tools-main.example','tools-original.example','tools-client.example','tools-won.example','tools-foreign.example','tools-pending.example'])].sort();
    for(const [tool,expected] of [['get_existing_domains',expectedExisting],['get_rejected_domains',expectedRejected]]){
      const first=await run(tool),second=await run(tool,{page:2}),empty=await run(tool,{page:3});
      expect(first).toMatchObject({total:expected.length,page:1,pageSize:100,hasMore:true});expect(first.domains).toHaveLength(100);
      expect(second).toMatchObject({total:expected.length,page:2,pageSize:100,hasMore:false});expect([...first.domains,...second.domains]).toEqual(expected);
      expect(empty).toMatchObject({domains:[],total:expected.length,page:3,hasMore:false});
      expect(JSON.stringify(first)+JSON.stringify(second)).not.toContain('tools-private');
    }
    const reference=await run('get_research_catalog');expect(JSON.stringify(reference)).toContain('Product Visualization');expect(JSON.stringify(reference)).toContain('Furniture');expect(JSON.stringify(reference)).toContain('additionalProperties');
    for(const [tool,id] of [['get_lead',privateCompany.id],['get_research_candidate',privateCandidate.id]]){
      const response=await invoke(tool,{id});expect(response.status()).toBe(404);expect(await response.text()).not.toContain('Other owner');
    }
    for(const body of [
      {tool:'search_leads',arguments:{},owner_id:other.user.id},
      {tool:'search_leads',arguments:{owner_id:other.user.id}},
      {tool:'search_leads',arguments:{filters:{owner_id:other.user.id}}},
      {tool:'get_lead',arguments:{id:main.id,select:'*'}},
      {tool:'get_research_catalog',arguments:{scopes:['admin:write']}},
      {tool:'update_lead',arguments:{id:main.id,fit:'LOW'}},
      {tool:'execute_sql',arguments:{query:'select * from crm_companies'}},
    ])expect((await appPost('crm-tools-call',body)).status()).toBe(400);
    expect((await page.request.get(origin+'/api/admin?action=crm-tools-list&owner_id='+other.user.id)).status()).toBe(400);
    expect((await page.request.post(origin+'/api/admin?action=crm-tools-call&owner_id='+other.user.id,{headers:{Origin:origin},data:{tool:'search_leads',arguments:{}}})).status()).toBe(400);
    expect((await page.request.get(origin+'/api/admin?action=crm-tools-call')).status()).toBe(405);
    expect((await appPost('crm-tools-list',{})).status()).toBe(405);

    // Exercise the official MCP client against the same real owner session.
    // Playwright keeps HttpOnly cookies in its private request context; credentials
    // are never copied into test output, traces, files or a connector config.
    mcp=new Client({name:'shapeviz-live-fixture',version:'1.0.0'});mcp.onerror=()=>{};
    const transport=new StreamableHTTPClientTransport(new URL(origin+'/api/admin?action=crm-tools-mcp'),{fetch:async(url,init)=>{
      const response=await page.request.fetch(String(url),{method:init.method,headers:{...Object.fromEntries(new Headers(init.headers)),Origin:origin},...(init.body?{data:init.body}:{})});
      return new Response([202,204,304].includes(response.status())?null:await response.body(),{status:response.status(),headers:response.headers()});
    }});
    await mcp.connect(transport);expect(mcp.getServerCapabilities()).toEqual({tools:{listChanged:false}});expect(transport.sessionId).toBeUndefined();
    expect((await mcp.listTools()).tools.map(tool=>tool.name)).toEqual(catalog.tools.map(tool=>tool.name));await mcp.ping();
    const mcpRun=async(name,args={})=>{
      const result=await mcp.callTool({name,arguments:args});expect(result.isError,`${name} MCP result`).toBe(false);
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);expect(result.structuredContent.meta).toEqual({read_only:true,untrusted_data:true});return result.structuredContent.data;
    };
    for(const [name,args] of [
      ['search_leads',{filters:{country:'SK',fit:'HIGH'}}],['get_lead',{id:main.id}],['check_company_duplicates',{website:'tools-duplicates.example'}],
      ['get_research_candidates',{filters:{research_status:'REJECTED'},page:2}],['get_research_candidate',{id:pending.id}],
      ['get_existing_domains',{}],['get_existing_domains',{page:2}],['get_rejected_domains',{page:2}],['get_research_catalog',{}],
    ])expect(await mcpRun(name,args)).toEqual(await run(name,args));
    for(const [name,id] of [['get_lead',privateCompany.id],['get_research_candidate',privateCandidate.id]]){
      const result=await mcp.callTool({name,arguments:{id}});expect(result.isError).toBe(true);expect(result._meta['shapeviz/httpStatus']).toBe(404);expect(JSON.stringify(result)).not.toContain('Other owner');
    }
    const refused=await mcp.callTool({name:'update_lead',arguments:{id:main.id,fit:'LOW'}});expect(refused.isError).toBe(true);
    expect(await snapshots()).toEqual(initial);

    // Membership is checked again on every read even while the session is valid.
    await request(`/rest/v1/presentation_admins?user_id=eq.${owner.user.id}`,{method:'DELETE'});removedMembership=owner.user.id;
    expect((await page.request.get(origin+'/api/admin?action=crm-tools-list')).status()).toBe(403);expect((await invoke('get_research_catalog')).status()).toBe(403);
    await expect(mcp.listTools()).rejects.toMatchObject({code:403});await expect(mcp.ping()).rejects.toMatchObject({code:403});
    expect(await snapshots()).toEqual(initial);
    await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:owner.user.id,role:'owner'}});removedMembership=null;
    await page.getByRole('button',{name:'Sign out'}).click();await expect(page.locator('#signin')).toBeVisible();signedOut=true;
    expect((await page.request.get(origin+'/api/admin?action=crm-tools-list')).status()).toBe(401);expect((await invoke('search_leads')).status()).toBe(401);expect(errors).toEqual([]);
    await expect(mcp.listTools()).rejects.toMatchObject({code:401});
  }finally{
    const failures=[];
    await mcp?.close();
    if(removedMembership){try{await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:removedMembership,role:'owner'}});}catch(error){failures.push(error.message);}}
    if(server&&origin&&!signedOut){try{const response=await appPost('logout',{});if(![200,401].includes(response.status()))failures.push('Application sign-out failed: '+response.status());}catch{failures.push('Application sign-out request failed.');}}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    for(const user of users){
      const account=accounts.find(account=>account.user.id===user.id);
      for(const table of ['crm_contacts','crm_notes'])if(account){try{await request(`/rest/v1/${table}?owner_id=eq.${user.id}`,{method:'DELETE',jwt:account.jwt});}catch(error){failures.push(error.message);}}
      for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_clients?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){
        try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
      }
    }
    if(failures.length)throw new Error('Read-tool fixture cleanup failed: '+failures.join('; '));
  }
});
