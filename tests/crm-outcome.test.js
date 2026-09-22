import test from 'node:test';
import assert from 'node:assert/strict';
import {companyInput,handleCrm} from '../src/crm/handler.js';
import {LOST_REASONS} from '../public/admin/crm-outcome.js';
const company={company_name:'Fixture',services:[],priority:'MEDIUM',lead_source:'Other',pipeline_status:'LOST'};
test('loss reason is optional, constrained and omitted legacy fields stay untouched',()=>{
 assert.ok(!('lost_reason' in companyInput(company)));
 for(const reason of ['',...LOST_REASONS])assert.equal(companyInput({...company,lost_reason:reason}).lost_reason,reason);
 for(const reason of [null,12,{},'<script>','Unknown'])assert.throws(()=>companyInput({...company,lost_reason:reason}),{status:400});
});
test('pipeline moves never erase retained loss reason and edits use owner/version/JWT',async()=>{
 let sent;const id='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111';
 const base={user:{id:owner},token:'jwt',url:new URL('https://example.test'),call:async(path,options)=>{sent={path,options};return [{id}];}};
 await handleCrm({...base,action:'crm-status',body:{id,version:2,pipeline_status:'REPLIED',lost_reason:''}});
 assert.deepEqual(sent.options.body,{pipeline_status:'REPLIED'});
 await handleCrm({...base,action:'crm-update',body:{...company,id,version:3,lost_reason:'Budget'}});
 assert.match(sent.path,/version=eq.3/);assert.ok(sent.path.includes(owner));assert.equal(sent.options.token,'jwt');assert.equal(sent.options.body.lost_reason,'Budget');
});
