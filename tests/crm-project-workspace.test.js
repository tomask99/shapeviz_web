import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCrm} from '../src/crm/handler.js';
import {projectInput} from '../src/crm/clients.js';
import {projectRevenueMarkup} from '../public/admin/crm-project-revenue.js';
const owner='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',projectId='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
function fixture({archived=false,noProject=false,stale=false}={}){
 const calls=[];const call=async(path,options)=>{
  calls.push({path,options});assert.equal(options.token,'jwt');
  if(options.method==='PATCH'||options.method==='DELETE')return stale?[]:[{id,version:2,...options.body}];
  if(path.startsWith('/rest/v1/crm_companies'))return [{id:companyId,archived_at:archived?'2026-09-30':null}];
  if(path.startsWith('/rest/v1/crm_projects?')&&(!options.method||options.method==='GET'))return noProject?[]:[{id:projectId,company_id:companyId,version:1}];
  if(path.startsWith('/rest/v1/crm_clients'))return [{company_id:companyId}];
  return [{id,...options.body}];
 };
 return {calls,run:(action,body={},params={})=>handleCrm({action,body:{companyId,projectId,...body},url:new URL('https://example.test/?'+new URLSearchParams({companyId,projectId,...params})),user:{id:owner},token:'jwt',call})};
}
test('Project pricing keeps exact decimals and clears the other frequency on a change',()=>{
 const base={name:'Renders',status:'ACTIVE',description:'Summary',amount:'1200,25'};
 assert.deepEqual(projectInput({...base,billing_type:'ONE_TIME'}),{name:'Renders',status:'ACTIVE',description:'Summary',project_value:'1200.25',monthly_value:null});
 const monthly=projectInput({...base,billing_type:'MONTHLY',project_value:'999'});assert.equal(monthly.project_value,null);assert.equal(monthly.monthly_value,'1200.25');assert.ok(!Object.hasOwn(monthly,'notes'));assert.ok(!Object.hasOwn(monthly,'start_date'));
 assert.equal(projectInput({...base,billing_type:'MONTHLY',amount:'0'}).monthly_value,'0.00');
 for(const change of [{amount:''},{amount:'1.999'},{amount:'-2'},{billing_type:'YEARLY'},{status:'OTHER'}])assert.throws(()=>projectInput({...base,billing_type:'ONE_TIME',...change}),{status:400});
 const legacy=projectInput({...base,billing_type:'MIXED',monthly_value:'400'});assert.equal(legacy.project_value,'1200.25');assert.equal(legacy.monthly_value,'400.00');
});
test('Project detail and child records require a matching company and project, and paginated reads are owner scoped',async()=>{
 const {run,calls}=fixture();await run('crm-project-tasks',{}, {page:2});assert.match(calls.at(-1).path,/limit=51&offset=50/);
 for(const value of [`project_id=eq.${projectId}`,`company_id=eq.${companyId}`,`owner_id=eq.${owner}`])assert.ok(calls.at(-1).path.includes(value));
 await assert.rejects(fixture({noProject:true}).run('crm-project-notes'),{status:404});await assert.rejects(run('crm-project-tasks',{}, {page:0}),{status:400});await assert.rejects(run('crm-project',{}, {projectId:'invalid'}),{status:400});
});
test('Brief updates are bounded, versioned and cannot overwrite price or identity',async()=>{
 const {run,calls}=fixture();await run('crm-project-brief-save',{brief:'Full <assignment>\nSecond line',version:3,project_value:'1',owner_id:id});const write=calls.at(-1);
 assert.deepEqual(write.options.body,{brief:'Full <assignment>\nSecond line'});assert.match(write.path,/version=eq.3/);
 await assert.rejects(run('crm-project-brief-save',{brief:'x'.repeat(50001),version:1}),{status:400});await assert.rejects(fixture({stale:true}).run('crm-project-brief-save',{brief:'new',version:1}),{status:409});await assert.rejects(fixture({archived:true}).run('crm-project-brief-save',{brief:'new',version:1}),{status:409});
});
test('Project tasks and notes never write to the company records and reject stale or archived mutations',async()=>{
 const {run,calls}=fixture();await run('crm-project-task-save',{title:'Render chair',owner_id:id});assert.deepEqual(calls.at(-1).options.body,{title:'Render chair',project_id:projectId,company_id:companyId,owner_id:owner});
 await run('crm-project-task-save',{id,version:2,completed:false});assert.deepEqual(calls.at(-1).options.body,{completed:false});assert.match(calls.at(-1).path,/crm_project_tasks/);
 await run('crm-project-note-save',{content:'Meeting notes'});assert.match(calls.at(-1).path,/crm_project_notes/);
 await run('crm-project-note-delete',{id,version:2,confirm:'delete'});assert.equal(calls.at(-1).options.method,'DELETE');
 for(const action of ['crm-project-task-save','crm-project-note-save','crm-project-note-delete'])await assert.rejects(fixture({archived:true}).run(action,{id,version:1,title:'Task',content:'Note',confirm:'delete'}),{status:409});
 await assert.rejects(fixture({stale:true}).run('crm-project-task-save',{id,version:1,completed:true}),{status:409});await assert.rejects(run('crm-project-note-delete',{id,version:1}),{status:400});await assert.rejects(run('crm-project-note-save',{content:''}),{status:400});
});
test('New project creation uses a scoped conflict key for safe retries',async()=>{
 const {run,calls}=fixture();await run('crm-project-save',{name:'Project',status:'ACTIVE',billing_type:'MONTHLY',amount:'250',requestId:id});const write=calls.at(-1);assert.match(write.path,/on_conflict=owner_id,company_id,creation_request_id/);assert.match(write.options.headers.Prefer,/resolution=ignore-duplicates/);assert.equal(write.options.body.creation_request_id,id);assert.equal(write.options.body.owner_id,owner);
});
test('Card status actions change only status, scope the owner and require the current version',async()=>{
 const {run,calls}=fixture();
 for(const status of ['ON_HOLD','COMPLETED','ACTIVE']){
  await run('crm-project-status',{status,version:4,project_value:'0',brief:'Overwrite',owner_id:id});
  const write=calls.at(-1);assert.equal(write.options.method,'PATCH');assert.deepEqual(write.options.body,{status});
  for(const part of [`id=eq.${projectId}`,`company_id=eq.${companyId}`,`owner_id=eq.${owner}`,'version=eq.4'])assert.ok(write.path.includes(part));
 }
 for(const body of [{status:'BAD',version:1},{status:'ON_HOLD'},{status:'ON_HOLD',version:0}])await assert.rejects(run('crm-project-status',body),{status:400});
 await assert.rejects(fixture({stale:true}).run('crm-project-status',{status:'ON_HOLD',version:1}),{status:409});
 await assert.rejects(fixture({archived:true}).run('crm-project-status',{status:'COMPLETED',version:1}),{status:409});
 await assert.rejects(fixture({noProject:true}).run('crm-project-status',{status:'ACTIVE',version:1}),{status:404});
});
test('Deleting a project requires confirmation and version and issues one scoped atomic delete',async()=>{
 const {run,calls}=fixture();const result=await run('crm-project-delete',{version:5,confirm:'delete',owner_id:id});
 assert.deepEqual(result,{ok:true});const writes=calls.filter(c=>c.options.method==='DELETE');assert.equal(writes.length,1);
 assert.equal(writes[0].path,`/rest/v1/crm_projects?id=eq.${projectId}&company_id=eq.${companyId}&owner_id=eq.${owner}&version=eq.5`);assert.equal(writes[0].options.body,undefined);
 await assert.rejects(run('crm-project-delete',{version:5}),{status:400});await assert.rejects(run('crm-project-delete',{confirm:'delete'}),{status:400});
 for(const [options,status] of [[{stale:true},409],[{archived:true},409],[{noProject:true},404]])await assert.rejects(fixture(options).run('crm-project-delete',{version:5,confirm:'delete'}),{status});
});
test('Revenue markup separates agreements and monthly rates and rejects malformed totals',()=>{
 const data={currency:'EUR',one_time:{amount:'3000.25',count:2},monthly:{amount:'500.00',count:1}};
 const html=projectRevenueMarkup(data);assert.match(html,/data-revenue="one_time"/);assert.match(html,/Active monthly revenue/);assert.match(html,/not payment records/);
 for(const changed of [{...data,currency:'USD'},{...data,monthly:{amount:'<script>',count:1}},{...data,one_time:{amount:'-1',count:1}}])assert.match(projectRevenueMarkup(changed),/totals unavailable/);
});
