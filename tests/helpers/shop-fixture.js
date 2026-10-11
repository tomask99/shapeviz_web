import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
export const sampleUrl='https://tomaskrajcovic.gumroad.com/l/jQHeN';
export async function shopFixture(){
 const db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../../supabase/migrations/20261011124216_shop_catalog.sql',import.meta.url),'utf8'));
 const send=async(input,options={})=>{
  const u=new URL(input),body=options.body?JSON.parse(options.body):{};
  if(u.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer owner'?Response.json({id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'}):options.headers.Authorization==='Bearer visitor'?Response.json({id:'visitor'}):Response.json({error:'Denied'},{status:401});
  if(u.pathname==='/rest/v1/presentation_admins')return Response.json(u.searchParams.get('user_id')==='eq.11111111-1111-4111-8111-111111111111'?[{role:'owner'}]:[]);
  if(u.pathname==='/rest/v1/shop_catalog'){
   if(options.method==='PATCH'){
    const version=Number(u.searchParams.get('version').slice(3));
    const fields=Object.keys(body);if(fields.some(k=>!['version','updated_at','launched','categories','products'].includes(k)))throw new Error('Unexpected field');
    const args=fields.map(k=>typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);args.push(version);
    return Response.json((await db.query(`update shop_catalog set ${fields.map((k,i)=>`${k}=$${i+1}`).join(',')} where id=1 and version=$${args.length} returning *`,args)).rows);
   }
   return Response.json((await db.query('select * from shop_catalog where id=1')).rows);
  }
  // Existing studio chrome makes unrelated read requests.
  if(u.pathname.includes('crm_time'))return Response.json({entries:[],items:[],timer:null,active:null});
  return Response.json([]);
 };
 const server=createApp({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test'},send});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const request=(action,body,role='owner')=>fetch(origin+'/api/admin?action='+action,{method:body?'POST':'GET',headers:{...(role?{Cookie:'sv_access='+role}:{}),...(body?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {db,origin,request,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();}};
}
