import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',contactId='44444444-4444-4444-8444-444444444444';
const company={id:companyId,company_name:'Nario',services:[],priority:'HIGH',pipeline_status:'CONTACTED',created_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-22T10:00:00Z',version:1};
const project={deck_slug:'nario-pitch',client:'Nario',title:'Initial <pitch>',status:'published',slide_count:27,is_template:false,analytics_enabled:true};
async function fixture(page){
  let links=[],events=[],calls=[];
  await page.route('**/api/admin?*',route=>{
    const url=new URL(route.request().url()),action=url.searchParams.get('action'),body=route.request().method()==='POST'?route.request().postDataJSON():null;calls.push({action,body});let data={};
    if(action==='me')data={email:'owner@example.com'};
    if(action==='crm-detail')data={company};
    if(action==='crm-contacts')data={items:[{id:contactId,full_name:'Martin'}],hasMore:false};
    if(action==='crm-notes')data={items:[],hasMore:false};
    if(action==='crm-activity')data={items:events,hasMore:false};
    if(action==='crm-presentations')data={items:links,hasMore:false,page:1};
    if(action==='crm-presentation-catalog')data={items:links.length?[]:[project],hasMore:false,page:1};
    if(action==='crm-presentation-assign'){
      const row={id,deck_slug:project.deck_slug,company_id:companyId,project,version:1,created_at:new Date().toISOString(),sent_at:null};links=[row];data={item:row};
      events.unshift({event_type:'presentation_assigned',metadata:{name:project.title},created_at:new Date().toISOString()});
    }
    if(action==='crm-presentation-sent'){
      links[0].sent_at=body.sent_at;links[0].version++;links[0].contact=body.contact_id?{full_name:'Martin'}:null;data={item:links[0]};
      events.unshift({event_type:'presentation_sent',metadata:{name:project.title,sent_at:body.sent_at},created_at:new Date().toISOString()});
    }
    if(action==='crm-presentation-stats')data={days:Number(url.searchParams.get('days')),stats:{summary:{visits:3,seconds:268,website_clicks:1},slides:[{slide_index:1,views:3},{slide_index:2,views:2},{slide_index:3,views:0}],sessions:[{started_at:'2026-09-22T12:32:00Z'}]}};
    if(action==='crm-presentation-unassign'){links=[];data={ok:true};events.unshift({event_type:'presentation_unassigned',metadata:{name:project.title},created_at:new Date().toISOString()});}
    return route.fulfill({json:data});
  });
  return {calls};
}
test('company presentations assign, reload, mark sent, analytics, history and safe unlink',async({page})=>{
  const {calls}=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/leads/'+companyId+'?tab=presentations');
  await expect(page.getByText('No presentations assigned yet.')).toBeVisible();
  await page.getByRole('button',{name:'Assign presentation',exact:true}).click();
  const dialog=page.locator('#crm-presentation-dialog');
  await dialog.getByLabel('Search presentations').fill('nario');await dialog.getByRole('button',{name:'Search',exact:true}).click();
  await dialog.getByRole('button',{name:'Assign this presentation'}).click();
  await expect(dialog).not.toBeVisible();await expect(page.locator('[data-presentation-link]')).toHaveCount(1);
  expect(calls.filter(c=>c.action==='crm-presentation-stats')).toHaveLength(0);
  await page.reload();await expect(page.locator('[data-presentation-link] h3')).toHaveText('Initial <pitch>');
  await expect(page.getByRole('link',{name:'Open presentation',exact:true})).toHaveAttribute('href','/p/nario-pitch');
  await page.getByRole('button',{name:'Mark sent',exact:true}).click();
  await dialog.getByLabel('Sent date and time *').fill('2026-01-20T10:30');
  await dialog.getByRole('combobox',{name:'Sent to contact (optional)'}).selectOption(contactId);
  await dialog.getByRole('button',{name:'Record sent',exact:true}).click();
  await expect(page.locator('[data-presentation-link]')).toContainText('Martin');
  await expect(page.getByRole('button',{name:'Mark sent',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Show analytics',exact:true}).click();
  await expect(page.locator('[data-engagement]')).toContainText('4m 28s');
  await expect(page.locator('[data-engagement]')).toContainText('2 / 27');
  await page.getByRole('combobox',{name:'Analytics period'}).selectOption('7');
  await page.getByRole('button',{name:'Show analytics',exact:true}).click();await expect(page.locator('[data-engagement]')).toContainText('last 7 days');
  await page.screenshot({path:'.cache/crm-presentations-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/crm-presentations-mobile.png',fullPage:true});
  await page.getByRole('tab',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Presentation sent',exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByRole('tab',{name:'Presentations',exact:true})).toHaveAttribute('aria-selected','true');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Unassign',exact:true}).click();await expect(page.getByText('No presentations assigned yet.')).toBeVisible();
  await page.getByRole('button',{name:'Assign presentation',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Initial <pitch>',exact:true})).toBeVisible();
  expect(calls.some(c=>['delete','reset-statistics'].includes(c.action))).toBe(false);expect(errors).toEqual([]);
});
test('presentation load retry and duplicate assignment retain dialog; tab navigation clears it',async({page})=>{
  await fixture(page);let failed=false;
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='crm-presentations'&&!failed){failed=true;return route.fulfill({status:502,json:{error:'Temporary error'}});}
    if(action==='crm-presentation-assign')return route.fulfill({status:409,json:{error:'Presentation already assigned. Refresh first.'}});
    return route.fallback();
  });
  await page.goto('/admin/leads/'+companyId+'?tab=presentations');await page.getByRole('button',{name:'Try again'}).click();
  await page.getByRole('button',{name:'Assign presentation',exact:true}).click();const dialog=page.locator('#crm-presentation-dialog');
  await dialog.getByRole('button',{name:'Assign this presentation'}).click();await expect(dialog.getByRole('alert')).toContainText('already assigned');
  await page.setViewportSize({width:320,height:760});expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('tab',{name:'Notes',exact:true}).click();await expect(page.locator('#crm-presentation-dialog')).toHaveCount(0);
});
