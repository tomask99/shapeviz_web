import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePresentation} from '../src/admin/prepare-presentation.js';
import {STATUSES} from '../public/admin/crm-options.js';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',operation='33333333-3333-4333-8333-333333333333';
function fixture(){
 const state={company:{id,company_name:'Nábytok <A & B>',version:3,archived_at:null},template:{deck_slug:'template',client:'Template',title:'Pitch',is_template:true,status:'draft',content:{}},saved:null,saves:0,finishes:0,fail:false,html:'<html><body><section class="slide"><h1 data-embed="client-name">Template</h1></section><script>window.setShapevizClientName=function(name){document.querySelector("h1").textContent=name}</script></body></html>'};
 const args={body:{companyId:id,operationId:operation,template:'template',version:3,client:'Attacker value'},user:{id:owner},token:'owner-jwt',
 call:async(path,options={})=>{
  if(path.includes('crm_companies?')){assert.equal(options.token,'owner-jwt');assert.match(path,new RegExp('owner_id=eq.'+owner));return state.company?[state.company]:[];}
  if(path.includes('presentation_projects?'))return state.saved?[state.saved]:[];
  assert.equal(path,'/rest/v1/rpc/crm_finish_prepared_presentation');assert.equal(options.token,'owner-jwt');assert.deepEqual(options.body,{p_company:id,p_deck:'pitch-'+operation,p_version:3});state.finishes++;if(state.fail)throw Object.assign(new Error('Try again'),{status:502});return {company:{...state.company,pipeline_status:'PRESENTATION_READY'}};
 },project:async()=>state.template,source:async()=>state.html,saveDeck:async(body,html,parent,scopes,content)=>{state.saves++;state.output=html;state.saved={...body,deck_slug:body.slug,parent_slug:parent,content};return {project:state.saved,url:'/p/'+body.slug};}};
 return {state,args};
}
test('prepare uses authoritative company name, template engine and retryable atomic CRM finish',async()=>{
 const {state,args}=fixture();state.fail=true;await assert.rejects(preparePresentation(args),{status:502});assert.equal(state.saves,1);assert.equal(state.saved.client,state.company.company_name);assert.equal(state.saved.publish,true);assert.match(state.output,/setShapevizClientName\("Nábytok \\u003cA \\u0026 B\\u003e"\)/);assert.ok(!state.output.includes('Attacker value'));
 state.fail=false;const result=await preparePresentation(args);assert.equal(state.saves,1);assert.equal(state.finishes,2);assert.equal(result.company.pipeline_status,'PRESENTATION_READY');
});
test('prepare rejects missing/archived/stale company, unavailable templates and unowned retry',async()=>{
 for(const mutate of [s=>s.company=null,s=>s.company.archived_at='2026-09-23',s=>s.company.version++,s=>s.template.is_template=false,s=>s.template.status='archived',s=>s.html='<html><body>No embed</body></html>',s=>s.saved={parent_slug:'template',content:{_prepareOwner:'another-owner'}}]){
  const {state,args}=fixture();mutate(state);await assert.rejects(preparePresentation(args));assert.equal(state.saves,0);assert.equal(state.finishes,0);
 }
 assert.ok(!STATUSES.includes('QUALIFIED'));assert.equal(STATUSES[1],'PRESENTATION_READY');
});
