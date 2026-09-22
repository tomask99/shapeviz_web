import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import path from 'node:path';
test.use({trace:'off',screenshot:'off'});
test('live auth, company/contact creation, WON save, filters and dashboard use real RLS',async({page})=>{
 test.skip(process.env.LIVE_CRM_TEST!=='true','Explicit opt-in: temporary test user and data, cleaned in finally');
 test.setTimeout(180000);process.loadEnvFile('.env');
 const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',PRESENTATIONS_REMOTE:'true'},email=`crm-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
 let user,token,server,deck,cloneSlug,origin;
 const request=async(path,{method='GET',body,jwt}={})=>{
  const r=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,...(jwt?{Authorization:`Bearer ${jwt}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new Error(`Live fixture ${method} ${path.split('?')[0]} failed: ${r.status}`);
  const raw=await r.text();return raw?JSON.parse(raw):null;
 };
 try{
  user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
  await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});token=auth.access_token;
  origin=process.env.LIVE_APP_ORIGIN;
  if(!origin){server=createApp({env:{...env,TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''},templatesRoot:path.resolve(import.meta.dirname,'../fixtures/presentation-templates')});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;}
  await page.goto(origin+'/admin/leads');await page.locator('#signin [name=email]').fill(email);await page.locator('#signin [name=password]').fill(password);await page.locator('#signin button').click();
  await page.locator('#crm .page-heading [data-add]').click();const form=page.locator('#lead-form');
  await form.getByLabel('Company name').fill('CRM isolated live fixture');await form.locator('[data-initial-contact] summary').click();await form.getByLabel('Contact name',{exact:true}).fill('Test contact');
  await form.getByLabel('Pipeline status').selectOption('WON');await form.locator('[data-won-fields] summary').click();await form.getByLabel('Won project value (EUR)').fill('1200,25');await form.getByLabel('Won date').fill('2026-09-22');await form.getByLabel('Won notes').fill('Isolated integration check');
  await form.getByRole('button',{name:'Save lead'}).click();await expect(page.locator('.crm-won-panel')).toContainText('Isolated integration check',{timeout:30000});
  await page.reload();await expect(page.locator('.crm-signals')).toContainText('NONE',{timeout:20000});await expect(page.locator('.crm-won-panel')).toContainText('2026-09-22');
  const companies=await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&select=id,won_project_value`,{jwt:token});expect(companies).toHaveLength(1);expect(Number(companies[0].won_project_value)).toBe(1200.25);
  const contacts=await request(`/rest/v1/crm_contacts?owner_id=eq.${user.id}&select=full_name,primary_contact`,{jwt:token});expect(contacts).toEqual([{full_name:'Test contact',primary_contact:true}]);
  const filtered=await request('/rest/v1/rpc/crm_list_companies',{method:'POST',jwt:token,body:{p_filters:{engagement:'NONE',pipeline_status:'WON'},p_page:1}});expect(filtered.total).toBe(1);
  const report=await request('/rest/v1/rpc/crm_business_overview',{method:'POST',jwt:token,body:{p_today:'2026-09-22T00:00:00Z',p_tomorrow:'2026-09-23T00:00:00Z'}});expect(Number(report.source_report[0].won_project)).toBe(1200.25);
  await page.screenshot({path:'.cache/crm-live.png',fullPage:true});
  if(server){
   // Phase 2A.1: the real Overview uses the same versioned task actions as Follow-ups.
   await request('/rest/v1/crm_followups',{method:'POST',jwt:token,body:{owner_id:user.id,company_id:companies[0].id,title:'Live Action Center task',due_at:new Date(Date.now()-3600000).toISOString()}});
   await page.goto(origin+'/admin');const actionCenter=page.locator('#action-center');await expect(actionCenter).toContainText('Live Action Center task',{timeout:20000});
   await actionCenter.getByRole('button',{name:'Edit / reschedule'}).click();const editor=page.locator('#action-followup-dialog');
   await editor.getByLabel('Title',{exact:false}).fill('Live rescheduled task');await editor.getByRole('button',{name:'Save follow-up'}).click();await expect(editor).toBeHidden();await expect(actionCenter).toContainText('Live rescheduled task');
   await actionCenter.getByRole('button',{name:'Mark complete'}).click();await expect(actionCenter).not.toContainText('Live rescheduled task');
   const finished=await request(`/rest/v1/crm_followups?owner_id=eq.${user.id}&select=completed_at,version`,{jwt:token});expect(finished[0].completed_at).toBeTruthy();expect(finished[0].version).toBe(3);
   const recent=page.locator('#recent-activity');await expect(recent).toContainText('Follow-up completed',{timeout:20000});await expect(recent).toContainText('Live rescheduled task');await expect(recent).not.toContainText('Contact added');
   const feedResponse=await page.request.get(origin+'/api/admin?action=crm-recent-activity');expect(feedResponse.status()).toBe(200);const feed=await feedResponse.json();expect(feed.items.every(item=>item.company_id===companies[0].id)).toBe(true);
   deck='crm-live-'+randomUUID();
   await request('/rest/v1/presentation_projects',{method:'POST',jwt:token,body:{deck_slug:deck,client:'Fixture',title:'Isolated fixture',presentation_date:'2026',description:'Fixture',locale:'en',status:'published',source_type:'template',template_key:'test-template',access_mode:'unlisted',analytics_enabled:true,content:{headline:'Live visit fixture',intro:'Test',opportunity:'Test',focus:'Test',cta:'Test'}}});
   await request('/rest/v1/crm_presentation_links',{method:'POST',jwt:token,body:{company_id:companies[0].id,owner_id:user.id,deck_slug:deck}});
   await request(`/rest/v1/crm_companies?id=eq.${companies[0].id}&owner_id=eq.${user.id}`,{method:'PATCH',jwt:token,body:{pipeline_status:'CONTACTED'}});
   await page.goto(origin+'/p/'+deck);expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(true);
   expect(await request(`/rest/v1/presentation_sessions?deck_slug=eq.${deck}&select=id`)).toEqual([]);
   // Phase 2A.4.1: private API -> opaque link -> gate -> attributed session -> revocation.
   const association=(await request(`/rest/v1/crm_presentation_links?deck_slug=eq.${deck}&select=id`,{jwt:token}))[0];
    await page.goto(origin+'/admin/leads/'+companies[0].id+'?tab=presentations');await page.getByRole('button',{name:'Share / recipients'}).click();
    const share=page.locator('#crm-share-dialog');await share.getByLabel('Recipient type').selectOption('adhoc');await share.getByLabel('Recipient name').fill('Private fixture recipient');await share.getByLabel('Email (optional)').fill('private@example.test');await share.getByRole('button',{name:'Generate tracked link'}).click();await expect(share.getByLabel('New tracked link')).toBeVisible();
    const linkURL=new URL(await share.getByLabel('New tracked link').inputValue());const recipient={url:linkURL.pathname+linkURL.search,item:(await request(`/rest/v1/crm_presentation_recipients?association_id=eq.${association.id}&select=id`,{jwt:token}))[0]};
    page.once('dialog',d=>d.accept());await share.getByRole('button',{name:'Mark recipient sent'}).click();await expect(share.getByRole('button',{name:'Mark recipient sent'})).toHaveCount(0);await share.getByRole('button',{name:'Show recipient analytics'}).click();await expect(share).toContainText('0 checked visits');
   await page.goto(origin+recipient.url);expect(await page.evaluate(()=>window.__shapevizTracking.exclude)).toBe(true);expect(await request(`/rest/v1/presentation_sessions?deck_slug=eq.${deck}&select=id`)).toEqual([]);
   const recipientContext=await page.context().browser().newContext();
   try{
    const recipientPage=await recipientContext.newPage(),recipientURL=new URL(recipient.url,origin);recipientURL.pathname+='/';
    await recipientPage.goto(recipientURL.href);await recipientPage.waitForURL(u=>u.searchParams.has('sv_gate')&&u.searchParams.get('r')===new URL(recipient.url,origin).searchParams.get('r'));await expect(recipientPage.getByRole('heading',{name:'Live visit fixture'})).toBeVisible();
    const config=await recipientPage.evaluate(()=>window.__shapevizTracking);expect(config.exclude).toBe(false);expect(JSON.stringify(config)).not.toContain('private@example.test');expect(await recipientPage.content()).not.toContain('Private fixture recipient');
    await expect.poll(async()=>{const rows=await request(`/rest/v1/presentation_sessions?recipient_id=eq.${recipient.item.id}&select=id,crm_verified`);return rows.some(r=>r.id===config.session&&r.crm_verified);},{timeout:20000}).toBe(true);
     await page.goto(origin+'/admin/leads/'+companies[0].id+'?tab=presentations');await page.getByRole('button',{name:'Share / recipients'}).click();await share.getByRole('button',{name:'Show recipient analytics'}).click();await expect(share).toContainText('1 checked visits');page.once('dialog',d=>d.accept());await share.getByRole('button',{name:'Revoke link'}).click();await expect(share).toContainText('Revoked');
    const late=await recipientPage.request.post(origin+'/api/presentation-events',{headers:{Origin:'null'},data:{deck,sessionId:config.session,eventId:randomUUID(),eventType:'session_heartbeat',activeSeconds:5,trackingProof:config.proof}});expect(late.headers()['x-analytics-status']).toBe('unavailable');
    const reopened=await recipientPage.goto(origin+recipient.url);expect(reopened.status()).toBe(404);
   }finally{await recipientContext.close();}
   const visitor=await page.context().browser().newContext();
   try{
    const visit=await visitor.newPage();await visit.goto(origin+'/p/'+deck);await visit.waitForURL('**?sv_gate=1');await expect(visit.getByRole('heading',{name:'Live visit fixture'})).toBeVisible();
    await expect.poll(async()=>{const s=await request(`/rest/v1/crm_company_signals?id=eq.${companies[0].id}&select=engagement`,{jwt:token});return s[0]?.engagement;},{timeout:20000}).toBe('ACTIVE');
    const rows=await request(`/rest/v1/crm_companies?id=eq.${companies[0].id}&select=pipeline_status`,{jwt:token});expect(rows[0].pipeline_status).toBe('PRESENTATION_VIEWED');
   }finally{await visitor.close();}
   await page.goto(origin+'/admin');await expect(page.locator('#recent-activity')).toContainText('First checked presentation visit',{timeout:20000});await expect(page.locator('#recent-activity')).toContainText('CONTACTED → PRESENTATION_VIEWED');
   cloneSlug=deck+'-v2';const clone=await page.request.post(origin+'/api/admin?action=clone-presentation',{headers:{Origin:origin},data:{companyId:companies[0].id,source:deck,slug:cloneSlug,title:'Live separate version'}});expect(clone.status()).toBe(200);const version=(await request(`/rest/v1/presentation_projects?deck_slug=eq.${cloneSlug}&select=parent_slug,status,source_path`))[0];expect(version.parent_slug).toBe(deck);expect(version.status).toBe('draft');expect(await request(`/rest/v1/presentation_sessions?deck_slug=eq.${cloneSlug}&select=id`)).toEqual([]);expect((await page.request.get(origin+'/p/'+cloneSlug)).status()).toBe(404);
   // Phase 2A.3: persisted state and the shared editor use the real API/RLS.
   await request(`/rest/v1/crm_companies?id=eq.${companies[0].id}`,{method:'PATCH',jwt:token,body:{pipeline_status:'REPLIED'}});
   await page.goto(origin+'/admin');const suggestions=page.locator('#crm-suggestions');await expect(suggestions).toContainText('Follow up on reply',{timeout:20000});
   await suggestions.getByRole('button',{name:'Snooze 24h'}).click();await expect(suggestions).toContainText('No suggestions right now');await page.reload();await expect(suggestions).toContainText('No suggestions right now');
   await suggestions.getByRole('button',{name:'Show snoozed / dismissed'}).click();await expect(suggestions).toContainText('Snoozed until');await suggestions.getByRole('button',{name:'Restore suggestion'}).click();await suggestions.getByRole('button',{name:'Show active suggestions'}).click();
   await suggestions.getByRole('button',{name:'Dismiss',exact:true}).click();await suggestions.getByRole('button',{name:'Show snoozed / dismissed'}).click();await expect(suggestions).toContainText('Dismissed until restored');await suggestions.getByRole('button',{name:'Restore suggestion'}).click();await suggestions.getByRole('button',{name:'Show active suggestions'}).click();
   await suggestions.getByRole('button',{name:'Create follow-up'}).click();await expect(editor.getByLabel('Title',{exact:false})).toHaveValue('Follow up on reply');await editor.getByLabel('Title',{exact:false}).fill('Live suggested follow-up');await editor.getByRole('button',{name:'Save follow-up'}).click();await expect(editor).toBeHidden();await expect(suggestions).toContainText('No suggestions right now');
   const created=await request(`/rest/v1/crm_followups?company_id=eq.${companies[0].id}&completed_at=is.null&select=title`,{jwt:token});expect(created).toEqual([{title:'Live suggested follow-up'}]);
   // Remaining Sales OS: actual browser -> API -> private database -> rendered response.
   await page.goto(origin+'/admin/leads/'+companies[0].id);
   await page.getByRole('button',{name:'+ Note',exact:true}).click();const quick=page.locator('#quick-note');await quick.getByLabel('Note',{exact:true}).fill('Live quick note');await quick.getByRole('button',{name:'Save note'}).click();await expect(quick).toBeHidden();await expect(page.locator('.crm-summary')).toContainText('Live quick note');
   await page.getByRole('button',{name:'Edit company'}).click();await form.getByLabel('Fit · manual').selectOption('HIGH');await form.getByLabel('Pipeline status').selectOption('WON');await form.getByRole('button',{name:'Save lead'}).click();
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Convert to client'}).click();await expect(page.locator('.crm-client')).toContainText('Active client.');
   await page.getByRole('button',{name:'Add project',exact:true}).click();const project=page.locator('#crm-project-dialog');await project.getByLabel('Project name').fill('Live retainer project');await project.getByLabel('Project status',{exact:true}).selectOption('ACTIVE');await project.getByLabel('One-time project value (EUR)').fill('0');await project.getByLabel('Monthly value (EUR)').fill('1500.25');await project.getByRole('button',{name:'Save project'}).click();await expect(project).toBeHidden();await expect(page.locator('.crm-client')).toContainText('Live retainer project');
   await page.goto(origin+'/admin/clients');await expect(page.locator('[data-client-results]')).toContainText('1 active projects');
   await page.keyboard.press('Control+k');const palette=page.locator('#crm-command');await palette.getByRole('searchbox').fill('Live retainer');await expect(palette).toContainText('Live retainer project');await palette.getByRole('button',{name:'Live retainer project · Project'}).click();await expect(page).toHaveURL(origin+'/admin/leads/'+companies[0].id);
   await page.goto(origin+'/admin/leads');await page.getByText('Filters & sorting',{exact:true}).click();await page.locator('#lead-filters').getByLabel('Fit · manual').selectOption('HIGH');page.once('dialog',d=>d.accept('Live high fit'));await page.getByRole('button',{name:'Save current view'}).click();const views=page.locator('#saved-views');await expect(views.getByRole('option',{name:'Live high fit',exact:true})).toHaveCount(1);const viewId=await views.getByRole('option',{name:'Live high fit',exact:true}).getAttribute('value');await views.getByLabel('Saved views',{exact:true}).selectOption(viewId);await expect(page).toHaveURL(/fit=HIGH/);await page.getByRole('button',{name:'Set default',exact:true}).click();await expect(views).toContainText('Live high fit · default');await page.goto(origin+'/admin/leads');await expect(page).toHaveURL(/fit=HIGH/);
   await page.getByRole('button',{name:'Import CSV',exact:true}).click();const csv=page.locator('#crm-import-dialog');await csv.getByLabel('CSV text',{exact:true}).fill('company_name\nCRM isolated live fixture\nImported Sales OS fixture');await csv.getByRole('button',{name:'Preview import'}).click();await expect(csv).toContainText('2 rows · 0 validation errors');await expect(csv).toContainText('Row 1 matches');page.once('dialog',d=>d.accept());await csv.getByRole('button',{name:'Confirm import'}).click();await expect(csv).toContainText('1 imported, 1 skipped duplicates');await csv.getByRole('button',{name:'Close',exact:true}).click();
   await page.goto(origin+'/admin/reports');await expect(page.locator('[data-report]')).toContainText('2 companies in cohort');await expect(page.locator('[data-report]')).toContainText('WON: 1');
   const values=await request(`/rest/v1/crm_projects?owner_id=eq.${user.id}&select=project_value,monthly_value`,{jwt:token});expect(Number(values[0].project_value)).toBe(0);expect(Number(values[0].monthly_value)).toBe(1500.25);
  }
 }finally{
  if(user?.id){
   if(cloneSlug){const rows=await request(`/rest/v1/presentation_projects?deck_slug=eq.${cloneSlug}&select=deck_slug`);if(rows.length){const removed=await page.request.post(origin+'/api/admin?action=delete',{headers:{Origin:origin},data:{slug:cloneSlug,confirmSlug:cloneSlug}});expect(removed.status()).toBe(200);}}
   if(deck)await request(`/rest/v1/presentation_projects?deck_slug=eq.${deck}`,{method:'DELETE'});
   await request(`/rest/v1/crm_followups?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request(`/rest/v1/crm_projects?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request(`/rest/v1/crm_clients?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request(`/rest/v1/crm_import_batches?owner_id=eq.${user.id}`,{method:'DELETE'});
   if(token)await request(`/rest/v1/crm_saved_views?owner_id=eq.${user.id}`,{method:'DELETE',jwt:token});
   if(token)await request(`/rest/v1/crm_notes?owner_id=eq.${user.id}`,{method:'DELETE',jwt:token});
   if(token)await request(`/rest/v1/crm_contacts?owner_id=eq.${user.id}`,{method:'DELETE',jwt:token});
   await request(`/rest/v1/crm_activities?owner_id=eq.${user.id}`,{method:'DELETE'});
   await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}`,{method:'DELETE'});
   if(token)await request('/auth/v1/logout',{method:'POST',jwt:token});
   await request('/auth/v1/admin/users/'+user.id,{method:'DELETE'});
  }
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
});
