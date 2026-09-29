import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
const ownerId='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',candidateId='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
const base={user:{id:ownerId},token:'owner-jwt',body:{},url:new URL('https://example.test')};
test('research notes save with owner identity and approved candidates use company notes',async()=>{
 for(const approved of [null,companyId]){
  const calls=[];
  await handleCrm({...base,action:'crm-note-save',body:{candidateId,content:' My note ',owner_id:'spoofed'},call:async(path,opts)=>{calls.push({path,opts});return path.includes('crm_research_candidates?')?[{id:candidateId,approved_company_id:approved}]:[{id}];}});
  assert.match(calls[0].path,new RegExp('owner_id=eq.'+ownerId));assert.equal(calls[1].opts.token,'owner-jwt');
  assert.equal(calls[1].path,approved?'/rest/v1/crm_notes':'/rest/v1/crm_research_notes');
  assert.deepEqual(calls[1].opts.body,{content:'My note',owner_id:ownerId,...(approved?{company_id:companyId}:{candidate_id:candidateId})});
 }
});
test('company can edit an attached research note only after scoped version lookup',async()=>{
 const calls=[];
 await handleCrm({...base,action:'crm-note-save',body:{companyId,id,version:2,content:'Updated'},call:async(path,opts)=>{calls.push({path,opts});return path.includes('crm_companies?')?[{id:companyId}]:path.includes('crm_all_notes?')?[{id,candidate_id:candidateId}]:[{id}];}});
 assert.match(calls[1].path,new RegExp('company_id=eq.'+companyId));assert.match(calls[1].path,/version=eq.2/);
 assert.match(calls[2].path,new RegExp('crm_research_notes.*candidate_id=eq.'+candidateId));assert.deepEqual(calls[2].opts.body,{content:'Updated'});
 await assert.rejects(()=>handleCrm({...base,action:'crm-note-save',body:{companyId,id,version:2,content:'No'},call:async path=>path.includes('crm_companies?')?[{id:companyId}]:[]}),{status:409});
});
test('note targets and batch sizes are validated before database access',async()=>{
 const call=async()=>{throw new Error('Unexpected database request');};
 for(const body of [{companyId,candidateId,content:'x'},{candidateId:'bad',content:'x'},{}])await assert.rejects(()=>handleCrm({...base,action:'crm-note-save',body,call}),{status:400});
 for(const ids of ['invalid',Array(201).fill(companyId).join(',')])await assert.rejects(()=>handleCrm({...base,action:'crm-note-summaries',url:new URL('https://example.test/?companyIds='+ids),call}),{status:400});
 await assert.rejects(()=>handleCrm({...base,action:'crm-notes',url:new URL('https://example.test/?candidateId='+candidateId),call:async()=>[]}),{status:404});
});
