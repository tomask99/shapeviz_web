import {test,expect} from '@playwright/test';
import {createApp} from '../../server.js';

test('real Supabase upload, finalize, publish and file cleanup',async({page})=>{
 test.skip(process.env.LIVE_SUPABASE_TEST!=='true','Explicit opt-in for live integration');
 process.loadEnvFile('.env');
 const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',PRESENTATIONS_REMOTE:'true'};
 const owner='00000000-0000-4000-8000-000000000001';
 const send=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:owner,email:'integration@example.com'});
  if(url.includes('/presentation_admins?'))return Response.json([{role:'owner'}]);
  return fetch(url,options);
 };
 const server=createApp({env,send});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`,slug=`upload-check-${Date.now()}`;
 const variant=slug+'-variant';let finalizedBody;
 page.on('request',r=>{if(r.url().endsWith('action=finalize'))finalizedBody=r.postDataJSON();});
 await page.context().addCookies([{name:'sv_access',value:'integration-only',url:origin}]);
 const api=async(action,body)=>page.evaluate(async({action,body})=>{const r=await fetch('/api/admin?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};},{action,body});
 try{
  await page.goto(origin+'/adminlogin');await page.locator('#upload-top').click();await page.locator('#create-from-upload').click();
  await page.locator('#html-file').setInputFiles({name:'test.html',mimeType:'text/html',buffer:Buffer.from('<!doctype html><title>Upload check</title><section class="slide"><h1 data-embed="client-name">Upload check</h1><audio src="data:audio/mpeg;base64,SUQzBAAAAAAA"></audio></section><script>window.setShapevizClientName=name=>document.querySelectorAll(\'[data-embed="client-name"]\').forEach(node=>node.textContent=name)</script>')});
  await page.locator('#upload-form [name=client]').fill('Upload check');await page.locator('#upload-form [name=title]').fill('Integration test');await page.locator('#upload-form [name=slug]').fill(slug);
  await page.locator('#upload-form button[type=submit]').click();
  await expect(page.locator('#upload-dialog')).not.toBeVisible({timeout:45000});
  await expect(page.locator('#projects')).toContainText(slug);
  const r=await page.request.get(origin+'/p/'+slug);expect(r.status()).toBe(200);expect(await r.text()).toContain('Upload check');
  const finalized=await api('finalize',finalizedBody);expect(finalized.status).toBe(200);
  expect((await api('update',{slug,isTemplate:true})).status).toBe(200);
  const created=await api('variant',{template:slug,slug:variant,client:'Variant check',title:'Variant check',publish:true});expect(created.status).toBe(201);
  const result=await api('delete',{slug,confirmSlug:slug});expect(result.status).toBe(200);expect(result.data.deletedFiles).toBe(2);expect(result.data.sharedFiles).toBe(1);
  const vr=await page.request.get(origin+'/p/'+variant);expect(vr.status()).toBe(200);
  const media=(await vr.text()).match(/https:\/\/[^" ]+\/presentation-media\/[^" ]+/)[0];
  expect((await page.request.get(media)).status()).toBe(200);
  const removed=await api('delete',{slug:variant,confirmSlug:variant});expect(removed.status).toBe(200);expect(removed.data.deletedFiles).toBe(2);
  expect((await page.request.get(origin+'/p/'+slug)).status()).toBe(404);
  // Query Storage itself, avoiding cached public asset responses after deletion.
  for(const [bucket,object] of [
   ['presentation-source',finalizedBody.object],
   ['presentation-source',finalized.data.project.source_path],
   ['presentation-source',created.data.project.source_path],
   ['presentation-media',finalizedBody.object]
  ]){
   const prefix=object.slice(0,object.lastIndexOf('/')+1);
   const listed=await fetch(env.SUPABASE_URL+'/storage/v1/object/list/'+bucket,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:100,offset:0})});
   expect(listed.status).toBe(200);expect(await listed.json()).toEqual([]);
  }
 }finally{
  await api('delete',{slug:variant,confirmSlug:variant}).catch(()=>{});
  await api('delete',{slug,confirmSlug:slug}).catch(()=>{});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
});
