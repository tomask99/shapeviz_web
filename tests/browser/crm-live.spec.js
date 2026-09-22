import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import path from 'node:path';
test.use({trace:'off',screenshot:'off'});
test('live auth, company/contact creation, WON save, filters and dashboard use real RLS',async({page})=>{
 test.skip(process.env.LIVE_CRM_TEST!=='true','Explicit opt-in: temporary test user and data, cleaned in finally');
 test.setTimeout(120000);process.loadEnvFile('.env');
 const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',PRESENTATIONS_REMOTE:'true'},email=`crm-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
 let user,token,server,deck;
 const request=async(path,{method='GET',body,jwt}={})=>{
  const r=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,...(jwt?{Authorization:`Bearer ${jwt}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new Error(`Live fixture ${method} ${path.split('?')[0]} failed: ${r.status}`);
  const raw=await r.text();return raw?JSON.parse(raw):null;
 };
 try{
  user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
  await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});token=auth.access_token;
  let origin=process.env.LIVE_APP_ORIGIN;
  if(!origin){server=createApp({env:{...env,TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''},templatesRoot:path.resolve(import.meta.dirname,'../fixtures/presentation-templates')});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;}
  await page.goto(origin+'/admin/leads');await page.locator('#signin [name=email]').fill(email);await page.locator('#signin [name=password]').fill(password);await page.locator('#signin button').click();
  await page.locator('#crm .page-heading [data-add]').click();const form=page.locator('#lead-form');
  await form.getByLabel('Company name').fill('CRM isolated live fixture');await form.locator('[data-initial-contact] summary').click();await form.getByLabel('Contact name',{exact:true}).fill('Test contact');
  await form.getByLabel('Pipeline status').selectOption('WON');await form.locator('[data-won-fields] summary').click();await form.getByLabel('Won project value (EUR)').fill('1200,25');await form.getByLabel('Won date').fill('2026-09-22');await form.getByLabel('Won notes').fill('Isolated integration check');
  await form.getByRole('button',{name:'Save lead'}).click();await expect(page.locator('.crm-won-panel')).toContainText('Isolated integration check',{timeout:30000});
  await page.reload();await expect(page.locator('.crm-signals')).toContainText('COLD',{timeout:20000});await expect(page.locator('.crm-won-panel')).toContainText('2026-09-22');
  const companies=await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&select=id,won_project_value`,{jwt:token});expect(companies).toHaveLength(1);expect(Number(companies[0].won_project_value)).toBe(1200.25);
  const contacts=await request(`/rest/v1/crm_contacts?owner_id=eq.${user.id}&select=full_name,primary_contact`,{jwt:token});expect(contacts).toEqual([{full_name:'Test contact',primary_contact:true}]);
  const filtered=await request('/rest/v1/rpc/crm_list_companies',{method:'POST',jwt:token,body:{p_filters:{engagement:'COLD',pipeline_status:'WON'},p_page:1}});expect(filtered.total).toBe(1);
  const report=await request('/rest/v1/rpc/crm_business_overview',{method:'POST',jwt:token,body:{p_today:'2026-09-22T00:00:00Z',p_tomorrow:'2026-09-23T00:00:00Z'}});expect(Number(report.source_report[0].won_project)).toBe(1200.25);
  await page.screenshot({path:'.cache/crm-live.png',fullPage:true});
  if(server){
   deck='crm-live-'+randomUUID();
   await request('/rest/v1/presentation_projects',{method:'POST',jwt:token,body:{deck_slug:deck,client:'Fixture',title:'Isolated fixture',presentation_date:'2026',description:'Fixture',locale:'en',status:'published',source_type:'template',template_key:'test-template',access_mode:'unlisted',analytics_enabled:true,content:{headline:'Live visit fixture',intro:'Test',opportunity:'Test',focus:'Test',cta:'Test'}}});
   await request('/rest/v1/crm_presentation_links',{method:'POST',jwt:token,body:{company_id:companies[0].id,owner_id:user.id,deck_slug:deck}});
   await request(`/rest/v1/crm_companies?id=eq.${companies[0].id}&owner_id=eq.${user.id}`,{method:'PATCH',jwt:token,body:{pipeline_status:'CONTACTED'}});
   await page.goto(origin+'/p/'+deck);expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(true);
   expect(await request(`/rest/v1/presentation_sessions?deck_slug=eq.${deck}&select=id`)).toEqual([]);
   const visitor=await page.context().browser().newContext();
   try{
    const visit=await visitor.newPage();await visit.goto(origin+'/p/'+deck);await visit.waitForURL('**?sv_gate=1');await expect(visit.getByRole('heading',{name:'Live visit fixture'})).toBeVisible();
    await expect.poll(async()=>{const s=await request(`/rest/v1/crm_company_signals?id=eq.${companies[0].id}&select=engagement`,{jwt:token});return s[0]?.engagement;},{timeout:20000}).toBe('ACTIVE');
    const rows=await request(`/rest/v1/crm_companies?id=eq.${companies[0].id}&select=pipeline_status`,{jwt:token});expect(rows[0].pipeline_status).toBe('PRESENTATION_VIEWED');
   }finally{await visitor.close();}
  }
 }finally{
  if(user?.id){
   if(deck)await request(`/rest/v1/presentation_projects?deck_slug=eq.${deck}`,{method:'DELETE'});
   if(token)await request(`/rest/v1/crm_contacts?owner_id=eq.${user.id}`,{method:'DELETE',jwt:token});
   await request(`/rest/v1/crm_activities?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request('/auth/v1/admin/users/'+user.id,{method:'DELETE'});
  }
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
});
