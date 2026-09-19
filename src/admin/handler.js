import { randomUUID } from 'node:crypto';
import { readJson, requestOrigin } from '../http.js';
import { transformDeck } from './html.js';
import { getPrivatePresentationSource, uploadStorageObject, slugPattern } from '../presentations/remote.js';
import { renderPresentationTemplate } from '../presentations/page.js';

const fail = (status, message) => Object.assign(new Error(message), {status});
const fields = 'deck_slug,client,title,status,source_type,template_key,is_template,template_match,parent_slug,slide_count,analytics_enabled,updated_at';
const text = (value, max = 160) => typeof value === 'string' && value.trim().length && value.length <= max ? value.trim() : null;
const key = value => { if (!slugPattern.test(value || '') || value.length > 100) throw fail(400,'Use a URL name such as hrno or company-name.'); return value; };

export function createAdminHandler({env = process.env, send = fetch} = {}) {
  const root = env.SUPABASE_URL?.replace(/\/$/, '');
  async function call(url, {method='GET',body,token,headers={}} = {}) {
    const response = await send(`${root}${url}`, {method, headers:{apikey:env.SUPABASE_SECRET_KEY,...(token ? {Authorization:`Bearer ${token}`} : {}),...(body ? {'Content-Type':'application/json'} : {}),...headers}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(25_000)});
    const value = await response.text();
    let data; try {data = value ? JSON.parse(value) : null;} catch {data = null;}
    if (!response.ok) throw fail(response.status === 409 ? 409 : response.status === 429 ? 429 : 502, response.status === 409 ? 'This URL is already in use. Choose another name.' : 'The service could not complete this request. Please try again.');
    return data;
  }
  async function owner(user) {
    if (!user?.id) throw fail(401,'Please sign in.');
    const rows = await call(`/rest/v1/presentation_admins?user_id=eq.${encodeURIComponent(user.id)}&select=role`);
    if (rows?.[0]?.role !== 'owner') throw fail(403,'This account does not have admin access.');
    return user;
  }
  function cookies(res, session) {
    const secure = env.VERCEL || env.SITE_URL?.startsWith('https:') ? '; Secure' : '';
    res.setHeader('Set-Cookie', ['access','refresh'].map(name => `sv_${name}=${session?.[`${name}_token`] || ''}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${session ? 604800 : 0}${secure}`));
  }
  async function session(req,res) {
    const jar = Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)));
    let token = jar.sv_access, user;
    if (token) try {user=await call('/auth/v1/user',{token});} catch {}
    if (!user && jar.sv_refresh) {
      let refreshed;
      try {refreshed=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar.sv_refresh}});} catch {cookies(res,null);throw fail(401,'Your session expired. Please sign in again.');}
      user=refreshed.user;token=refreshed.access_token;
      await owner(user);cookies(res,refreshed);
    }
    await owner(user);
    return {user,token};
  }
  async function project(slug) {
    const rows=await call(`/rest/v1/presentation_projects?deck_slug=eq.${key(slug)}&select=*`);
    if (!rows?.[0]) throw fail(404,'Presentation not found.');
    return rows[0];
  }
  async function source(p) {return p.source_type === 'template' ? renderPresentationTemplate(p) : getPrivatePresentationSource(p,{env,send});}
  async function saveDeck(body, html, parent=null, sourcePath=null) {
    const slug=key(body.slug), client=text(body.client), title=text(body.title);
    if (!client || !title) throw fail(400,'Enter the company and presentation title.');
    const existing=await call(`/rest/v1/presentation_projects?deck_slug=eq.${slug}&select=deck_slug`);
    if (existing.length) throw fail(409,'This URL is already in use. Choose another name.');
    const prepared=transformDeck(html,{slug});
    const object=sourcePath || `${slug}/${randomUUID()}/index.html`;
    await uploadStorageObject({bucket:'presentation-source',object,body:prepared.html,contentType:'text/html',env,send});
    const status=body.isTemplate ? 'draft' : body.publish === true ? 'published' : 'draft';
    const record={deck_slug:slug,client,title,presentation_date:new Date().toISOString().slice(0,10),description:title,locale:'en',status,source_type:'standalone',source_bucket:'presentation-source',source_path:object,access_mode:'unlisted',analytics_enabled:true,slide_count:prepared.slides,is_template:body.isTemplate === true,template_match:body.isTemplate ? text(body.match) : null,parent_slug:parent,published_at:status==='published' ? new Date().toISOString() : null,content:{}};
    if(record.is_template && !record.template_match) throw fail(400,'Enter the company name to replace in this template.');
    const rows=await call('/rest/v1/presentation_projects',{method:'POST',body:record,headers:{Prefer:'return=representation'}});
    return {project:rows[0],url:`/p/${slug}`};
  }
  return async function admin(req,res) {
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if (!root || !env.SUPABASE_SECRET_KEY) throw fail(503,'Admin service is not configured.');
      if (!['GET','POST'].includes(req.method)) throw fail(405,'Method not allowed.');
      const origin=requestOrigin(req,env);
      if (req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site']==='cross-site') throw fail(403,'Request origin rejected.');
      if(req.method==='POST' && req.headers.origin !== origin) throw fail(403,'Request origin rejected.');
      const url=new URL(req.url,'http://localhost');
      const action=url.searchParams.get('action') || 'me';
      const readActions=['me','list','stats'];
      if(req.method==='GET' && !readActions.includes(action)) throw fail(405,'Use POST for this action.');
      if(req.method==='POST' && !/^application\/json\b/i.test(req.headers['content-type']||'')) throw fail(415,'JSON is required.');
      const body=req.method==='POST' ? await readJson(req,100_000) : {};
      if(action==='login' || action==='verify') {
        let auth;
        try {
          auth=action==='login' ? await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:text(body.email,254),password:typeof body.password==='string' ? body.password : ''}}) : await call('/auth/v1/verify',{method:'POST',body:{token_hash:text(body.tokenHash,512),type:'recovery'}});
        } catch(error) {throw fail(error.status===429 ? 429 : 401,'Sign-in failed. Check your details or setup link.');}
        await owner(auth.user);cookies(res,auth);reply(200,{email:auth.user.email});return;
      }
      const {user,token}=await session(req,res);
      if(action==='me') {reply(200,{email:user.email});return;}
      if(action==='logout') {await call('/auth/v1/logout',{method:'POST',token}).catch(()=>{});cookies(res,null);reply(200,{ok:true});return;}
      if(action==='password') {if(typeof body.password!=='string'||body.password.length<12||body.password.length>128) throw fail(400,'Use a password with 12–128 characters.');await call('/auth/v1/user',{method:'PUT',token,body:{password:body.password}});reply(200,{ok:true});return;}
      if(action==='list') {const projects=await call(`/rest/v1/presentation_projects?select=${fields}&order=updated_at.desc&limit=1000`);reply(200,{projects});return;}
      if(action==='stats') {const slug=url.searchParams.get('slug');const days=Number(url.searchParams.get('days')||30);if(![7,30,90].includes(days)) throw fail(400,'Invalid date range.');reply(200,await call('/rest/v1/rpc/presentation_admin_stats',{method:'POST',body:{p_slug:slug ? key(slug) : null,p_days:days}}));return;}
      if(action==='sign-upload') {
        const id=body.uploadId || randomUUID();if(!/^[a-f0-9-]{36}$/.test(id)) throw fail(400,'Invalid upload.');
        const filename=body.filename;
        if(!/^[a-zA-Z0-9_-]+\.(html|png|jpg|jpeg|webp|avif|gif|svg|mp4|webm|woff2|woff|css|js)$/.test(filename||'')) throw fail(400,'Unsupported file type.');
        const bucket=filename.endsWith('.html') ? 'presentation-source' : 'presentation-media';
        const object=`uploads/${user.id}/${id}/${filename}`;
        const signed=await call(`/storage/v1/object/upload/sign/${bucket}/${object}`,{method:'POST',body:{}});
        reply(200,{uploadId:id,object,bucket,url:`${root}/storage/v1${signed.url}`,publicUrl:`${root}/storage/v1/object/public/${bucket}/${object}`});return;
      }
      if(action==='finalize') {
        if(!/^uploads\/[a-f0-9-]+\/[a-f0-9-]{36}\/source\.html$/.test(body.object||'')||!body.object.startsWith(`uploads/${user.id}/`)) throw fail(400,'Invalid upload source.');
        const html=await getPrivatePresentationSource({source_bucket:'presentation-source',source_path:body.object},{env,send});
        reply(201,await saveDeck(body,html));return;
      }
      if(action==='variant' || action==='preview') {
        const original=await project(body.template);
        if(!original.is_template && original.source_type!=='template') throw fail(400,'Select a template first.');
        const company=text(body.client), from=text(body.match || original.template_match || original.client);
        if(!company||!from) throw fail(400,'Enter the original and new company names.');
        const transformed=transformDeck(await source(original),{from,company,slug:key(body.slug),analytics:false});
        if(!transformed.replacements) throw fail(400,'No matching company text was found. Check the original name.');
        if(action==='preview') reply(200,{...transformed,html:transformed.html.replace(/<base\b[^>]*>/gi,'')});
        else reply(201,await saveDeck({...body,isTemplate:false},transformed.html,original.deck_slug));
        return;
      }
      if(action==='delete') {
        const p=await project(body.slug);
        if(body.confirmSlug!==p.deck_slug) throw fail(400,'Confirm the presentation URL name before deleting.');
        // FK cascades remove this deck's sessions/events; variants retain their own HTML.
        await call(`/rest/v1/presentation_projects?deck_slug=eq.${p.deck_slug}`,{method:'DELETE'});
        // Media can be shared by independent variants, so retain their assets.
        reply(200,{ok:true});return;
      }
      if(action==='update') {
        const p=await project(body.slug), patch={};
        if(body.status!==undefined) {if(!['published','draft','archived'].includes(body.status)) throw fail(400,'Invalid status.');patch.status=body.status;}
        if(body.title!==undefined) {patch.title=text(body.title);if(!patch.title)throw fail(400,'Enter a title.');}
        if(body.isTemplate!==undefined) {patch.is_template=body.isTemplate===true;patch.template_match=patch.is_template ? text(body.match) : null;if(patch.is_template&&!patch.template_match)throw fail(400,'Enter a company name to replace.');}
        await call(`/rest/v1/presentation_projects?deck_slug=eq.${p.deck_slug}`,{method:'PATCH',body:patch});reply(200,{ok:true});return;
      }
      throw fail(404,'Unknown action.');
    } catch(error) {reply(error.status || 500,{error:error.status ? error.message : 'Something went wrong. Please try again.'});}
  };
}
