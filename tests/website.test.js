import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createWebsiteEventHandler,referralSource} from '../src/website/events.js';
import {createAdminHandler} from '../src/admin/handler.js';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'123'};
async function serve(handler,run) {
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('website records independently, strips referral details and sends Telegram once per visit',async()=>{
 const ids=new Set(),messages=[],records=[];
 const send=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/rpc/record_website_visit')){records.push(body);const fresh=!ids.has(body.p_id);ids.add(body.p_id);return Response.json(fresh);}
  assert.match(url,/api.telegram.org/);messages.push(body);return Response.json({ok:true});
 };
 await serve(createWebsiteEventHandler({env,send}),async origin=>{
  const sessionId=randomUUID();
  const post=seconds=>fetch(origin,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','User-Agent':'iPhone Mobile'},body:JSON.stringify({sessionId,seconds,referrer:'https://example.org/private?secret=123'})});
  const responses=await Promise.all([post(0),post(0),post(15)]);
  assert.ok(responses.every(r=>r.status===204));assert.equal(messages.length,1);
  assert.match(messages[0].text,/Niekto otvoril tvoj web/);assert.match(messages[0].text,/iPhone/);
  assert.ok(records.every(r=>r.p_source==='example.org'));
  assert.doesNotMatch(JSON.stringify(records),/secret=|private|p_deck/);
 });
});
test('website rejects invalid origins, payloads and methods; respects privacy and bots',async()=>{
 await serve(createWebsiteEventHandler({env,send:()=>{throw new Error('No network expected');}}),async origin=>{
  const post=(body,headers={})=>fetch(origin,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(origin)).status,405);
  assert.equal((await post({}, {Origin:'null'})).status,403);
  assert.equal((await post({}, {Origin:'https://elsewhere.test'})).status,403);
  assert.equal((await post({})).status,400);
  assert.equal((await post({sessionId:randomUUID(),seconds:-1})).status,400);
  assert.equal((await post({}, {'Content-Type':'image/png'})).status,415);
  assert.equal((await post({value:'x'.repeat(5000)})).status,413);
  for(const headers of [{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'Googlebot'}])assert.equal((await post({},headers)).status,204);
 });
 assert.equal(referralSource('https://site.test/private?x=y','https://site.test'),'Direct / unknown');
 assert.equal(referralSource('javascript:alert(1)','https://site.test'),'Direct / unknown');
});
test('website stats require owner and validate period; tracking-status excludes verified owner',async()=>{
 let owner=false,calls=0;
 const send=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'test'});
  if(url.includes('/presentation_admins?'))return Response.json(owner ? [{role:'owner'}] : []);
  assert.ok(url.endsWith('/rpc/website_admin_stats'));assert.equal(JSON.parse(options.body).p_days,7);calls++;return Response.json({summary:{visits:3}});
 };
 await serve(createAdminHandler({env,send}),async origin=>{
  assert.equal((await fetch(origin+'?action=website-stats')).status,401);
  assert.deepEqual(await (await fetch(origin+'?action=tracking-status')).json(),{exclude:false});
  const headers={Cookie:'sv_access=test'};
  assert.equal((await fetch(origin+'?action=website-stats',{headers})).status,403);
  owner=true;
  assert.deepEqual(await (await fetch(origin+'?action=tracking-status',{headers})).json(),{exclude:true});
  assert.equal((await fetch(origin+'?action=website-stats&days=1',{headers})).status,400);
  assert.deepEqual(await (await fetch(origin+'?action=website-stats&days=7',{headers})).json(),{summary:{visits:3}});
  assert.equal(calls,1);
 });
});
