import {randomUUID} from 'node:crypto';
import {fail,uuid} from '../crm/validation.js';
import {configuration,plain,consentRequest,sourceSession,randomSecret,hash,seal,unseal,grantAad,callback,bindingCookie,SCOPE_LABELS} from './domain.js';

export const OAUTH_ADMIN_ACTIONS=['oauth-preview','oauth-decide','oauth-connections','oauth-disconnect'];
const rpc=(call,name,body)=>call('/rest/v1/rpc/crm_mcp_oauth_'+name,{method:'POST',body});
export async function handleOAuthAdmin({action,body,url,req,res,user,token,env,call}) {
  if([...url.searchParams.keys()].some(key=>key!=='action'||url.searchParams.getAll(key).length!==1))throw fail(400,'Invalid connection options.');
  if(action==='oauth-connections'&&env.MCP_OAUTH_ENABLED!=='true')return {enabled:false,connections:[]};
  const config=configuration(env);
  if(action==='oauth-connections')return {enabled:true,connections:await rpc(call,'list',{p_owner:user.id})};
  if(!plain(body))throw fail(400,'Invalid connection request.');
  if(action==='oauth-disconnect'){
    if(Object.keys(body).length!==2||!uuid(body.id)||body.confirm!==true)throw fail(400,'Confirm which connection to remove.');
    const removed=await rpc(call,'revoke',{p_owner:user.id,p_grant:body.id,p_token_hash:null,p_client_id:null});
    if(!removed)throw fail(404,'Connection not found.');return {ok:true};
  }
  if(Object.keys(body).some(key=>!['request',...(action==='oauth-decide'?['approve','review']:[])].includes(key))||typeof body.request!=='string'||action==='oauth-decide'&&(typeof body.approve!=='boolean'||typeof body.review!=='string'))throw fail(400,'Invalid connection request.');
  const request=consentRequest(body,req,config);
  const source=sourceSession(token,user,env),reviewAad='shapeviz-mcp-review-v1:'+config.issuer;
  if(action==='oauth-preview'){
    const review=seal({request_hash:hash(request.nonce),owner_id:user.id,...source,exp:request.exp},config.key,reviewAad);
    return {review,client_name:request.client_name,scopes:request.scopes.map(id=>({id,label:SCOPE_LABELS[id]})),expires_at:source.expires_at,request_expires_at:new Date(request.exp).toISOString(),account_email:user.email};
  }
  const review=unseal(body.review,config.key,reviewAad);
  if(review.owner_id!==user.id||review.source_session_id!==source.source_session_id||review.request_hash!==hash(request.nonce)||review.exp<=Date.now())throw fail(409,'Your account or connection request changed. Review the connection again.');
  let grant=null,code;
  if(body.approve){
    code='sv_code_'+randomSecret();
    grant={id:randomUUID(),owner_id:user.id,client_id:request.client_id,client_name:request.client_name,resource:config.resource,redirect_uri:request.redirect_uri,scopes:request.scopes,...source,expires_at:new Date(Math.min(Date.parse(source.expires_at),Date.parse(review.expires_at))).toISOString()};
    grant.encrypted_session=seal({token},config.key,grantAad(grant));grant.code_hash=hash(code);grant.code_challenge=request.code_challenge;
  }
  const result=await rpc(call,'decide',{p_request_hash:hash(request.nonce),p_owner:user.id,p_grant:grant});
  if(result?.error)throw fail(result.error==='request_used'?409:403,'This connection request is no longer available. Start connecting again.');
  if(body.approve?!result?.approved:!result?.denied)throw fail(502,'The connection decision could not be confirmed. Start connecting again.');
  const existing=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:[existing]),bindingCookie('',config)]);
  return {redirect:callback(request.redirect_uri,{...(body.approve?{code}:{error:'access_denied'}),state:request.state,iss:config.issuer})};
}
