import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createFilesHandler} from '../src/files/handler.js';

const access='a'.repeat(32),share='b'.repeat(32);
async function fixture(t,{configured=true,delivery=true}={}) {
  const portal={id:randomUUID(),company_id:randomUUID(),owner_id:randomUUID(),slug:'milenium',title:'Milenium models',active:true,source_version:1,mega_url:'private-mega-source',public_token:access};
  const link={id:randomUUID(),token:share,portal_id:portal.id,mega_node_id:'folder01',type:'folder',source_version:1,ancestor_ids:[],enabled:true};
  const claims=new Map(),messages=[],calls=[];
  const env={SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'secret',...configured?{TELEGRAM_BOT_TOKEN:'bot-secret',TELEGRAM_CHAT_ID:'owner-chat'}:{}};
  const send=async(url,options)=>{
    if(url.startsWith('https://api.telegram.org/')){messages.push(JSON.parse(options.body));return Response.json({ok:delivery});}
    const u=new URL(url);calls.push({path:u.pathname,params:u.searchParams,options});
    assert.equal(options.headers.apikey,'secret');
    if(u.pathname.endsWith('/client_file_shares'))return Response.json(portal.active&&(u.searchParams.get('id')==='eq.'+portal.id||u.searchParams.get('public_token')==='eq.'+access)?[portal]:[]);
    if(u.pathname.endsWith('/client_file_links'))return Response.json(link.enabled?[link]:[]);
    if(u.pathname.endsWith('/crm_companies')){
      assert.equal(u.searchParams.get('id'),'eq.'+portal.company_id);assert.equal(u.searchParams.get('owner_id'),'eq.'+portal.owner_id);
      return Response.json([{company_name:'Milenium company'}]);
    }
    if(u.pathname.endsWith('/client_file_website_clicks')){
      assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=representation');
      const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['event_id','portal_id','source']);
      if(claims.has(body.event_id))return Response.json([]);
      claims.set(body.event_id,body);return Response.json([{event_id:body.event_id}]);
    }
    throw new Error('Unexpected request');
  };
  const loadFolder=async()=>{throw new Error('Website clicks must not depend on MEGA availability');};
  const servers=await Promise.all([0,1].map(async()=>{const server=createServer(createFilesHandler({env,send,loadFolder}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return 'http://127.0.0.1:'+server.address().port;}));
  const request=(params='portal=milenium',body={eventId:randomUUID(),source:'visual_studio'},headers={},server=0)=>fetch(servers[server]+'/?action=website-click&'+params,{method:'POST',headers:{Origin:servers[server],'Content-Type':'application/json','X-Files-Access':params.startsWith('portal=')?access:'',...headers},body:JSON.stringify(body)});
  return {portal,link,claims,messages,calls,request,servers};
}

test('Cloud storage clicks resolve the real company and claim concurrent retries across server instances once',async t=>{
  const f=await fixture(t),body={eventId:randomUUID(),source:'visual_studio'};
  const responses=await Promise.all([f.request(undefined,body),f.request(undefined,body,{},1)]);
  assert.deepEqual(responses.map(r=>r.headers.get('x-cloud-click-status')).sort(),['duplicate','notified']);
  assert.equal(f.claims.size,1);assert.equal(f.messages.length,1);
  const [message]=f.messages;assert.equal(message.chat_id,'owner-chat');
  assert.match(message.text,/shapeviz.com z Cloud storage/);assert.match(message.text,/Firma: Milenium company/);assert.match(message.text,/Cloud storage: Milenium models/);
  assert.match(message.text,/Visual studio/);assert.doesNotMatch(message.text,/private-mega|bot-secret|aaaaaaaa|bbbbbbbb/);
  assert.equal(message.parse_mode,undefined);assert.equal(message.link_preview_options.is_disabled,true);
  assert.equal((await f.request('share='+share,{eventId:randomUUID(),source:'logo'})).status,204);
  assert.match(f.messages[1].text,/Logo Shapeviz/);
});

test('untrusted, cross-origin, disabled and out-of-scope clicks never notify',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.servers[0]+'/?action=website-click&portal=milenium')).status,405);
  for(const [params,body,headers,status] of [
    ['portal=milenium',undefined,{Origin:'https://evil.example'},403],
    ['portal=milenium',undefined,{Origin:''},403],
    ['portal=milenium',undefined,{'Sec-Fetch-Site':'cross-site'},403],
    ['portal=milenium',undefined,{'Content-Type':'text/plain'},415],
    ['portal=milenium',undefined,{'X-Files-Access':'c'.repeat(32)},404],
    ['share='+share+'&node=rootroot',undefined,{},400],
    ['portal=milenium',{eventId:randomUUID(),source:'logo',company:'Spoofed'}, {},400],
    ['portal=milenium',{eventId:'invalid',source:'logo'},{},400],
    ['portal=milenium',{eventId:randomUUID(),source:'arbitrary'},{},400]
  ])assert.equal((await f.request(params,body,headers)).status,status);
  f.portal.active=false;assert.equal((await f.request()).status,404);f.portal.active=true;
  f.portal.source_version++;assert.equal((await f.request('share='+share)).status,404);f.portal.source_version--;
  f.link.ancestor_ids=[randomUUID()];assert.equal((await f.request('share='+share)).status,404);f.link.ancestor_ids=[];
  f.link.enabled=false;assert.equal((await f.request('share='+share)).status,404);
  assert.equal(f.claims.size,0);assert.equal(f.messages.length,0);
});

test('privacy, bots and unconfigured Telegram skip notification; uncertain deliveries are not repeated',async t=>{
  const f=await fixture(t,{delivery:false}),warn=console.warn,warnings=[];console.warn=message=>warnings.push(message);t.after(()=>{console.warn=warn;});
  for(const headers of [{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'preview crawler'}])assert.equal((await f.request(undefined,undefined,headers)).headers.get('x-cloud-click-status'),'ignored');
  assert.equal(f.calls.length,0);
  const body={eventId:randomUUID(),source:'logo'};
  assert.equal((await f.request(undefined,body)).headers.get('x-cloud-click-status'),'delivery-failed');
  assert.equal((await f.request(undefined,body)).headers.get('x-cloud-click-status'),'duplicate');
  assert.equal(f.messages.length,1);assert.deepEqual(warnings,['Telegram Cloud storage click notification failed']);
  const disabled=await fixture(t,{configured:false});assert.equal((await disabled.request()).headers.get('x-cloud-click-status'),'not-configured');assert.equal(disabled.claims.size,0);
});

test('click bursts are bounded and do not create an unbounded notification stream',async t=>{
  const f=await fixture(t,{configured:false});
  for(let i=0;i<30;i++)assert.equal((await f.request()).status,204);
  const response=await f.request();assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
});

test('click ledger is private, deduplicates events and is removed with its portal in Postgres',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.client_file_shares(id uuid primary key);');
    await db.exec(await readFile(new URL('../supabase/migrations/20260930145212_cloud_storage_website_clicks.sql',import.meta.url),'utf8'));
    const portal=randomUUID(),event=randomUUID();await db.query('insert into public.client_file_shares values ($1)',[portal]);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      for(const query of ['select * from public.client_file_website_clicks','insert into public.client_file_website_clicks default values','delete from public.client_file_website_clicks'])await assert.rejects(db.exec(query),/permission denied/);
      await db.exec('reset role');
    }
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.client_file_website_clicks'::regclass")).rows[0].relrowsecurity,true);
    await db.exec('set role service_role');
    const insert='insert into public.client_file_website_clicks(event_id,portal_id,source) values ($1,$2,$3) on conflict(event_id) do nothing returning event_id';
    assert.equal((await db.query(insert,[event,portal,'logo'])).rows.length,1);assert.equal((await db.query(insert,[event,portal,'visual_studio'])).rows.length,0);
    await assert.rejects(db.query(insert,[randomUUID(),portal,'bad']),/check constraint/);
    await db.exec('reset role');await db.query('delete from public.client_file_shares where id=$1',[portal]);
    assert.equal((await db.query('select * from public.client_file_website_clicks')).rows.length,0);
  }finally{await db.close();}
});
