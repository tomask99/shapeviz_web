import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createApp} from '../../server.js';
import {firstArticle} from '../../src/articles/first-article.js';

export async function articlesFixture({seed=false,preview=false}={}) {
  const db=new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  const migration=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(name=>/_articles\.sql$/.test(name));
  await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
  let unavailable=false;
  const columns=new Set(['id','slug','title','excerpt','seo_title','seo_description','cover','content','status','version','created_at','updated_at','published_at']);
  const send=async(input,options={})=>{
    const url=new URL(input),method=options.method||'GET';
    if(url.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer owner'?Response.json({id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'}):options.headers.Authorization==='Bearer visitor'?Response.json({id:'visitor'}):Response.json({}, {status:401});
    if(url.pathname==='/rest/v1/presentation_admins')return Response.json(url.searchParams.get('user_id')==='eq.11111111-1111-4111-8111-111111111111'?[{role:'owner'}]:[]);
    if(url.pathname.startsWith('/storage/v1/object/upload/sign/article-images/'))return Response.json({url:url.pathname.replace('/storage/v1','')+'?token=test'});
    if(url.pathname==='/rest/v1/articles') {
      if(unavailable)return Response.json({error:'Offline'},{status:503});
      const values=[];const bind=value=>{values.push(typeof value==='object'&&value!==null?JSON.stringify(value):value);return '$'+values.length;};
      const body=options.body?JSON.parse(options.body):{};
      const entries=Object.entries(body);for(const [key]of entries)if(!columns.has(key))throw new Error('Unexpected column '+key);
      let statement;
      if(method==='POST')statement=`insert into articles (${entries.map(([key])=>key).join(',')}) values (${entries.map(([,value])=>bind(value)).join(',')})`;
      if(method==='PATCH')statement=`update articles set ${entries.map(([key,value])=>key+'='+bind(value)).join(',')}`;
      if(method==='DELETE')statement='delete from articles';
      if(method==='GET')statement='select * from articles';
      const filters=[];
      for(const [key,value]of url.searchParams){if(columns.has(key)){const dot=value.indexOf('.'),op=value.slice(0,dot);if(!['eq','lte'].includes(op))throw new Error('Unknown filter');filters.push(key+(op==='eq'?'=':'<=')+bind(value.slice(dot+1)));}}
      if(filters.length)statement+=' where '+filters.join(' and ');
      if(method==='GET')statement+=' order by published_at desc nulls last,id';else statement+=' returning *';
      try{return Response.json((await db.query(statement,values)).rows);}catch(error){if(error.code==='23505')return Response.json({code:error.code},{status:409});throw error;}
    }
    if(url.pathname==='/rest/v1/site_content')return Response.json([{companies:[],version:1,gallery:null,gallery_version:1}]);
    if(url.pathname.includes('crm_time'))return Response.json({entries:[],items:[],timer:null,active:null});
    return Response.json([]);
  };
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test',...(preview?{VERCEL_ENV:'preview'}:{})};
  const server=createApp({env,send});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(action,body,role='owner',params={})=>fetch(origin+'/api/admin?'+new URLSearchParams({action,...params}),{method:body?'POST':'GET',headers:{...(role?{Cookie:'sv_access='+role}:{}),...(body?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(seed){const response=await request('articles-save',firstArticle);if(!response.ok)throw new Error(await response.text());}
  return {db,origin,env,request,setUnavailable:value=>{unavailable=value;},close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}};
}
