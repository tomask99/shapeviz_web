import test from 'node:test';
import assert from 'node:assert/strict';
import {recentActivityQuery,recentActivityPage} from '../src/crm/recent-activity.js';
import {handleCrm} from '../src/crm/handler.js';
const id='11111111-1111-4111-8111-111111111111',at='2026-09-22T12:00:00.123456+00:00';
test('Recent activity uses bounded owner and archived filters, preserving cursor precision',()=>{
 const q=new URL('https://example.test'+recentActivityQuery(new URLSearchParams({beforeAt:at,beforeId:id,owner_id:'spoof'}),id)).searchParams;
 assert.equal(q.get('owner_id'),'eq.'+id);assert.equal(q.get('limit'),'21');assert.equal(q.get('company.archived_at'),'is.null');assert.match(q.get('select'),/!inner/);assert.match(q.get('or'),/123456\+00:00/);assert.equal(q.get('order'),'created_at.desc,id.desc');assert.doesNotMatch(q.get('event_type'),/lead_created|note_added|heartbeat/);
 for(const p of [{beforeAt:at},{beforeId:id},{beforeAt:'2026-02-30T12:00:00Z',beforeId:id},{beforeAt:'bad),id.gt.0',beforeId:id},{beforeAt:at,beforeId:'bad'}])assert.throws(()=>recentActivityQuery(new URLSearchParams(p),id),{status:400});
});
test('Recent activity page returns minimal bounded data and next cursor',()=>{
 const row={id,company_id:id,created_at:at,company:{company_name:'Example'},event_type:'status_changed',metadata:{from_status:'NEW',to_status:'WON',secret:'hidden'},owner_id:id};
 const page=recentActivityPage(Array(21).fill(row));assert.equal(page.items.length,20);assert.deepEqual(page.next,{beforeAt:at,beforeId:id});assert.equal(page.items[0].detail,'NEW → WON');assert.equal(page.items[0].metadata,undefined);assert.equal(page.items[0].owner_id,undefined);assert.equal(recentActivityPage([row]).next,null);assert.deepEqual(recentActivityPage([]),{items:[],next:null});assert.equal(recentActivityPage([{...row,event_type:'manual_activity',metadata:{content:'a'.repeat(900)}}]).items[0].detail.length,300);
});
test('Recent activity forwards user JWT and rejects unauthenticated calls',async()=>{
 const context={action:'crm-recent-activity',body:{},user:{id},token:'user-jwt',url:new URL('https://example.test'),call:async(path,options)=>{assert.equal(options.token,'user-jwt');assert.match(path,/crm_activities/);return [];}};
 assert.deepEqual(await handleCrm(context),{items:[],next:null});await assert.rejects(()=>handleCrm({...context,token:null}),{status:401});
});
test('Completion and presentation names use existing history metadata',()=>{
 for(const event_type of ['followup_completed','presentation_sent','presentation_viewed'])assert.equal(recentActivityPage([{event_type,metadata:{name:'Stored name'}}]).items[0].detail,'Stored name');
});
