import {fail,uuid,string,choice} from './validation.js';
import {opportunityValueInput} from '../../public/admin/crm-value.js';
import {SERVICES} from '../../public/admin/crm-options.js';
export const clientActions=['crm-clients','crm-client','crm-client-convert','crm-client-save','crm-projects','crm-project-save'];
export function projectInput(body){
 const name=string(body.name,160,'project name');if(!name)throw fail(400,'Enter a project name.');const result={name,status:choice(body.status,['PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'],'project status'),service_type:choice(body.service_type||'',['',...SERVICES],'service'),description:string(body.description,5000,'description'),notes:string(body.notes,5000,'notes')};
 for(const key of ['start_date','end_date']){const v=string(body[key],10,'date');if(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1900-01-01'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw fail(400,'Invalid project date.');result[key]=v||null;}
 if(result.start_date&&result.end_date&&result.end_date<result.start_date)throw fail(400,'End date precedes start date.');
 for(const key of ['project_value','monthly_value'])try{result[key]=opportunityValueInput({estimated_value:body[key],value_type:'ONE_TIME'}).estimated_value;}catch(e){throw fail(400,e.message);}return result;
}
export async function handleClients({action,body,url,user,request,owner}){
 const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
 if(action==='crm-clients')return request('/rest/v1/rpc/crm_client_list',{method:'POST',body:{p_q:string(url.searchParams.get('q'),160,'search'),p_active:choice(url.searchParams.get('active')||'',['','yes','no'],'active'),p_page:page}});
 const reading=['crm-client','crm-projects'].includes(action),companyId=reading?url.searchParams.get('companyId'):body.companyId;
 if(!uuid(companyId))throw fail(400,'Invalid company.');
 const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,pipeline_status,archived_at`);if(!companies[0])throw fail(404,'Company not found.');
 const scope=`company_id=eq.${companyId}&${owner}`,clients=await request(`/rest/v1/crm_clients?${scope}&select=*`);
 if(action==='crm-client')return {item:clients[0]||null};
 if(action==='crm-projects'){const rows=await request(`/rest/v1/crm_projects?${scope}&select=*&order=created_at.desc,id&limit=26&offset=${(page-1)*25}`);return {items:rows.slice(0,25),hasMore:rows.length>25};}
 if(companies[0].archived_at)throw fail(409,'Restore the company first.');
 if(action==='crm-client-convert'){if(clients[0])return {item:clients[0]};if(companies[0].pipeline_status!=='WON'||body.confirm!=='convert')throw fail(400,'Confirm conversion of a Won lead.');try{return {item:(await request('/rest/v1/crm_clients',{method:'POST',body:{company_id:companyId,owner_id:user.id},headers:{Prefer:'return=representation'}}))[0]};}catch(e){if(e.status===409){const rows=await request(`/rest/v1/crm_clients?${scope}&select=*`);if(rows[0])return {item:rows[0]};}throw e;}}
 if(!clients[0])throw fail(409,'Convert this company to a client first.');
 if(action==='crm-client-save'){if(typeof body.active!=='boolean'||!Number.isInteger(body.version))throw fail(400,'Invalid client.');const rows=await request(`/rest/v1/crm_clients?${scope}&version=eq.${body.version}`,{method:'PATCH',body:{active:body.active,account_notes:string(body.account_notes,5000,'account notes')},headers:{Prefer:'return=representation'}});if(!rows[0])throw fail(409,'Client changed. Refresh first.');return {item:rows[0]};}
 const id=body.id||null;if(id&&(!uuid(id)||!Number.isInteger(body.version)||body.version<1))throw fail(400,'Reload the project.');
 const rows=await request('/rest/v1/crm_projects'+(id?`?id=eq.${id}&${scope}&version=eq.${body.version}`:''),{method:id?'PATCH':'POST',body:{...projectInput(body),...(!id?{company_id:companyId,owner_id:user.id}:{})},headers:{Prefer:'return=representation'}});if(!rows[0])throw fail(409,'Project changed. Refresh first.');return {item:rows[0]};
}
