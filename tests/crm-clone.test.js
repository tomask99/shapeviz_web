import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createAdminHandler} from '../src/admin/handler.js';
test('Company clone keeps old analytics, creates a draft parent relation and retries association only',async()=>{
 const owner='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'};
 const source={deck_slug:'source',client:'Client',title:'Pitch',source_type:'standalone',source_bucket:'presentation-source',source_path:'source/index.html',status:'published',is_template:false,content:{}};let saved,uploads=0,insertions=0,linkAttempts=0;
 const send=async(url,o={})=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});if(url.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
 if(url.includes('/crm_companies?'))return Response.json([{id:company,company_name:'Client'}]);
 if(url.includes('/crm_presentation_links?')&&url.includes('deck_slug=eq.source'))return Response.json([{id:'link'}]);
 if(url.includes('/crm_presentation_links')&&o.method==='POST'){linkAttempts++;return linkAttempts===1?Response.json({message:'Temporary problem'},{status:503}):Response.json([{id:'new-link'}]);}
 if(url.includes('deck_slug=eq.source-v2'))return Response.json(saved?[saved]:[]);if(url.includes('deck_slug=eq.source'))return Response.json([source]);
 if(url.includes('/object/authenticated/'))return new Response('<html><body><section class="slide">Original pitch</section></body></html>');
 if(url.includes('/storage/v1/object/')){uploads++;return new Response(null,{status:200});}
 if(url.endsWith('/rest/v1/presentation_projects')&&o.method==='POST'){insertions++;saved=JSON.parse(o.body);return Response.json([saved]);}
 throw new Error('Unexpected mock route');};
 const server=createServer(createAdminHandler({env,send}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{const clone=()=>fetch(origin+'/?action=clone-presentation',{method:'POST',headers:{Origin:origin,Cookie:'sv_access=test','Content-Type':'application/json'},body:JSON.stringify({companyId:company,source:'source',slug:'source-v2',title:'Pitch v2'})});assert.equal((await clone()).status,502);const r=await clone();assert.equal(r.status,200);assert.equal(saved.parent_slug,'source');assert.equal(saved.status,'draft');assert.equal(saved.content._cloneOwner,owner);assert.equal(uploads,1);assert.equal(insertions,1);assert.equal(linkAttempts,2);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
