import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';
import {transformDeck} from '../src/admin/html.js';
import {parse} from 'parse5';

test('auth throttling keeps the session and forwards Retry-After without refreshing',async()=>{
 const urls=[];
 const send=async url=>{urls.push(url);return Response.json({error:'busy'},{status:429,headers:{'Retry-After':'5'}});};
 const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'},send}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const response=await fetch(`http://127.0.0.1:${server.address().port}/?action=me`,{headers:{Cookie:'sv_access=test; sv_refresh=test'}});
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'5');assert.equal(response.headers.get('Set-Cookie'),null);
  assert.equal(urls.length,1);assert.ok(urls[0].endsWith('/auth/v1/user'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('signed uploads enable idempotent replacement only under the verified owner path',async()=>{
 let signed;
 const send=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});
  if(url.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
  signed={url,options};return Response.json({url:'/signed'});
 };
 const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'},send}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try {
  const response=await fetch(origin+'/?action=sign-upload',{method:'POST',headers:{Origin:origin,Cookie:'sv_access=test','Content-Type':'application/json'},body:JSON.stringify({filename:'embedded-31.webp',uploadId:'00000000-0000-4000-8000-000000000001'})});
  assert.equal(response.status,200);assert.equal(signed.options.headers['x-upsert'],'true');
  assert.match(signed.url,/presentation-media\/uploads\/owner\/00000000-0000-4000-8000-000000000001\/embedded-31.webp$/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('variants change visible company text without modifying scripts, media URLs or injecting markup',()=>{
 const html='<html><head><title>MILENIUM</title></head><body><section class="slide"><h1>Milenium</h1><img src="https://example.com/MILENIUM.jpg" alt="Milenium"><script>const company="MILENIUM";</script></section></body></html>';
 const result=transformDeck(html,{from:'MILENIUM',company:'Hrno <img onerror=alert(1)>',slug:'hrno'});
 assert.equal(result.replacements,3);assert.equal(result.slides,1);
 assert.match(result.html,/Hrno &lt;img/);assert.match(result.html,/const company="MILENIUM"/);
 assert.match(result.html,/example.com\/MILENIUM.jpg/);
 const walk=node=>{assert.ok(!(node.attrs||[]).some(a=>a.name==='onerror'));(node.childNodes||[]).forEach(walk);};walk(parse(result.html));
 assert.match(result.html,/data-deck="hrno"/);
});
test('template match characters are treated literally',()=>{
 const result=transformDeck('<p>A+B [studio]</p>',{from:'A+B [studio]',company:'Hrno'});
 assert.equal(result.replacements,1);
});
test('admin requires verified user, owner role and same-origin writes',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'};
 let isOwner=false;
 const send=async url=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner-id',email:'owner@example.com'});if(url.includes('presentation_admins?'))return Response.json(isOwner?[{role:'owner'}]:[]);throw new Error('Unexpected call');};
 const server=createServer(createAdminHandler({env,send}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(origin+'/?action=me')).status,401);
  assert.equal((await fetch(origin+'/?action=me',{headers:{Cookie:'sv_access=test'}})).status,403);
  isOwner=true;const result=await fetch(origin+'/?action=me',{headers:{Cookie:'sv_access=test'}});assert.equal(result.status,200);assert.deepEqual(await result.json(),{email:'owner@example.com'});
  for(const badOrigin of ['null','https://attacker.example'])assert.equal((await fetch(origin+'/?action=update',{method:'POST',headers:{Origin:badOrigin,'Content-Type':'application/json',Cookie:'sv_access=test'},body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/?action=logout',{headers:{Cookie:'sv_access=test'}})).status,405);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('deletion requires confirmation and only removes the selected registry row',async()=>{
 const writes=[];const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test'};
 const send=async(url,options={})=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});if(url.includes('presentation_admins?'))return Response.json([{role:'owner'}]);if(options.method==='DELETE'){writes.push(url);return new Response(null,{status:204});}return Response.json([{deck_slug:'sample'}]);};
 const server=createServer(createAdminHandler({env,send}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const post=body=>fetch(origin+'/?action=delete',{method:'POST',headers:{Origin:origin,Cookie:'sv_access=test','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{assert.equal((await post({slug:'sample',confirmSlug:'wrong'})).status,400);assert.equal(writes.length,0);assert.equal((await post({slug:'sample',confirmSlug:'sample'})).status,200);assert.deepEqual(writes,['https://example.supabase.co/rest/v1/presentation_projects?deck_slug=eq.sample']);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
