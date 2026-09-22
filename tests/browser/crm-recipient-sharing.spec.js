import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
async function fixture(page,{fail=false}={}){
 let rows=[],calls=[];
 await page.route('**/api/admin?*',route=>{
  const u=new URL(route.request().url()),a=u.searchParams.get('action'),body=route.request().method()==='POST'?route.request().postDataJSON():null;calls.push({a,body,days:u.searchParams.get('days')});let data={items:[],hasMore:false};
  if(a==='me')data={email:'owner@example.test'};
  if(a==='crm-detail')data={company:{id:companyId,company_name:'Fixture',services:[],priority:'HIGH',pipeline_status:'CONTACTED',version:1}};
  if(a==='crm-contacts')data={items:[{id,full_name:'Contact fixture'}],hasMore:false};
  if(a==='crm-presentations')data={items:[{id,deck_slug:'fixture',project:{title:'Fixture deck',status:'published',is_template:false}}],hasMore:false};
  if(a==='crm-recipients')data={items:rows,hasMore:false};
  if(a==='crm-recipient-create'){
   if(fail){fail=false;return route.fulfill({status:500,json:{error:'Temporary failure'}});}
   rows=[{id,recipient_name:body.name||'Contact fixture',recipient_email:body.email||''}];data={item:rows[0],url:'/p/fixture?r=one-time-secret'};
  }
  if(a==='crm-recipient-sent'){rows[0].sent_at=body.sent_at;data={item:rows[0]};}
  if(a==='crm-recipient-revoke'){rows[0].revoked_at=new Date().toISOString();data={item:rows[0]};}
  if(a==='crm-recipient-stats')data={stats:{visits:2,seconds:40,slides_viewed:3,slide_count:10,website_clicks:1,analytics_enabled:false}};
  return route.fulfill({json:data});
 });
 await page.goto('/admin/leads/'+companyId+'?tab=presentations');await page.getByRole('button',{name:'Share / recipients'}).click();
 return {dialog:page.locator('#crm-share-dialog'),calls};
}
test('recipient contact link, sent, analytics, revocation and one-time secret lifecycle',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const {dialog:d,calls}=await fixture(page);
 await d.getByLabel('Contact',{exact:true}).selectOption(id);await d.getByRole('button',{name:'Generate tracked link'}).click();
 await expect(d.getByLabel('New tracked link')).toHaveValue(/one-time-secret/);
 expect(calls.find(c=>c.a==='crm-recipient-create').body.contact_id).toBe(id);
 page.on('dialog',dialog=>dialog.accept());await d.getByRole('button',{name:'Mark recipient sent'}).click();await expect(d.getByRole('button',{name:'Mark recipient sent'})).toHaveCount(0);
 await d.getByLabel('Analytics period').selectOption('7');await d.getByRole('button',{name:'Show recipient analytics'}).click();await expect(d).toContainText('2 checked visits');await expect(d).toContainText('historical data is retained');expect(calls.find(c=>c.a==='crm-recipient-stats').days).toBe('7');
 await d.getByRole('button',{name:'Revoke link'}).click();await expect(d).toContainText('Revoked');
 await d.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Share / recipients'}).click();await expect(d.locator('[data-created]')).toBeHidden();await expect(d.locator('[data-link]')).toHaveValue('');expect(errors).toEqual([]);
});
test('mobile ad-hoc failure preserves draft and clipboard fallback selects link',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied');}}}));
 const {dialog:d}=await fixture(page,{fail:true});await d.getByLabel('Recipient type').selectOption('adhoc');await d.getByLabel('Recipient name').fill('Private <name>');await d.getByLabel('Email (optional)').fill('private@example.test');await d.getByRole('button',{name:'Generate tracked link'}).click();await expect(d.locator('[data-error]')).toContainText('Refresh recipients');await expect(d.getByLabel('Recipient name')).toHaveValue('Private <name>');
 await d.getByRole('button',{name:'Generate tracked link'}).click();await expect(d.getByLabel('New tracked link')).toBeVisible();await d.getByRole('button',{name:'Copy tracked link',exact:true}).click();await expect(d.locator('[data-error]')).toContainText('Ctrl/Cmd+C');
 expect(await d.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'test-results/recipient-sharing-mobile.png'});
});
