import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {buildPresentationBundles} from '../scripts/lib/presentation-bundles.js';
import {getBundledPresentationSource} from '../src/presentations/bundled.js';
import {createPresentationPageHandler} from '../src/presentations/page.js';
import {newRecipientToken,recipientHash} from '../src/presentations/recipient-token.js';
import {signTracking,verifyTracking} from '../src/presentations/tracking-proof.js';

const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'fixture-secret'};
const project={deck_slug:'milenium',status:'published',access_mode:'unlisted',source_type:'standalone',source_bucket:'presentation-source',source_path:'private/index.html',updated_at:'2026-09-30T12:00:00Z',analytics_enabled:true};
const mediaUrl=env.SUPABASE_URL+'/storage/v1/object/public/presentation-media/fixture/photo.jpg';
const html=`<!doctype html><html><head></head><body><section class="slide active"><h1>Private client deck</h1><img src="${mediaUrl}"><img src="${mediaUrl}"></section></body></html>`;

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'shapeviz-bundle-'));
  await mkdir(path.join(root,'config'));
  await writeFile(path.join(root,'config/presentation-hosting.json'),JSON.stringify({bundledSlugs:['milenium']}));
  const calls=[];
  const send=async url=>{
    calls.push(url);
    if(url.includes('/presentation_projects?'))return Response.json([project]);
    if(url===mediaUrl)return new Response('fixture image bytes');
    if(url.includes('/storage/v1/object/authenticated/'))return new Response(html);
    throw new Error('Unexpected request');
  };
  const manifest=await buildPresentationBundles({root,env,send});
  return {root,manifest,calls,bundlesRoot:path.join(root,'build/presentation-bundles')};
}

test('selected deck bundles private HTML and unique hashed CDN assets without publishing its source',async()=>{
  const {root,manifest,calls,bundlesRoot}=await fixture();
  assert.deepEqual(Object.keys(manifest.presentations),['milenium']);
  assert.equal(calls.filter(url=>url===mediaUrl).length,1);
  const source=await getBundledPresentationSource(project,{bundlesRoot});
  assert.match(source,/\/presentation-media\/milenium\/[a-f0-9]{64}\.jpg/);
  assert.ok(!source.includes('supabase.co'));
  const files=await readdir(path.join(root,'dist/presentation-media/milenium'));
  assert.equal(files.length,1);assert.equal(path.extname(files[0]),'.jpg');
  assert.deepEqual(await readdir(path.join(root,'dist')),['presentation-media']);
  assert.equal(await getBundledPresentationSource({...project,deck_slug:'other'},{bundlesRoot}),null);
  assert.equal(await getBundledPresentationSource({...project,updated_at:'2026-10-01T12:00:00Z'},{bundlesRoot}),null);
  assert.equal(await getBundledPresentationSource({...project,source_path:'replacement.html'},{bundlesRoot}),null);
  await writeFile(path.join(bundlesRoot,manifest.presentations.milenium.file),'corrupt');
  assert.equal(await getBundledPresentationSource(project,{bundlesRoot}),null);
});

test('old URL and recipient links serve the bundle; revoked links and unpublished decks stay blocked',async()=>{
  const {bundlesRoot}=await fixture(),token=newRecipientToken();
  let current={...project},allowed=true,storageReads=0;
  const handler=createPresentationPageHandler({env,bundlesRoot,send:async(url,options)=>{
    if(url.includes('/presentation_projects?'))return Response.json([current]);
    if(url.endsWith('/rpc/crm_resolve_recipient')){
      assert.deepEqual(JSON.parse(options.body),{p_deck:'milenium',p_hash:recipientHash(token)});
      return Response.json(allowed);
    }
    if(url.includes('/storage/')){storageReads++;return new Response(html.replace('Private client deck','Updated remote deck'));}
    throw new Error('Unexpected runtime request');
  }});
  const server=http.createServer((req,res)=>{req.query={slug:'milenium'};return handler(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const gate=await fetch(origin+'/p/milenium?r='+token);
    assert.match(await gate.text(),new RegExp('tracking-gate&slug=milenium&r='+token));
    for(const suffix of ['?sv_gate=1','?sv_gate=1&r='+token]){
      const response=await fetch(origin+'/p/milenium'+suffix);
      assert.equal(response.status,200);assert.equal(response.headers.get('x-presentation-storage'),'vercel');
      assert.match(response.headers.get('content-security-policy'),/sandbox allow-scripts/);
      assert.match(await response.text(),/data-sv-src="\/presentation-media\/milenium\//);
    }
    assert.equal(storageReads,0);
    // Existing attributed visits still receive a signed proof for this recipient.
    const cookie=signTracking({kind:'classification',exclude:false,exp:Date.now()+60000},env.SUPABASE_SECRET_KEY);
    const attributed=await fetch(origin+'/p/milenium?r='+token,{headers:{Cookie:'sv_tracking='+cookie}});
    const body=await attributed.text(),config=JSON.parse(body.match(/window\.__shapevizTracking=(.*?);<\/script>/)[1]);
    assert.equal(verifyTracking(config.proof,env.SUPABASE_SECRET_KEY)?.recipient,recipientHash(token));
    allowed=false;
    assert.equal((await fetch(origin+'/p/milenium?sv_gate=1&r='+token)).status,404);
    current.status='draft';
    assert.equal((await fetch(origin+'/p/milenium?sv_gate=1')).status,404);
    current={...project,updated_at:'2026-10-01T00:00:00Z'};
    const updated=await fetch(origin+'/p/milenium?sv_gate=1');
    assert.equal(updated.headers.get('x-presentation-storage'),'supabase');
    assert.match(await updated.text(),/Updated remote deck/);assert.equal(storageReads,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('production build fails on missing credentials or an unavailable media file',async()=>{
  const {root}=await fixture();
  await assert.rejects(buildPresentationBundles({root,env:{VERCEL_ENV:'production'}}),/credentials/);
  await assert.rejects(buildPresentationBundles({root,env,send:async url=>{
    if(url.includes('/presentation_projects?'))return Response.json([project]);
    if(url===mediaUrl)return new Response(null,{status:404});
    return new Response(html);
  }}),/download failed/);
});
