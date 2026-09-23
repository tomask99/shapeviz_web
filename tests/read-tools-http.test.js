import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';

const owner='11111111-1111-4111-8111-111111111111';
const companyId='22222222-2222-4222-8222-222222222222';
const company={id:companyId,company_name:'Fixture',website:'https://fixture.example/',country:'SK',city:'',industry:'Furniture',short_description:'',services:['Product CGI'],fit:'HIGH',pipeline_status:'WON',archived_at:null,version:1,is_client:false};

async function fixture(run){
  const state={role:'owner',jwtOwner:true,expired:false,data:[],audits:[],refreshes:0};
  const send=async(endpoint,options)=>{
    const url=new URL(endpoint),path=url.pathname;
    if(path==='/auth/v1/user')return state.expired&&options.headers.Authorization==='Bearer expired'?Response.json({},{status:401}):Response.json({id:owner});
    if(path==='/auth/v1/token'){state.refreshes++;return Response.json({user:{id:owner},access_token:'renewed',refresh_token:'rotated'});}
    if(path==='/rest/v1/presentation_admins')return Response.json(options.headers.Authorization&&!state.jwtOwner?[]:[{user_id:owner,role:state.role}]);
    state.data.push({url,options});
    if(path==='/rest/v1/rpc/crm_tool_search_leads')return Response.json({items:[{...company,owner_id:owner,estimated_value:'SENSITIVE_AMOUNT',notes:'PRIVATE_NOTE'}],total:1,page:1,pageSize:25,hasMore:false});
    if(path==='/rest/v1/crm_companies')return Response.json([]);
    throw new Error('Unexpected business operation: '+path);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'server-secret'},send,toolAudit:event=>state.audits.push(event)}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const get=(suffix='',headers={Cookie:'sv_access=jwt'})=>fetch(origin+'/?action=crm-tools-list'+suffix,{headers});
  const post=(body,options={})=>fetch(origin+'/?action=crm-tools-call'+(options.query||''),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'sv_access=jwt',...options.headers},body:typeof body==='string'?body:JSON.stringify(body)});
  try{await run({state,get,post,origin});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('Read-tool catalog and calls require owner sessions and reject external bearer credentials',()=>fixture(async({state,get,post})=>{
  assert.equal((await get('',{})).status,401);
  assert.equal((await get('',{Authorization:'Bearer external-token'})).status,401);
  assert.equal((await post({tool:'get_research_catalog',arguments:{}},{headers:{Cookie:''}})).status,401);
  state.role='viewer';assert.equal((await get()).status,403);assert.equal((await post({tool:'get_research_catalog',arguments:{}})).status,403);
  state.role='owner';state.jwtOwner=false;assert.equal((await get()).status,403);assert.equal((await post({tool:'get_research_catalog',arguments:{}})).status,403);
  assert.equal(state.data.length,0);
}));

test('Read-tool HTTP adapter keeps same-origin, method, JSON and no-store boundaries',()=>fixture(async({get,post,origin})=>{
  assert.equal((await post({tool:'get_research_catalog',arguments:{}},{headers:{Origin:'https://foreign.example'}})).status,403);
  assert.equal((await post({tool:'get_research_catalog',arguments:{}},{headers:{Origin:''}})).status,403);
  assert.equal((await get('',{Cookie:'sv_access=jwt','Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await fetch(origin+'/?action=crm-tools-call',{headers:{Cookie:'sv_access=jwt'}})).status,405);
  assert.equal((await fetch(origin+'/?action=crm-tools-list',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'sv_access=jwt'},body:'{}'})).status,405);
  assert.equal((await post('{}',{headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await post('{broken')).status,400);
  assert.equal((await post({tool:'get_research_catalog',arguments:{text:'x'.repeat(16384)}})).status,413);
  const response=await get();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const catalog=await response.json();assert.equal(catalog.schema_version,1);assert.equal(catalog.tools.length,8);assert.ok(catalog.tools.every(tool=>tool.read_only===true));
}));

test('Strict read-tool envelope refuses owner/scope/query injection and mutation tools without business calls',()=>fixture(async({state,get,post})=>{
  for(const suffix of ['&owner_id='+owner,'&action=crm-tools-call','&tool=search_leads'])assert.equal((await get(suffix)).status,400);
  for(const body of [null,[],{}, {tool:'get_research_catalog',arguments:{},owner_id:owner},{tool:'get_research_catalog',arguments:{},scopes:['crm:write']},{tool:'get_research_catalog',arguments:[]},{tool:'execute_sql',arguments:{query:'select private'}},{tool:'crm-update',arguments:{id:companyId}},{tool:'search_leads',arguments:{filters:{owner_id:owner}}}])assert.equal((await post(body)).status,400,JSON.stringify(body));
  assert.equal((await post({tool:'get_research_catalog',arguments:{}},{query:'&owner_id='+owner})).status,400);
  assert.equal(state.data.length,0);
}));

test('Read-tool results project private data away and database reads carry the verified JWT',()=>fixture(async({state,post})=>{
  const response=await post({tool:'search_leads',arguments:{filters:{country:'sk',industry:'Furniture',fit:'HIGH',service:'Product CGI'}}});assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.tool,'search_leads');assert.equal(result.schema_version,1);assert.match(result.request_id,/^[a-f0-9-]{36}$/);assert.deepEqual(result.meta,{read_only:true,untrusted_data:true});assert.deepEqual(result.data.items,[company]);
  assert.doesNotMatch(JSON.stringify(result),/SENSITIVE_AMOUNT|PRIVATE_NOTE|owner_id|server-secret/);
  assert.equal(state.data.length,1);assert.equal(state.data[0].options.headers.Authorization,'Bearer jwt');assert.equal(state.data[0].url.pathname,'/rest/v1/rpc/crm_tool_search_leads');
  const sent=JSON.parse(state.data[0].options.body);assert.equal(sent.p_filters.country,'SK');assert.equal(sent.p_filters.service,'Product CGI');assert.equal(sent.p_page,1);
}));

test('Tool operational audit contains only controlled metadata and never query arguments, results or errors',()=>fixture(async({state,post})=>{
  await post({tool:'search_leads',arguments:{filters:{q:'SENSITIVE_QUERY'}}});
  await post({tool:'get_lead',arguments:{id:companyId}});
  await post({tool:'SECRET_FAKE_TOOL',arguments:{secret:'PRIVATE_ARGS'}});
  assert.equal(state.audits.length,3);assert.deepEqual(state.audits.map(event=>event.status),[200,404,400]);assert.equal(state.audits[2].tool,null);
  for(const event of state.audits){assert.deepEqual(Object.keys(event).sort(),['event','request_id','owner_id','action','tool','at','duration_ms','status','response_bytes'].sort());assert.equal(event.owner_id,owner);assert.equal(event.event,'crm_read_tool');assert.ok(event.duration_ms>=0);}
  assert.doesNotMatch(JSON.stringify(state.audits),/SENSITIVE_QUERY|SENSITIVE_AMOUNT|PRIVATE_NOTE|PRIVATE_ARGS|SECRET_FAKE_TOOL|server-secret|fixture\.example|jwt/);
}));

test('Expired admin sessions refresh before read tools and forward only the renewed user token',()=>fixture(async({state,post})=>{
  state.expired=true;
  const response=await post({tool:'search_leads',arguments:{}},{headers:{Cookie:'sv_access=expired; sv_refresh=refresh'}});assert.equal(response.status,200);assert.equal(state.refreshes,1);assert.match(response.headers.get('Set-Cookie'),/sv_access=renewed/);assert.equal(state.data[0].options.headers.Authorization,'Bearer renewed');
}));
