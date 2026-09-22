import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
test('business overview calls one invoker RPC with user JWT, validates local-day boundaries',async()=>{
  const calls=[];const base={action:'crm-overview',body:{owner_id:'spoof'},user:{id:'11111111-1111-4111-8111-111111111111'},token:'jwt',call:async(path,options)=>{calls.push({path,options});return {total_leads:0};}};
  const url=new URL('https://example.test/?today=2026-03-28T23:00:00.000Z&tomorrow=2026-03-29T22:00:00.000Z');
  assert.equal((await handleCrm({...base,url})).total_leads,0);assert.equal(calls.length,1);assert.equal(calls[0].options.token,'jwt');assert.equal(calls[0].path,'/rest/v1/rpc/crm_business_overview');assert.deepEqual(calls[0].options.body,{p_today:'2026-03-28T23:00:00.000Z',p_tomorrow:'2026-03-29T22:00:00.000Z'});
  for(const query of ['','today=bad&tomorrow=bad','today=2026-03-28T23:00:00.000Z&tomorrow=2026-03-30T22:00:00.000Z'])await assert.rejects(()=>handleCrm({...base,url:new URL('https://example.test/?'+query)}),{status:400});
});
