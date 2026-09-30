import {fail,uuid,string,choice,link} from './validation.js';
import {opportunityValueInput} from '../../public/admin/crm-value.js';
import {SERVICES} from '../../public/admin/crm-options.js';
export const clientActions=['crm-clients','crm-client','crm-client-create','crm-client-update','crm-client-convert','crm-client-save','crm-projects','crm-project-save','crm-client-tasks','crm-client-task-save','crm-client-task-delete'];
export function clientCompanyInput(body){
 const company_name=string(body.company_name,160,'company name');
 if(!company_name)throw fail(400,'Enter the company name.');
 let website=string(body.website,2048,'website');
 if(website&&!/^[a-z][a-z0-9+.-]*:/i.test(website))website='https://'+website;
 return {company_name,website:link(website,'website'),industry:string(body.industry,120,'industry'),short_description:string(body.short_description,3000,'description')};
}
export function projectInput(body){
 const name=string(body.name,160,'project name');if(!name)throw fail(400,'Enter a project name.');const result={name,status:choice(body.status,['PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'],'project status'),service_type:choice(body.service_type||'',['',...SERVICES],'service'),description:string(body.description,5000,'description'),notes:string(body.notes,5000,'notes')};
 for(const key of ['start_date','end_date']){const v=string(body[key],10,'date');if(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1900-01-01'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw fail(400,'Invalid project date.');result[key]=v||null;}
 if(result.start_date&&result.end_date&&result.end_date<result.start_date)throw fail(400,'End date precedes start date.');
 for(const key of ['project_value','monthly_value'])try{result[key]=opportunityValueInput({estimated_value:body[key]??null,value_type:'ONE_TIME'}).estimated_value;}catch(e){throw fail(400,e.message);}
 if(Object.hasOwn(body,'billing_type')){
  const type=choice(body.billing_type,['ONE_TIME','MONTHLY','MIXED'],'billing type');
  let amount;try{amount=opportunityValueInput({estimated_value:body.amount,value_type:'ONE_TIME'}).estimated_value;}catch(e){throw fail(400,e.message);}
  if(amount==null)throw fail(400,'Enter the agreed price.');
  result.project_value=type==='MONTHLY'?null:amount;result.monthly_value=type==='MONTHLY'?amount:type==='MIXED'?result.monthly_value:null;
  if(type==='MIXED'&&result.monthly_value==null)throw fail(400,'Enter the monthly price.');
  for(const key of ['service_type','notes','start_date','end_date'])if(!Object.hasOwn(body,key))delete result[key];
 }
 return result;
}
export async function handleClients({action,body,url,user,request,owner}){
 const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
 if(action==='crm-client-create'){
  if(!uuid(body.requestId))throw fail(400,'Reopen the client form before saving.');
  return request('/rest/v1/rpc/crm_create_client',{method:'POST',body:{p_request_id:body.requestId,p_data:clientCompanyInput(body)}});
 }
 if(action==='crm-clients'){
  const data=await request('/rest/v1/rpc/crm_client_list',{method:'POST',body:{p_q:string(url.searchParams.get('q'),160,'search'),p_active:choice(url.searchParams.get('active')||'',['','yes','no'],'active'),p_page:page}});
  if(!data.items?.length)return data;
  const companies=await request(`/rest/v1/crm_companies?id=in.(${data.items.map(c=>c.company_id).join(',')})&${owner}&select=id,website,industry,short_description`);
  const byId=new Map(companies.map(c=>[c.id,c]));
  return {...data,items:data.items.map(c=>({...c,website:byId.get(c.company_id)?.website||'',industry:byId.get(c.company_id)?.industry||'',short_description:byId.get(c.company_id)?.short_description||''}))};
 }
 const reading=['crm-client','crm-projects','crm-client-tasks'].includes(action),companyId=reading?url.searchParams.get('companyId'):body.companyId;
 if(!uuid(companyId))throw fail(400,'Invalid company.');
 const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,company_name,website,industry,short_description,pipeline_status,archived_at,version`);if(!companies[0])throw fail(404,'Company not found.');
 const scope=`company_id=eq.${companyId}&${owner}`,clients=await request(`/rest/v1/crm_clients?${scope}&select=*`);
 if(action==='crm-client')return {item:clients[0]||null,company:companies[0]};
 if(action==='crm-client-tasks'){
  if(!clients[0])throw fail(404,'Client not found.');
  const rows=await request(`/rest/v1/crm_client_tasks?${scope}&select=*&order=completed,created_at.desc,id&limit=51&offset=${(page-1)*50}`);
  return {items:rows.slice(0,50),hasMore:rows.length>50};
 }
 if(action==='crm-projects'){const rows=await request(`/rest/v1/crm_projects?${scope}&select=id,company_id,name,status,service_type,description,start_date,end_date,project_value,monthly_value,notes,version,created_at,updated_at&order=created_at.desc,id&limit=26&offset=${(page-1)*25}`);return {items:rows.slice(0,25),hasMore:rows.length>25};}
 if(companies[0].archived_at)throw fail(409,'Restore the company first.');
 if(action==='crm-client-convert'){if(clients[0])return {item:clients[0]};if(companies[0].pipeline_status!=='WON'||body.confirm!=='convert')throw fail(400,'Confirm conversion of a Won lead.');try{return {item:(await request('/rest/v1/crm_clients',{method:'POST',body:{company_id:companyId,owner_id:user.id},headers:{Prefer:'return=representation'}}))[0]};}catch(e){if(e.status===409){const rows=await request(`/rest/v1/crm_clients?${scope}&select=*`);if(rows[0])return {item:rows[0]};}throw e;}}
 if(!clients[0])throw fail(409,'Convert this company to a client first.');
 if(action==='crm-client-update'){
  if(!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Reload the client before saving.');
  const rows=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&version=eq.${body.version}&archived_at=is.null`,{
   method:'PATCH',body:clientCompanyInput(body),headers:{Prefer:'return=representation'}
  });
  if(!rows[0])throw fail(409,'Client changed. Close this form and reload the page before editing again.');
  return {company:rows[0]};
 }
 if(action==='crm-client-task-save'||action==='crm-client-task-delete'){
  const id=body.id||null,deleting=action==='crm-client-task-delete';
  if((id&&!uuid(id))||(deleting&&!id))throw fail(400,'Invalid task.');
  if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw fail(400,'Reload the task before saving.');
  if(deleting&&body.confirm!=='delete')throw fail(400,'Confirm task deletion.');
  const values={};
  if(!deleting){
   if(!id||Object.hasOwn(body,'title')){values.title=string(body.title,160,'task title');if(!values.title)throw fail(400,'Enter a task title.');}
   if(Object.hasOwn(body,'completed')){if(typeof body.completed!=='boolean')throw fail(400,'Invalid task status.');values.completed=body.completed;}
   if(!Object.keys(values).length)throw fail(400,'No task changes.');
  }
  const rows=await request('/rest/v1/crm_client_tasks'+(id?`?id=eq.${id}&${scope}&version=eq.${body.version}`:''),{
   method:deleting?'DELETE':id?'PATCH':'POST',headers:{Prefer:'return=representation'},
   ...(!deleting?{body:{...values,...(!id?{company_id:companyId,owner_id:user.id}:{})}}:{})
  });
  if(!rows[0])throw fail(409,'Task changed. Refresh the tasks before trying again.');
  return deleting?{ok:true}:{item:rows[0]};
 }
 if(action==='crm-client-save'){if(typeof body.active!=='boolean'||!Number.isInteger(body.version))throw fail(400,'Invalid client.');const rows=await request(`/rest/v1/crm_clients?${scope}&version=eq.${body.version}`,{method:'PATCH',body:{active:body.active,account_notes:string(body.account_notes,5000,'account notes')},headers:{Prefer:'return=representation'}});if(!rows[0])throw fail(409,'Client changed. Refresh first.');return {item:rows[0]};}
 const id=body.id||null;if(id&&(!uuid(id)||!Number.isInteger(body.version)||body.version<1))throw fail(400,'Reload the project.');
 const retry=!id&&body.requestId;
 if(retry&&!uuid(retry))throw fail(400,'Reopen the project form.');
 const rows=await request('/rest/v1/crm_projects'+(id?`?id=eq.${id}&${scope}&version=eq.${body.version}`:retry?'?on_conflict=owner_id,company_id,creation_request_id':''),{method:id?'PATCH':'POST',body:{...projectInput(body),...(!id?{company_id:companyId,owner_id:user.id,...(retry?{creation_request_id:retry}:{})}:{})},headers:{Prefer:'return=representation'+(retry?',resolution=ignore-duplicates':'')}});
 if(!rows[0]&&retry){const existing=await request(`/rest/v1/crm_projects?${scope}&creation_request_id=eq.${retry}&select=*`);if(existing[0])return {item:existing[0]};}
 if(!rows[0])throw fail(409,'Project changed. Refresh first.');return {item:rows[0]};
}
