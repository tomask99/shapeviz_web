import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222',contactId='33333333-3333-4333-8333-333333333333';
async function fixture(page,{lostResponse=false,archived=false,contactFailure=false}={}){
  let events=[];const calls=[];
  const company={id:companyId,version:1,company_name:'Nario',country:'SK',industry:'Furniture',website:'',instagram:'',linkedin:'',services:[],priority:'HIGH',lead_source:'Other',pipeline_status:'WON',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:archived?new Date().toISOString():null};
  await page.route('**/api/admin?*',route=>{
    const params=new URL(route.request().url()).searchParams,action=params.get('action'),body=route.request().postDataJSON();calls.push({action,body});let data={};
    if(action==='me')data={email:'owner@example.test'};
    if(action==='crm-detail')data={company};
    if(action==='crm-followups')data={groups:[]};
    if(action==='crm-contacts'){
      if(contactFailure){contactFailure=false;return route.fulfill({status:503,json:{error:'Contacts temporarily unavailable'}});}
      data={items:[{id:contactId,full_name:'Martin <client>'}],hasMore:false};
    }
    if(['crm-notes','crm-activity'].includes(action))data={items:action==='crm-activity'?events:[],hasMore:false};
    if(action==='crm-reply-summary')data={item:events[0]||null};
    if(action==='crm-reply-add'){
      if(!events.some(e=>e.id===body.id))events.unshift({id:body.id,event_type:'reply_received',created_at:new Date().toISOString(),metadata:{content:body.content,received_at:body.received_at,contact_id:body.contact_id,contact_name:body.contact_id?'Martin <client>':null}});
      if(lostResponse){lostResponse=false;return route.fulfill({status:502,json:{error:'Response lost'}});}
      data={item:events.find(e=>e.id===body.id)};
    }
    return route.fulfill({json:data});
  });
  return {calls,events:()=>events};
}
test('record reply, retry a lost response, reload history and show latest reply without changing pipeline',async({page})=>{
  const f=await fixture(page,{lostResponse:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/leads/'+companyId+'?tab=activity');await page.getByRole('button',{name:'Record reply',exact:true}).click();
  const dialog=page.locator('#crm-reply-dialog');await dialog.getByLabel('Received date and time *').fill('2026-01-15T10:30');await dialog.getByLabel('Reply summary *').fill('Interested in <CGI>');await dialog.getByLabel('From contact (optional)').selectOption(contactId);
  await page.screenshot({path:'.cache/crm-reply-desktop.png',fullPage:true});
  await dialog.getByRole('button',{name:'Record reply',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Response lost');await expect(dialog.getByLabel('Reply summary *')).toBeDisabled();
  await dialog.getByRole('button',{name:'Retry recording reply'}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:'Client reply received'})).toHaveCount(1);
  expect(f.events()).toHaveLength(1);expect(f.calls.filter(c=>c.action==='crm-reply-add')[0].body).toEqual(f.calls.filter(c=>c.action==='crm-reply-add')[1].body);
  expect(f.calls.some(c=>['crm-update','crm-status','crm-move','crm-pipeline-move'].includes(c.action))).toBe(false);
  await page.reload();await expect(page.locator('#crm-related-panel')).toContainText('Interested in <CGI>');await expect(page.locator('#crm-related-panel')).toContainText('Martin <client>');
  await page.getByRole('tab',{name:'Overview',exact:true}).click();await expect(page.getByRole('heading',{name:'Latest client reply'})).toBeVisible();await expect(page.locator('.crm-summary')).toContainText('Interested in <CGI>');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Record reply',exact:true}).click();await expect(dialog.getByLabel('Reply summary *')).toBeEnabled();await expect(dialog.getByLabel('Reply summary *')).toHaveValue('');await page.screenshot({path:'.cache/crm-reply-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('reply rejects future date locally and contact-load retry preserves draft',async({page})=>{
  const f=await fixture(page,{contactFailure:true});await page.goto('/admin/leads/'+companyId+'?tab=activity');await page.getByRole('button',{name:'Record reply',exact:true}).click();const dialog=page.locator('#crm-reply-dialog');
  await expect(dialog.getByRole('alert')).toContainText('Contacts temporarily unavailable');await dialog.getByLabel('Reply summary *').fill('Call next week');await dialog.getByRole('button',{name:'Load more contacts'}).click();await expect(dialog.getByLabel('Reply summary *')).toHaveValue('Call next week');
  await dialog.getByLabel('Received date and time *').fill('2099-01-15T10:30');await dialog.getByRole('button',{name:'Record reply',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('cannot be in the future');expect(f.calls.filter(c=>c.action==='crm-reply-add')).toHaveLength(0);
  await dialog.getByLabel('Received date and time *').fill('2026-01-15T10:30');await dialog.getByRole('button',{name:'Record reply',exact:true}).click();await expect(dialog).not.toBeVisible();
});
test('archived company keeps history but cannot record a reply',async({page})=>{
  await fixture(page,{archived:true});await page.goto('/admin/leads/'+companyId+'?tab=activity');await expect(page.getByRole('button',{name:'Record reply',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:'Overview',exact:true}).click();await expect(page.getByRole('button',{name:'Record reply',exact:true})).toBeDisabled();await expect(page.getByText('No reply recorded yet.')).toBeVisible();
});
