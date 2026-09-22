import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
const id='11111111-1111-4111-8111-111111111111';
test('Suggestion reads use JWT and bounded page; writes whitelist company/rule/action',async()=>{
 const calls=[],ctx={action:'crm-suggestions',body:{},url:new URL('https://example.test/?page=2&hidden=true&owner_id=spoof'),user:{id},token:'user-jwt',call:async(path,options)=>{calls.push({path,options});return {};}};
 await handleCrm(ctx);assert.equal(calls[0].options.token,'user-jwt');assert.deepEqual(calls[0].options.body,{p_page:2,p_hidden:true});
 await handleCrm({...ctx,action:'crm-suggestion-state',body:{companyId:id,rule:'HOT_LEAD_IDLE',action:'snooze',owner_id:'spoof',dismissed_until:'2099-01-01'}});
 assert.deepEqual(calls[1].options.body,{p_company:id,p_rule:'HOT_LEAD_IDLE',p_action:'snooze'});
 for(const query of ['page=0','page=10001','page=1.1','hidden=bogus'])await assert.rejects(()=>handleCrm({...ctx,url:new URL('https://example.test/?'+query)}),{status:400});
 for(const body of [{companyId:'bad',rule:'HOT_LEAD_IDLE',action:'snooze'},{companyId:id,rule:'bad',action:'snooze'},{companyId:id,rule:'HOT_LEAD_IDLE',action:'delete'}])await assert.rejects(()=>handleCrm({...ctx,action:'crm-suggestion-state',body}),{status:400});
 await assert.rejects(()=>handleCrm({...ctx,token:null}),{status:401});
});
