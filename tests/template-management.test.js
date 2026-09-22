import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';

test('template deletion removes its source, preserves client media, and the last client removes all remaining files',async()=>{
 const prefix='uploads/owner/template-id/';
 const template={deck_slug:'template',client:'Template',title:'Pitch',is_template:true,status:'draft',source_type:'standalone',source_bucket:'presentation-source',source_path:'template/rev/index.html',content:{_storageScopes:[{bucket:'presentation-source',path:prefix+'source.html'},{bucket:'presentation-media',prefix}]}};
 const variant={deck_slug:'client',client:'Client',is_template:false,status:'published',source_type:'standalone',source_bucket:'presentation-source',source_path:'client/rev/index.html',content:{_storageScopes:[{bucket:'presentation-media',prefix}]}};
 const rows=new Map([[template.deck_slug,template],[variant.deck_slug,variant]]);
 const files=new Set(['presentation-source/'+prefix+'source.html','presentation-source/template/rev/index.html','presentation-source/client/rev/index.html','presentation-media/'+prefix+'image.png','presentation-media/'+prefix+'nested/video.mp4']);
 const removedRows=[];
 let failCleanup=false;
 const send=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):{};
  if(u.pathname==='/auth/v1/user')return Response.json({id:'owner'});
  if(u.pathname==='/rest/v1/presentation_admins')return Response.json([{role:'owner'}]);
  if(u.pathname==='/rest/v1/presentation_projects'){
   const filter=u.searchParams.get('deck_slug');
   if(filter.startsWith('neq.'))return Response.json([...rows.values()].filter(p=>p.deck_slug!==filter.slice(4)));
   const slug=filter.slice(3),row=rows.get(slug);
   if(options.method==='PATCH'){Object.assign(row,body);return new Response(null,{status:204});}
   if(options.method==='DELETE'){
    assert.ok(!files.has('presentation-source/'+row.source_path),'Registry must stay until its HTML is removed');
    rows.delete(slug);removedRows.push(slug);return new Response(null,{status:204});
   }
   return Response.json(row?[row]:[]);
  }
  if(u.pathname.startsWith('/storage/v1/object/list/')){
   const bucket=u.pathname.split('/').pop(),base=bucket+'/'+body.prefix,entries=new Map();
   for(const file of files){if(!file.startsWith(base))continue;const relative=file.slice(base.length),name=relative.split('/')[0];entries.set(name,{name,id:relative.includes('/')?null:name});}
   return Response.json([...entries.values()]);
  }
  if(options.method==='DELETE'&&u.pathname.startsWith('/storage/v1/object/')){
   if(failCleanup)return Response.json({error:'Unavailable'},{status:503});
   const bucket=u.pathname.split('/').pop();for(const path of body.prefixes)files.delete(bucket+'/'+path);
   return Response.json([]);
  }
  throw new Error('Unexpected request: '+url);
 };
 const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test'},send}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const post=(action,body)=>fetch(origin+'/?action='+action,{method:'POST',headers:{Origin:origin,Cookie:'sv_access=test','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('delete',{slug:'template',confirmSlug:'wrong'})).status,400);
  assert.equal(files.size,5);assert.equal(template.status,'draft');
  assert.equal((await post('update',{slug:'template',client:'Monthly pitch',title:'Monthly direction'})).status,200);
  assert.equal(template.client,'Monthly pitch');assert.equal(template.title,'Monthly direction');
  failCleanup=true;
  assert.equal((await post('delete',{slug:'template',confirmSlug:'template'})).status,502);
  assert.equal(rows.has('template'),true);assert.equal(template.status,'archived');assert.deepEqual(removedRows,[]);
  assert.equal((await post('variant',{template:'template',client:'New client'})).status,409);
  failCleanup=false;
  const deleted=await post('delete',{slug:'template',confirmSlug:'template'});
  assert.equal(deleted.status,200);assert.deepEqual(await deleted.json(),{ok:true,deletedFiles:2,sharedFiles:2});
  assert.deepEqual(removedRows,['template']);assert.equal(files.size,3);assert.equal(variant.status,'published');
  const last=await post('delete',{slug:'client',confirmSlug:'client'});
  assert.equal(last.status,200);assert.deepEqual(await last.json(),{ok:true,deletedFiles:3,sharedFiles:0});
  assert.equal(files.size,0);assert.equal(rows.size,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
