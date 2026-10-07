import {test,expect} from '@playwright/test';
import {createApp} from '../../server.js';
import {timeDatabase,owner,company,project} from '../helpers/time-database.js';
import {randomUUID} from 'node:crypto';

// Real browser -> admin HTTP/auth/validation -> migrated Postgres (PGlite).
// Only the upstream Supabase transport is adapted to the isolated SQL fixture.
async function fixture(context){
 const {db,rpc}=await timeDatabase();let lostStart=false,lostDelete=false;
 const send=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):{},method=options.method||'GET';
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  try{
   if(u.pathname==='/auth/v1/user')return json({id:owner,email:'owner@example.test'});
   if(u.pathname==='/rest/v1/presentation_admins')return json([{role:'owner'}]);
   if(u.pathname.startsWith('/rest/v1/rpc/')){
    const name=u.pathname.split('/').at(-1);
    if(name==='crm_business_overview')return json({total_leads:1,stages:{WON:1},followups:{today:0,overdue:0,upcoming:0},next_tasks:[],revenue:await rpc('crm_project_revenue')});
    if(!/^crm_(time_|project_time|workspace_projects)/.test(name))return json({});
    const result=await rpc(name,body);if(lostStart&&body.p_action==='start'){lostStart=false;return json({},502);}if(lostDelete&&body.p_action==='entry_delete'){lostDelete=false;return json({},502);}return json(result);
   }
   const table=u.pathname.split('/').at(-1);
   if(!['crm_companies','crm_clients','crm_projects'].includes(table))return json([]);
   const params=[],where=[];
   for(const key of ['id','company_id','owner_id','version','creation_request_id']){const v=u.searchParams.get(key);if(v?.startsWith('eq.')){params.push(v.slice(3));where.push(`${key}=$${params.length}`);}}
   if(method==='GET')return json((await db.query(`select * from public.${table}${where.length?' where '+where.join(' and '):''} order by ${table==='crm_clients'?'company_id':'id'}`,params)).rows);
   const keys=Object.keys(body);if(keys.some(k=>!/^[a-z_]+$/.test(k)))throw new Error('Invalid fixture field');
   if(method==='POST')return json((await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(body))).rows);
   if(method==='PATCH')return json((await db.query(`update public.${table} set ${keys.map((k,i)=>`${k}=$${params.length+i+1}`).join(',')},version=version+1 where ${where.join(' and ')} returning *`,[...params,...Object.values(body)])).rows);
   throw new Error('Unexpected fixture request');
  }catch(e){return json({code:e.code,message:e.message},/^PT\d+$/.test(e.code)?Number(e.code.slice(2)):e.code==='42501'?403:400);}
 };
 const server=createApp({env:{SUPABASE_URL:'https://fixture.example',SUPABASE_SECRET_KEY:'test-only'},send});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 await context.addCookies([{name:'sv_access',value:'fixture-jwt',url:origin}]);
 return {origin,db,rpc,loseStart(){lostStart=true;},loseDelete(){lostDelete=true;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}};
}

for(const width of [1440,390])test(`Hourly billing and persistent timer complete flow at ${width}px`,async({page,context})=>{
 test.setTimeout(90000);const f=await fixture(context),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:960});
 try{
  await page.goto(f.origin+'/admin/clients/'+company);
  await page.getByRole('button',{name:'New project',exact:true}).click();const editor=page.locator('#project-editor');
  await editor.getByLabel('Billing',{exact:true}).selectOption('HOURLY');await expect(editor.getByLabel('Hourly rate (EUR/h)',{exact:true})).toBeVisible();await editor.getByLabel('Project name',{exact:true}).fill('Animation');await editor.getByLabel('Hourly rate (EUR/h)',{exact:true}).fill('60,00');
  await editor.screenshot({path:`.cache/hourly-form-${width}.png`});await editor.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.locator('.project-heading')).toContainText('€60.00/h');
  await page.getByRole('button',{name:'Add time manually',exact:true}).click();const manual=page.getByRole('dialog',{name:'Add time manually.'});await manual.getByLabel('Date',{exact:true}).fill('2026-10-05');await manual.getByLabel('Start time',{exact:true}).fill('09:35');await manual.getByLabel('Hours',{exact:true}).fill('2');await manual.getByLabel('Minutes',{exact:true}).fill('30');await manual.screenshot({path:`.cache/manual-minutes-${width}.png`});await expect(manual.locator('[data-preview]')).toContainText('€150.00');await manual.getByRole('button',{name:'Save time',exact:true}).click();
  await expect(page.locator('[data-totals]')).toContainText('02:30:00');await expect(page.locator('[data-totals]')).toContainText('€150.00');
  await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=one_time] strong')).toHaveText('€150.00');await expect(page.locator('[data-hourly-revenue]')).toHaveText('Includes €150.00 of hourly work');await page.locator('.business-revenue').screenshot({path:`.cache/hourly-revenue-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.goBack();
  await page.getByRole('button',{name:'Edit time',exact:true}).click();await page.getByRole('dialog').getByLabel('Hours',{exact:true}).fill('3');await page.getByRole('dialog').getByLabel('Minutes',{exact:true}).fill('0');await page.getByRole('dialog').getByRole('button',{name:'Save time',exact:true}).click();await expect(page.locator('[data-totals]')).toContainText('€180.00');
  await page.locator('.time-project').screenshot({path:`.cache/hourly-project-${width}.png`});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete time',exact:true}).click();await expect(page.locator('[data-totals]')).toContainText('€0.00');
  await page.getByRole('link',{name:'Start tracking',exact:true}).click();await expect(page.getByLabel('Hourly project',{exact:true})).toHaveValue(/.+/);
  await page.getByRole('button',{name:'Start tracking',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');await page.reload();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();const paused=await page.locator('[data-clock]').textContent();await page.reload();await expect(page.locator('[data-clock]')).toHaveText(paused);
  await page.locator('#nav-clients').click();await expect(page.locator('.mini-timer')).toContainText('Paused');await page.locator('.mini-timer').click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume',exact:true}).click();await expect(page.locator('[data-clock]')).not.toHaveText(paused);await page.getByRole('button',{name:'Finish',exact:true}).click();await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();await expect(page.locator('.time-entry')).toHaveCount(1);
  await page.getByRole('button',{name:'View segments',exact:true}).click();await expect(page.locator('.time-segments li')).toHaveCount(2);await page.getByRole('button',{name:'Close session details',exact:true}).click();
  await page.getByLabel('Track',{exact:true}).selectOption('custom_activity');await page.getByLabel('Activity name',{exact:true}).fill('Learning Houdini');
  f.loseStart();await page.getByRole('button',{name:'Start tracking',exact:true}).click();await expect(page.getByRole('button',{name:'Retry command',exact:true})).toBeVisible();await page.getByRole('button',{name:'Retry command',exact:true}).click();await expect(page.locator('[data-current] h2')).toHaveText('Learning Houdini');
  await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await page.screenshot({path:`.cache/time-tracker-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Finish',exact:true}).click();await expect(page.locator('.time-entry')).toHaveCount(2);expect((await f.rpc('crm_time_history')).items.filter(r=>r.kind==='custom_activity')).toHaveLength(1);const recorded=page.locator('.time-entry').filter({has:page.getByRole('heading',{name:'Animation',exact:true})});page.once('dialog',d=>d.dismiss());await recorded.getByRole('button',{name:'Delete time',exact:true}).click();await expect(page.locator('.time-entry')).toHaveCount(2);page.once('dialog',d=>d.accept());await recorded.getByRole('button',{name:'Delete time',exact:true}).click();await expect(page.locator('.time-entry')).toHaveCount(1);expect((await f.rpc('crm_project_revenue')).one_time.amount).toBe('0');expect(errors).toEqual([]);
 }finally{await f.close();}
});

for(const width of [1440,390])test(`Workspace projects and deletable open timers at ${width}px`,async({page,context})=>{
 test.setTimeout(90000);const f=await fixture(context);await page.setViewportSize({width,height:960});
 try{
  await f.db.exec(`insert into public.crm_projects(company_id,owner_id,name,status,monthly_value) values('${company}','${owner}','Retainer','ACTIVE',500),('${company}','${owner}','Old campaign','COMPLETED',300);`);
  await page.goto(f.origin+'/admin/projects');await expect(page.locator('#nav-projects')).toHaveAttribute('aria-current','page');await expect(page.locator('.workspace-project-card')).toHaveCount(2);
  await page.getByRole('combobox',{name:'Billing',exact:true}).selectOption('HOURLY');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.locator('.workspace-project-card')).toHaveCount(1);
  await page.reload();await expect(page.getByRole('combobox',{name:'Billing',exact:true})).toHaveValue('HOURLY');await page.getByRole('combobox',{name:'Billing',exact:true}).selectOption('');await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('COMPLETED');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.locator('.workspace-project-card')).toContainText('Old campaign');
  await page.goBack();await expect(page.locator('.workspace-project-card')).toContainText('Hourly design');
  await page.screenshot({path:`.cache/workspace-projects-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const card=page.locator('.workspace-project-card');const initialUrl=page.url();
  if(width>650){await card.hover();await expect(card).not.toHaveCSS('transform','none');}
  await card.click({position:{x:12,y:120}});const detail=page.getByRole('dialog',{name:'Hourly design project details',exact:true});await expect(detail).toBeVisible();await expect(detail.locator('.project-heading')).toContainText('Hourly design');expect(page.url()).toBe(initialUrl);expect(context.pages()).toHaveLength(1);
  await detail.getByLabel('Detailed brief',{exact:true}).fill('A brief saved from the project popup.');await detail.getByRole('button',{name:'Save brief',exact:true}).click();await expect(detail.locator('[data-brief-status]')).toHaveText('Saved');
  await detail.getByRole('button',{name:'Add time manually',exact:true}).click();const manual=page.getByRole('dialog',{name:'Add time manually.',exact:true});await manual.getByLabel('Hours',{exact:true}).fill('0');await manual.getByLabel('Minutes',{exact:true}).fill('45');await manual.getByRole('button',{name:'Save time',exact:true}).click();await expect(detail.locator('[data-totals]')).toContainText('00:45:00');
  page.once('dialog',d=>d.accept());await detail.getByRole('button',{name:'Delete time',exact:true}).click();await expect(detail.locator('.time-entry')).toHaveCount(0);
  await detail.evaluate(el=>el.scrollTop=0);await page.screenshot({path:`.cache/project-popup-${width}.png`,fullPage:true});expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await detail.getByRole('button',{name:'Close project details',exact:true}).click();await expect(detail).toBeHidden();await expect(card).toHaveCount(1);expect(page.url()).toBe(initialUrl);
  const status=card.locator('[data-status-toggle]');await status.click();await expect(card.getByRole('group',{name:'Project status',exact:true})).toBeVisible();await page.screenshot({path:`.cache/project-status-${width}.png`,fullPage:true});await page.keyboard.press('Escape');await expect(status).toBeFocused();await expect(status).toHaveAttribute('aria-expanded','false');
  await status.click();await card.getByRole('button',{name:'Paused',exact:true}).click();await expect(status).toContainText('Paused');await expect(detail).toBeHidden();expect((await f.rpc('crm_workspace_projects')).items.find(p=>p.id===project).status).toBe('ON_HOLD');
  await page.reload();await expect(status).toContainText('Paused');await status.click();await card.getByRole('button',{name:'Active',exact:true}).click();await expect(status).toContainText('Active');
  await status.click();await card.getByRole('button',{name:'Done',exact:true}).click();await expect(card).toHaveCount(0);
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('COMPLETED');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(status).toContainText('Done');await status.click();await card.getByRole('button',{name:'Active',exact:true}).click();await expect(card).toHaveCount(0);
  await page.locator('#nav-time').click();await page.getByLabel('Track',{exact:true}).selectOption('custom_activity');await page.getByLabel('Activity name',{exact:true}).fill('Accidental session');await page.getByRole('button',{name:'Start tracking',exact:true}).click();await expect(page.locator('.time-entry')).toHaveCount(1);
  f.loseDelete();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete time',exact:true}).click();await expect(page.locator('[data-delete-error]')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete time',exact:true}).click();await expect(page.locator('.time-entry')).toHaveCount(0);await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();await expect(page.locator('.mini-timer')).toBeHidden();
  expect((await f.rpc('crm_time_open')).item).toBeNull();
 }finally{await f.close();}
});

test('Project popup keyboard, retry and status conflict keep the workspace intact',async({page,context})=>{
 const f=await fixture(context);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(f.origin+'/admin/projects');const card=page.locator('.workspace-project-card'),open=card.getByRole('button',{name:'Hourly design',exact:true});
  await page.route(url=>url.pathname==='/api/admin'&&url.searchParams.get('action')==='crm-project',route=>route.fulfill({status:503,json:{error:'Project temporarily unavailable.'}}),{times:1});
  await open.focus();await page.keyboard.press('Enter');const detail=page.getByRole('dialog',{name:'Hourly design project details',exact:true});await expect(detail.getByRole('alert')).toContainText('temporarily unavailable');await detail.getByRole('button',{name:'Retry project',exact:true}).click();await expect(detail.locator('.project-heading')).toContainText('Hourly design');
  await detail.getByRole('button',{name:'Edit project',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit project.',exact:true});await editor.getByLabel('Hourly rate (EUR/h)',{exact:true}).fill('75');await editor.getByRole('button',{name:'Save project',exact:true}).click();await expect(detail.locator('.project-price')).toHaveText('€75.00/h');
  await page.keyboard.press('Escape');await expect(detail).toBeHidden();await expect(card.locator('.project-price')).toHaveText('€75.00/h');await expect(open).toBeFocused();
  await open.click();await expect(detail).toBeVisible();await page.mouse.click(2,2);await expect(detail).toBeHidden();
  await f.db.exec(`update public.crm_projects set status='ON_HOLD',version=version+1 where id='${project}';`);
  const status=card.locator('[data-status-toggle]');await status.click();await card.getByRole('button',{name:'Done',exact:true}).click();await expect(card.getByRole('alert')).toContainText('Project changed');await expect(status).toContainText('Active');await expect(status).toBeEnabled();
  await card.getByRole('button',{name:'Refresh projects',exact:true}).click();await expect(status).toContainText('Paused');await expect(detail).toBeHidden();expect(errors).toEqual([]);
 }finally{await f.close();}
});

test('simultaneous tabs share one timer and stale commands cannot change it',async({page,context})=>{
 const f=await fixture(context);try{
  const post=(action,body)=>page.request.post(f.origin+'/api/admin?action='+action,{headers:{Origin:f.origin},data:body});
  const input={kind:'project',companyId:company,projectId:project};const results=await Promise.all([post('crm-time-start',{...input,requestId:randomUUID()}),post('crm-time-start',{...input,requestId:randomUUID()})]);expect(results.map(r=>r.status()).sort()).toEqual([200,409]);
  await page.goto(f.origin+'/admin/time-tracker');const second=await context.newPage();await second.goto(f.origin+'/admin/time-tracker');await expect(second.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(second.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  const item=(await f.rpc('crm_time_open')).item;await post('crm-time-finish',{id:item.id,version:item.version,requestId:randomUUID()});await page.reload();await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();await second.close();
 }finally{await f.close();}
});
