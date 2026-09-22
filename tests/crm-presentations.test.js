import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
const owner='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const base={user:{id:owner},token:'jwt',body:{companyId},url:new URL('https://example.test/?companyId='+companyId)};
test('studio lookup is owner scoped and ensure retries only the same owned association',async()=>{
  const calls=[];
  const result=await handleCrm({...base,action:'crm-presentation-company',url:new URL('https://example.test/?slug=pitch'),call:async(path,opts)=>{calls.push({path,opts});return [];}});
  assert.equal(result.item,null);assert.equal(calls[0].opts.token,'jwt');assert.match(calls[0].path,new RegExp('owner_id=eq.'+owner));
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-company',url:new URL('https://example.test/?slug=../private'),call:async()=>[]}),{status:400});
  const retry=async(found)=>handleCrm({...base,action:'crm-presentation-ensure',body:{companyId,slug:'pitch'},call:async(path,opts)=>{
    assert.equal(opts.token,'jwt');
    if(opts.method==='POST')throw Object.assign(new Error('duplicate'),{status:409});
    if(path.includes('crm_presentation_links')){assert.match(path,new RegExp('company_id=eq.'+companyId));assert.match(path,new RegExp('owner_id=eq.'+owner));return found?[{id,company_id:companyId,deck_slug:'pitch'}]:[];}
    return [{id,status:'published',is_template:false}];
  }});
  assert.equal((await retry(true)).item.id,id);await assert.rejects(()=>retry(false),{status:409});
});
test('presentation assignment checks owner company and registry with JWT, excludes templates, handles duplicates',async()=>{
  const calls=[];const call=async(path,opts)=>{calls.push({path,opts});return [{id,deck_slug:'pitch',status:'published',is_template:false}];};
  await handleCrm({...base,action:'crm-presentation-assign',body:{companyId,slug:'pitch',owner_id:'spoof'},call});
  assert.equal(calls.length,3);assert.ok(calls.every(c=>c.opts.token==='jwt'));
  assert.deepEqual(calls[2].opts.body,{company_id:companyId,owner_id:owner,deck_slug:'pitch'});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-assign',body:{companyId,slug:'pitch'},call:async(path)=>[{id,is_template:path.includes('presentation_projects')}]}),{status:400});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-assign',body:{companyId,slug:'pitch'},call:async(path)=>{if(path==='/rest/v1/crm_presentation_links')throw Object.assign(new Error('Unique'),{status:409});return [{id}];}}),{status:409,message:/already assigned/});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-assign',body:{companyId,slug:'../pitch'},call}),{status:400});
});
test('presentation stats uses service-only RPC only after owner-scoped link authorization, never browser slug',async()=>{
  const calls=[];
  const url=new URL(base.url);url.searchParams.set('id',id);url.searchParams.set('slug','another-deck');url.searchParams.set('days','7');
  await handleCrm({...base,action:'crm-presentation-stats',url,call:async(path,opts)=>{calls.push({path,opts});return path.includes('/rpc/')?{summary:{visits:0}}:[{id,deck_slug:'authorized-deck'}];}});
  assert.equal(calls.length,3);assert.match(calls[1].path,new RegExp('company_id=eq.'+companyId));assert.match(calls[1].path,new RegExp('owner_id=eq.'+owner));assert.equal(calls[1].opts.token,'jwt');
  assert.equal(calls[2].opts.token,undefined);assert.deepEqual(calls[2].opts.body,{p_slug:'authorized-deck',p_days:7});
  let privileged=0;
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-stats',url,call:async(path)=>{if(path.includes('/rpc/'))privileged++;return path.includes('crm_companies')?[{id:companyId}]:[];}}),{status:404});
  assert.equal(privileged,0);
  url.searchParams.set('days','365');await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-stats',url,call:async()=>[{id}]}),{status:400});
});
test('sent and unassign writes scope version and preserve registry; rejects unrelated contacts, missing confirmation and auth',async()=>{
  let write;
  const body={companyId,id,version:2,sent_at:'2026-01-02T10:00:00.000Z'};
  const call=async(path,opts)=>{if(opts.method)write={path,opts};return [{id}];};
  await handleCrm({...base,action:'crm-presentation-sent',body,call});
  assert.match(write.path,/version=eq.2&sent_at=is.null/);assert.deepEqual(write.opts.body,{sent_at:body.sent_at,sent_to_contact_id:null});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-sent',body:{...body,contact_id:owner},call:async(path)=>path.includes('crm_contacts')?[]:[{id}]}),{status:400});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-sent',body:{...body,sent_at:'2099-01-02T10:00:00.000Z'},call}),{status:400});
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-unassign',body,call}),{status:400});
  await handleCrm({...base,action:'crm-presentation-unassign',body:{...body,confirm:'unlink'},call});
  assert.equal(write.opts.method,'DELETE');assert.match(write.path,/crm_presentation_links/);assert.match(write.path,/version=eq.2$/);
  await assert.rejects(()=>handleCrm({...base,action:'crm-presentation-sent',body,call:async(path,opts)=>opts.method?[]:[{id}]}),{status:409});
  await assert.rejects(()=>handleCrm({...base,token:null,action:'crm-presentations',call}),{status:401});
});
