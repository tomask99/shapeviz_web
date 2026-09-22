import {test,expect} from '@playwright/test';
async function fixture(page,{fail=false,value={currency:'EUR',one_time:{amount:'12500.25',count:1},monthly:{amount:'4500',count:1},missing_count:1,unknown_frequency_count:1}}={}){
 const calls=[];
 await page.route('**/api/admin?*',route=>{
  const p=new URL(route.request().url()).searchParams,action=p.get('action');calls.push({action,params:Object.fromEntries(p)});let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:[]};
  if(action==='stats')data={summary:{visits:9},daily:[],decks:[]};
  if(action==='crm-overview'){
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'CRM unavailable'}});}
   data={total_leads:10,stages:{CONTACTED:2,MEETING:1,REPLIED:2,PROPOSAL:1,WON:1,LOST:3},replies_recorded:3,followups:{today:2,overdue:1,upcoming:4},next_tasks:[{company_id:'22222222-2222-4222-8222-222222222222',company_name:'Nario <client>',title:'Send proposal',due_at:'2026-01-01T12:00:00Z'}]};
   data.pipeline_value=value;
  }
  if(action==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  return route.fulfill({json:data});
 });return calls;
}
test('business overview preserves analytics, links to filtered pipeline, hides on template/CRM views',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=await fixture(page);await page.goto('/admin');const root=page.locator('#business-overview');
 await expect(root).toContainText('Your business, at a glance.');await expect(root.locator('.business-cards').first()).toContainText('10');await expect(root).toContainText('not a historical conversion funnel');await expect(root.getByRole('link',{name:'Nario <client>'})).toHaveAttribute('href','/admin/leads/22222222-2222-4222-8222-222222222222');await expect(page.locator('#metrics')).toContainText('9');await expect(page.locator('#visits-chart')).toBeVisible();
 await expect(root.locator('[data-value-kind=one_time]')).toContainText('12,500.25');await expect(root.locator('[data-value-kind=monthly]')).toContainText('4,500.00 / month');await expect(root.locator('.business-value')).toContainText('1 without an amount; 1 with an amount');
 await root.screenshot({path:'.cache/crm-overview-desktop.png'});await page.setViewportSize({width:390,height:844});await root.screenshot({path:'.cache/crm-overview-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('[data-view=templates]').click();await expect(root).toBeHidden();await page.locator('[data-view=all]').click();await expect(root).toBeVisible();
 await root.locator('a[href="/admin/leads?pipeline_status=CONTACTED"]').click();await expect(page).toHaveURL(/pipeline_status=CONTACTED/);await expect(root).toBeHidden();await page.locator('[data-view=all]').click();await expect(root).toContainText('Your business, at a glance.');
 expect(calls.some(c=>c.action==='crm-overview'&&c.params.today&&c.params.tomorrow)).toBe(true);expect(errors).toEqual([]);
});

test('pipeline value zero, absent estimates, refresh and invalid payload retain other dashboard sections',async({page})=>{
 const value={currency:'EUR',one_time:{amount:'0',count:1},monthly:{amount:'0',count:0},missing_count:2,unknown_frequency_count:1};
 const calls=await fixture(page,{value});await page.goto('/admin');const root=page.locator('#business-overview');
 await expect(root.locator('[data-value-kind=one_time]')).toContainText('€0.00');await expect(root.locator('[data-value-kind=monthly]')).toContainText('Not estimated');
 value.one_time.amount='99999999999999.99';await root.getByRole('button',{name:'Refresh sales'}).click();await expect(root.locator('[data-value-kind=one_time]')).toContainText('99,999,999,999,999.99');
 await page.setViewportSize({width:320,height:844});await root.locator('.business-value').screenshot({path:'.cache/crm-pipeline-value-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 value.one_time.amount='<img src=x onerror=alert(1)>';await root.getByRole('button',{name:'Refresh sales'}).click();await expect(root.locator('.business-value')).toContainText('Value summary unavailable');await expect(root.locator('[data-value-kind]')).toHaveCount(0);await expect(root.getByRole('heading',{name:'Follow-ups',exact:true})).toBeVisible();await expect(page.locator('#metrics')).toContainText('9');
 expect(calls.filter(c=>c.action==='crm-overview')).toHaveLength(3);expect(calls.some(c=>c.action==='crm-detail')).toBe(false);
});
test('CRM failure does not hide presentation analytics, retry recovers and logout clears sales',async({page})=>{
 await fixture(page,{fail:true});await page.goto('/admin');const root=page.locator('#business-overview');await expect(root.getByRole('alert')).toContainText('CRM unavailable');await expect(page.locator('#metrics')).toContainText('9');await expect(root.locator('.business-cards')).toHaveCount(0);
 await root.getByRole('button',{name:'Retry sales overview'}).click();await expect(root).toContainText('Your business, at a glance.');await page.locator('#logout').click();await expect(page.locator('#login')).toBeVisible();await expect(root).toBeEmpty();
});
test('overview refreshes local day boundaries after midnight',async({page})=>{
 await page.clock.install({time:new Date('2026-09-22T21:59:40Z')});const calls=await fixture(page);await page.goto('/admin');await expect(page.locator('#business-overview')).toContainText('Your business, at a glance.');
 const before=calls.find(c=>c.action==='crm-overview').params.today;await page.clock.runFor(60000);await expect.poll(()=>calls.filter(c=>c.action==='crm-overview').length).toBe(2);expect(calls.filter(c=>c.action==='crm-overview')[1].params.today).not.toBe(before);
});
