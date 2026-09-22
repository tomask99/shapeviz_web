import {test,expect} from '@playwright/test';
test('WON details and initial contact persist, reopening retains values, signals render on mobile',async({page})=>{
 let company;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:[]};
  if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(['crm-create','crm-update'].includes(action))company={...company,...body,id:'22222222-2222-4222-8222-222222222222',version:1,created_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-22T10:00:00Z',archived_at:null};
  if(['crm-create','crm-update','crm-detail'].includes(action))data={company};
  if(['crm-contacts','crm-notes','crm-activity','crm-presentations'].includes(action))data={items:[],page:1,pageSize:25,total:0};
  if(action==='crm-reply-summary')data={item:null};
  if(action==='crm-signals')data={signals:{engagement:'HOT',visits:3,seconds:200,clicks:1,presentation_status:'VIEWED'}};
  await route.fulfill({json:data});
 });
 await page.goto('/admin/leads');await page.locator('#crm .page-heading [data-add]').click();
 const form=page.locator('#lead-form');await form.getByLabel('Company name').fill('Won fixture');
 await form.locator('[data-initial-contact] summary').click();await form.getByLabel('Contact name',{exact:true}).fill('Jane');await form.getByLabel('Contact email').fill('jane@example.test');
 await form.getByLabel('Pipeline status').selectOption('WON');await form.locator('[data-won-fields] summary').click();
 await form.getByLabel('Won date').fill('2026-09-22');await form.getByLabel('Won project value (EUR)').fill('4500');await form.getByLabel('Won notes').fill('Agreed scope');
 await form.getByRole('button',{name:'Save lead'}).click();await expect(page.locator('.crm-won-panel')).toContainText('Agreed scope');expect(company.initial_contact.full_name).toBe('Jane');
 await page.reload();await expect(page.locator('.crm-won-panel')).toContainText('2026-09-22');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Edit company'}).click();await expect(form.locator('[data-initial-contact]')).toBeHidden();
 await form.getByLabel('Pipeline status').selectOption('PROPOSAL');await form.getByRole('button',{name:'Save lead'}).click();await expect(page.locator('.crm-won-panel')).toContainText('PREVIOUSLY SAVED');expect(company.won_project_value).toBe('4500');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
