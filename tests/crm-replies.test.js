import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
const owner='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',contact='44444444-4444-4444-8444-444444444444';
const body={id,companyId,received_at:'2026-01-15T09:30:00.000Z',content:'Interested',contact_id:null};
const base={action:'crm-reply-add',body,user:{id:owner},token:'jwt',url:new URL('https://example.test/?companyId='+companyId)};
test('reply insert uses verified owner, user JWT and normalized fixed event; retries do not append',async()=>{
  let saved=null;const calls=[];
  const call=async(path,opts)=>{calls.push({path,opts});if(path.includes('crm_companies'))return [{id:companyId}];if(opts.method==='POST'){saved={...opts.body};return [saved];}return saved?[saved]:[];};
  await handleCrm({...base,body:{...body,owner_id:'spoof',event_type:'lead_won'},call});
  assert.ok(calls.every(c=>c.opts.token==='jwt'));assert.equal(saved.owner_id,owner);assert.equal(saved.event_type,'reply_received');
  assert.equal((await handleCrm({...base,call})).item.id,id);assert.equal(calls.filter(c=>c.opts.method==='POST').length,1);
  await assert.rejects(()=>handleCrm({...base,body:{...body,content:'Changed'},call}),{status:409});
});
test('reply rejects invalid dates, IDs, empty content, other company contacts and archived companies',async()=>{
  const call=async path=>path.includes('crm_companies')?[{id:companyId}]:[];
  for(const change of [{id:'bad'},{companyId:'bad'},{received_at:'tomorrow'},{received_at:'2099-01-01T00:00:00.000Z'},{content:' '},{contact_id:'bad'},{contact_id:contact}])await assert.rejects(()=>handleCrm({...base,body:{...body,...change},call}),{status:400});
  await assert.rejects(()=>handleCrm({...base,call:async path=>path.includes('crm_companies')?[{id:companyId,archived_at:'2026-01-01'}]:[]}),{status:409});
  await assert.rejects(()=>handleCrm({...base,call:async()=>[]}),{status:404});
  await assert.rejects(()=>handleCrm({...base,token:null,call}),{status:401});
});
test('reply race re-reads only authorized event; summary uses bounded received-date order',async()=>{
  let reads=0;
  const result=await handleCrm({...base,call:async(path,opts)=>{
    if(path.includes('crm_companies'))return [{id:companyId}];
    if(opts.method==='POST')throw Object.assign(new Error('duplicate'),{status:409});
    assert.match(path,new RegExp('company_id=eq.'+companyId));assert.match(path,new RegExp('owner_id=eq.'+owner));assert.match(path,/event_type=eq.reply_received/);
    return ++reads>1?[{id,metadata:body}]:[];
  }});assert.equal(result.item.id,id);
  await handleCrm({...base,action:'crm-reply-summary',call:async(path,opts)=>{assert.equal(opts.token,'jwt');if(path.includes('crm_companies'))return [{id:companyId}];assert.match(path,/order=metadata->>received_at.desc,id&limit=1/);return [];}});
});
