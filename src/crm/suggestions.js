import {fail,uuid,choice} from './validation.js';
import {SUGGESTION_RULES} from '../../public/admin/crm-suggestion-rules.js';
export async function handleSuggestions({action,body,url,request}){
 if(action==='crm-suggestions'){
  const page=Number(url.searchParams.get('page')||1),hidden=url.searchParams.get('hidden')||'false';
  if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
  choice(hidden,['true','false'],'visibility');
  return request('/rest/v1/rpc/crm_suggestions',{method:'POST',body:{p_page:page,p_hidden:hidden==='true'}});
 }
 if(!uuid(body.companyId))throw fail(400,'Invalid company.');
 return request('/rest/v1/rpc/crm_set_suggestion_state',{method:'POST',body:{p_company:body.companyId,p_rule:choice(body.rule,Object.keys(SUGGESTION_RULES),'suggestion'),p_action:choice(body.action,['snooze','dismiss','restore'],'action')}});
}
