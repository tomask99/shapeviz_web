import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createAdminHandler} from '../src/admin/handler.js';
import {handleReadMcp} from '../src/tools/mcp.js';
import {READ_TOOLS} from '../src/tools/catalog.js';
import {validateResearchCandidate} from '../src/research/validation.js';
import {candidateProposal} from '../src/research/refresh-domain.js';
import {RESEARCH_SERVICES} from '../public/admin/service-catalog.js';
import {OPPORTUNITY_SIGNALS,PROVENANCE_FIELDS} from '../public/admin/research-options.js';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const record='33333333-3333-4333-8333-333333333333';
const company=id=>({id:record,company_name:id===owner?'First owner':'Second owner',website:'https://fixture.example/',country:'SK',city:'',industry:'Furniture',short_description:'',services:['Product CGI'],fit:'HIGH',pipeline_status:'NEW_LEAD',archived_at:null,version:1,is_client:false});
const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
const initialize=()=>rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'fixture',version:'1'}});

async function fixture(run,{scopes}={}) {
  const state={member:true,jwtMember:true,reads:[],audits:[],refreshes:0,candidate:[],upstreamError:false};
  const call=async(path,options={})=>{
    const id=options.token==='jwt-b'?other:owner;
    if(path.startsWith('/rest/v1/presentation_admins'))return state.member&&(!options.token||state.jwtMember)?[{user_id:id,role:'owner'}]:[];
    state.reads.push({path,...options});
    if(state.upstreamError)throw new Error('PRIVATE_UPSTREAM_ERROR with server-secret');
    if(path==='/rest/v1/rpc/crm_tool_search_leads'){
      await new Promise(resolve=>setTimeout(resolve,id===owner?10:1));
      return {items:[{...company(id),notes:'PRIVATE_NOTE',estimated_value:100,owner_id:id}],total:1,page:1,pageSize:25,hasMore:false};
    }
    if(path.startsWith('/rest/v1/crm_companies'))return [];
    if(path.startsWith('/rest/v1/crm_research_candidates'))return state.candidate;
    throw new Error('Unexpected business read');
  };
  const send=async(endpoint,options)=>{
    const url=new URL(endpoint),token=options.headers.Authorization?.slice(7);
    if(url.pathname==='/auth/v1/user')return ['jwt-a','jwt-b','renewed'].includes(token)?Response.json({id:token==='jwt-b'?other:owner}):Response.json({},{status:401});
    if(url.pathname==='/auth/v1/token'){state.refreshes++;return Response.json({user:{id:owner},access_token:'renewed',refresh_token:'rotated'});}
    return Response.json(await call(url.pathname+url.search,{token,method:options.method,...(options.body?{body:JSON.parse(options.body)}:{})}));
  };
  const audit=event=>state.audits.push(event);
  const handler=scopes?async(req,res)=>{
    if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'}).end();return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    await handleReadMcp({req,res,body:JSON.parse(Buffer.concat(chunks).toString()),url:new URL(req.url,'http://localhost'),user:{id:owner},token:'jwt-a',scopes,call,audit});
  }:createAdminHandler({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'server-secret'},send,toolAudit:audit});
  const server=createServer(handler),clients=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,url=origin+'/api/admin?action=crm-tools-mcp';
  const headers={Origin:origin,Cookie:'sv_access=jwt-a','Content-Type':'application/json',Accept:'application/json, text/event-stream'};
  const post=(body,options={})=>fetch(url+(options.query||''),{method:'POST',headers:{...headers,...options.headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const client=async(token='jwt-a')=>{
    const instance=new Client({name:'shapeviz-fixture',version:'1.0.0'});
    const transport=new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Origin:origin,Cookie:'sv_access='+token}}});
    instance.onerror=()=>{};clients.push(instance);await instance.connect(transport);return {instance,transport};
  };
  try{await run({state,post,client,url,headers,origin});}
  finally{await Promise.all(clients.map(instance=>instance.close()));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('Official MCP client initializes, discovers the exact schemas, pings and reads structured/text results',()=>fixture(async({client,state})=>{
  const {instance,transport}=await client();
  assert.equal(instance.getServerVersion().name,'shapeviz-research-read');
  assert.deepEqual(instance.getServerCapabilities(),{tools:{listChanged:false}});assert.equal(transport.sessionId,undefined);
  assert.deepEqual(await instance.ping(),{});
  const {tools}=await instance.listTools();assert.deepEqual(tools.map(tool=>tool.name),READ_TOOLS.map(tool=>tool.name));
  for(const [index,tool] of tools.entries()){
    assert.deepEqual(tool.inputSchema,READ_TOOLS[index].inputSchema);
    assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
    assert.deepEqual(tool._meta['shapeviz/requiredScopes'],READ_TOOLS[index].required_scopes);assert.equal(tool.securitySchemes,undefined);
  }
  const result=await instance.callTool({name:'search_leads',arguments:{filters:{country:'sk'}}});
  assert.equal(result.isError,false);assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);
  assert.deepEqual(result.structuredContent.data.items,[company(owner)]);assert.deepEqual(result.structuredContent.meta,{read_only:true,untrusted_data:true});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NOTE|estimated_value|owner_id|server-secret|jwt-a/);
  assert.ok(state.reads.every(read=>read.token==='jwt-a'));assert.equal(state.reads[0].body.p_filters.country,'SK');
}));

test('MCP authentication covers initialize, list, ping, notifications and calls without accepting bearer credentials',()=>fixture(async({post,state})=>{
  for(const body of [initialize(),rpc('tools/list'),rpc('ping'),{jsonrpc:'2.0',method:'notifications/initialized'},rpc('tools/call',{name:'get_research_catalog'})]){
    for(const headers of [{Cookie:''},{Cookie:'',Authorization:'Bearer jwt-a'},{Cookie:'sv_access=invalid'}]){
      const response=await post(body,{headers});assert.equal(response.status,401);assert.equal((await response.json()).jsonrpc,'2.0');
    }
  }
  state.member=false;assert.equal((await post(initialize())).status,403);
  state.member=true;state.jwtMember=false;assert.equal((await post(initialize())).status,403);
  assert.equal(state.reads.length,0);
}));

test('Internal MCP keeps origin, method, media type, payload, query and cache boundaries',()=>fixture(async({post,url,headers})=>{
  for(const change of [{Origin:''},{Origin:'https://foreign.example'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await post(initialize(),{headers:change})).status,403);
  for(const method of ['GET','DELETE','PUT','OPTIONS']){
    const response=await fetch(url,{method,headers});assert.equal(response.status,405);assert.equal(response.headers.get('Allow'),'POST');
  }
  assert.equal((await post(initialize(),{headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await post(initialize(),{headers:{Accept:'application/json'}})).status,406);
  assert.equal((await post(initialize(),{query:'&owner_id='+other})).status,400);
  assert.equal((await post(initialize(),{query:'&action=me'})).status,400);
  assert.equal((await post(rpc('ping',{_meta:{large:'x'.repeat(16384)}}))).status,413);
  for(const key of ['mcp-session-id','last-event-id'])assert.equal((await post(initialize(),{headers:{[key]:'foreign-session'}})).status,400);
  assert.equal((await post(rpc('ping'),{headers:{'MCP-Protocol-Version':'unsupported'}})).status,400);
  const notification=await post({jsonrpc:'2.0',method:'notifications/initialized'});assert.equal(notification.status,202);assert.equal(await notification.text(),'');
  const response=await post(initialize());assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.equal(response.headers.get('mcp-session-id'),null);
}));

test('Malformed MCP and batch requests fail with bounded protocol errors before business data',()=>fixture(async({post,state})=>{
  const broken=await post('{broken');assert.equal(broken.status,400);assert.equal((await broken.json()).error.code,-32700);
  for(const body of [null,[],[rpc('tools/list')],{},rpc('ping',{},'x'.repeat(129)),{...rpc('ping'),owner_id:other},{...rpc('tools/list'),scopes:['crm:write']},{jsonrpc:'2.0',method:'tools/call',params:{name:'search_leads'}},rpc('notifications/initialized')]){
    const response=await post(body);assert.equal(response.status,400);assert.equal((await response.json()).error.code,-32600);
  }
  for(const body of [rpc('tools/call',{name:5}),rpc('tools/call',{name:'get_research_catalog',arguments:[]}),rpc('tools/call',{name:'search_leads',owner_id:other}),rpc('tools/call',{name:'search_leads',task:{ttl:100}}),rpc('tools/list',{cursor:'opaque'}),rpc('ping',{scopes:['crm:write']})]){
    const response=await post(body);assert.equal(response.status,400);assert.equal((await response.json()).error.code,-32602);
  }
  for(const method of ['execute_sql','__proto__','constructor','toString']){
    const response=await post(rpc(method,{query:'PRIVATE_QUERY'}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.error.code,-32601);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_QUERY|execute_sql/);
  }
  assert.equal(state.reads.length,0);
}));

test('Unknown tools and owner/scope injection cannot invoke business writes or widen the read schema',()=>fixture(async({client,state})=>{
  const {instance}=await client();
  for(const [name,args] of [['crm-update',{id:record}],['execute_sql',{query:'secret'}],['search_leads',{owner_id:other}],['search_leads',{filters:{owner_id:other}}],['get_research_catalog',{scopes:['crm:write']}],['get_lead',{id:'invalid'}]]){
    const result=await instance.callTool({name,arguments:args});assert.equal(result.isError,true);assert.equal(result._meta['shapeviz/httpStatus'],400);assert.equal(result.structuredContent,undefined);
  }
  assert.equal(state.reads.length,0);
}));

test('Concurrent MCP clients with identical JSON-RPC ids keep separate owner tokens and results',()=>fixture(async({client})=>{
  const [first,second]=await Promise.all([client(),client('jwt-b')]);
  const results=await Promise.all(Array.from({length:8},(_,index)=>[first,second][index%2].instance.callTool({name:'search_leads'})));
  results.forEach((result,index)=>assert.deepEqual(result.structuredContent.data.items,[company(index%2?other:owner)]));
  assert.equal(new Set(results.map(result=>result.structuredContent.request_id)).size,8);
}));

test('MCP discovery and calls obey trusted scopes even when metadata claims wider grants',()=>fixture(async({client,state})=>{
  const {instance}=await client();assert.deepEqual((await instance.listTools()).tools.map(tool=>tool.name),['get_research_catalog']);
  const denied=await instance.callTool({name:'search_leads',_meta:{scopes:['crm:read'],owner_id:other}});assert.equal(denied.isError,true);assert.equal(denied._meta['shapeviz/httpStatus'],403);
  assert.equal((await instance.callTool({name:'get_research_catalog'})).isError,false);assert.equal(state.reads.length,0);
},{scopes:['catalog:read']}));

test('Existing MCP clients lose access on membership revocation and expired sessions can refresh',()=>fixture(async({client,post,state})=>{
  const {instance}=await client();await instance.listTools();state.member=false;
  await assert.rejects(instance.listTools(),error=>error.code===403);state.member=true;state.jwtMember=false;
  assert.equal((await post(rpc('ping'))).status,403);state.jwtMember=true;
  const response=await post(rpc('tools/call',{name:'search_leads'}),{headers:{Cookie:'sv_access=expired; sv_refresh=refresh'}});
  assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/sv_access=renewed/);assert.equal(state.refreshes,1);assert.equal(state.reads.at(-1).token,'renewed');
}));

test('Tool failures have safe isError results and metadata-only audit records',()=>fixture(async({client,state})=>{
  const {instance}=await client();
  await instance.callTool({name:'search_leads',arguments:{filters:{q:'PRIVATE_QUERY'}}});
  assert.equal((await instance.callTool({name:'get_lead',arguments:{id:record}}))._meta['shapeviz/httpStatus'],404);
  state.upstreamError=true;const result=await instance.callTool({name:'search_leads'});assert.equal(result.isError,true);assert.equal(result._meta['shapeviz/httpStatus'],500);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_UPSTREAM_ERROR|server-secret/);
  await instance.callTool({name:'PRIVATE_FAKE_TOOL'});
  const audits=state.audits.filter(event=>event.method==='tools/call');assert.deepEqual(audits.map(event=>event.status),[200,404,500,400]);
  assert.ok(audits[0].response_bytes>0);assert.equal(audits[1].response_bytes,0);assert.equal(audits.at(-1).tool,null);
  for(const event of audits)assert.deepEqual(Object.keys(event).sort(),['event','request_id','owner_id','method','tool','at','duration_ms','status','response_bytes'].sort());
  assert.doesNotMatch(JSON.stringify(audits),/PRIVATE_|jwt-a|server-secret|fixture\.example/);
}));

test('MCP enforces the complete wire size including repeated structured and escaped text content',()=>fixture(async({client,state})=>{
  const repeated='"'.repeat(3000);
  const research=candidateProposal(validateResearchCandidate({company_name:'Large canonical report',website:'https://fixture.example/',country:'SK',city:'Bratislava',industry:'Furniture',business_type:'Manufacturer',product_categories:['Sofas'],secondary_categories:['Chairs'],market_segments:['Architects'],research_summary:repeated.repeat(4),suggested_pitch_angle:repeated.repeat(2),short_description:repeated,
    potential_services:RESEARCH_SERVICES.map(service=>({service,relevance:'MEDIUM',reason:repeated})),
    opportunity_signals:OPPORTUNITY_SIGNALS.map(signal=>({signal,confidence:'LOW',status:'INFERRED',evidence:repeated})),
    field_provenance:Object.fromEntries(PROVENANCE_FIELDS.map(field=>[field,{status:'INFERRED',confidence:'LOW',evidence:repeated}])),
  }).candidate);
  const candidate={...research,id:record,version:1,research_status:'NEEDS_REVIEW',approved_company_id:null,created_at:'2026-09-23T00:00:00Z',updated_at:'2026-09-23T00:00:00Z'};
  assert.ok(Buffer.byteLength(JSON.stringify(candidate))<500000);state.candidate=[candidate];
  const {instance}=await client(),result=await instance.callTool({name:'get_research_candidate',arguments:{id:record}});
  assert.equal(result.isError,true);assert.equal(result._meta['shapeviz/httpStatus'],413);assert.equal(result.structuredContent,undefined);assert.ok(JSON.stringify(result).length<1000);
}));
