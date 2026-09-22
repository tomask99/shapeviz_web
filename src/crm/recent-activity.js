import {fail,uuid} from './validation.js';
import {RECENT_TYPES} from '../../public/admin/crm-recent-types.js';
export function recentActivityQuery(params,owner){
 const at=params.get('beforeAt'),id=params.get('beforeId');
 if(at!==null||id!==null){
  if(!uuid(id)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(at||'')||!Number.isFinite(Date.parse(at))||new Date(at).toISOString().slice(0,19)!==at.slice(0,19))throw fail(400,'Invalid activity cursor.');
 }
 const q=new URLSearchParams({select:'id,company_id,event_type,metadata,created_at,company:crm_companies!inner(company_name,archived_at)',owner_id:`eq.${owner}`,'company.archived_at':'is.null',event_type:`in.(${Object.keys(RECENT_TYPES).join(',')})`,order:'created_at.desc,id.desc',limit:'21'});
 if(at)q.set('or',`(created_at.lt.${at},and(created_at.eq.${at},id.lt.${id}))`);
 return `/rest/v1/crm_activities?${q}`;
}
const short=v=>typeof v==='string'?v.slice(0,300):'';
export function recentActivityPage(rows){
 const items=rows.slice(0,20).map(r=>({id:r.id,company_id:r.company_id,company_name:short(r.company?.company_name),event_type:r.event_type,created_at:r.created_at,detail:short(r.event_type==='status_changed'?`${short(r.metadata?.from_status)} → ${short(r.metadata?.to_status)}`:r.metadata?.content||r.metadata?.name||'')}));
 const last=items.at(-1);
 return {items,next:rows.length>20?{beforeAt:last.created_at,beforeId:last.id}:null};
}
