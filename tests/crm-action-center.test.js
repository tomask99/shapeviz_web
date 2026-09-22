import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
import {actionCenterInput} from '../src/crm/action-center.js';
test('Action Center validates DST day bounds and bounded groups/pages, ignoring spoofed ownership/clock',async()=>{
 const p=new URLSearchParams({today:'2026-03-28T23:00:00.000Z',tomorrow:'2026-03-29T22:00:00.000Z',group:'overdue',page:'2',owner_id:'spoof',now:'1900-01-01'});
 const expected={p_today:p.get('today'),p_tomorrow:p.get('tomorrow'),p_group:'overdue',p_page:2};assert.deepEqual(actionCenterInput(p),expected);
 const calls=[];const context={action:'crm-action-center',body:{owner_id:'spoof'},user:{id:'11111111-1111-4111-8111-111111111111'},token:'user-jwt',url:new URL('https://example.test/?'+p),call:async(path,options)=>{calls.push({path,options});return {groups:[]};}};
 await handleCrm(context);assert.equal(calls.length,1);assert.equal(calls[0].path,'/rest/v1/rpc/crm_action_center');assert.equal(calls[0].options.token,'user-jwt');assert.deepEqual(calls[0].options.body,expected);
 await assert.rejects(()=>handleCrm({...context,token:null}),{status:401});
 for(const [k,v] of [['group','completed'],['page','0'],['page','10001'],['page','1.5'],['today','bad'],['tomorrow','2026-03-31T22:00:00.000Z']]){const bad=new URLSearchParams(p);bad.set(k,v);assert.throws(()=>actionCenterInput(bad),{status:400});}
});
