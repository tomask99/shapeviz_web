import test from 'node:test';
import assert from 'node:assert/strict';
import {contactInput} from '../src/crm/relations.js';
import {handleCrm} from '../src/crm/handler.js';
const user={id:'11111111-1111-4111-8111-111111111111'};
const companyId='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const contact={full_name:'Jane',email:'jane@example.com',primary_contact:true};
const base={user,token:'user-jwt',url:new URL('https://example.test/?companyId='+companyId)};

test('contact validation rejects empty names, bad URLs, emails and non-boolean primary flags',()=>{
  assert.equal(contactInput(contact).full_name,'Jane');
  for(const fields of [{full_name:''},{email:'bad'},{linkedin:'javascript:alert(1)'},{primary_contact:'true'},{notes:'x'.repeat(3001)}])assert.throws(()=>contactInput({...contact,...fields}),{status:400});
});
test('contact save checks company ownership and passes only validated values to transactional RPC',async()=>{
  const calls=[];
  const result=await handleCrm({...base,action:'crm-contact-save',body:{...contact,companyId,owner_id:'attacker',id,version:2},call:async(path,opts)=>{calls.push({path,opts});return path.includes('crm_companies?')?[{id:companyId}]:{id};}});
  assert.equal(result.item.id,id);assert.match(calls[0].path,new RegExp('owner_id=eq.'+user.id));
  assert.equal(calls[1].opts.token,'user-jwt');assert.equal(calls[1].opts.body.p_company_id,companyId);assert.equal(calls[1].opts.body.p_version,2);
  assert.ok(!('owner_id' in calls[1].opts.body.p_data));
  await assert.rejects(()=>handleCrm({...base,action:'crm-contact-save',body:{...contact,companyId},call:async()=>[]}),{status:404});
});
test('relation lists are bounded, owner/company scoped, and stale edits and deletes conflict',async()=>{
  let last;
  const call=async(path,opts)=>{last={path,opts};return path.includes('crm_companies?')?[{id:companyId}]:[];};
  const result=await handleCrm({...base,action:'crm-notes',body:{},call});
  assert.deepEqual(result,{items:[],hasMore:false,page:1});assert.match(last.path,/limit=31&offset=0/);assert.match(last.path,new RegExp('company_id=eq.'+companyId));
  for(const action of ['crm-note-save','crm-note-delete','crm-contact-delete']) {
    await assert.rejects(()=>handleCrm({...base,action,body:{companyId,id,version:4,content:'Updated',confirm:'delete'},call}),{status:409});
    assert.match(last.path,/version=eq.4/);
  }
  await assert.rejects(()=>handleCrm({...base,action:'crm-contact-save',body:{...contact,companyId,id,version:4},call:async path=>path.includes('crm_companies?')?[{id:companyId}]:null}),{status:409});
});
test('notes and manual activity reject blank content, spoofing, missing confirmation and missing auth',async()=>{
  let last;
  const call=async(path,opts)=>{last={path,opts};return path.includes('crm_companies?')?[{id:companyId}]:[{id}];};
  await handleCrm({...base,action:'crm-activity-add',body:{companyId,content:'Called the team.',event_type:'lead_won',owner_id:'attacker'},call});
  assert.equal(last.opts.body.event_type,'manual_activity');assert.equal(last.opts.body.owner_id,user.id);assert.deepEqual(last.opts.body.metadata,{content:'Called the team.'});
  await assert.rejects(()=>handleCrm({...base,action:'crm-note-save',body:{companyId,content:' '},call}),{status:400});
  await assert.rejects(()=>handleCrm({...base,action:'crm-contact-delete',body:{companyId,id,version:1},call}),{status:400});
  await assert.rejects(()=>handleCrm({...base,token:null,action:'crm-notes',body:{},call}),{status:401});
});
