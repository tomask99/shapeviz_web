import {fail,uuid,string} from './validation.js';
import {instant} from './followups.js';
const slug=value=>typeof value==='string'&&value.length<=100&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const presentationActions=['crm-presentations','crm-presentation-catalog','crm-presentation-assign','crm-presentation-ensure','crm-presentation-company','crm-presentation-unassign','crm-presentation-sent','crm-presentation-stats'];
export async function handlePresentations({action,body,url,user,request,owner,call}) {
  if(action==='crm-presentation-company'){
    const deck=url.searchParams.get('slug');if(!slug(deck))throw fail(400,'Invalid presentation.');
    const rows=await request(`/rest/v1/crm_presentation_links?deck_slug=eq.${deck}&${owner}&select=id,company_id,company:crm_companies(company_name)&limit=1`);
    return {item:rows[0]||null};
  }
  const reading=['crm-presentations','crm-presentation-catalog','crm-presentation-stats'].includes(action);
  const companyId=reading?url.searchParams.get('companyId'):body.companyId;
  if(!uuid(companyId))throw fail(400,'Invalid company.');
  const companies=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id,archived_at`);
  if(!companies[0])throw fail(404,'Company not found.');
  if(!reading&&companies[0].archived_at)throw fail(409,'Restore the company before changing its presentations.');
  if(action==='crm-presentations'||action==='crm-presentation-catalog'){
    const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
    if(action==='crm-presentation-catalog')return request('/rest/v1/rpc/crm_presentation_catalog',{method:'POST',body:{p_q:string(url.searchParams.get('q'),160,'search'),p_page:page}});
    const items=await request(`/rest/v1/crm_presentation_links?company_id=eq.${companyId}&${owner}&select=*,project:presentation_projects(deck_slug,client,title,status,is_template,slide_count,analytics_enabled),contact:crm_contacts(full_name)&order=created_at.desc,id&limit=26&offset=${(page-1)*25}`);
    return {items:items.slice(0,25),hasMore:items.length>25,page};
  }
  if(action==='crm-presentation-assign'||action==='crm-presentation-ensure'){
    if(!slug(body.slug))throw fail(400,'Invalid presentation.');
    // Registry RLS checks existing shared owner-role access using this user's JWT.
    const projects=await request(`/rest/v1/presentation_projects?deck_slug=eq.${body.slug}&select=deck_slug,is_template,status`);
    if(!projects[0]||projects[0].is_template||projects[0].status==='archived')throw fail(400,'Choose an available presentation, not a reusable template.');
    try{
      const rows=await request('/rest/v1/crm_presentation_links',{method:'POST',body:{owner_id:user.id,company_id:companyId,deck_slug:body.slug},headers:{Prefer:'return=representation'}});
      return {item:rows[0]};
    }catch(e){
      if(e.status===409){
        // A lost response may be retried, but never transfer a deck or reveal another owner's link.
        if(action==='crm-presentation-ensure'){
          const rows=await request(`/rest/v1/crm_presentation_links?deck_slug=eq.${body.slug}&company_id=eq.${companyId}&${owner}&select=id,company_id,deck_slug&limit=1`);
          if(rows[0])return {item:rows[0]};
        }
        throw fail(409,'This presentation is already assigned. Refresh the list before trying again.');
      }
      throw e;
    }
  }
  const id=reading?url.searchParams.get('id'):body.id;if(!uuid(id))throw fail(400,'Invalid presentation link.');
  const path=`/rest/v1/crm_presentation_links?id=eq.${id}&company_id=eq.${companyId}&${owner}`;
  if(action==='crm-presentation-stats'){
    const days=Number(url.searchParams.get('days')||30);if(![7,30,90].includes(days))throw fail(400,'Invalid analytics period.');
    const rows=await request(`${path}&select=deck_slug`);if(!rows[0])throw fail(404,'Presentation link not found.');
    // Existing stats RPC is service-only. Invoke it only after JWT/RLS link authorization;
    // the slug comes from that authorized row, never from the browser.
    const stats=await call('/rest/v1/rpc/presentation_admin_stats',{method:'POST',body:{p_slug:rows[0].deck_slug,p_days:days}});
    return {stats,days};
  }
  if(!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Reload the presentation link before saving.');
  if(action==='crm-presentation-unassign'){
    if(body.confirm!=='unlink')throw fail(400,'Confirm removing this association.');
    const rows=await request(`${path}&version=eq.${body.version}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
    if(!rows[0])throw fail(409,'This association changed. Refresh before trying again.');return {ok:true};
  }
  const sent_at=instant(body.sent_at);if(Date.parse(sent_at)>Date.now()+60000)throw fail(400,'The sent date cannot be in the future.');
  const contactId=body.contact_id||null;if(contactId&&!uuid(contactId))throw fail(400,'Invalid contact.');
  if(contactId){const contacts=await request(`/rest/v1/crm_contacts?id=eq.${contactId}&company_id=eq.${companyId}&${owner}&select=id`);if(!contacts[0])throw fail(400,'Choose a contact from this company.');}
  const rows=await request(`${path}&version=eq.${body.version}&sent_at=is.null`,{method:'PATCH',body:{sent_at,sent_to_contact_id:contactId},headers:{Prefer:'return=representation'}});
  if(!rows[0])throw fail(409,'This presentation was already marked sent or the association changed. Refresh first.');
  return {item:rows[0]};
}
