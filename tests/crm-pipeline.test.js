import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
import {STATUSES} from '../public/admin/crm-options.js';
const user={id:'11111111-1111-4111-8111-111111111111'},id='22222222-2222-4222-8222-222222222222';
const base={user,token:'user-jwt',body:{}};

test('pipeline reads fixed bounded stages using user JWT and excludes archived leads',async()=>{
  const calls=[];
  const data=await handleCrm({...base,action:'crm-pipeline',url:new URL('https://example.test/?archived=all&country_category=SK&q=chair'),call:async(path,opts)=>{calls.push({path,opts});return {companies:[],total:0,page:1,pageSize:25};}});
  assert.deepEqual(data.columns.map(c=>c.status),STATUSES.filter(s=>s!=='LOST'));
  assert.equal(calls.length,9);
  for(const {path,opts}of calls){assert.equal(path,'/rest/v1/rpc/crm_list_companies');assert.equal(opts.token,'user-jwt');assert.equal(opts.body.p_filters.archived,'active');assert.equal(opts.body.p_filters.country_category,'SK');assert.equal(opts.body.p_filters.q,'chair');assert.equal(opts.body.p_page,1);}
});
test('lost view is explicit and invalid pipeline mode is rejected',async()=>{
  let count=0;
  const data=await handleCrm({...base,action:'crm-pipeline',url:new URL('https://example.test/?mode=lost'),call:async(path,opts)=>{count++;assert.equal(opts.body.p_filters.pipeline_status,'LOST');return {companies:[],total:0,page:1};}});
  assert.equal(count,1);assert.equal(data.columns[0].status,'LOST');
  await assert.rejects(()=>handleCrm({...base,action:'crm-pipeline',url:new URL('https://example.test/?mode=all'),call:async()=>{throw new Error('should not call');}}),{status:400});
});
test('status move updates only status, scopes by owner/version and rejects archived or stale cards',async()=>{
  let captured;
  const args={...base,action:'crm-status',url:new URL('https://example.test'),body:{id,version:3,pipeline_status:'QUALIFIED',company_name:'Do not overwrite',owner_id:'attacker'}};
  const data=await handleCrm({...args,call:async(path,opts)=>{captured={path,opts};return [{id,version:4}];}});
  assert.equal(data.company.version,4);assert.deepEqual(captured.opts.body,{pipeline_status:'QUALIFIED'});
  assert.match(captured.path,new RegExp('owner_id=eq.'+user.id));assert.match(captured.path,/version=eq.3&archived_at=is.null/);assert.equal(captured.opts.token,'user-jwt');
  await assert.rejects(()=>handleCrm({...args,call:async()=>[]}),{status:409});
  await assert.rejects(()=>handleCrm({...args,body:{...args.body,pipeline_status:'BOGUS'},call:async()=>[]}),{status:400});
  await assert.rejects(()=>handleCrm({...args,token:null,call:async()=>[]}),{status:401});
});
