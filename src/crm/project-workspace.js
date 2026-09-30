import {fail,uuid,string,choice} from './validation.js';
export const projectWorkspaceReads=['crm-project','crm-project-tasks','crm-project-notes'];
export const projectWorkspaceActions=[...projectWorkspaceReads,'crm-project-status','crm-project-delete','crm-project-brief-save','crm-project-task-save','crm-project-task-delete','crm-project-note-save','crm-project-note-delete'];

export async function handleProjectWorkspace({action,body,url,user,request,owner}){
 const reading=projectWorkspaceReads.includes(action),input=reading?Object.fromEntries(url.searchParams):body;
 const {companyId,projectId}=input;
 if(!uuid(companyId)||!uuid(projectId))throw fail(400,'Invalid project.');
 const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,company_name,archived_at`);
 if(!companies[0])throw fail(404,'Company not found.');
 const scope=`company_id=eq.${companyId}&${owner}`;
 const projects=await request(`/rest/v1/crm_projects?id=eq.${projectId}&${scope}&select=${action==='crm-project'?'*':'id'}`);
 if(!projects[0])throw fail(404,'Project not found for this client.');
 if(action==='crm-project')return {item:projects[0],company:companies[0]};
 const task=action.includes('-task'),table=task?'crm_project_tasks':'crm_project_notes',recordScope=`project_id=eq.${projectId}&${scope}`;
 if(reading){
  const page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
  const rows=await request(`/rest/v1/${table}?${recordScope}&select=*&order=${task?'completed,':''}created_at.desc,id&limit=51&offset=${(page-1)*50}`);
  return {items:rows.slice(0,50),hasMore:rows.length>50};
 }
 if(companies[0].archived_at)throw fail(409,'Restore the company before editing this project.');
 if(action==='crm-project-status'||action==='crm-project-delete'){
  if(!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Refresh projects before trying again.');
  const deleting=action==='crm-project-delete';
  if(deleting&&body.confirm!=='delete')throw fail(400,'Confirm project deletion.');
  const rows=await request(`/rest/v1/crm_projects?id=eq.${projectId}&${scope}&version=eq.${body.version}`,{
   method:deleting?'DELETE':'PATCH',headers:{Prefer:'return=representation'},
   ...(!deleting?{body:{status:choice(body.status,['ACTIVE','ON_HOLD','COMPLETED'],'project status')}}:{})
  });
  if(!rows[0])throw fail(409,'Project changed. Refresh projects before trying again.');
  return deleting?{ok:true}:{item:rows[0]};
 }
 if(action==='crm-project-brief-save'){
  if(!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Reload the project before saving.');
  const rows=await request(`/rest/v1/crm_projects?id=eq.${projectId}&${scope}&version=eq.${body.version}`,{method:'PATCH',body:{brief:string(body.brief,50000,'project brief')},headers:{Prefer:'return=representation'}});
  if(!rows[0])throw fail(409,'Project changed. Reload it before saving the brief again.');return {item:rows[0]};
 }
 const deleting=action.endsWith('-delete'),id=body.id||null;
 if((id&&!uuid(id))||(deleting&&!id))throw fail(400,'Invalid record.');
 if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw fail(400,'Reload the record before saving.');
 if(deleting&&body.confirm!=='delete')throw fail(400,'Confirm deletion.');
 const values={};
 if(!deleting){
  if(task){
   if(!id||Object.hasOwn(body,'title')){values.title=string(body.title,160,'task title');if(!values.title)throw fail(400,'Enter a task title.');}
   if(Object.hasOwn(body,'completed')){if(typeof body.completed!=='boolean')throw fail(400,'Invalid task status.');values.completed=body.completed;}
   if(!Object.keys(values).length)throw fail(400,'No task changes.');
  }else{values.content=string(body.content,5000,'note');if(!values.content)throw fail(400,'Enter some text.');}
 }
 const rows=await request(`/rest/v1/${table}`+(id?`?id=eq.${id}&${recordScope}&version=eq.${body.version}`:''),{method:deleting?'DELETE':id?'PATCH':'POST',headers:{Prefer:'return=representation'},...(!deleting?{body:{...values,...(!id?{project_id:projectId,company_id:companyId,owner_id:user.id}:{})}}:{})});
 if(!rows[0])throw fail(409,'This record changed. Refresh before trying again.');return deleting?{ok:true}:{item:rows[0]};
}
