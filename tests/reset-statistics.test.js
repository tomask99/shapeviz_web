import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';

test('statistics reset requires confirmation and deletes only the selected deck sessions',async()=>{
 const writes=[];
 const send=async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});
  if(url.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
  if(options.method==='DELETE'){writes.push(url);return new Response(null,{status:204});}
  if(url.includes('deck_slug=eq.selected&'))return Response.json([{deck_slug:'selected'}]);
  return Response.json([]);
 };
 const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'},send}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const post=(body,cookie='sv_access=test')=>fetch(origin+'/?action=reset-statistics',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post({slug:'selected',confirmSlug:'selected'},'')).status,401);
  assert.equal((await post({slug:'selected',confirmSlug:'other'})).status,400);
  assert.equal((await post({slug:'missing',confirmSlug:'missing'})).status,404);
  assert.equal(writes.length,0);
  assert.equal((await post({slug:'selected',confirmSlug:'selected'})).status,200);
  assert.deepEqual(writes,['https://example.supabase.co/rest/v1/presentation_sessions?deck_slug=eq.selected']);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
