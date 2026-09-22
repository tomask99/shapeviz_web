import {STATUSES, SERVICES, SOURCES, PRIORITIES} from '../../public/admin/crm-options.js';

import {fail,uuid,string,choice,link} from './validation.js';
import {handleRelations,relationActions,contactInput} from './relations.js';
import {outcomeInput} from './outcome.js';
import {handleFollowups,followupActions,withNextActions} from './followups.js';
import {handlePresentations,presentationActions} from './presentations.js';
import {handleReplies,replyActions} from './replies.js';
import {instant} from './followups.js';
import {opportunityValueInput} from '../../public/admin/crm-value.js';
import {LOST_REASONS} from '../../public/admin/crm-outcome.js';

/** Validate the editable company fields; never accept owner IDs or audit timestamps. */
export function companyInput(body) {
  let opportunity;
  try { opportunity=opportunityValueInput(body); } catch(error) { throw fail(400,error.message); }
  const company_name = string(body.company_name, 160, 'company name');
  if (!company_name) throw fail(400, 'Enter the company name.');
  const country = string(body.country, 2, 'country').toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) throw fail(400, 'Use a two-letter country code.');
  if (!Array.isArray(body.services) || body.services.length > SERVICES.length || body.services.some(x => !SERVICES.includes(x))) throw fail(400, 'Invalid services.');
  return {
    ...opportunity,
    ...outcomeInput(body),
    ...(Object.hasOwn(body,'lost_reason')?{lost_reason:choice(body.lost_reason,['',...LOST_REASONS],'lost reason')}:{}),
    company_name, country,
    city: string(body.city, 120, 'city'), industry: string(body.industry, 120, 'industry'),
    short_description: string(body.short_description, 3000, 'description'),
    website: link(body.website, 'website'), instagram: link(body.instagram, 'Instagram'), linkedin: link(body.linkedin, 'LinkedIn'),
    services: [...new Set(body.services)],
    priority: choice(body.priority, PRIORITIES, 'priority'),
    lead_source: choice(body.lead_source, SOURCES, 'source'),
    pipeline_status: choice(body.pipeline_status, STATUSES, 'status'),
  };
}

export async function handleCrm({action, body, url, user, token, call}) {
  // Every CRM request carries the verified user's JWT, including reads.
  if (!token || !uuid(user.id)) throw fail(401, 'Please sign in.');
  const request = (path, options = {}) => call(path, {...options, token});
  const owner = `owner_id=eq.${encodeURIComponent(user.id)}`;
  if(action==='crm-overview'){
    const today=instant(url.searchParams.get('today')),tomorrow=instant(url.searchParams.get('tomorrow'));
    const hours=(Date.parse(tomorrow)-Date.parse(today))/3600000;
    if(hours<22||hours>26)throw fail(400,'Invalid local day boundaries.');
    return request('/rest/v1/rpc/crm_business_overview',{method:'POST',body:{p_today:today,p_tomorrow:tomorrow}});
  }
  if(action==='crm-signals'){
    const id=url.searchParams.get('companyId');if(!uuid(id))throw fail(400,'Invalid company.');
    const rows=await request(`/rest/v1/crm_company_signals?id=eq.${id}&${owner}&select=*`);if(!rows[0])throw fail(404,'Company not found.');return {signals:rows[0]};
  }
  if (replyActions.includes(action)) return handleReplies({action,body,url,user,request,owner});
  if (presentationActions.includes(action)) return handlePresentations({action,body,url,user,request,owner,call});
  if (followupActions.includes(action)) return handleFollowups({action,body,url,user,request,owner});
  if (relationActions.includes(action)) return handleRelations({action,body,url,user,request,owner});
  if (action === 'crm-list' || action === 'crm-pipeline') {
    const p = url.searchParams;
    const page = Number(p.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw fail(400, 'Invalid page.');
    const filters = {q: string(p.get('q'), 160, 'search'), industry: string(p.get('industry'), 120, 'industry')};
    for (const [key, values] of Object.entries({country_category:['SK','CZ','INT'], pipeline_status:STATUSES, priority:PRIORITIES, service:SERVICES, lead_source:SOURCES, archived:['active','archived','all'],sort:['recent','name','updated','priority','last_activity','last_contact','next_followup','engagement'],presentation_status:['NONE','ASSIGNED','SENT','VIEWED'],engagement:['COLD','ACTIVE','HOT'],has_followup:['yes','no'],has_replied:['yes','no'],last_contacted:['never','7','30','older30']})) {
      const value = p.get(key);
      if (value) filters[key] = choice(value, values, key);
    }
    if(action==='crm-pipeline') {
      const mode=choice(p.get('mode')||'active',['active','lost'],'pipeline view');
      const stages=mode==='lost'?['LOST']:STATUSES.filter(status=>status!=='LOST');
      const columns=await Promise.all(stages.map(async status=>({
        status,...await request('/rest/v1/rpc/crm_list_companies',{method:'POST',body:{p_filters:{...filters,archived:'active',pipeline_status:status,sort:'updated'},p_page:1}})
      })));
      return withNextActions({columns},request);
    }
    return withNextActions(await request('/rest/v1/rpc/crm_list_companies', {method:'POST', body:{p_filters:filters, p_page:page}}),request);
  }
  if (action === 'crm-create') {
    if(body.initial_contact){
      const company=await request('/rest/v1/rpc/crm_create_company_contact',{method:'POST',body:{p_data:companyInput(body),p_contact:contactInput({...body.initial_contact,primary_contact:true})}});
      return {company};
    }
    const rows = await request('/rest/v1/crm_companies', {method:'POST', body:{...companyInput(body), owner_id:user.id}, headers:{Prefer:'return=representation'}});
    return {company:rows[0]};
  }
  const id = action === 'crm-detail' ? url.searchParams.get('id') : body.id;
  if (!uuid(id)) throw fail(400, 'Invalid company.');
  const path = `/rest/v1/crm_companies?id=eq.${id}&${owner}`;
  if (action === 'crm-detail') {
    const rows = await request(`${path}&select=*`);
    if (!rows[0]) throw fail(404, 'Company not found.');
    return withNextActions({company:rows[0]},request);
  }
  if (!['crm-update','crm-archive','crm-status'].includes(action)) throw fail(404, 'Unknown CRM action.');
  if (!Number.isSafeInteger(body.version) || body.version < 1) throw fail(400, 'Reload the company before saving.');
  if (action === 'crm-archive' && typeof body.archived !== 'boolean') throw fail(400, 'Invalid archive action.');
  const values = action === 'crm-update' ? companyInput(body) : action==='crm-status' ? {pipeline_status:choice(body.pipeline_status,STATUSES,'status')} : {archived_at:body.archived ? new Date().toISOString() : null};
  const rows = await request(`${path}&version=eq.${body.version}${action==='crm-status'?'&archived_at=is.null':''}`, {method:'PATCH', body:values, headers:{Prefer:'return=representation'}});
  if (!rows[0]) throw fail(409, 'This company changed or is no longer available. Reload it before saving again.');
  return {company:rows[0]};
}
