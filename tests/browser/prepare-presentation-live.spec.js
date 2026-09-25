import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';

test.use({trace:'off',screenshot:'off'});
test('prepared template fills the company, links once and tracks only non-admin visits',async({page,browser})=>{
 test.skip(process.env.LIVE_PREPARE_TEST!=='true','Opt-in isolated production fixture, removed in finally');
 test.setTimeout(180000);process.loadEnvFile('.env');
 const checkVisits=process.env.LIVE_PREPARE_TRACKING==='true',root='https://psqykqbewphchalfyrsp.supabase.co';
 let origin='https://shapevizweb.vercel.app',server,visitorContext;
 // Real Auth/Storage/CRM, with external notifications disabled for synthetic
 // visitor traffic. Production preparation can still be checked separately.
 if(checkVisits){
  const env={...process.env,VERCEL:'',SITE_URL:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',PRESENTATIONS_REMOTE:'true'};
  server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;env.SITE_URL=origin;
 }
 const template='prepare-fixture-'+randomUUID(),sourcePath=template+'/index.html',email='prepare-test-'+randomUUID()+'@example.test',password=randomUUID()+randomUUID();
 let user,jwt,company,prepared,requestBody;
 const sb=async(path,{method='GET',body,token,raw=false}={})=>{
  const response=await fetch(root+path,{method,headers:{apikey:process.env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+(token||process.env.SUPABASE_SECRET_KEY),'Content-Type':raw?'text/html':'application/json',Prefer:'return=representation'},...(body?{body:raw?body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Object.assign(new Error(`Fixture ${method} ${path.split('?')[0]}: ${response.status}`),{status:response.status});const text=await response.text();return text?JSON.parse(text):null;
 };
 const post=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
 try{
  user=await sb('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
  await sb('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  jwt=(await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}})).access_token;
  company=(await sb('/rest/v1/crm_companies',{method:'POST',token:jwt,body:{owner_id:user.id,company_name:'Prepare fixture Nábytok & Design',pipeline_status:'NEW_LEAD'}}))[0];
  await sb('/storage/v1/object/presentation-source/'+sourcePath,{method:'POST',raw:true,body:'<!doctype html><html><head><title>Preparation fixture</title></head><body><section class="slide"><h1 data-embed="client-name">Template</h1></section><script>window.setShapevizClientName=function(name){document.querySelector("h1").textContent=name}</script></body></html>'});
  await sb('/rest/v1/presentation_projects',{method:'POST',body:{deck_slug:template,client:'Preparation fixture',title:'Fixture pitch',presentation_date:'2026-09-23',description:'Temporary verification fixture',source_type:'standalone',source_bucket:'presentation-source',source_path:sourcePath,status:'draft',is_template:true,content:{_storageScopes:[]}}});
  expect((await post('login',{email,password})).status()).toBe(200);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(new URL(request.url()).searchParams.get('action')==='prepare-presentation'){requestBody=request.postDataJSON();prepared='pitch-'+requestBody.operationId;}});
  await page.goto(origin+'/admin/leads/'+company.id);
  await page.getByRole('button',{name:'Prepare presentation',exact:true}).click();const dialog=page.locator('#crm-prepare-presentation');
  await expect(dialog.getByLabel('Company',{exact:true})).toHaveValue(company.company_name);
  await dialog.getByLabel('Template',{exact:true}).selectOption(template);
  await dialog.getByRole('button',{name:'Prepare presentation',exact:true}).click();await expect(dialog).toBeHidden({timeout:60000});
  await expect(page.locator('#crm')).toContainText('Presentation ready');
  const row=(await sb('/rest/v1/crm_companies?id=eq.'+company.id+'&select=pipeline_status,version',{token:jwt}))[0];expect(row.pipeline_status).toBe('PRESENTATION_READY');
  const links=await sb('/rest/v1/crm_presentation_links?company_id=eq.'+company.id+'&select=deck_slug',{token:jwt});expect(links.map(l=>l.deck_slug)).toEqual([prepared]);
  expect((await post('prepare-presentation',requestBody)).status()).toBe(200);
  expect((await sb('/rest/v1/crm_companies?id=eq.'+company.id+'&select=version',{token:jwt}))[0].version).toBe(row.version);
  await page.goto(origin+'/p/'+prepared);await expect(page.locator('[data-embed=client-name]')).toHaveText(company.company_name);
  expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(true);
  const sessions=()=>sb('/rest/v1/presentation_sessions?deck_slug=eq.'+prepared+'&select=id,crm_verified');
  const currentStage=async()=>(await sb('/rest/v1/crm_companies?id=eq.'+company.id+'&select=pipeline_status',{token:jwt}))[0].pipeline_status;
  // The admin's tracker sends no start, slide, click or unload events.
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));
  expect(await sessions()).toEqual([]);expect(await currentStage()).toBe('PRESENTATION_READY');
  if(checkVisits){
   // Expired/missing classification cookie must recheck the actual login.
   await page.context().clearCookies({name:'sv_tracking'});await page.goto(origin+'/p/'+prepared);
   await page.waitForURL('**?sv_gate=1');await expect(page.locator('[data-embed=client-name]')).toHaveText(company.company_name);
   expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(true);expect(await sessions()).toEqual([]);expect(await currentStage()).toBe('PRESENTATION_READY');
   visitorContext=await browser.newContext();const visitor=await visitorContext.newPage();
   await visitor.goto(origin+'/p/'+prepared);await visitor.waitForURL('**?sv_gate=1');
   await expect(visitor.locator('[data-embed=client-name]')).toHaveText(company.company_name);
   expect(await visitor.evaluate(()=>window.__shapevizTracking.exclude)).toBe(false);
   await expect.poll(currentStage,{timeout:20000}).toBe('PRESENTATION_VIEWED');
   const counted=await sessions();expect(counted).toHaveLength(1);expect(counted[0].crm_verified).toBe(true);
   await visitorContext.close();visitorContext=null;
   await page.goto(origin+'/p/'+prepared);await expect(page.locator('[data-embed=client-name]')).toHaveText(company.company_name);
   expect(await sessions()).toHaveLength(1);expect(await currentStage()).toBe('PRESENTATION_VIEWED');
   // Viewing again must never push an already replied lead backwards.
   await sb('/rest/v1/crm_companies?id=eq.'+company.id,{method:'PATCH',token:jwt,body:{pipeline_status:'REPLIED'}});
   visitorContext=await browser.newContext();const returning=await visitorContext.newPage();await returning.goto(origin+'/p/'+prepared);
   await expect.poll(async()=>(await sessions()).length,{timeout:20000}).toBe(2);expect(await currentStage()).toBe('REPLIED');
   await visitorContext.close();visitorContext=null;
  }
  expect(errors).toEqual([]);console.info(`${checkVisits?'Real-database tracking':'Production preparation'} passed: published company deck, idempotent linking, admin excluded${checkVisits?', visitor counted and moved to Presentation viewed, later stages preserved':''}.`);
 }finally{
  const failures=[];
  await visitorContext?.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  // Exact fixture slugs and source objects only. These synthetic decks have no
  // shared media; cleanup is independent of other library records or UI auth.
  for(const slug of [prepared,template].filter(Boolean))try{
   const rows=await sb('/rest/v1/presentation_projects?deck_slug=eq.'+slug+'&select=source_path');
   if(rows.length){
    if(!rows[0].source_path.startsWith(slug+'/'))throw new Error('Unexpected fixture source path');
    await sb('/storage/v1/object/presentation-source',{method:'DELETE',body:{prefixes:[rows[0].source_path]}});
    await sb('/rest/v1/presentation_projects?deck_slug=eq.'+slug,{method:'DELETE'});
   }
  }catch(error){failures.push(error.message);}
  // Also handles a failed registry insertion after the fixture HTML upload.
  try{await sb('/storage/v1/object/presentation-source',{method:'DELETE',body:{prefixes:[sourcePath]}});}catch(error){failures.push(error.message);}
  if(jwt)try{await sb('/auth/v1/logout?scope=global',{method:'POST',token:jwt});}catch(error){if(![401,403].includes(error.status))failures.push(error.message);}
  if(user)for(const path of ['/rest/v1/crm_activities?owner_id=eq.'+user.id,'/rest/v1/crm_companies?owner_id=eq.'+user.id,'/rest/v1/presentation_admins?user_id=eq.'+user.id,'/auth/v1/admin/users/'+user.id])try{await sb(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
  if(failures.length)throw new Error(failures.join('; '));
 }
});
