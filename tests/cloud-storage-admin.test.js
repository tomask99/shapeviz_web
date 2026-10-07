import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleClientFiles} from '../src/files/admin.js';
import {createApp} from '../server.js';
const owner='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222';

test('Cloud storage lists owned portals with company names and bounded pagination, without source keys',async()=>{
 const calls=[],portals=Array.from({length:51},(_,i)=>({id:randomUUID(),company_id:randomUUID(),title:'Portal '+i,slug:'portal-'+i,public_token:'a'.repeat(32),version:1,active:i!==0}));
 const run=page=>handleClientFiles({action:'cloud-storage',body:{owner_id:'spoof'},url:new URL('http://localhost/?page='+page),user:{id:owner},token:'owner-jwt',call:async(path,options)=>{
  assert.equal(options.token,'owner-jwt');calls.push(path);const url=new URL(path,'http://db');assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);
  if(url.pathname.endsWith('/client_file_shares')){assert.equal(url.searchParams.get('limit'),'51');assert.equal(url.searchParams.get('offset'),'50');assert.ok(!url.searchParams.get('select').includes('mega_url'));return portals;}
  assert.equal(url.pathname,'/rest/v1/crm_companies');return portals.slice(0,50).map((p,i)=>({id:p.company_id,company_name:'Company '+i,archived_at:i===0?'2026-01-01':null}));
 }});
 const result=await run(2);assert.equal(result.items.length,50);assert.equal(result.hasMore,true);assert.equal(result.items[0].company_name,'Company 0');assert.equal(result.items[0].active,false);assert.equal(result.items[0].archived_at,'2026-01-01');assert.equal(calls.length,2);assert.doesNotMatch(JSON.stringify(result),/mega_url|owner_id/);
 for(const page of [0,-1,1.5,10001,'bad'])await assert.rejects(run(page),{status:400});
});

test('Cloud storage company choices exclude archived clients and identify existing connections',async()=>{
 const companies=Array.from({length:101},(_,i)=>({company_id:randomUUID(),crm_companies:{company_name:'Company '+i}})),calls=[];
 const result=await handleClientFiles({action:'cloud-storage-companies',url:new URL('http://localhost/?page=2'),user:{id:owner},token:'owner-jwt',call:async(path,options)=>{
  assert.equal(options.token,'owner-jwt');calls.push(path);const query=new URL(path,'http://db').searchParams;assert.equal(query.get('owner_id'),'eq.'+owner);
  if(path.startsWith('/rest/v1/crm_clients?')){assert.equal(query.get('crm_companies.archived_at'),'is.null');assert.equal(query.get('offset'),'100');assert.equal(query.get('limit'),'101');return companies;}
  assert.equal(query.get('select'),'company_id');return [{company_id:companies[0].company_id}];
 }});
 assert.equal(result.items.length,100);assert.equal(result.hasMore,true);assert.equal(result.items[0].has_storage,true);assert.equal(result.items[1].has_storage,false);assert.equal(calls.length,2);
 for(const action of ['cloud-storage','cloud-storage-companies'])await assert.rejects(handleClientFiles({action,url:new URL('http://localhost'),user:{id:owner},token:null}),{status:401});
});

test('Cloud storage GET actions run through the authenticated admin handler and refuse anonymous access',async t=>{
 const calls=[],server=createApp({env:{SUPABASE_URL:'https://fixture.example',SUPABASE_SECRET_KEY:'fixture-only'},send:async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,authorization:options.headers.Authorization});
  if(path==='/auth/v1/user')return Response.json({id:owner,email:'owner@example.test'});
  if(path==='/rest/v1/presentation_admins')return Response.json([{role:'owner'}]);
  if(path==='/rest/v1/crm_clients')return Response.json([{company_id:company,crm_companies:{id:company,company_name:'Studio',archived_at:null}}]);
  return Response.json([]);
 }});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const origin='http://127.0.0.1:'+server.address().port;
 for(const action of ['cloud-storage','cloud-storage-companies']){
  const endpoint=origin+'/api/admin?action='+action;assert.equal((await fetch(endpoint)).status,401);
  const response=await fetch(endpoint,{headers:{Cookie:'sv_access=fixture-jwt'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const data=await response.json();assert.ok(Array.isArray(data.items));
 }
 assert.ok(calls.some(call=>call.path==='/rest/v1/client_file_shares'));
});
