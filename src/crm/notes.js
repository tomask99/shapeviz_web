import {fail,uuid,string} from './validation.js';

export const noteActions=['crm-notes','crm-note-save','crm-note-delete','crm-note-summaries'];
export async function handleNotes({action,body,url,user,request,owner}) {
  if(action==='crm-note-summaries') {
    const parse=name=>{
      const ids=(url.searchParams.get(name)||'').split(',').filter(Boolean);
      if(ids.length>200||ids.some(id=>!uuid(id)))throw fail(400,'Invalid note targets.');
      return [...new Set(ids)];
    };
    return {items:await request('/rest/v1/rpc/crm_note_summaries',{method:'POST',body:{p_company_ids:parse('companyIds'),p_candidate_ids:parse('candidateIds')}})};
  }
  const reading=action==='crm-notes',input=reading?Object.fromEntries(url.searchParams):body;
  let companyId=input.companyId,candidateId=input.candidateId;
  if(Boolean(companyId)===Boolean(candidateId)||!uuid(companyId||candidateId))throw fail(400,'Invalid company.');
  if(candidateId){
    const rows=await request(`/rest/v1/crm_research_candidates?id=eq.${candidateId}&${owner}&select=id,approved_company_id`);
    if(!rows[0])throw fail(404,'Research company not found.');
    companyId=rows[0].approved_company_id;
  }else{
    const rows=await request(`/rest/v1/crm_companies?id=eq.${companyId}&${owner}&select=id`);
    if(!rows[0])throw fail(404,'Company not found.');
  }
  const scope=`${companyId?'company_id=eq.'+companyId:'candidate_id=eq.'+candidateId}&${owner}`;
  if(reading){
    const page=Number(input.page||1);
    if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
    const rows=await request(`/rest/v1/crm_all_notes?${scope}&select=*&order=created_at.desc,id&limit=31&offset=${(page-1)*30}`);
    return {items:rows.slice(0,30),hasMore:rows.length>30,page};
  }
  const deleting=action==='crm-note-delete',id=body.id||null;
  if((id&&!uuid(id))||(deleting&&!id))throw fail(400,'Invalid record.');
  if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw fail(400,'Reload the record before saving.');
  if(deleting&&body.confirm!=='delete')throw fail(400,'Confirm deletion.');
  const content=deleting?null:string(body.content,5000,'content');
  if(!deleting&&!content)throw fail(400,'Enter some text.');
  let table=companyId?'crm_notes':'crm_research_notes',recordScope=scope;
  if(id){
    const rows=await request(`/rest/v1/crm_all_notes?id=eq.${id}&${scope}&version=eq.${body.version}&select=id,candidate_id`);
    if(!rows[0])throw fail(409,'This note changed or is no longer available. Reopen Notes before trying again.');
    table=rows[0].candidate_id?'crm_research_notes':'crm_notes';
    recordScope=`${rows[0].candidate_id?'candidate_id=eq.'+rows[0].candidate_id:'company_id=eq.'+companyId}&${owner}`;
  }
  const rows=await request(`/rest/v1/${table}`+(id?`?id=eq.${id}&${recordScope}&version=eq.${body.version}`:''),{
    method:deleting?'DELETE':id?'PATCH':'POST',headers:{Prefer:'return=representation'},
    ...(!deleting?{body:{content,...(!id?{owner_id:user.id,...(companyId?{company_id:companyId}:{candidate_id:candidateId})}:{})}}:{})
  });
  if(!rows[0])throw fail(409,'This note changed or is no longer available. Reopen Notes before trying again.');
  return deleting?{ok:true}:{item:rows[0]};
}
