import {fail,uuid,string,link} from './validation.js';

export const relationActions=['crm-contacts','crm-notes','crm-activity','crm-contact-save','crm-contact-delete','crm-note-save','crm-note-delete','crm-activity-add'];
export function contactInput(body) {
  const full_name=string(body.full_name,160,'contact name');
  if(!full_name)throw fail(400,'Enter the contact name.');
  const email=string(body.email,254,'email');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter a valid email address.');
  if(typeof body.primary_contact!=='boolean')throw fail(400,'Invalid primary contact.');
  return {full_name,email,job_title:string(body.job_title,160,'position'),phone:string(body.phone,80,'phone'),
    linkedin:link(body.linkedin,'LinkedIn'),instagram:link(body.instagram,'Instagram'),
    notes:string(body.notes,3000,'contact notes'),primary_contact:body.primary_contact};
}
const content=value=>{const result=string(value,5000,'content');if(!result)throw fail(400,'Enter some text.');return result;};
export async function handleRelations({action,body,url,user,request,owner}) {
  const reading=['crm-contacts','crm-notes','crm-activity'].includes(action);
  const companyId=reading?url.searchParams.get('companyId'):body.companyId;
  if(!uuid(companyId))throw fail(400,'Invalid company.');
  const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id`);
  if(!companies[0])throw fail(404,'Company not found.');
  const scope=`company_id=eq.${companyId}&${owner}`;
  if(reading) {
    const page=Number(url.searchParams.get('page')||1);
    if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
    const table={'crm-contacts':'crm_contacts','crm-notes':'crm_notes','crm-activity':'crm_activities'}[action];
    const order=action==='crm-contacts'?'primary_contact.desc,created_at.desc,id':'created_at.desc,id';
    const rows=await request(`/rest/v1/${table}?${scope}&select=*&order=${order}&limit=31&offset=${(page-1)*30}`);
    return {items:rows.slice(0,30),hasMore:rows.length>30,page};
  }
  if(action==='crm-activity-add'){
    const rows=await request('/rest/v1/crm_activities',{method:'POST',body:{company_id:companyId,owner_id:user.id,event_type:'manual_activity',metadata:{content:content(body.content)}},headers:{Prefer:'return=representation'}});
    return {item:rows[0]};
  }
  const deleting=action.endsWith('-delete'),contact=action.startsWith('crm-contact-');
  const id=body.id||null;
  if((id&&!uuid(id))||(deleting&&!id))throw fail(400,'Invalid record.');
  if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw fail(400,'Reload the record before saving.');
  if(deleting&&body.confirm!=='delete')throw fail(400,'Confirm deletion.');
  if(contact&&!deleting) {
    const item=await request('/rest/v1/rpc/crm_save_contact',{method:'POST',body:{p_company_id:companyId,p_contact_id:id,p_version:id?body.version:null,p_data:contactInput(body)}});
    if(!item?.id)throw fail(409,'This contact changed or is no longer available. Reload it before saving again.');
    return {item};
  }
  const table=contact?'crm_contacts':'crm_notes';
  const path=`/rest/v1/${table}`+(id?`?id=eq.${id}&${scope}&version=eq.${body.version}`:'');
  const rows=await request(path,{method:deleting?'DELETE':id?'PATCH':'POST',...(deleting?{}:{body:{content:content(body.content),...(!id?{company_id:companyId,owner_id:user.id}:{})}}),headers:{Prefer:'return=representation'}});
  if(!rows[0])throw fail(409,'This record changed or is no longer available. Reload it before trying again.');
  return deleting?{ok:true}:{item:rows[0]};
}
