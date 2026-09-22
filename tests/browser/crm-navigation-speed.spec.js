import {test,expect} from '@playwright/test';
test('rapid navigation reuses all three views; refresh bypasses and status save invalidates',async({page})=>{
 const calls={};let stage='NEW_LEAD';const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const company=()=>({id:'22222222-2222-4222-8222-222222222222',company_name:'Speed fixture',services:[],priority:'HIGH',pipeline_status:stage,version:1});
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');calls[action]=(calls[action]||0)+1;let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='crm-list')data={companies:[company()],total:1,page:1,pageSize:25};
  if(action==='crm-saved-views')data={items:[]};
  if(action==='crm-pipeline')data={columns:[{status:stage,companies:[company()],total:1,page:1,pageSize:25}]};
  if(action==='crm-followups')data={groups:['overdue','today','upcoming','completed'].map(key=>({key,items:[],total:0,page:1,pageSize:25}))};
  if(action==='crm-status'){stage=route.request().postDataJSON().pipeline_status;data={company:company()};}
  await route.fulfill({json:data});
 });
 const leads=async()=>{await page.locator('#nav-leads').click();await expect(page.locator('#lead-results')).toContainText('Speed fixture');};
 const pipeline=async()=>{await page.locator('#nav-pipeline').click();await expect(page.locator('[data-card]')).toHaveCount(1);};
 const followups=async()=>{await page.locator('#nav-followups').click();await expect(page.locator('.followup-group')).toHaveCount(4);};
 await page.goto('/admin/leads');await expect(page.locator('#lead-results')).toContainText('Speed fixture');
 await pipeline();await followups();await leads();await pipeline();await followups();
 for(const action of ['crm-list','crm-pipeline','crm-followups'])expect(calls[action]).toBe(1);
 await page.locator('[data-followup-refresh]').click();await expect.poll(()=>calls['crm-followups']).toBe(2);
 await leads();await page.locator('[data-reload]').click();await expect.poll(()=>calls['crm-list']).toBe(3);
 await pipeline();await page.locator('[data-pipeline-refresh]').click();await expect.poll(()=>calls['crm-pipeline']).toBe(3);
 await page.locator('[data-move]').selectOption('QUALIFIED');await expect(page.locator('[data-stage=QUALIFIED]')).toBeVisible();
 await leads();await expect(page.locator('#lead-results')).toContainText('Qualified');expect(calls['crm-list']).toBe(4);
 expect(errors).toEqual([]);
});
