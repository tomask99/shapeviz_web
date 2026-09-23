import {createHash,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {fail,uuid} from '../crm/validation.js';

export const SCOPES=Object.freeze(['crm:read','research:read','catalog:read']);
export const SCOPE_LABELS=Object.freeze({'crm:read':'Read company profiles and Leads','research:read':'Read Research, evidence and known domains','catalog:read':'Read Shapeviz services and research guidance'});
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const randomSecret=()=>randomBytes(32).toString('base64url');
export const challenge=value=>createHash('sha256').update(value).digest('base64url');
export const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export const oauthError=(code,status=400)=>Object.assign(fail(status,code),{oauthCode:code});
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const loopback=url=>url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
const nativeLoopback=url=>url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname);

// RFC 8252 native callbacks retain an exact IP literal and path but permit the
// ephemeral listener port. Codes remain bound to the concrete requested URI.
export function redirectAllowed(client,value) {
  if(client.redirect_uris.includes(value))return true;
  if(client.application_type!=='native'||!text(value,2048))return false;
  try {
    const requested=new URL(value);
    if(!nativeLoopback(requested)||requested.username||requested.password||requested.search||requested.hash||requested.href!==value)return false;
    return client.redirect_uris.some(uri=>{const registered=new URL(uri);return nativeLoopback(registered)&&!registered.port&&registered.hostname===requested.hostname&&registered.pathname===requested.pathname;});
  }catch{return false;}
}

export function configuration(env) {
  if(env.MCP_OAUTH_ENABLED!=='true')throw oauthError('temporarily_unavailable',503);
  try {
    const origin=new URL(env.SITE_URL),local=env.MCP_OAUTH_ALLOW_LOOPBACK==='true'&&!env.VERCEL;
    if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.protocol!=='https:'&&!(local&&loopback(origin)))throw new Error();
    const key=Buffer.from(env.MCP_OAUTH_ENCRYPTION_KEY||'','base64');
    if(key.length!==32||key.toString('base64')!==env.MCP_OAUTH_ENCRYPTION_KEY)throw new Error();
    const clients=JSON.parse(env.MCP_OAUTH_CLIENTS||'null');
    if(!Array.isArray(clients)||clients.length<1||clients.length>10)throw new Error();
    const ids=new Set();
    for(const client of clients){
      if(!plain(client)||Object.keys(client).some(k=>!['client_id','name','redirect_uris','application_type'].includes(k))||client.application_type!==undefined&&!['web','native'].includes(client.application_type)||!text(client.client_id,120)||!/^[A-Za-z0-9._-]+$/.test(client.client_id)||ids.has(client.client_id)||!text(client.name,120)||!Array.isArray(client.redirect_uris)||!client.redirect_uris.length||client.redirect_uris.length>5)throw new Error();
      ids.add(client.client_id);
      for(const value of client.redirect_uris){
        if(!text(value,2048))throw new Error();const redirect=new URL(value);
        const native=client.application_type==='native'&&nativeLoopback(redirect)&&!redirect.port;
        if(redirect.username||redirect.password||redirect.hash||redirect.search||redirect.href!==value||redirect.protocol!=='https:'&&!native&&!(local&&loopback(redirect)))throw new Error();
      }
    }
    if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new Error();
    return {issuer:origin.origin,resource:origin.origin+'/api/mcp',metadata:origin.origin+'/.well-known/oauth-protected-resource/api/mcp',secure:origin.protocol==='https:',key,clients};
  }catch{throw oauthError('temporarily_unavailable',503);}
}

export function parseScopes(value) {
  if(typeof value!=='string'||value.length>100)throw oauthError('invalid_scope');
  const scopes=value.split(' ');
  if(!scopes.length||scopes.some(item=>!SCOPES.includes(item))||new Set(scopes).size!==scopes.length)throw oauthError('invalid_scope');
  return SCOPES.filter(scope=>scopes.includes(scope));
}

export function parameters(params,allowed) {
  if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))throw oauthError('invalid_request');
  return Object.fromEntries(params);
}

export function authorization(params,config) {
  const p=parameters(params,['response_type','client_id','redirect_uri','scope','state','code_challenge','code_challenge_method','resource']);
  const client=config.clients.find(item=>item.client_id===p.client_id);
  if(!client||!redirectAllowed(client,p.redirect_uri))throw oauthError('invalid_request');
  // Only a registered callback (including a native listener port) gets errors.
  try {
    if(p.response_type!=='code')throw oauthError('unsupported_response_type');
    if(p.resource!==config.resource)throw oauthError('invalid_target');
    if(p.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge||'')||!text(p.state,512))throw oauthError('invalid_request');
    return {client_id:client.client_id,client_name:client.name,redirect_uri:p.redirect_uri,resource:config.resource,scopes:parseScopes(p.scope),state:p.state,code_challenge:p.code_challenge};
  }catch(error){error.redirect=callback(p.redirect_uri,{error:error.oauthCode,state:text(p.state,512)?p.state:undefined,iss:config.issuer});throw error;}
}

export function callback(uri,values) {
  const url=new URL(uri);for(const [key,value] of Object.entries(values))if(value!==undefined)url.searchParams.set(key,value);return url.href;
}

export function seal(value,key,aad) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
export function unseal(value,key,aad) {
  try {
    if(typeof value!=='string'||value.length>20000||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error();
    const packed=Buffer.from(value,'base64url');if(packed.length<29||packed.toString('base64url')!==value)throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));decipher.setAuthTag(packed.subarray(12,28));decipher.setAAD(Buffer.from(aad));
    return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)),decipher.final()]).toString('utf8'));
  }catch{throw oauthError('invalid_request');}
}
export const grantAad=g=>JSON.stringify(['shapeviz-mcp-session-v1',g.id,g.owner_id,g.client_id,g.resource,g.scopes,g.source_session_id,g.expires_at]);
export const requestAad=config=>'shapeviz-mcp-consent-v1:'+config.issuer;
export function bindingCookie(value,config) {return `sv_oauth_binding=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${value?600:0}${config.secure?'; Secure':''}`;}
export function consentRequest(body,req,config,now=Date.now()) {
  const value=unseal(body.request,config.key,requestAad(config));
  const bindings=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('sv_oauth_binding='));
  const binding=bindings.length===1?bindings[0].slice('sv_oauth_binding='.length):'';
  if(!plain(value)||!Number.isSafeInteger(value.exp)||value.exp<=now||value.exp>now+600000||!/^[a-f0-9]{64}$/.test(value.binding_hash||'')||!binding||!timingSafeEqual(Buffer.from(hash(binding)),Buffer.from(value.binding_hash)))throw oauthError('invalid_request');
  const client=config.clients.find(item=>item.client_id===value.client_id);
  if(!client||client.name!==value.client_name||!redirectAllowed(client,value.redirect_uri)||value.resource!==config.resource||!/^[A-Za-z0-9_-]{43}$/.test(value.nonce||''))throw oauthError('invalid_request');
  value.scopes=parseScopes(value.scopes.join(' '));return value;
}

/** Claims are read ONLY after Supabase has verified this access token. */
export function sourceSession(token,user,env,now=Date.now()) {
  try {
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
    if(claims.sub!==user.id||claims.iss!==env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1'||claims.role!=='authenticated'||!(claims.aud==='authenticated'||Array.isArray(claims.aud)&&claims.aud.includes('authenticated'))||!uuid(claims.session_id)||!Number.isSafeInteger(claims.exp)||claims.exp*1000<=now+60000)throw new Error();
    return {source_session_id:claims.session_id,expires_at:new Date(Math.min(claims.exp*1000-30000,now+3600000)).toISOString()};
  }catch{throw fail(401,'Your session needs to be renewed. Sign in again before connecting.');}
}

export function authChallenge(config,error,scopes=SCOPES) {
  return `Bearer resource_metadata="${config.metadata}", scope="${scopes.join(' ')}"${error?`, error="${error}"`:''}`;
}
