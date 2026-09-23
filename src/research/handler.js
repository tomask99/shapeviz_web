import {fail,uuid} from '../crm/validation.js';
import {researchFilters} from '../../public/admin/research-filters.js';
import {handleResearchImport} from './import.js';
import {handleResearchReview,reviewReadActions,reviewWriteActions} from './review.js';
import {handleResearchRefresh,refreshReadActions,refreshWriteActions} from './refresh.js';
import {handleResearchSimilar,similarReadActions} from './similar.js';
import {handleResearchContacts,contactsReadActions,contactsWriteActions} from './contacts.js';
import {handleResearchEnrich,enrichReadActions,enrichWriteActions} from './enrich.js';

export const researchReadActions = ['crm-research-list','crm-research-detail','crm-research-prompt',...reviewReadActions,...refreshReadActions,...similarReadActions,...contactsReadActions,...enrichReadActions];
export const researchWriteActions = ['crm-research-import-preview','crm-research-import-commit',...reviewWriteActions,...refreshWriteActions,...contactsWriteActions,...enrichWriteActions];
export const RESEARCH_DETAIL_FIELDS = [
  'id','company_name','website','normalized_domain','country','country_category','city','industry','business_type',
  'product_categories','secondary_categories','market_segments','positioning','short_description','research_summary',
  'potential_services','opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence',
  'sources','field_provenance','source_origin','last_researched_at','research_status','duplicate_company_id','duplicate_candidate_id',
  'duplicate_checked_at','rejection_reason','created_at','updated_at','approved_at','rejected_at','version','approved_company_id','manual_fields',
].join(',');

/** Reads use owner JWT/RLS; reviewed writes pass through the validated import gateway. */
export async function handleResearch({action,body,url,user,token,call,signingKey,validateCompany}) {
  if (!token || !uuid(user?.id)) throw fail(401,'Please sign in.');
  const params = url.searchParams;
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1) throw fail(400,'Repeated research query parameters are not allowed.');
  }
  if (reviewReadActions.includes(action) || reviewWriteActions.includes(action)) {
    return handleResearchReview({action,body,url,user,token,call,signingKey,validateCompany});
  }
  if (refreshReadActions.includes(action) || refreshWriteActions.includes(action)) {
    return handleResearchRefresh({action,body,url,user,token,call,signingKey});
  }
  if (similarReadActions.includes(action)) {
    return handleResearchSimilar({action,url,user,token,call});
  }
  if (contactsReadActions.includes(action) || contactsWriteActions.includes(action)) {
    return handleResearchContacts({action,body,url,user,token,call,signingKey});
  }
  if (enrichReadActions.includes(action) || enrichWriteActions.includes(action)) {
    return handleResearchEnrich({action,body,url,user,token,call,signingKey,validateCompany});
  }
  if (action.startsWith('crm-research-import-') || action==='crm-research-prompt') {
    return handleResearchImport({action,body,url,user,token,call,signingKey});
  }
  if (action === 'crm-research-list') {
    const rawPage = params.get('page') ?? '1';
    if (!/^[1-9]\d{0,4}$/.test(rawPage) || Number(rawPage) > 10000) throw fail(400,'Invalid research page.');
    let filters;
    try { filters = researchFilters(Object.fromEntries([...params].filter(([key]) => !['action','page'].includes(key)))); }
    catch (error) { throw fail(400,error.message); }
    return call('/rest/v1/rpc/crm_research_list',{token,method:'POST',body:{p_filters:filters,p_page:Number(rawPage)}});
  }
  if (action === 'crm-research-detail') {
    if ([...params.keys()].some(key => !['action','id'].includes(key)) || !uuid(params.get('id'))) throw fail(400,'Invalid research candidate.');
    const rows = await call(`/rest/v1/crm_research_candidates?id=eq.${encodeURIComponent(params.get('id'))}&owner_id=eq.${user.id}&select=${RESEARCH_DETAIL_FIELDS}&limit=1`,{token});
    if (!rows?.[0]) throw fail(404,'Research candidate not found.');
    const events = await call(`/rest/v1/crm_research_events?candidate_id=eq.${encodeURIComponent(params.get('id'))}&owner_id=eq.${user.id}&select=id,event_type,metadata,created_at&order=created_at.desc,id.desc&limit=50`,{token});
    return {candidate:rows[0],events};
  }
  throw fail(400,'Unknown research action.');
}
