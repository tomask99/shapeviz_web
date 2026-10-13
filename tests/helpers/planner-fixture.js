import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',regular='33333333-3333-4333-8333-333333333333';
export async function plannerDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}'),('${regular}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.presentation_admins(user_id uuid primary key,role text);insert into public.presentation_admins values('${owner}','owner'),('${other}','owner');grant select on public.presentation_admins to authenticated;`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013215641_workspace_planner.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
 return db;
}
export async function plannerFixture(){
 const db=await plannerDatabase();let loseCreate=false,failSave=false,failList=false;
 // PostgREST returns SQL dates as YYYY-MM-DD; PGlite exposes them as JS Dates.
 const json=(data,status=200)=>new Response(JSON.stringify(data,(key,value)=>key==='planned_date'&&value?String(value).slice(0,10):value),{status,headers:{'Content-Type':'application/json'}});
 const send=async(url,options={})=>{
  const u=new URL(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  if(u.pathname==='/auth/v1/user')return json({id:owner,email:'owner@example.test'});
  if(u.pathname==='/rest/v1/presentation_admins')return json([{role:'owner'}]);
  if(u.pathname==='/rest/v1/rpc/crm_time_state')return json({timer:null});
  if(u.pathname!=='/rest/v1/workspace_planner')return json([]);
  if(failList&&method==='GET'){failList=false;return json({},503);}
  if(failSave&&method!=='GET'){failSave=false;return json({},503);}
  try{
   const where=[],params=[];
   for(const [key,value] of u.searchParams){
    if(!['id','owner_id','kind','planned_date','version'].includes(key))continue;
    if(value==='in.(note,checklist)'){where.push("kind in ('note','checklist')");continue;}
    const match=/^(eq|gte|lte)\.(.*)$/.exec(value);if(!match)throw Error('Unsupported filter');params.push(match[2]);where.push(`${key}${{eq:'=',gte:'>=',lte:'<='}[match[1]]}$${params.length}`);
   }
   const filter=where.length?' where '+where.join(' and '):'';
   if(method==='GET')return json((await db.query('select * from public.workspace_planner'+filter+' order by created_at desc,id limit '+Number(u.searchParams.get('limit')||1001),params)).rows);
   if(method==='DELETE')return json((await db.query('delete from public.workspace_planner'+filter+' returning *',params)).rows);
   const keys=Object.keys(body);if(keys.some(k=>!/^[a-z_]+$/.test(k)))throw Error('Invalid field');const values=keys.map(k=>k==='checklist'?JSON.stringify(body[k]):body[k]);
   if(method==='POST'){
    const result=(await db.query(`insert into public.workspace_planner(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(id) do nothing returning *`,values)).rows;
    if(loseCreate){loseCreate=false;return json({},502);}return json(result);
   }
   return json((await db.query(`update public.workspace_planner set ${keys.map((k,i)=>`${k}=$${params.length+i+1}`).join(',')}${filter} returning *`,[...params,...values])).rows);
  }catch(e){return json({code:e.code,message:e.message},e.code==='42501'?403:400);}
 };
 const server=createApp({env:{SUPABASE_URL:'https://fixture.example',SUPABASE_SECRET_KEY:'test'},send});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 return {db,origin,loseCreate(){loseCreate=true;},failSave(){failSave=true;},failList(){failList=true;},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();}};
}
