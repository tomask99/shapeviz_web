import {uuid,fail} from '../crm/validation.js';
import {supportsClientNameApi,transformDeck} from './html.js';
import {storageScopes} from './storage.js';

/** Retrying the same operation reuses its deck and atomically finishes CRM changes. */
export async function preparePresentation({body,user,token,call,project,source,saveDeck}) {
  if(!uuid(body.companyId)||!uuid(body.operationId)||!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Reload the company before preparing a presentation.');
  if(typeof body.template!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.template)||body.template.length>100)throw fail(400,'Choose a template.');
  const companies=await call(`/rest/v1/crm_companies?id=eq.${body.companyId}&owner_id=eq.${user.id}&select=id,company_name,version,archived_at`,{token});
  const company=companies[0];
  if(!company)throw fail(404,'Company not found.');
  if(company.archived_at)throw fail(409,'Restore the company before preparing a presentation.');
  // Stable across network retries, independent of accents or a later company rename.
  const slug='pitch-'+body.operationId;
  const existing=await call(`/rest/v1/presentation_projects?deck_slug=eq.${slug}&select=*`);
  let result;
  if(existing[0]){
    const p=existing[0],meta=p.content||{};
    if(meta._prepareOwner!==user.id||meta._prepareCompany!==company.id||meta._prepareVersion!==body.version||p.parent_slug!==body.template)throw fail(409,'This preparation belongs to a different request. Reopen the dialog.');
    result={project:p,url:'/p/'+slug};
  }else{
    if(company.version!==body.version)throw fail(409,'The company changed. Reopen Prepare presentation.');
    const original=await project(body.template);
    if((!original.is_template&&original.source_type!=='template')||original.status==='archived')throw fail(400,'Choose an available template.');
    const html=await source(original),modern=supportsClientNameApi(html),from=original.template_match||original.client;
    if(!modern&&!from)throw fail(400,'This template is missing its original company name.');
    const transformed=transformDeck(html,modern?{company:company.company_name,slug,analytics:false,useClientNameApi:true}:{from,company:company.company_name,slug,analytics:false});
    if(!transformed.replacements)throw fail(400,'No company-name fields were found in this template.');
    result=await saveDeck({slug,client:company.company_name,title:original.title,publish:true,isTemplate:false},transformed.html,original.deck_slug,storageScopes(original).filter(s=>s.bucket==='presentation-media'),{_prepareOwner:user.id,_prepareCompany:company.id,_prepareVersion:body.version});
  }
  const crm=await call('/rest/v1/rpc/crm_finish_prepared_presentation',{method:'POST',token,body:{p_company:company.id,p_deck:slug,p_version:body.version}});
  return {...result,...crm};
}
