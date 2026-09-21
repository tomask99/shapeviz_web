import test from 'node:test';
import assert from 'node:assert/strict';
import {retryUpload,retryDelay} from '../public/admin/upload-retry.js';

test('temporary errors back off, respect Retry-After and stop after four attempts',async()=>{
 const waits=[],notices=[];let calls=0;
 await assert.rejects(retryUpload(async()=>{calls++;throw Object.assign(new Error('busy'),{status:429,retryAfter:'3'});},m=>notices.push(m),'Upload',{sleep:async ms=>waits.push(ms),random:()=>0}),/busy/);
 assert.equal(calls,4);assert.deepEqual(waits,[3000,4000,8000]);assert.equal(notices.length,3);
});
test('network failure can recover; permanent failures are not retried',async()=>{
 let calls=0;
 assert.equal(await retryUpload(async()=>{if(++calls===1)throw new TypeError('offline');return 'ok';},()=>{},'Upload',{sleep:async()=>{}}),'ok');
 for(const status of [400,401,403,409,413]) {
  calls=0;await assert.rejects(retryUpload(async()=>{calls++;throw Object.assign(new Error('permanent'),{status});},()=>{},'Upload'),/permanent/);assert.equal(calls,1);
 }
});
test('Retry-After date parsing and long server delays do not cause early retries',async()=>{
 assert.equal(retryDelay('Wed, 21 Oct 2015 07:28:00 GMT',Date.parse('Wed, 21 Oct 2015 07:27:50 GMT')),10000);
 assert.equal(retryDelay('invalid'),0);
 let calls=0;await assert.rejects(retryUpload(async()=>{calls++;throw Object.assign(new Error('busy'),{status:429,retryAfter:'120'});},()=>{},'Upload'),/busy/);assert.equal(calls,1);
});
