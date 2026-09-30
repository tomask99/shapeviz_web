import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrmReadCache} from '../public/admin/crm-read-cache.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('navigation reads share requests, return independent objects and expire',async()=>{
 let calls=0,time=0;const d=deferred(),api=createCrmReadCache(()=>{calls++;return d.promise;},{now:()=>time});
 const a=api('crm-list',null,{q:'x',page:1}),b=api('crm-list',null,{page:1,q:'x'});d.resolve({companies:[{name:'Original'}]});
 const first=await a;first.companies[0].name='Changed';assert.equal((await b).companies[0].name,'Original');assert.equal(calls,1);
 await api('crm-list',null,{q:'x',page:1});assert.equal(calls,1);time=30001;await api('crm-list',null,{q:'x',page:1});assert.equal(calls,2);
});
test('writes invalidate before and after completion; an old request cannot refill cache',async()=>{
 const read=deferred(),write=deferred();let calls=0;
 const api=createCrmReadCache((action,body)=>{if(body)return write.promise;calls++;return calls===1?read.promise:{version:calls};});
 const old=api('crm-pipeline');await Promise.resolve();const mutation=api('crm-status',{});
 assert.equal((await api('crm-pipeline')).version,2);write.resolve({});await mutation;
 read.resolve({version:1});await old;
 assert.equal((await api('crm-pipeline')).version,3);assert.equal((await api('crm-pipeline')).version,3);
 api.invalidate();assert.equal((await api('crm-pipeline')).version,4);
});
test('errors are not cached, keys separate filters, unlisted/auth reads always go to server',async()=>{
 let calls=0;const api=createCrmReadCache(()=>{if(++calls===1)throw Error('offline');return {calls};});
 await assert.rejects(api('crm-list'),/offline/);await api('crm-list');await api('crm-list',null,{q:'other'});await api('me');await api('me');assert.equal(calls,5);
});
test('failed writes also invalidate and storage is bounded',async()=>{
 let calls=0;const api=createCrmReadCache((action,body)=>{if(body)throw Error('uncertain');return {calls:++calls};},{maxEntries:2});
 await api('crm-list',null,{q:'a'});await api('crm-list',null,{q:'b'});await api('crm-list',null,{q:'c'});await api('crm-list',null,{q:'a'});assert.equal(calls,4);
 await assert.rejects(api('crm-update',{}));await api('crm-list',null,{q:'a'});assert.equal(calls,5);
});

test('presentation and website statistics reuse only matching reads; explicit refresh and mutations reload',async()=>{
 let calls=0;const api=createCrmReadCache(()=>({count:++calls}));
 for(const action of ['list','stats','website-stats']){
  const first=await api(action,null,{days:30});
  assert.deepEqual(await api(action,null,{days:30}),first);
 }
 assert.equal(calls,3);
 await api('stats',null,{days:7});await api('stats',null,{days:30,slug:'other'});assert.equal(calls,5);
 api.invalidate();await api('stats',null,{days:30});assert.equal(calls,6);
 await api('update',{slug:'test'});await api('list',null,{days:30});assert.equal(calls,8);
 // Portal capabilities and login checks must never become cached reads.
 await api('client-files');await api('client-files');await api('me');await api('me');assert.equal(calls,12);
});
