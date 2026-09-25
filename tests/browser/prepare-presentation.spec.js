import {test,expect} from '@playwright/test';
import {STATUSES} from '../../public/admin/crm-options.js';
const id='22222222-2222-4222-8222-222222222222';
async function fixture(page,{fail=false,empty=false}={}){
 const calls=[],company={id,company_name:'Nábytok <A & B>',services:[],pipeline_status:'NEW_LEAD',priority:'HIGH',version:1};
 await page.route('**/api/admin?*',route=>{
  const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();calls.push({action,body});let data={};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:empty?[]:[{deck_slug:'template',client:'Template',title:'Furniture',is_template:true,status:'draft'},{deck_slug:'archived',is_template:true,status:'archived'}]};
  if(action==='crm-detail')data={company};
  if(action==='crm-pipeline')data={columns:STATUSES.filter(s=>s!=='LOST').map(status=>({status,total:status===company.pipeline_status?1:0,page:1,companies:status===company.pipeline_status?[company]:[]}))};
  if(action==='prepare-presentation'){
   if(fail){fail=false;return route.fulfill({status:502,json:{error:'Connection interrupted.'}});}
   company.pipeline_status='PRESENTATION_READY';company.version++;data={company,url:'/p/prepared',project:{deck_slug:'prepared'}};
  }
  return route.fulfill({json:data});
 });
 await page.goto('/admin/pipeline');return calls;
}
test('pipeline prepares from one template and immediately moves the card; desktop and mobile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=await fixture(page);
 await expect(page.locator('[data-stage=QUALIFIED]')).toHaveCount(0);
 await page.getByRole('button',{name:'Prepare presentation',exact:true}).click();const dialog=page.locator('#crm-prepare-presentation');
 await dialog.getByLabel('Template',{exact:true}).selectOption('template');await expect(dialog.locator('option[value=archived]')).toHaveCount(0);
 await page.screenshot({path:'.cache/prepare-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.cache/prepare-mobile.png',fullPage:true});
 expect(await dialog.evaluate(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().left>=0)).toBe(true);
 await dialog.getByRole('button',{name:'Prepare presentation',exact:true}).click();await expect(dialog).toBeHidden();
 await expect(page.locator('[data-stage=PRESENTATION_READY] [data-card]')).toHaveCount(1);await expect(page.locator('[data-stage=NEW_LEAD] [data-card]')).toHaveCount(0);
 expect(calls.filter(c=>c.action==='prepare-presentation')).toHaveLength(1);expect(errors).toEqual([]);
});
test('interrupted preparation retries the same operation after closing and reopening',async({page})=>{
 const calls=await fixture(page,{fail:true});await page.getByRole('button',{name:'Prepare presentation',exact:true}).click();const dialog=page.locator('#crm-prepare-presentation');
 await dialog.getByLabel('Template',{exact:true}).selectOption('template');await dialog.getByRole('button',{name:'Prepare presentation',exact:true}).click();
 await expect(dialog.locator('[role=alert]')).toContainText('Retry');await expect(dialog.getByLabel('Template',{exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Prepare presentation',exact:true}).click();
 await dialog.getByRole('button',{name:'Retry preparation',exact:true}).click();await expect(dialog).toBeHidden();
 const requests=calls.filter(c=>c.action==='prepare-presentation');expect(requests).toHaveLength(2);expect(requests[0].body).toEqual(requests[1].body);
});
test('empty template library explains the next step and prevents preparation',async({page})=>{
 await fixture(page,{empty:true});await page.getByRole('button',{name:'Prepare presentation',exact:true}).click();const dialog=page.locator('#crm-prepare-presentation');
 await expect(dialog).toContainText('Add a template in Presentation Studio');await expect(dialog.getByRole('button',{name:'Prepare presentation',exact:true})).toBeDisabled();
});
