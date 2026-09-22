import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';
test('optional value creates, persists, validates, retries, changes frequency and clears on mobile',async({page})=>{
 let company=null,fail=false,writes=0;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:[]};
  if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(['crm-create','crm-update'].includes(action)){
   writes++;if(fail){fail=false;return route.fulfill({status:409,json:{error:'Company changed. Reload before saving.'}});}
   company={...company,...body,id,version:(company?.version||0)+1,created_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-22T10:00:00Z',archived_at:null};
  }
  if(['crm-create','crm-update','crm-detail'].includes(action))data={company};
  if(['crm-contacts','crm-notes','crm-activity','crm-presentations'].includes(action))data={items:[],page:1,pageSize:25,total:0};
  if(action==='crm-reply-summary')data={item:null};
  await route.fulfill({json:data});
 });
 await page.goto('/admin/leads');await page.locator('#crm .page-heading [data-add]').click();
 const form=page.locator('#lead-form'),panel=page.locator('.crm-value-panel');
 await form.getByLabel('Company name').fill('Value fixture');
 await form.locator('[data-opportunity] summary').click();
 await form.getByLabel('Estimated value (EUR)').fill('3000,25');await form.getByLabel('Value type').selectOption('ONE_TIME');
 await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('one-time');expect(company.estimated_value).toBe('3000.25');
 await page.reload();await expect(panel).toContainText('one-time');
 await page.getByRole('button',{name:'Edit company'}).click();await expect(form.getByLabel('Estimated value (EUR)')).toHaveValue('3000.25');
 await form.getByLabel('Estimated value (EUR)').fill('1.001');await form.getByRole('button',{name:'Save lead'}).click();await expect(form.locator('[data-error]')).toContainText('two decimal');expect(writes).toBe(1);
 await form.getByLabel('Estimated value (EUR)').fill('1500');await form.getByLabel('Value type').selectOption('MONTHLY');
 fail=true;await form.getByRole('button',{name:'Save lead'}).click();await expect(form.locator('[data-error]')).toContainText('Reload');await expect(form.getByLabel('Estimated value (EUR)')).toHaveValue('1500');
 await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('/ month');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Edit company'}).click();
 await form.locator('[data-opportunity]').scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/crm-value-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await form.getByLabel('Estimated value (EUR)').fill('0');await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('/ month');expect(company.estimated_value).toBe('0.00');
 await page.getByRole('button',{name:'Edit company'}).click();await form.getByLabel('Estimated value (EUR)').fill('');await form.getByRole('button',{name:'Save lead'}).click();
 await expect(panel).toContainText('Not specified');expect(company.estimated_value).toBeNull();expect(company.value_type).toBe('UNKNOWN');expect(errors).toEqual([]);
});
