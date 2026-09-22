import test from 'node:test';import assert from 'node:assert/strict';
import {companyInput,handleCrm} from '../src/crm/handler.js';
const c={company_name:'A',services:[],priority:'MEDIUM',lead_source:'Other',pipeline_status:'WON'};
test('won fields validate exact money, dates, service and legacy omissions',()=>{
 const result=companyInput({...c,won_date:'2026-09-22',won_project_value:'3000,25',won_monthly_value:'0',won_service:'Web',won_notes:' Agreed '});
 assert.equal(result.won_project_value,'3000.25');assert.equal(result.won_monthly_value,'0.00');assert.equal(result.won_notes,'Agreed');assert.ok(!('won_date' in companyInput(c)));
 for(const fields of [{won_date:'2026-02-30'},{won_project_value:'-1'},{won_monthly_value:'1.001'},{won_service:'bogus'},{logo_url:'javascript:alert(1)'}])assert.throws(()=>companyInput({...c,...fields}),{status:400});
});
test('first contact creation uses one JWT RPC and rejects unnamed contacts before writing',async()=>{
 let called=0;const base={action:'crm-create',user:{id:'11111111-1111-4111-8111-111111111111'},token:'jwt',url:new URL('https://example.test'),call:async(path,options)=>{called++;assert.match(path,/crm_create_company_contact/);assert.equal(options.token,'jwt');assert.equal(options.body.p_contact.primary_contact,true);return {id:'saved'};}};
 await assert.rejects(()=>handleCrm({...base,body:{...c,initial_contact:{email:'x@y.test'}}}),{status:400});assert.equal(called,0);
 assert.equal((await handleCrm({...base,body:{...c,initial_contact:{full_name:'Person',email:'x@y.test'}}})).company.id,'saved');assert.equal(called,1);
});
