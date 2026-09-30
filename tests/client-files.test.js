import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCipheriv } from 'node:crypto';
import { normalizeMegaFolder, indexFolder, createFolderLoader } from '../src/files/mega.js';
import { handleClientFiles } from '../src/files/admin.js';
import { createFilesHandler } from '../src/files/handler.js';
import { createApp } from '../server.js';

const owner='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const share='a'.repeat(32),mega='https://mega.nz/folder/abcdefgh#'+'A'.repeat(22);
const root={nodeId:'rootroot',name:'Models',directory:true,key:Buffer.alloc(16),children:[]};
const folder={downloadId:['abcdefgh','folder01'],name:'Sofas',directory:true,key:Buffer.alloc(16),children:[]};
const file={downloadId:['abcdefgh','model001'],name:'Sofa <oak>.fbx',size:123456,key:Buffer.alloc(32,1)};
root.children=[folder];folder.children=[file];
function fixture(options={}) {
  const calls=[];
  const call=async(path,opts={})=>{
    calls.push({path,...opts});assert.equal(opts.token,'user-jwt');
    if(path.includes('/crm_clients?'))return options.missing?[]:[{company_id:company,crm_companies:{archived_at:options.archived?'2026-09-30':null}}];
    if(['POST','PATCH','DELETE'].includes(opts.method))return options.conflict?[]:[{id,...opts.body}];
    if(path.includes('request_id='))return options.existing?[{id,title:'Existing'}]:[];
    return [];
  };
  const run=(action,body={})=>handleClientFiles({action,body:{companyId:company,...body},url:new URL('http://localhost/?companyId='+company),user:{id:owner},token:'user-jwt',call,loadFolder:async url=>{assert.equal(url,mega);calls.push({mega:true});if(options.badLink)throw Object.assign(new Error('Unavailable'),{status:502});return indexFolder(root);}});
  return {run,calls};
}
test('MEGA validation accepts full folder shares and rejects arbitrary hosts, credentials and subfolder ambiguity',()=>{
  assert.equal(normalizeMegaFolder(mega),mega);
  assert.equal(normalizeMegaFolder('https://mega.co.nz/#F!abcdefgh!'+'A'.repeat(22)),mega);
  for(const input of ['http://mega.nz/folder/abcdefgh#'+'A'.repeat(22),mega.replace('mega.nz','mega.nz.evil.test'),mega.replace('mega.nz','user@mega.nz'),mega+'/folder/other123',mega.replace('/folder/','/file/'),mega.split('#')[0],'https://127.0.0.1/admin','javascript:alert(1)',null])assert.throws(()=>normalizeMegaFolder(input),{status:400});
});
test('folder indexing contains only reachable nodes and rejects cycles or missing keys',()=>{
  const tree=indexFolder(root);assert.equal(tree.nodes.size,3);assert.equal(tree.nodes.get('model001').parent,'folder01');
  assert.throws(()=>indexFolder({...root,key:null}),{status:502});
  assert.throws(()=>indexFolder({...root,children:[root]}),{status:502});
});
test('fresh MEGA loads see additions, renames, moves and removals beyond a stale server snapshot',async()=>{
  // Exercise MEGAJS decoding with encrypted synthetic API nodes. MEGA's ca=1
  // response intentionally stays old while the live folder changes.
  function encrypt(mode,key,value) {
    const cipher=createCipheriv('aes-128-'+mode,key,mode==='cbc'?Buffer.alloc(16):null);
    cipher.setAutoPadding(false);return Buffer.concat([cipher.update(value),cipher.final()]).toString('base64url');
  }
  function node(h,p,name,directory=true) {
    const key=Buffer.alloc(directory?16:32,7),attributeKey=Buffer.from(key.subarray(0,16));
    if(!directory)for(let i=0;i<16;i++)attributeKey[i]^=key[i+16];
    const text=Buffer.from('MEGA'+JSON.stringify({n:name})),attributes=Buffer.alloc(Math.ceil(text.length/16)*16);
    text.copy(attributes);
    return {h,p,t:directory?1:0,s:directory?0:123,a:encrypt('cbc',attributeKey,attributes),k:'rootroot:'+encrypt('ecb',Buffer.alloc(16),key)};
  }
  const parent=node('rootroot',undefined,'Models'),original=node('folder01','rootroot','Architects');
  const snapshot=[parent,original,node('model001','folder01','Original.fbx',false)];
  let current=snapshot,calls=0;
  const load=createFolderLoader({send:async(url,options)=>{
    calls++;assert.equal(new URL(url).searchParams.get('n'),'abcdefgh');
    const [request]=JSON.parse(options.body);assert.equal(request.a,'f');
    return Response.json([{f:request.ca?snapshot:current}]);
  }});
  const first=await load(mega);
  assert.equal(first.nodes.size,3);assert.equal(first.nodes.get('model001').name,'Original.fbx');
  current=[parent,original,node('renders1','rootroot','02_RENDERS'),node('model001','renders1','Renamed.fbx',false)];
  assert.equal(await load(mega),first);assert.equal(calls,1);
  const changed=await load(mega,{fresh:true});
  assert.equal(changed.nodes.get('renders1')?.name,'02_RENDERS');
  assert.equal(changed.nodes.get('model001').name,'Renamed.fbx');
  assert.equal(changed.nodes.get('model001').parent,'renders1');
  current=[parent,node('renders1','rootroot','Final renders')];
  const removed=await load(mega,{fresh:true});
  assert.equal(removed.nodes.size,2);assert.equal(removed.nodes.get('renders1').name,'Final renders');
  assert.equal(removed.nodes.has('folder01'),false);assert.equal(removed.nodes.has('model001'),false);
  assert.equal(calls,3);
});
test('admin verifies ownership, validates MEGA before creating and retries idempotently',async()=>{
  const {run,calls}=fixture();const result=await run('client-files-save',{title:' Sofa models ',slug:'sofas',description:'Download files.',megaUrl:mega,requestId:id,owner_id:id});
  assert.equal(result.item.title,'Sofa models');assert.match(result.item.public_token,/^[\w-]{32}$/);
  const write=calls.at(-1);assert.equal(write.body.owner_id,owner);assert.equal(write.body.company_id,company);assert.ok(calls.find(c=>c.mega));assert.match(write.headers.Prefer,/ignore-duplicates/);
  const retry=fixture({existing:true});await retry.run('client-files-save',{title:'Models',slug:'sofas',megaUrl:mega,requestId:id});assert.ok(!retry.calls.some(c=>c.method==='POST'||c.mega));
  for(const options of [{missing:true},{archived:true},{badLink:true}])await assert.rejects(fixture(options).run('client-files-save',{title:'Models',slug:'sofas',megaUrl:mega,requestId:id}));
});
test('admin validates changed sources and slugs; status changes and revocation use scoped optimistic updates',async()=>{
  const {run,calls}=fixture();await run('client-files-status',{id,version:3,active:false,megaUrl:'bad',public_token:'spoof'});
  assert.deepEqual(calls.at(-1).body,{active:false});assert.match(calls.at(-1).path,/version=eq.3/);assert.ok(calls.at(-1).path.includes('owner_id=eq.'+owner));
  await assert.rejects(run('client-files-save',{id,version:4,title:'New title',slug:'sofas',megaUrl:'bad'}),{status:400});
  await run('client-files-save',{id,version:4,title:'New title',slug:'sofas',description:'',megaUrl:mega});assert.deepEqual(calls.at(-1).body,{title:'New title',slug:'sofas',description:'',mega_url:mega});
  for(const slug of ['share','Bad Slug','../admin','a--b'])await assert.rejects(run('client-files-save',{id,version:4,title:'Title',slug}),{status:400});
  await run('client-file-link-disable',{id,version:2,enabled:true});assert.deepEqual(calls.at(-1).body,{enabled:false});assert.match(calls.at(-1).path,/client_file_links/);
  await assert.rejects(run('client-files-status',{id,version:0,active:false}),{status:400});
  await assert.rejects(fixture({conflict:true}).run('client-files-status',{id,version:1,active:false}),{status:409});
});
async function serverFor(t,handler) {
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return 'http://127.0.0.1:'+server.address().port;
}

test('removing a portal requires confirmation, owner scope and the current version',async()=>{
  const {run,calls}=fixture();
  await assert.rejects(run('client-files-delete',{id,version:2}),{status:400});
  assert.ok(!calls.some(call=>call.method==='DELETE'));
  assert.deepEqual(await run('client-files-delete',{id,version:2,confirm:'delete',owner_id:id}),{deleted:true});
  const deletion=calls.at(-1);
  assert.equal(deletion.method,'DELETE');assert.match(deletion.path,/version=eq.2/);
  assert.ok(deletion.path.includes('company_id=eq.'+company));assert.ok(deletion.path.includes('owner_id=eq.'+owner));
  assert.equal(deletion.body,undefined);assert.ok(!calls.some(call=>call.mega));
  await assert.rejects(run('client-files-delete',{id,version:0,confirm:'delete'}),{status:400});
  for(const [options,status] of [[{missing:true},404],[{archived:true},409],[{conflict:true},409]])await assert.rejects(fixture(options).run('client-files-delete',{id,version:2,confirm:'delete'}),{status});
});
test('scoped links enforce live ancestry, private portal access, forwarding and revocation through HTTP',async t=>{
  const portal={id,company_id:company,owner_id:owner,slug:'sofas',public_token:share,active:true,source_version:1,title:'Sofa library',description:'Public description',mega_url:mega};
  const links=[];let tree=indexFolder(root),loaded=0;
  const matches=(row,params)=>[...params].every(([key,value])=>{
    if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
    if(value==='is.null')return row[key]==null;
    if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(row[key]);
    return true;
  });
  const handler=createFilesHandler({env:{SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'secret'},send:async(url,options)=>{
    assert.equal(options.headers.apikey,'secret');const u=new URL(url);
    if(options.method==='POST'){
      const record=JSON.parse(options.body),parent=links.find(item=>item.id===record.parent_id);
      const row={...record,id:crypto.randomUUID(),enabled:true,ancestor_ids:parent?[...parent.ancestor_ids,parent.id]:[]};links.push(row);return Response.json([row]);
    }
    return Response.json((u.pathname.endsWith('/client_file_links')?links:[portal]).filter(row=>matches(row,u.searchParams)));
  },loadFolder:async(_,options)=>{assert.equal(options.fresh,true);loaded++;return tree;}});
  const base=await serverFor(t,handler),endpoint=base+'/?portal=sofas';
  const request=(url,options={})=>fetch(url,{headers:{'X-Files-Access':share},...options});
  const response=await request(endpoint),data=await response.json();
  assert.equal(data.items[0].id,'folder01');assert.equal(data.current.id,'rootroot');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.doesNotMatch(JSON.stringify(data),/mega_url|downloadId|owner_id|public_token|"key"/);
  assert.equal((await fetch(endpoint)).status,404);
  assert.equal((await request(endpoint,{headers:{'X-Files-Access':'b'.repeat(32)}})).status,404);
  assert.equal((await request(endpoint+'&node=outside1')).status,404);
  assert.equal((await request(endpoint+'&page=0')).status,400);
  assert.equal((await request(endpoint+'&action=share')).status,405);
  assert.equal((await request(endpoint+'&action=share',{method:'POST',headers:{'X-Files-Access':share,Origin:'https://evil.test'}})).status,403);
  const create=async(url)=>{const res=await request(url+'&action=share',{method:'POST'});assert.equal(res.status,200);return (await res.json()).url.split('/').at(-1);};
  const folderToken=await create(endpoint+'&node=folder01');assert.match(folderToken,/^[\w-]{32}$/);assert.notEqual(folderToken,share);
  assert.equal(await create(endpoint+'&node=folder01'),folderToken);assert.equal(links.length,1);
  const scoped=base+'/?share='+folderToken;
  const scopeData=await(await fetch(scoped)).json();assert.equal(scopeData.current.parent,null);assert.equal(scopeData.breadcrumbs.length,1);assert.equal(scopeData.breadcrumbs[0].id,'folder01');assert.equal(scopeData.restricted,true);
  assert.doesNotMatch(JSON.stringify(scopeData),/rootroot|public_token|mega_url/);
  for(const action of ['browse','download','share','preview'])assert.equal((await fetch(scoped+'&node=rootroot&action='+action,{method:action==='share'?'POST':'GET'})).status,404);
  const forwarded=await(await fetch(scoped+'&node=model001&action=share',{method:'POST'})).json();
  const childToken=forwarded.url.split('/').at(-1),child=links.find(item=>item.token===childToken),parent=links[0];
  assert.equal(child.parent_id,parent.id);assert.deepEqual(child.ancestor_ids,[parent.id]);
  const exact=base+'/?share='+childToken,exactData=await(await fetch(exact)).json();
  assert.equal(exactData.current.name,file.name);assert.equal(exactData.current.parent,null);assert.equal(exactData.breadcrumbs.length,1);assert.equal(exactData.items.length,0);
  assert.equal((await fetch(exact+'&node=folder01')).status,404);
  const download=await(await fetch(exact+'&action=download')).json();assert.deepEqual(download.download.downloadId,file.downloadId);assert.equal(download.download.key,file.key.toString('base64url'));
  assert.equal((await fetch(exact+'&action=preview')).status,415);
  const model=tree.nodes.get('model001');model.name='Render.PNG';
  const preview=await(await fetch(exact+'&action=preview')).json();
  assert.equal(preview.file.name,'Render.PNG');assert.deepEqual(preview.download.downloadId,file.downloadId);
  assert.doesNotMatch(JSON.stringify(preview),/mega_url|owner_id|public_token|rootroot/);
  model.size=33*1024*1024;assert.equal((await fetch(exact+'&action=preview')).status,415);
  model.size=file.size;
  for(const name of ['Render.svg','Render.html','Render.constructor']){model.name=name;assert.equal((await fetch(exact+'&action=preview')).status,415);}
  model.name=file.name;
  const ownLink=await(await fetch(exact+'&action=share',{method:'POST'})).json();assert.equal(ownLink.url,forwarded.url);
  parent.enabled=false;const before=loaded;
  assert.equal((await fetch(exact+'&action=download')).status,404);assert.equal((await fetch(exact+'&action=preview')).status,404);assert.equal((await fetch(scoped)).status,404);assert.equal(loaded,before);
  parent.enabled=true;
  tree.nodes.get('model001').parent='rootroot';
  assert.equal((await fetch(exact)).status,404);assert.equal((await fetch(scoped+'&node=model001&action=download')).status,404);
  tree=indexFolder(root);tree.nodes.get('model001').name='Renamed.fbx';
  assert.equal((await(await fetch(exact)).json()).current.name,'Renamed.fbx');
  tree.nodes.delete('model001');assert.equal((await fetch(exact)).status,404);tree=indexFolder(root);
  portal.source_version++;assert.equal((await fetch(exact)).status,404);assert.equal((await fetch(scoped)).status,404);
  portal.active=false;assert.equal((await request(endpoint)).status,404);
});
test('file routes and browser vendor work locally without changing site CSP',async t=>{
  const app=createApp({env:{}});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
  const base='http://127.0.0.1:'+app.address().port;
  const page=await fetch(base+'/files/share/'+share);assert.equal(page.status,200);assert.match(await page.text(),/Copy collection link/);assert.match(page.headers.get('content-security-policy'),/https:\/\/\*\.mega\.co\.nz/);
  assert.equal((await fetch(base+'/files/sofas')).status,200);
  assert.equal(page.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await fetch(base+'/files/vendor/megajs.mjs')).status,200);assert.equal((await fetch(base+'/files/download-worker.js')).status,200);
  assert.doesNotMatch((await fetch(base+'/')).headers.get('content-security-policy'),/mega/);
  assert.equal((await fetch(base+'/api/files?share='+share)).status,503);
});
