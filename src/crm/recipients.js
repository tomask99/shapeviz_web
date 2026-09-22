import {fail,uuid,string} from './validation.js';
import {newRecipientToken,recipientHash} from '../presentations/recipient-token.js';
import {instant} from './followups.js';
export const recipientActions=['crm-recipients','crm-recipient-create','crm-recipient-revoke','crm-recipient-sent','crm-recipient-stats'];
const fields='id,association_id,company_id,deck_slug,contact_id,recipient_name,recipient_email,created_at,revoked_at,sent_at';
export async function handleRecipients({action,body,url,user,request,owner}){
 const read=['crm-recipients','crm-recipient-stats'].includes(action),company=read?url.searchParams.get('companyId'):body.companyId;
 if(!uuid(company))throw fail(400,'Invalid company.');
 const companies=await request(`/rest/v1/crm_companies?id=eq.${company}&${owner}&select=id,archived_at`);
 if(!companies[0])throw fail(404,'Company not found.');
 if(action==='crm-recipient-stats'||action==='crm-recipient-sent'){
  const id=read?url.searchParams.get('id'):body.id;if(!uuid(id))throw fail(400,'Invalid recipient.');
  const path=`/rest/v1/crm_presentation_recipients?id=eq.${id}&company_id=eq.${company}&${owner}&select=${fields}`;
  const rows=await request(path);if(!rows[0])throw fail(404,'Recipient not found.');
  if(read){const days=Number(url.searchParams.get('days')||30);if(![7,30,90].includes(days))throw fail(400,'Invalid period.');return {stats:await request('/rest/v1/rpc/crm_recipient_stats',{method:'POST',body:{p_recipient:id,p_days:days}}),days};}
  if(rows[0].sent_at)return {item:rows[0]}; // Safe retry after a lost successful response.
  if(companies[0].archived_at||rows[0].revoked_at)throw fail(409,'This recipient is not available for sending.');
  const sent_at=instant(body.sent_at);if(Date.parse(sent_at)>Date.now()+60000)throw fail(400,'Sent date cannot be in the future.');
  const saved=await request(path+'&sent_at=is.null',{method:'PATCH',body:{sent_at},headers:{Prefer:'return=representation'}});
  if(saved[0])return {item:saved[0]};const refreshed=await request(path);if(refreshed[0]?.sent_at)return {item:refreshed[0]};throw fail(409,'Recipient changed. Refresh first.');
 }
 if(action==='crm-recipient-revoke'){
  if(!uuid(body.id))throw fail(400,'Invalid recipient.');
  const rows=await request(`/rest/v1/crm_presentation_recipients?id=eq.${body.id}&company_id=eq.${company}&${owner}&select=${fields}`,{method:'PATCH',body:{revoked_at:new Date().toISOString()},headers:{Prefer:'return=representation'}});
  if(!rows[0])throw fail(404,'Recipient not found.');return {item:rows[0]};
 }
 const association=read?url.searchParams.get('associationId'):body.associationId;
 if(!uuid(association))throw fail(400,'Invalid presentation association.');
 const links=await request(`/rest/v1/crm_presentation_links?id=eq.${association}&company_id=eq.${company}&${owner}&select=id,deck_slug`);
 if(!links[0])throw fail(404,'Presentation association not found.');
 if(read){const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');const rows=await request(`/rest/v1/crm_presentation_recipients?association_id=eq.${association}&company_id=eq.${company}&${owner}&select=${fields}&order=created_at.desc,id&limit=26&offset=${(page-1)*25}`);return {items:rows.slice(0,25),hasMore:rows.length>25,page};}
 if(companies[0].archived_at)throw fail(409,'Restore the company first.');
 let name,email,contact=body.contact_id||null;
 if(contact){
  if(!uuid(contact))throw fail(400,'Invalid contact.');
  const contacts=await request(`/rest/v1/crm_contacts?id=eq.${contact}&company_id=eq.${company}&${owner}&select=full_name,email`);
  if(!contacts[0])throw fail(400,'Choose a contact belonging to this company.');name=contacts[0].full_name;email=contacts[0].email;
 }else{name=string(body.name,160,'recipient name');email=string(body.email,254,'email');if(!name)throw fail(400,'Enter a recipient name.');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter a valid email.');}
 const token=newRecipientToken(),rows=await request('/rest/v1/crm_presentation_recipients?select='+fields,{method:'POST',body:{association_id:association,company_id:company,owner_id:user.id,deck_slug:links[0].deck_slug,contact_id:contact,recipient_name:name,recipient_email:email||'',token_hash:recipientHash(token)},headers:{Prefer:'return=representation'}});
 return {item:rows[0],url:`/p/${encodeURIComponent(links[0].deck_slug)}?r=${token}`};
}
