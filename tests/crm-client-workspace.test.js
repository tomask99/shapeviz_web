import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
import {clientCompanyInput} from '../src/crm/clients.js';
const owner='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
function fixture({archived=false,client=true,conflict=false}={}){
 const calls=[];
 const call=async(path,options)=>{
  calls.push({path,options});assert.equal(options.token,'user-jwt');
  if(path.includes('crm_companies'))return [{id:companyId,company_name:'Furniture',website:'https://furniture.example',industry:'Furniture',short_description:'Makes chairs.',archived_at:archived?'2026-09-30':null}];
  if(path.includes('crm_client_list'))return {items:[{company_id:companyId}],total:1};
  if(path.includes('/crm_clients?'))return client?[{company_id:companyId}]:[];
  return conflict?[]:[{id,...options.body}];
 };
 const run=(action,body={},params={})=>handleCrm({action,user:{id:owner},token:'user-jwt',call,body:{companyId,...body},url:new URL('https://example.test/?'+new URLSearchParams({companyId,...params}))});
 return {calls,run};
}
test('Client cards receive company description and website in one owner-scoped batch',async()=>{
 const {run,calls}=fixture();const result=await run('crm-clients');assert.equal(result.items[0].industry,'Furniture');assert.equal(result.items[0].website,'https://furniture.example');assert.equal(result.items[0].short_description,'Makes chairs.');assert.equal(calls.length,2);assert.match(calls[1].path,new RegExp('owner_id=eq.'+owner));
});
test('Client detail returns the company summary without research dependencies',async()=>{
 const {run,calls}=fixture();const result=await run('crm-client');assert.equal(result.company.company_name,'Furniture');assert.equal(calls.length,2);
});
test('Task creation enforces client ownership and ignores supplied owner or timestamps',async()=>{
 const {run,calls}=fixture();await run('crm-client-task-save',{title:'Prepare renders',owner_id:id,created_at:'spoof'});
 assert.deepEqual(calls.at(-1).options.body,{title:'Prepare renders',company_id:companyId,owner_id:owner});
 await assert.rejects(fixture({client:false}).run('crm-client-task-save',{title:'Test'}),{status:409});
 await assert.rejects(fixture({archived:true}).run('crm-client-task-save',{title:'Test'}),{status:409});
 for(const body of [{title:''},{title:' '.repeat(3)},{title:'x'.repeat(161)},{title:'x',completed:'yes'},{id,version:0,title:'x'},{id,version:1},{id:'bad',title:'x'}])await assert.rejects(run('crm-client-task-save',body),{status:400});
});
test('Tasks toggle in both directions with optimistic version checks and scoped deletion',async()=>{
 const {run,calls}=fixture();
 for(const completed of [true,false]){await run('crm-client-task-save',{id,version:4,completed});const last=calls.at(-1);assert.equal(last.options.method,'PATCH');assert.deepEqual(last.options.body,{completed});for(const scope of [`id=eq.${id}`,`company_id=eq.${companyId}`,`owner_id=eq.${owner}`,'version=eq.4'])assert.ok(last.path.includes(scope));}
 await assert.rejects(fixture({conflict:true}).run('crm-client-task-save',{id,version:1,completed:true}),{status:409});
 await assert.rejects(run('crm-client-task-delete',{id,version:1}),{status:400});
 await run('crm-client-task-delete',{id,version:4,confirm:'delete'});assert.equal(calls.at(-1).options.method,'DELETE');
 await assert.rejects(fixture({archived:true}).run('crm-client-task-delete',{id,version:1,confirm:'delete'}),{status:409});
});
test('Task reads are paginated, require a client and allow archived company history',async()=>{
 const {run,calls}=fixture({archived:true});await run('crm-client-tasks',{}, {page:2});assert.match(calls.at(-1).path,/limit=51&offset=50/);
 await assert.rejects(run('crm-client-tasks',{}, {page:-1}),{status:400});await assert.rejects(fixture({client:false}).run('crm-client-tasks'),{status:404});
});
test('Compact client input validates only company identity and description',()=>{
 assert.deepEqual(clientCompanyInput({company_name:' Studio ',website:'studio.example',industry:'Design',short_description:'A small studio.',pipeline_status:'LOST',services:['Other'],owner_id:id}),{company_name:'Studio',website:'https://studio.example/',industry:'Design',short_description:'A small studio.'});
 for(const values of [{company_name:''},{company_name:'x'.repeat(161)},{website:'javascript:alert(1)'},{website:'https://user:password@example.com'},{industry:'x'.repeat(121)},{short_description:'x'.repeat(3001)}])assert.throws(()=>clientCompanyInput({company_name:'Studio',...values}),{status:400});
});
test('Manual client creation is one atomic RPC, needs no company or pipeline transition and keeps retry identity',async()=>{
 const {run,calls}=fixture();await run('crm-client-create',{requestId:id,company_name:'Studio',website:'studio.example',owner_id:companyId,pipeline_status:'LOST'});
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/rest/v1/rpc/crm_create_client');assert.equal(calls[0].options.body.p_request_id,id);
 assert.deepEqual(calls[0].options.body.p_data,{company_name:'Studio',website:'https://studio.example/',industry:'',short_description:''});
 await assert.rejects(run('crm-client-create',{company_name:'Studio'}),{status:400});
});
test('Client editing preserves sales fields and uses company version, owner and archive checks',async()=>{
 const {run,calls}=fixture();await run('crm-client-update',{version:3,company_name:'New name',website:'new.example',industry:'Design',short_description:'Updated.',pipeline_status:'LOST',account_notes:'overwrite'});
 const last=calls.at(-1);assert.equal(last.options.method,'PATCH');assert.deepEqual(last.options.body,{company_name:'New name',website:'https://new.example/',industry:'Design',short_description:'Updated.'});
 assert.match(last.path,new RegExp(`id=eq.${companyId}&owner_id=eq.${owner}&version=eq.3&archived_at=is.null`));
 await assert.rejects(run('crm-client-update',{version:0,company_name:'New name'}),{status:400});
 await assert.rejects(fixture({client:false}).run('crm-client-update',{version:1,company_name:'New name'}),{status:409});
 await assert.rejects(fixture({archived:true}).run('crm-client-update',{version:1,company_name:'New name'}),{status:409});
 const base={action:'crm-client-update',user:{id:owner},token:'user-jwt',body:{companyId,version:1,company_name:'New name'},url:new URL('https://example.test')};
 await assert.rejects(handleCrm({...base,call:async(path,options)=>options.method==='PATCH'?[]:[{id:companyId}]}),{status:409});
});
