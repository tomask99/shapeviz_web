import {test,expect} from '@playwright/test';
import {createApp} from '../../server.js';
import path from 'node:path';
for(const scenario of ['owner','visitor','outage'])test(`presentation gate classifies ${scenario} before tracking`,async({browser})=>{
 const writes=[];let verified=0;
 const server=createApp({templatesRoot:path.resolve(import.meta.dirname,'../fixtures/presentation-templates'),env:{PRESENTATIONS_REMOTE:'true',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test'},send:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return scenario==='outage'?Response.json({message:'Unavailable'},{status:503}):Response.json({id:'owner'});
  if(url.includes('/presentation_admins?'))return Response.json([{role:'owner'}]);
  if(url.includes('/presentation_projects?'))return Response.json([{deck_slug:'gate-test',source_type:'template',template_key:'test-template',client:'Test',title:'Test',presentation_date:'2026',description:'Test',locale:'en',status:'published',access_mode:'unlisted',analytics_enabled:true,content:{headline:'Gate fixture',intro:'Test',opportunity:'Test',focus:'Test',cta:'Test'}}]);
  if(url.endsWith('/rpc/record_presentation_event')){writes.push(JSON.parse(options.body));return new Response(null,{status:204});}
  if(url.endsWith('/rpc/crm_record_verified_visit')){verified++;return new Response(null,{status:204});}
  throw new Error('Unexpected request');
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext();
 try{
  if(scenario!=='visitor')await context.addCookies([{name:'sv_access',value:'test',domain:'127.0.0.1',path:'/api/admin',httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();await page.goto(origin+'/p/gate-test');await page.waitForURL('**/p/gate-test?sv_gate=1');await expect(page.getByRole('heading',{name:'Gate fixture'})).toBeVisible();
  expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(scenario!=='visitor');
  if(scenario==='visitor'){await expect.poll(()=>writes.length).toBeGreaterThan(0);await expect.poll(()=>verified).toBeGreaterThan(0);}
  else{await page.evaluate(()=>dispatchEvent(new Event('pagehide')));expect(writes).toHaveLength(0);expect(verified).toBe(0);}
 }finally{await context.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
