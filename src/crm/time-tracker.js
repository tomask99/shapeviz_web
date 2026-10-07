import {fail,uuid,string,choice} from './validation.js';
import {durationSeconds,durationParts} from '../../public/admin/time-values.js';
export const timeReads=['crm-time-open','crm-time-options','crm-time-history','crm-time-detail','crm-time-summary','crm-project-time'];
export const timeActions=[...timeReads,'crm-time-start','crm-time-pause','crm-time-resume','crm-time-finish','crm-time-manual-save','crm-time-manual-delete','crm-time-delete'];
function id(value,label,optional=false){if(optional&&!value)return null;if(!uuid(value))throw fail(400,`Invalid ${label}.`);return value;}
function date(value,optional=false){if(optional&&!value)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail(400,'Invalid work date.');return value;}
export async function handleTime({action,body,url,request}){
 const input=timeReads.includes(action)?Object.fromEntries(url.searchParams):body;
 const rpc=(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:args});
 if(action==='crm-time-open')return rpc('crm_time_open');
 if(action==='crm-time-options'){
  const page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
  return rpc('crm_time_options',{p_page:page,p_company:id(input.companyId,'client',true)});
 }
 if(action==='crm-time-detail')return rpc('crm_time_detail',{p_id:id(input.id,'session')});
 if(action==='crm-project-time')return rpc('crm_project_time',{p_project:id(input.projectId,'project'),p_company:id(input.companyId,'client')});
 if(action==='crm-time-summary'){
  let zone=string(input.timeZone||'Europe/Bratislava',100,'time zone');try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw fail(400,'Invalid time zone.');}
  return rpc('crm_time_summary',{p_zone:zone});
 }
 if(action==='crm-time-history'){
  const page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
  const from=date(input.from,true),to=date(input.to,true);if(from&&to&&from>to)throw fail(400,'End date precedes start date.');
  const zone=string(input.timeZone||'Europe/Bratislava',100,'time zone');try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw fail(400,'Invalid time zone.');}
  return rpc('crm_time_history',{p_from:from,p_to:to,p_company:id(input.companyId,'client',true),p_project:id(input.projectId,'project',true),p_kind:choice(input.kind||'',['','project','custom_activity'],'type'),p_page:page,p_zone:zone});
 }
 const requestId=id(input.requestId,'request');
 if(action==='crm-time-delete'){
  if(input.confirm!=='delete')throw fail(400,'Confirm entry deletion.');
  if(!Number.isSafeInteger(input.version)||input.version<1)throw fail(400,'Refresh the entry before deleting.');
  return rpc('crm_time_command',{p_action:'entry_delete',p_request:requestId,p_data:{id:id(input.id,'entry'),version:input.version,source:choice(input.source,['Tracked','Manual'],'entry type'),confirm:'delete'}});
 }
 if(action==='crm-time-start'){
  const kind=choice(input.kind,['project','custom_activity'],'type'),name=string(input.activity_name,160,'activity name');
  if(kind==='custom_activity'&&!name)throw fail(400,'Enter an activity name.');
  return rpc('crm_time_command',{p_action:'start',p_request:requestId,p_data:{kind,company_id:kind==='project'?id(input.companyId,'client'):null,project_id:kind==='project'?id(input.projectId,'project'):null,activity_name:name,description:string(input.description,5000,'description')}});
 }
 if(action.startsWith('crm-time-manual-')){
  const deleting=action==='crm-time-manual-delete',recordId=id(input.id,'entry',!deleting);
  if(recordId&&(!Number.isSafeInteger(input.version)||input.version<1))throw fail(400,'Reload the entry before saving.');
  if(deleting&&input.confirm!=='delete')throw fail(400,'Confirm entry deletion.');
  let seconds;const clock={};if(!deleting){
   try{seconds=Object.hasOwn(input,'minutes')?durationParts(input.hours,input.minutes,input.seconds??0):durationSeconds(input.hours);}catch(e){throw fail(400,e.message);}
   if(Object.hasOwn(input,'work_time')){
    if(input.work_time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.work_time))throw fail(400,'Enter a start time in HH:MM format.');
    clock.work_time=input.work_time||null;clock.time_zone=null;
    if(clock.work_time){clock.time_zone=string(input.timeZone,100,'time zone');try{new Intl.DateTimeFormat('en',{timeZone:clock.time_zone}).format();}catch{throw fail(400,'Invalid time zone.');}}
   }
  }
  return rpc('crm_time_command',{p_action:deleting?'manual_delete':'manual_save',p_request:requestId,p_data:{id:recordId,version:input.version,company_id:id(input.companyId,'client'),project_id:id(input.projectId,'project'),...(deleting?{}:{work_date:date(input.work_date),duration_seconds:seconds,description:string(input.description,5000,'description'),...clock})}});
 }
 if(!Number.isSafeInteger(input.version)||input.version<1)throw fail(400,'Synchronize the timer before changing it.');
 return rpc('crm_time_command',{p_action:action.replace('crm-time-',''),p_request:requestId,p_data:{id:id(input.id,'session'),version:input.version}});
}
