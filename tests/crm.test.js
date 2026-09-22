import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';
import {companyInput,handleCrm} from '../src/crm/handler.js';

const owner='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const company={company_name:'Nario',country:'sk',services:['Product CGI','Social content'],priority:'HIGH',lead_source:'Instagram',pipeline_status:'NEW_LEAD',website:'https://nario.example'};

test('CRM validation allows custom industries and rejects unsafe links and invalid enums',()=>{
  const row=companyInput({...company,industry:'Custom industry',owner_id:'attacker'});
  assert.equal(row.country,'SK');assert.equal(row.industry,'Custom industry');assert.ok(!('owner_id' in row));assert.ok(!('country_category' in row));
  for(const fields of [{company_name:''},{website:'javascript:alert(1)'},{instagram:'https://user:pass@example.com'},{country:'Slovakia'},{services:['invalid']},{priority:'HOT'},{pipeline_status:'ADMIN'},{lead_source:'bogus'}])assert.throws(()=>companyInput({...company,...fields}),{status:400});
});

test('CRM reads and writes always use the user token and explicit owner; stale updates return 409',async()=>{
  const calls=[];
  const call=async(path,opts)=>{calls.push({path,opts});return [];};
  const base={user:{id:owner},token:'user-jwt',call,url:new URL('https://example.test/?id='+id)};
  await assert.rejects(()=>handleCrm({...base,action:'crm-update',body:{...company,id,version:4}}),{status:409});
  assert.match(calls[0].path,new RegExp('owner_id=eq.'+owner));assert.match(calls[0].path,/version=eq.4/);assert.equal(calls[0].opts.token,'user-jwt');
  calls.length=0;
  await handleCrm({...base,action:'crm-create',body:{...company,owner_id:'attacker'},call:async(path,opts)=>{calls.push({path,opts});return [{id}];}});
  assert.equal(calls[0].opts.body.owner_id,owner);assert.equal(calls[0].opts.token,'user-jwt');
  await assert.rejects(()=>handleCrm({...base,action:'crm-detail',body:{}}),{status:404});
  await assert.rejects(()=>handleCrm({...base,token:null,action:'crm-list',body:{}}),{status:401});
  await assert.rejects(()=>handleCrm({...base,action:'crm-archive',body:{id,version:1,archived:'true'}}),{status:400});
});

test('CRM list validates paging and combines filters as RPC parameters, not SQL',async()=>{
  let sent;
  const base={user:{id:owner},token:'jwt',action:'crm-list',body:{},call:async(path,opts)=>{sent={path,opts};return {companies:[]};}};
  await handleCrm({...base,url:new URL('https://example.test/?q=a%25%27&country_category=SK&priority=HIGH&service=Product+CGI&page=2')});
  assert.equal(sent.opts.body.p_filters.q,"a%'");assert.equal(sent.opts.body.p_filters.country_category,'SK');assert.equal(sent.opts.body.p_page,2);
  for(const query of ['page=-1','page=1.5','page=10001','priority=bogus'])await assert.rejects(()=>handleCrm({...base,url:new URL('https://example.test/?'+query)}),{status:400});
});

test('CRM API keeps authentication, owner authorization, same-origin and method protections',async()=>{
  let role='owner';const calls=[];
  const send=async(url,opts)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(url.includes('presentation_admins?'))return Response.json([{role}]);
    calls.push({url,opts});return Response.json(url.includes('crm_list')?{companies:[],total:0,page:1,pageSize:25}:[{id}]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'server-key'},send}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  try{
    const request=(action,opts={})=>fetch(origin+'/?action='+action,opts);
    assert.equal((await request('crm-list')).status,401);
    assert.equal((await request('crm-create',{headers:{Cookie:'sv_access=jwt'}})).status,405);
    const headers={Cookie:'sv_access=jwt',Origin:origin,'Content-Type':'application/json'};
    assert.equal((await request('crm-create',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify(company)})).status,403);
    role='viewer';assert.equal((await request('crm-list',{headers})).status,403);
    role='owner';assert.equal((await request('crm-create',{method:'POST',headers,body:JSON.stringify(company)})).status,200);
    assert.equal(calls.length,1);assert.equal(calls[0].opts.headers.Authorization,'Bearer jwt');
    assert.equal(JSON.parse(calls[0].opts.body).owner_id,owner);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
