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
  await page.goto(origin+'/adminlogin');await page.locator('#upload-top').click();
  await page.locator('#html-file').setInputFiles({name:'test.html',mimeType:'text/html',buffer:Buffer.from('<!doctype html><title>Upload check</title><section class="slide"><h1>Upload check</h1><audio src="data:audio/mpeg;base64,SUQzBAAAAAAA"></audio></section>')});
  await page.locator('#upload-form [name=client]').fill('Upload check');await page.locator('#upload-form [name=title]').fill('Integration test');await page.locator('#upload-form [name=slug]').fill(slug);
  await page.locator('#upload-form button[type=submit]').click();
  await expect(page.locator('#upload-dialog')).not.toBeVisible({timeout:45000});
  await expect(page.locator('#projects')).toContainText(slug);
  const r=await page.request.get(origin+'/p/'+slug);expect(r.status()).toBe(200);expect(await r.text()).toContain('Upload check');
  expect((await api('finalize',finalizedBody)).status).toBe(200);
  expect((await api('update',{slug,isTemplate:true,match:'Upload check'})).status).toBe(200);
  expect((await api('variant',{template:slug,slug:variant,client:'Variant check',title:'Variant check',publish:true})).status).toBe(201);
  const result=await api('delete',{slug,confirmSlug:slug});expect(result.status).toBe(200);expect(result.data.deletedFiles).toBe(2);expect(result.data.sharedFiles).toBe(1);
  const vr=await page.request.get(origin+'/p/'+variant);expect(vr.status()).toBe(200);
  const media=(await vr.text()).match(/https:\/\/[^" ]+\/presentation-media\/[^" ]+/)[0];
  expect((await page.request.get(media)).status()).toBe(200);
  const removed=await api('delete',{slug:variant,confirmSlug:variant});expect(removed.status).toBe(200);expect(removed.data.deletedFiles).toBe(2);
  expect((await page.request.get(origin+'/p/'+slug)).status()).toBe(404);
 }finally{
  await api('delete',{slug:variant,confirmSlug:variant}).catch(()=>{});
  await api('delete',{slug,confirmSlug:slug}).catch(()=>{});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
});
