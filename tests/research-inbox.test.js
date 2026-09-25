import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../server.js';
import {createAdminHandler} from '../src/admin/handler.js';
import {handleCrm} from '../src/crm/handler.js';
import {researchFilters} from '../public/admin/research-filters.js';

const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const context = {user:{id:owner},token:'user-jwt',body:{},call:async()=>[]};
const url = query => new URL('https://example.test/?'+query);

test('Research filters preserve custom taxonomy and validate enums, bounds and ownership injection',() => {
  assert.deepEqual(researchFilters({q:' sofas ',country:'cz',industry:'Custom category',fit:'HIGH',sort:'signals'}),{q:'sofas',country:'CZ',industry:'Custom category',fit:'HIGH',sort:'signals'});
  for (const value of ['true','false']) assert.deepEqual(researchFilters({hide_in_leads:value}),{hide_in_leads:value});
  for (const value of [true,false,'yes','1']) assert.throws(()=>researchFilters({hide_in_leads:value}));
  for (const input of [[],null,{owner_id:owner},{q:[]},{q:'x'.repeat(161)},{country:'USA'},{fit:'87'},{sort:'sql'},{potential_service:'Invented'},{duplicate_status:'none'}]) assert.throws(()=>researchFilters(input));
});

test('Research list delegates bounded filters to an invoker RPC using the user JWT',async() => {
  const calls = [], result = {items:[],total:0,page:2,pageSize:25};
  const response = await handleCrm({...context,action:'crm-research-list',url:url('action=crm-research-list&q=%25_%27&country=cz&fit=HIGH&sort=fit&hide_in_leads=true&page=2'),call:async(path,options)=>{calls.push({path,options});return result;}});
  assert.equal(response,result);
  assert.equal(calls[0].path,'/rest/v1/rpc/crm_research_list');
  assert.equal(calls[0].options.token,'user-jwt');
  assert.deepEqual(calls[0].options.body,{p_filters:{q:"%_'",country:'CZ',fit:'HIGH',sort:'fit',hide_in_leads:'true'},p_page:2});
  for (const query of ['page=0','page=-1','page=1.5','page=10001','page=1e3','page=','page=1&page=2','q=a&q=b','owner_id=spoof','research_status=BOGUS']) {
    await assert.rejects(()=>handleCrm({...context,action:'crm-research-list',url:url(query),call:async()=>assert.fail('Invalid query reached database')}),{status:400});
  }
});

test('Research detail is owner-scoped, avoids wildcard projection and hides missing records',async() => {
  let sent;
  const candidate = {id,company_name:'Private candidate',sources:[{url:'https://example.com'}]};
  const events=[{id,event_type:'candidate_updated',metadata:{changed_fields:['fit']}}];
  const result = await handleCrm({...context,action:'crm-research-detail',url:url('id='+id),call:async(path,options)=>{if(path.includes('/crm_research_events?')){assert.match(path,new RegExp('owner_id=eq.'+owner));assert.match(path,/limit=50$/);assert.equal(options.token,'user-jwt');return events;}sent={path,options};return [candidate];}});
  assert.equal(result.candidate,candidate);
  assert.equal(result.events,events);
  assert.match(sent.path,new RegExp('owner_id=eq.'+owner));
  assert.match(sent.path,/limit=1$/);
  assert.doesNotMatch(sent.path,/select=\*/);
  assert.match(sent.path,/sources/);
  assert.equal(sent.options.token,'user-jwt');
  await assert.rejects(()=>handleCrm({...context,action:'crm-research-detail',url:url('id='+id)}),{status:404});
  for (const query of ['id=invalid','id='+id+'&owner_id=spoof','id='+id+'&id='+id]) await assert.rejects(()=>handleCrm({...context,action:'crm-research-detail',url:url(query)}),{status:400});
  for (const action of ['crm-research-list','crm-research-detail']) await assert.rejects(()=>handleCrm({...context,action,token:null,url:url('id='+id)}),{status:401});
});

test('Research API remains private and exposes no approval or GET import action',async() => {
  let role='owner'; const calls=[];
  const send=async(endpoint,options)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role}]);
    calls.push({endpoint,options});
    return Response.json(endpoint.includes('crm_research_list')?{items:[],total:0,page:1,pageSize:25}:[]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    for (const action of ['crm-research-list','crm-research-detail&id='+id,'crm-research-similar-prompt&referenceType=company&referenceId='+id+'&countries=CZ']) {
      assert.equal((await fetch(origin+'/?action='+action)).status,401);
      role='viewer';assert.equal((await fetch(origin+'/?action='+action,{headers:{Cookie:'sv_access=jwt'}})).status,403);
    }
    role='owner';
    const response=await fetch(origin+'/?action=crm-research-list',{headers:{Cookie:'sv_access=jwt'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
    assert.equal((await fetch(origin+'/?action=crm-research-approve',{headers:{Cookie:'sv_access=jwt'}})).status,405);
    assert.equal((await fetch(origin+'/?action=crm-research-import',{headers:{Cookie:'sv_access=jwt'}})).status,405);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});

test('Similar-company prompt is an owner-only HTTP read with JWT-scoped reference and exclusions',async() => {
  const calls=[];
  const send=async(endpoint,options)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
    calls.push({endpoint,options});
    if(endpoint.includes('/crm_companies?'))return Response.json([{id,company_name:'Reference company',website:'https://reference.example/',country:'SK',city:'',industry:'Furniture',short_description:'A furniture brand',services:['Product CGI'],fit:'HIGH',pipeline_status:'NEW_LEAD',archived_at:null,version:1}]);
    if(endpoint.endsWith('/crm_research_excluded_domains'))return Response.json({domains:['reference.example','rejected.example'],count:2,overflow:false});
    assert.fail('Unexpected request: '+endpoint);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    const response=await fetch(origin+'/?action=crm-research-similar-prompt&referenceType=company&referenceId='+id+'&countries=CZ,AT&count=5',{headers:{Cookie:'sv_access=jwt'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/private.*no-store/);
    const body=await response.json();
    assert.match(body.prompt,/SIMILAR_COMPANY/);
    assert.match(body.prompt,/rejected\.example/);
    assert.deepEqual(body.countries,['CZ','AT']);
    assert.equal(body.count,5);
    assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer jwt'));
    assert.match(calls[0].endpoint,new RegExp('owner_id=eq.'+owner));
    assert.doesNotMatch(JSON.stringify(body),/server-only|Bearer jwt/);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Research import HTTP gateway accepts bounded escaped JSON, authenticates writes and keeps commit credentials server-only',async() => {
  const calls=[];
  const send=async(endpoint,options)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
    const body=options.body?JSON.parse(options.body):{};
    calls.push({endpoint,options,body});
    if(endpoint.endsWith('/crm_research_duplicates'))return Response.json(body.p_rows.map(row=>({row:row.row,matches:[],match_count:0,fingerprint:'fixture'})));
    if(endpoint.endsWith('/crm_research_import'))return Response.json({imported:25,skipped:0,candidate_ids:[]});
    return Response.json([]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const headers={Cookie:'sv_access=jwt',Origin:origin,'Content-Type':'application/json'};
  const json=JSON.stringify({candidates:Array.from({length:25},(_,i)=>({company_name:'Fixture '+i,research_summary:'"'.repeat(7000)}))});
  assert.ok(Buffer.byteLength(json)<500_000);
  assert.ok(Buffer.byteLength(JSON.stringify({json}))>500_000);
  try {
    const endpoint=origin+'/?action=crm-research-import-preview';
    assert.equal((await fetch(endpoint,{headers:{Cookie:'sv_access=jwt'}})).status,405);
    assert.equal((await fetch(endpoint,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify({json})})).status,403);
    assert.equal((await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({json})})).status,401);
    const previewResponse=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({json})});
    assert.equal(previewResponse.status,200);
    const preview=await previewResponse.json();
    assert.equal(preview.valid_count,25);
    assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
    const response=await fetch(origin+'/?action=crm-research-import-commit',{method:'POST',headers,body:JSON.stringify({json,previewToken:preview.previewToken,batchId:id,choices:preview.rows.map(row=>({row:row.row,decision:'import'})),confirm:'import'})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).imported,25);
    const commit=calls.at(-1);
    assert.equal(commit.body.p_owner,owner);
    assert.equal(commit.options.headers.apikey,'server-only');
    assert.equal(commit.options.headers.Authorization,undefined);
    assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({json:'x'.repeat(500_001)})})).status,413);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Research deep links serve the private Studio shell with no-store and noindex',async() => {
  const server=createApp({env:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    for (const path of ['/admin/ai-research','/admin/ai-research/'+id]) {
      const response=await fetch(origin+path);
      assert.equal(response.status,200);
      assert.match(response.headers.get('cache-control'),/no-store/);
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      const html=await response.text();
      assert.match(html,/id="nav-research"/);
      assert.match(html,/research.css/);
    }
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
