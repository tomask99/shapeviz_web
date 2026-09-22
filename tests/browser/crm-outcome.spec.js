import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';
test('LOST can be saved without reason, edited, retained after reopening and explicitly cleared',async({page})=>{
 let company=null,fail=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:[]};
  if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(['crm-create','crm-update'].includes(action)){
   if(fail){fail=false;return route.fulfill({status:409,json:{error:'Company changed. Reload before saving.'}});}
   company={...company,...body,id,version:(company?.version||0)+1,created_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-22T10:00:00Z',archived_at:null};
  }
  if(['crm-create','crm-update','crm-detail'].includes(action))data={company};
  if(['crm-contacts','crm-notes','crm-activity','crm-presentations'].includes(action))data={items:[],page:1,pageSize:25,total:0};
  if(action==='crm-reply-summary')data={item:null};
  await route.fulfill({json:data});
 });
 await page.goto('/admin/leads');await page.locator('#crm .page-heading [data-add]').click();
 const form=page.locator('#lead-form'),reason=form.getByLabel('Lost reason (optional)'),panel=page.locator('.crm-lost-panel');
 await expect(reason).toBeHidden();await form.getByLabel('Company name').fill('Lost fixture');await form.getByLabel('Pipeline status').selectOption('LOST');await expect(reason).toBeVisible();
 await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('Not specified');
 await page.getByRole('button',{name:'Edit company'}).click();await reason.selectOption('Budget');fail=true;
 await form.getByRole('button',{name:'Save lead'}).click();await expect(form.locator('[data-error]')).toContainText('Reload');await expect(reason).toHaveValue('Budget');
 await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('Budget');await page.reload();await expect(panel).toContainText('Budget');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Edit company'}).click();await reason.scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/crm-lost-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await form.getByLabel('Pipeline status').selectOption('REPLIED');await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toContainText('PREVIOUSLY SAVED');expect(company.lost_reason).toBe('Budget');
 await page.getByRole('button',{name:'Edit company'}).click();await reason.selectOption('');await form.getByRole('button',{name:'Save lead'}).click();await expect(panel).toHaveCount(0);expect(company.lost_reason).toBe('');expect(errors).toEqual([]);
});
