import test from 'node:test';
import assert from 'node:assert/strict';
import {opportunityValueInput,opportunityValueText} from '../public/admin/crm-value.js';
import {companyInput,handleCrm} from '../src/crm/handler.js';
const company={company_name:'Fixture',services:[],priority:'MEDIUM',lead_source:'Other',pipeline_status:'NEW_LEAD'};
test('opportunity amounts preserve decimals, accept comma, distinguish unknown and zero',()=>{
  assert.deepEqual(opportunityValueInput({}),{});
  for(const raw of ['',null])assert.deepEqual(opportunityValueInput({estimated_value:raw,value_type:'MONTHLY'}),{estimated_value:null,value_type:'UNKNOWN'});
  for(const [raw,expected] of [['1500,25','1500.25'],[0,'0.00'],['999999999.99','999999999.99'],['00003.1','3.10']])
    assert.equal(opportunityValueInput({estimated_value:raw,value_type:'ONE_TIME'}).estimated_value,expected);
  for(const raw of ['-1','1.001','1e3','1 000','Infinity','NaN',true,{},[],1000000000,' '])
    assert.throws(()=>companyInput({...company,estimated_value:raw,value_type:'MONTHLY'}),{status:400});
  assert.throws(()=>companyInput({...company,estimated_value:10,value_type:'WEEKLY'}),{status:400});
  assert.throws(()=>companyInput({...company,value_type:'MONTHLY'}),{status:400});
  assert.equal(opportunityValueText({estimated_value:null}),'Not specified');
  assert.match(opportunityValueText({estimated_value:0,value_type:'MONTHLY'}),/0.*\/ month/);
  assert.match(opportunityValueText({estimated_value:12,value_type:'UNKNOWN'}),/frequency unspecified/);
});
test('opportunity edits retain owner/JWT/version checks and omitted legacy values remain untouched',async()=>{
  const id='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111';let sent;
  const base={action:'crm-update',user:{id:owner},token:'jwt',url:new URL('https://example.test'),call:async(path,options)=>{sent={path,options};return [{id}];}};
  await handleCrm({...base,body:{...company,id,version:3,estimated_value:'1500,25',value_type:'MONTHLY',owner_id:'spoof'}});
  assert.match(sent.path,/version=eq.3/);assert.ok(sent.path.includes(owner));assert.equal(sent.options.token,'jwt');assert.equal(sent.options.body.estimated_value,'1500.25');assert.ok(!('owner_id' in sent.options.body));
  await handleCrm({...base,body:{...company,id,version:4}});assert.ok(!('estimated_value' in sent.options.body));assert.ok(!('value_type' in sent.options.body));
});
