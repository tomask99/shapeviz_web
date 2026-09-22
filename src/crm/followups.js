import {fail,uuid,string,choice} from './validation.js';
export const followupActions=['crm-followups','crm-followup-save','crm-followup-complete'];
export function instant(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw fail(400,'Enter a valid date and time.');
  return value;
}
export async function withNextActions(data,request) {
  const companies=data.columns?data.columns.flatMap(c=>c.companies):data.companies||[data.company];
  if(!companies.length)return data;
  const next=await request('/rest/v1/rpc/crm_next_actions',{method:'POST',body:{p_company_ids:companies.map(c=>c.id)}});
  companies.forEach(c=>{c.next_action=next?.[c.id]||null;});return data;
}
export async function handleFollowups({action,body,url,user,request,owner}) {
  const reading=action==='crm-followups',p=url.searchParams;
  const companyId=(reading?p.get('companyId'):body.companyId)||null;
  if((companyId&&!uuid(companyId))||(!reading&&!companyId))throw fail(400,'Invalid company.');
  if(companyId){
    const rows=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,archived_at`);
    if(!rows[0])throw fail(404,'Company not found.');
    if(!reading&&rows[0].archived_at)throw fail(409,'Restore the company before changing follow-ups.');
  }
  if(reading){
    const today=instant(p.get('today')),tomorrow=instant(p.get('tomorrow')),hours=(Date.parse(tomorrow)-Date.parse(today))/3600000;
    if(hours<22||hours>26)throw fail(400,'Invalid local day boundaries.');
    const page=Number(p.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
    return request('/rest/v1/rpc/crm_list_followups',{method:'POST',body:{p_today:today,p_tomorrow:tomorrow,p_company_id:companyId,p_group:p.get('group')?choice(p.get('group'),['overdue','today','upcoming','completed'],'group'):null,p_page:page}});
  }
  const id=body.id||null;
  if((id&&!uuid(id))||(action==='crm-followup-complete'&&!id))throw fail(400,'Invalid follow-up.');
  if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw fail(400,'Reload the follow-up before saving.');
  let values;
  if(action==='crm-followup-complete')values={completed_at:new Date().toISOString()};
  else {
    const title=string(body.title,160,'title');if(!title)throw fail(400,'Enter a follow-up title.');
    const contactId=body.contact_id||null;if(contactId&&!uuid(contactId))throw fail(400,'Invalid contact.');
    if(contactId){const contacts=await request(`/rest/v1/crm_contacts?id=eq.${contactId}&company_id=eq.${companyId}&${owner}&select=id`);if(!contacts[0])throw fail(400,'Choose a contact belonging to this company.');}
    values={title,description:string(body.description,5000,'description'),contact_id:contactId,due_at:instant(body.due_at)};
  }
  const path='/rest/v1/crm_followups'+(id?`?id=eq.${id}&company_id=eq.${companyId}&${owner}&version=eq.${body.version}&completed_at=is.null`:'');
  const rows=await request(path,{method:id?'PATCH':'POST',body:{...values,...(!id?{company_id:companyId,owner_id:user.id}:{})},headers:{Prefer:'return=representation'}});
  if(!rows[0])throw fail(409,'This follow-up changed or was completed. Refresh before trying again.');
  return {item:rows[0]};
}
