import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';

test('retired dashboard features have no API route or database call',async()=>{
 let calls=0;
 for(const action of ['crm-action-center','crm-suggestions','crm-suggestion-state']){
  await assert.rejects(()=>handleCrm({action,body:{},url:new URL('https://example.test/'),user:{id:'11111111-1111-4111-8111-111111111111'},token:'owner-jwt',call:async()=>{calls++;}}),{status:404});
 }
 assert.equal(calls,0);
});
