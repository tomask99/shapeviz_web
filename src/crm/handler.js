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
import {actionCenterInput} from './action-center.js';
import {recentActivityQuery,recentActivityPage} from './recent-activity.js';
import {handleSuggestions} from './suggestions.js';
import {handleRecipients,recipientActions} from './recipients.js';
import {handleSavedViews,savedViewActions} from './saved-views.js';
import {websiteMetadata} from './website-metadata.js';
import {handleClients,clientActions} from './clients.js';
import {handleOperations,operationActions} from './operations.js';
import {filterConfig,FILTER_CHOICES} from '../../public/admin/crm-filter-config.js';
import {normalizedDomain,normalizedName} from '../../public/admin/crm-normalize.js';

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
    ...(Object.hasOwn(body,'fit')?{fit:choice(body.fit,['','LOW','MEDIUM','HIGH'],'fit')||null}:{}),
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
  if(['crm-suggestions','crm-suggestion-state'].includes(action))return handleSuggestions({action,body,url,request});
  if(action==='crm-recent-activity')return recentActivityPage(await request(recentActivityQuery(url.searchParams,user.id)));
  const owner = `owner_id=eq.${encodeURIComponent(user.id)}`;
  if(operationActions.includes(action))return handleOperations({action,body,url,request,validateCompany:companyInput});
  if(clientActions.includes(action))return handleClients({action,body,url,user,request,owner});
  if(action==='crm-website-metadata')return {data:await websiteMetadata(string(body.website,2048,'website'))};
  if(action==='crm-duplicates')return {items:await request('/rest/v1/rpc/crm_duplicates',{method:'POST',body:{p_domain:normalizedDomain(string(body.website,2048,'website')),p_name:normalizedName(string(body.company_name,160,'name')),p_country:string(body.country,2,'country').toUpperCase()}})};
  if(savedViewActions.includes(action))return handleSavedViews({action,body,user,request,owner});
  if(recipientActions.includes(action))return handleRecipients({action,body,url,user,request,owner});
  if(action==='crm-action-center')return request('/rest/v1/rpc/crm_action_center',{method:'POST',body:actionCenterInput(url.searchParams)});
  if(action==='crm-overview'){
    const today=instant(url.searchParams.get('today')),tomorrow=instant(url.searchParams.get('tomorrow'));
    const hours=(Date.parse(tomorrow)-Date.parse(today))/3600000;
    if(hours<22||hours>26)throw fail(400,'Invalid local day boundaries.');
    return request('/rest/v1/rpc/crm_business_overview',{method:'POST',body:{p_today:today,p_tomorrow:tomorrow}});
  }
  if(action==='crm-signals'){
    const id=url.searchParams.get('companyId');if(!uuid(id))throw fail(400,'Invalid company.');
    const rows=await request(`/rest/v1/crm_company_signals?id=eq.${id}&${owner}&select=*`);if(!rows[0])throw fail(404,'Company not found.');return {signals:rows[0],config:await request('/rest/v1/rpc/crm_engagement_config',{method:'POST',body:{}})};
  }
  if (replyActions.includes(action)) return handleReplies({action,body,url,user,request,owner});
  if (presentationActions.includes(action)) return handlePresentations({action,body,url,user,request,owner,call});
  if (followupActions.includes(action)) return handleFollowups({action,body,url,user,request,owner});
  if (relationActions.includes(action)) return handleRelations({action,body,url,user,request,owner});
  if (action === 'crm-list' || action === 'crm-pipeline') {
    const p = url.searchParams;
    const page = Number(p.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw fail(400, 'Invalid page.');
    let filters;try{filters=filterConfig(Object.fromEntries([...p].filter(([key])=>['q','industry',...Object.keys(FILTER_CHOICES)].includes(key))));}catch(e){throw fail(400,e.message);}
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
