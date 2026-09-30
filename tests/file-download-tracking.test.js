import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createFilesHandler} from '../src/files/handler.js';
import {handleClientFiles} from '../src/files/admin.js';
import {parseTrackingLink} from '../src/files/admin-tracking.js';
import {indexFolder} from '../src/files/mega.js';
import {createDownloadTracker} from '../src/files/download-tracking.js';

const owner='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',portalId='33333333-3333-4333-8333-333333333333',trackerId='44444444-4444-4444-8444-444444444444';
const token='a'.repeat(32),linkToken='b'.repeat(32),origin='https://www.shapeviz.com';
const file={downloadId:['abcdefgh','model001'],name:'Sofa <oak>.png',size:20,key:Buffer.alloc(32)};
const other={...file,downloadId:['abcdefgh','model002'],name:'Other.fbx'};
const sub={downloadId:['abcdefgh','nested01'],name:'Great',directory:true,key:Buffer.alloc(16),children:[file]};
const folder={downloadId:['abcdefgh','folder01'],name:'3D models',directory:true,key:Buffer.alloc(16),children:[sub]};
const tree=()=>indexFolder({nodeId:'rootroot',name:'Milenium',directory:true,key:Buffer.alloc(16),children:[folder,other]});
const portal={id:portalId,company_id:company,owner_id:owner,source_version:1,slug:'sofas',title:'Sofas',active:true,public_token:token,mega_url:'https://mega.nz/folder/abcdefgh#'+'A'.repeat(22)};
const link={id:randomUUID(),portal_id:portalId,source_version:1,mega_node_id:file.downloadId[1],type:'file',token:linkToken,enabled:true,ancestor_ids:[]};
function fixture(){
  const trackers=[{id:trackerId,portal_id:portalId,company_id:company,owner_id:owner,source_version:1,mega_node_id:'folder01',active:true}];
  let writes=0;const recorded=new Set(),records=[];
  const store=async(path,options={})=>{
    if(path.startsWith('client_file_trackers'))return trackers;
    if(path.startsWith('client_file_links'))return link.enabled?[link]:[];
    if(path.startsWith('client_file_shares'))return portal.active?[portal]:[];
    if(path==='rpc/record_client_file_download'){
      const data=typeof options.body==='string'?JSON.parse(options.body):options.body;
      if(recorded.has(data.p_event_id))return 0;
      recorded.add(data.p_event_id);records.push(data);writes++;return 1;
    }
    throw new Error(path);
  };
  return {store,trackers,records,get writes(){return writes;}};
}
test('tracking link parser supports folder/portal links and rejects unsafe or incomplete links',()=>{
  const parsed=parseTrackingLink(origin+'/files/share/'+token+'?node=nested01',origin);
  assert.equal(parsed.params.get('node'),'nested01');assert.deepEqual(parsed.req.headers,{});
  assert.equal(parseTrackingLink(origin+'/files/sofas?node=folder01#access='+token,origin).req.headers['x-files-access'],token);
  for(const value of ['https://evil.test/files/share/'+token,'https://www.shapeviz.com.evil.test/files/share/'+token,'https://user@www.shapeviz.com/files/share/'+token,'https://mega.nz/folder/abcdefgh#key',origin+'/files/sofas',origin+'/files/share/'+token+'?node=../admin'])assert.throws(()=>parseTrackingLink(value,origin),{status:400});
});
test('completion is scoped, signed, expires, deduplicates retries, and counts descendants from direct file links',async()=>{
  const f=fixture();let now=Date.now();const tracker=createDownloadTracker({env:{SUPABASE_SECRET_KEY:'test-secret'},store:f.store,now:()=>now});
  const access={portal,folder:tree(),current:tree().nodes.get('model001')};
  const receipt=await tracker.issue(access);assert.equal(f.writes,0);
  assert.equal(await tracker.issue({...access,current:tree().nodes.get('model002')}),null);
  const req={headers:{origin,'content-type':'application/json'},body:{receipt},socket:{remoteAddress:'test'}};
  const params=new URLSearchParams({share:linkToken});
  assert.equal((await tracker.complete(req,params)).recorded,true);
  assert.equal((await tracker.complete(req,params)).recorded,false);
  assert.equal(f.writes,1);assert.deepEqual(f.records[0].p_targets,[{id:trackerId,path:'Great / Sofa <oak>.png'}]);
  await assert.rejects(tracker.complete({...req,body:{receipt:'X'+receipt}},params),{status:400});
  link.enabled=false;await assert.rejects(tracker.complete(req,params),{status:404});link.enabled=true;
  portal.source_version=2;await assert.rejects(tracker.complete(req,new URLSearchParams({portal:'sofas'})),{status:404});portal.source_version=1;
  now+=49*3600000;await assert.rejects(tracker.complete(req,params),{status:410});
});
test('HTTP browse and image previews never issue receipts; download completion requires same origin POST',async t=>{
  const f=fixture();const handler=createFilesHandler({env:{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'test-secret'},loadFolder:async()=>tree(),send:async(url,options)=>Response.json(await f.store(new URL(url).pathname.replace('/rest/v1/','')+new URL(url).search,options))});
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base='http://127.0.0.1:'+server.address().port;
  const endpoint=base+'/?share='+linkToken;
  for(const action of ['browse','preview']){const data=await (await fetch(endpoint+'&action='+action)).json();assert.equal(data.receipt,undefined);}
  const data=await (await fetch(endpoint+'&action=download')).json();assert.ok(data.receipt);assert.equal(f.writes,0);
  const url=endpoint+'&action=download-complete';
  assert.equal((await fetch(url)).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({receipt:data.receipt})})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({receipt:data.receipt})})).status,200);
  assert.equal(f.writes,1);
});
test('admin validates client ownership, folder type and idempotent tracking without replacing totals',async()=>{
  const f=fixture();let target=link.mega_node_id,created;
  const call=async(path,options={})=>{
    if(path.includes('crm_clients'))return [{company_id:company,crm_companies:{}}];
    if(path.includes('client_file_links'))return [{...link,mega_node_id:target,type:target==='folder01'?'folder':'file'}];
    if(path.includes('client_file_shares'))return [portal];
    if(options.method==='POST'){created=options.body;return [{id:trackerId,...created,total_downloads:0}];}
    if(path.includes('client_file_trackers'))return created?[{id:trackerId,...created,total_downloads:7}]:[];
    throw new Error(path);
  };
  const run=(body={})=>handleClientFiles({action:'client-file-tracking-add',body:{companyId:company,link:origin+'/files/share/'+linkToken,...body},url:new URL(origin+'/api/admin'),user:{id:owner},token:'owner-jwt',call,loadFolder:async()=>tree()});
  await assert.rejects(run(),{status:400});target='folder01';
  portal.company_id=owner;await assert.rejects(run(),{status:400});portal.company_id=company;
  const first=await run();assert.equal(first.item.folder_name,'3D models');assert.equal(created.owner_id,owner);
  const again=await run();assert.equal(again.existing,true);assert.equal(again.item.total_downloads,7);
});

test('Postgres lifetime totals are atomic, owner-only and survive renames, pause, source replacement and portal deletion',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema crm_private;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;create table public.presentation_admins(user_id uuid,role text);grant select on public.presentation_admins to authenticated;
      create table public.crm_companies(id uuid primary key,owner_id uuid,unique(id,owner_id));
      create table public.client_file_shares(id uuid primary key,company_id uuid,owner_id uuid,source_version integer,active boolean);grant all on public.client_file_shares to service_role;
      insert into public.crm_companies values('${company}','${owner}');insert into public.presentation_admins values('${owner}','owner');
      insert into public.client_file_shares values('${portalId}','${company}','${owner}',1,true);`);
    await db.exec(await readFile(new URL('../supabase/migrations/20260930165702_client_file_download_tracking.sql',import.meta.url),'utf8'));
    await db.exec(`set role service_role;insert into public.client_file_trackers(id,portal_id,company_id,owner_id,source_version,mega_node_id,folder_name,folder_path) values('${trackerId}','${portalId}','${company}','${owner}',1,'folder01','Models','Models');`);
    const event=randomUUID();const record=(id=event,name='Sofa.fbx')=>db.query(`select public.record_client_file_download($1,$2,1,'model001',$3,$4,now()+interval '48 hours') as n`,[id,portalId,name,JSON.stringify([{id:trackerId,path:'Great / '+name}])]);
    assert.equal((await record()).rows[0].n,1);assert.equal((await record()).rows[0].n,0);
    await Promise.all(Array.from({length:5},()=>record(randomUUID(),'Renamed.fbx')));
    assert.equal((await db.query('select download_count,file_name from public.client_file_download_counts')).rows[0].download_count,6);
    assert.equal((await db.query('select file_name from public.client_file_download_counts')).rows[0].file_name,'Renamed.fbx');
    await db.exec(`update public.client_file_trackers set active=false`);assert.equal((await record(randomUUID())).rows[0].n,0);
    await db.exec(`update public.client_file_trackers set active=true;delete from public.client_file_download_receipts`);
    assert.equal((await db.query('select total_downloads from public.client_file_trackers')).rows[0].total_downloads,6);
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${owner}'`);
    assert.equal((await db.query('select * from public.client_file_download_counts')).rows.length,1);
    await assert.rejects(db.exec('update public.client_file_download_counts set download_count=0'),/permission denied/);
    await assert.rejects(record(randomUUID()),/permission denied/);
    await db.exec(`set request.jwt.claim.sub='${company}'`);assert.equal((await db.query('select * from public.client_file_download_counts')).rows.length,0);
    await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from public.client_file_trackers'),/permission denied/);
    await db.exec(`reset role;update public.client_file_shares set source_version=2;set role service_role`);
    assert.equal((await record(randomUUID())).rows[0].n,0);
    await db.exec(`reset role;delete from public.client_file_shares`);
    const saved=(await db.query('select portal_id,total_downloads from public.client_file_trackers')).rows[0];assert.equal(saved.portal_id,null);assert.equal(saved.total_downloads,6);
    assert.equal((await db.query('select download_count from public.client_file_download_counts')).rows[0].download_count,6);
  }finally{await db.close();}
});
