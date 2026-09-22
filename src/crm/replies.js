import {fail,uuid,string} from './validation.js';
import {instant} from './followups.js';
export const replyActions=['crm-reply-add','crm-reply-summary'];
export async function handleReplies({action,body,url,user,request,owner}){
  const reading=action==='crm-reply-summary',companyId=reading?url.searchParams.get('companyId'):body.companyId;
  if(!uuid(companyId))throw fail(400,'Invalid company.');
  const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,archived_at`);
  if(!companies[0])throw fail(404,'Company not found.');
  const scope=`company_id=eq.${companyId}&${owner}&event_type=eq.reply_received`;
  if(reading){
    const rows=await request(`/rest/v1/crm_activities?${scope}&select=*&order=metadata->>received_at.desc,id&limit=1`);
    return {item:rows[0]||null};
  }
  if(!uuid(body.id))throw fail(400,'Invalid reply identity. Reopen the form.');
  const content=string(body.content,5000,'reply summary');if(!content)throw fail(400,'Enter a reply summary.');
  const received_at=instant(body.received_at);if(Date.parse(received_at)>Date.now()+60000)throw fail(400,'The reply date cannot be in the future.');
  const contact_id=body.contact_id||null;if(contact_id&&!uuid(contact_id))throw fail(400,'Invalid contact.');
  const path=`/rest/v1/crm_activities?id=eq.${body.id}&${scope}&select=*`;
  const existing=async()=>{
    const rows=await request(path),item=rows[0];if(!item)return null;
    if(item.metadata?.content!==content||Date.parse(item.metadata?.received_at)!==Date.parse(received_at)||(item.metadata?.contact_id||null)!==contact_id)
      throw fail(409,'This reply was already saved with different details. Close and review the activity history.');
    return {item};
  };
  const saved=await existing();if(saved)return saved;
  if(companies[0].archived_at)throw fail(409,'Restore the company before recording a reply.');
  if(contact_id){const contacts=await request(`/rest/v1/crm_contacts?id=eq.${contact_id}&company_id=eq.${companyId}&${owner}&select=id`);if(!contacts[0])throw fail(400,'Choose a contact from this company.');}
  try{
    const rows=await request('/rest/v1/crm_activities',{method:'POST',body:{id:body.id,company_id:companyId,owner_id:user.id,event_type:'reply_received',metadata:{content,received_at,contact_id}},headers:{Prefer:'return=representation'}});
    return {item:rows[0]};
  }catch(error){
    if(error.status===409){const saved=await existing();if(saved)return saved;throw fail(409,'The reply could not be recorded. Close and review the activity history.');}
    throw error;
  }
}
