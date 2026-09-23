import {configuration,SCOPES,authorization,parameters,plain,oauthError,randomSecret,hash,challenge,seal,unseal,requestAad,grantAad,bindingCookie,authChallenge,redirectAllowed} from './domain.js';
import {readJson} from '../http.js';
import {handleReadMcp, mcpHttpError} from '../tools/mcp.js';
import {uuid} from '../crm/validation.js';

export const OAUTH_ROUTES=Object.freeze({'/oauth/authorize':'authorize','/oauth/token':'token','/oauth/revoke':'revoke','/.well-known/oauth-authorization-server':'metadata','/.well-known/oauth-protected-resource':'resource','/.well-known/oauth-protected-resource/api/mcp':'resource','/api/mcp':'mcp'});

async function readForm(req) {
  if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(req.headers['content-type']||''))throw oauthError('invalid_request',415);
  let raw=req.body;
  if(raw===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>8192)throw oauthError('invalid_request',413);chunks.push(Buffer.from(chunk));}raw=Buffer.concat(chunks).toString('utf8');}
  if(plain(raw)){if(Object.values(raw).some(v=>typeof v!=='string'))throw oauthError('invalid_request');raw=new URLSearchParams(raw).toString();}
  if(Buffer.isBuffer(raw))raw=raw.toString('utf8');
  if(typeof raw!=='string'||Buffer.byteLength(raw)>8192)throw oauthError('invalid_request',413);
  return new URLSearchParams(raw);
}

export function createOAuthHandler({env=process.env,send=fetch,endpoint,audit}={}) {
  const call=async(path,{method='GET',body,token}={})=>{
    const response=await send(env.SUPABASE_URL.replace(/\/$/,'')+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw oauthError(response.status===401||response.status===403?'invalid_token':'temporarily_unavailable',response.status===401||response.status===403?401:503);
    return response.json();
  };
  const rpc=(name,body)=>call('/rest/v1/rpc/crm_mcp_oauth_'+name,{method:'POST',body});
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    let kind,config;
    try {
      const url=new URL(req.url,'http://localhost');kind=endpoint||OAUTH_ROUTES[url.pathname];config=configuration(env);
      if(!kind)throw oauthError('invalid_request',404);
      if(kind!=='authorize'){
        if(url.search)throw oauthError('invalid_request');
        if(req.headers.origin){
          const origins=[config.issuer,...config.clients.flatMap(client=>client.redirect_uris.map(uri=>new URL(uri).origin))];
          if(!origins.includes(req.headers.origin))throw oauthError('access_denied',403);
          res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Protocol-Version');
        }
        if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':kind==='resource'||kind==='metadata'?'GET, OPTIONS':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, MCP-Protocol-Version, Accept'});res.end();return;}
      }
      const method=['authorize','metadata','resource'].includes(kind)?'GET':'POST';
      if(req.method!==method){res.setHeader('Allow',method);throw oauthError('invalid_request',405);}
      if(kind==='metadata'){reply(200,{issuer:config.issuer,authorization_endpoint:config.issuer+'/oauth/authorize',token_endpoint:config.issuer+'/oauth/token',revocation_endpoint:config.issuer+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:SCOPES,authorization_response_iss_parameter_supported:true});return;}
      if(kind==='resource'){reply(200,{resource:config.resource,authorization_servers:[config.issuer],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'Shapeviz CRM and Research'});return;}
      if(kind==='authorize'){
        if(req.url.length>8192)throw oauthError('invalid_request',413);
        const request=authorization(url.searchParams,config),binding=randomSecret();
        const sealed=seal({...request,nonce:randomSecret(),binding_hash:hash(binding),exp:Date.now()+600000},config.key,requestAad(config));
        res.setHeader('Set-Cookie',bindingCookie(binding,config));res.writeHead(302,{Location:config.issuer+'/admin/connections#request='+sealed});res.end();return;
      }
      if(kind==='token'||kind==='revoke'){
        if(req.headers.authorization)throw oauthError('invalid_client',401);
        const params=parameters(await readForm(req),kind==='token'?['grant_type','code','code_verifier','client_id','redirect_uri','resource']:['token','token_type_hint','client_id']);
        const client=config.clients.find(item=>item.client_id===params.client_id);if(!client)throw oauthError('invalid_client');
        if(kind==='revoke'){
          if(!params.token||params.token.length>512)throw oauthError('invalid_request');
          if(params.token_type_hint&&!['access_token','refresh_token'].includes(params.token_type_hint))throw oauthError('unsupported_token_type');
          await rpc('revoke',{p_owner:null,p_grant:null,p_token_hash:hash(params.token),p_client_id:client.client_id});reply(200,{});return;
        }
        if(params.grant_type!=='authorization_code')throw oauthError('unsupported_grant_type');
        if(params.resource!==config.resource)throw oauthError('invalid_target');
        if(!redirectAllowed(client,params.redirect_uri)||!/^sv_code_[A-Za-z0-9_-]{43}$/.test(params.code||'')||!/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier||''))throw oauthError('invalid_grant');
        const token='sv_mcp_'+randomSecret();
        const result=await rpc('exchange',{p_code_hash:hash(params.code),p_challenge:challenge(params.code_verifier),p_client_id:client.client_id,p_redirect_uri:params.redirect_uri,p_resource:config.resource,p_token_hash:hash(token)});
        if(result?.error)throw oauthError('invalid_grant');
        if(!Array.isArray(result?.scopes)||!result.scopes.length||result.scopes.some(scope=>!SCOPES.includes(scope))||!Number.isFinite(Date.parse(result.expires_at)))throw oauthError('temporarily_unavailable',503);
        const expires=Math.floor((Date.parse(result.expires_at)-Date.now())/1000);if(expires<=0)throw oauthError('invalid_grant');
        reply(200,{access_token:token,token_type:'Bearer',expires_in:expires,scope:result.scopes.join(' ')});return;
      }
      if(kind==='mcp'){
        const match=/^Bearer +(sv_mcp_[A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization||'');if(!match)throw oauthError('invalid_token',401);
        const grant=await rpc('resolve',{p_token_hash:hash(match[1]),p_resource:config.resource});
        if(!grant||!uuid(grant.id)||!uuid(grant.owner_id)||!uuid(grant.source_session_id)||grant.resource!==config.resource||!config.clients.some(client=>client.client_id===grant.client_id)||!Array.isArray(grant.scopes)||!grant.scopes.length||grant.scopes.some(scope=>!SCOPES.includes(scope))||!Number.isFinite(Date.parse(grant.expires_at))||Date.parse(grant.expires_at)<=Date.now())throw oauthError('invalid_token',401);
        // PostgreSQL normalizes timestamp formatting. Canonicalize the expiry
        // used as authenticated encryption context before decrypting the JWT.
        grant.expires_at=new Date(grant.expires_at).toISOString();
        let source;try{source=unseal(grant.encrypted_session,config.key,grantAad(grant));}catch{throw oauthError('invalid_token',401);}
        if(typeof source?.token!=='string')throw oauthError('invalid_token',401);
        const user=await call('/auth/v1/user',{token:source.token});if(user?.id!==grant.owner_id)throw oauthError('invalid_token',401);
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw oauthError('invalid_request',415);
        let body;try{body=await readJson(req,16384);}catch(error){throw oauthError('invalid_request',error.status===413?413:400);}
        await handleReadMcp({req,res,body,url,user,token:source.token,scopes:grant.scopes,call,audit,oauth:{challenge:(error,scopes)=>authChallenge(config,error,scopes)}});return;
      }
    }catch(error){
      if(res.headersSent)return;
      if(error.redirect){res.writeHead(302,{Location:error.redirect});res.end();return;}
      const status=error.oauthCode?error.status:503;
      if(kind==='mcp'){
        if(config&&[401,403].includes(status))res.setHeader('WWW-Authenticate',authChallenge(config,status===401?'invalid_token':'insufficient_scope'));
        mcpHttpError(res,{status,message:status===401?'Authentication required.':status===403?'Access denied.':'The MCP request could not be completed.'});return;
      }
      reply(status,{error:error.oauthCode||'temporarily_unavailable'});
    }
  };
}
