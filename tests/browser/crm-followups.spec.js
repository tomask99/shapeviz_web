import {test,expect} from '@playwright/test';
test.use({timezoneId:'Europe/Bratislava'});
const companyId='22222222-2222-4222-8222-222222222222',contactId='44444444-4444-4444-8444-444444444444';
const company={id:companyId,version:1,company_name:'Nario <studio>',country:'SK',industry:'Furniture',services:[],priority:'HIGH',pipeline_status:'CONTACTED',created_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-22T10:00:00Z'};
async function fixture(page){
  let records=[],events=[],calls=[];
  await page.route('**/api/admin?*',async route=>{
    const url=new URL(route.request().url()),action=url.searchParams.get('action'),body=route.request().method()==='POST'?route.request().postDataJSON():null;
    calls.push({action,body});let data={};
    if(action==='me')data={email:'owner@example.com'};
    const next=records.filter(f=>!f.completed_at).sort((a,b)=>a.due_at.localeCompare(b.due_at))[0]||null;
    if(action==='crm-detail')data={company:{...company,next_action:next}};
    if(action==='crm-list')data={companies:[{...company,next_action:next}],total:1,page:1,pageSize:25};
    if(action==='crm-pipeline')data={columns:[{status:'CONTACTED',companies:[{...company,next_action:next}],total:1,page:1,pageSize:25}]};
    if(action==='crm-contacts')data={items:[{id:contactId,company_id:companyId,full_name:'Martin',primary_contact:true}],hasMore:false};
    if(action==='crm-notes')data={items:[],hasMore:false};
    if(action==='crm-activity')data={items:events,hasMore:false};
    if(action==='crm-followups'){
      const today=url.searchParams.get('today'),tomorrow=url.searchParams.get('tomorrow');
      const keys=url.searchParams.get('group')?[url.searchParams.get('group')]:['overdue','today','upcoming','completed'];
      data={groups:keys.map(key=>{const items=records.filter(f=>(f.completed_at?'completed':f.due_at<today?'overdue':f.due_at<tomorrow?'today':'upcoming')===key),p=Number(url.searchParams.get('page')||1);return {key,items:items.slice((p-1)*25,p*25),total:items.length,page:p,pageSize:25};})};
    }
    if(action==='crm-followup-save'){
      let item=records.find(f=>f.id===body.id);
      if(item&&item.version!==body.version)return route.fulfill({status:409,json:{error:'Follow-up changed. Refresh before retrying.'}});
      if(item){Object.assign(item,body,{version:item.version+1});}
      else{item={...body,id:crypto.randomUUID(),version:1,company_id:companyId,company_name:company.company_name,pipeline_status:'CONTACTED',contact_name:'Martin',completed_at:null};records.push(item);}
      events.unshift({event_type:body.id?'followup_rescheduled':'followup_created',metadata:{name:body.title},created_at:new Date().toISOString()});data={item};
    }
    if(action==='crm-followup-complete'){
      const item=records.find(f=>f.id===body.id);item.completed_at=new Date().toISOString();item.version++;
      events.unshift({event_type:'followup_completed',metadata:{name:item.title},created_at:new Date().toISOString()});data={item};
    }
    if(action==='list')data={projects:[]};if(action==='stats')data={summary:{},daily:[],decks:[]};
    await route.fulfill({json:data});
  });
  return {calls,records};
}
test('schedule from company, reload, next actions, reschedule and complete with history',async({page})=>{
  const {calls}=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/leads/'+companyId);
  await page.getByRole('link',{name:'Manage follow-ups'}).click();
  await expect(page.getByRole('heading',{name:'Follow-ups.'})).toBeVisible();
  await page.getByRole('button',{name:'Schedule follow-up +'}).click();
  const dialog=page.locator('#followup-dialog');
  await dialog.getByLabel('Title *',{exact:true}).fill('Send proposal <draft>');
  await dialog.getByLabel('Due date and time *').fill('2026-01-20T10:30');
  await dialog.getByLabel('Contact (optional)').selectOption(contactId);
  await dialog.getByLabel('Description',{exact:true}).fill('Discuss next visuals');
  await dialog.getByRole('button',{name:'Save follow-up'}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region',{name:'Overdue'}).getByRole('heading',{name:'Send proposal <draft>'})).toBeVisible();
  await page.reload();await expect(page.locator('[data-followup]')).toHaveCount(1);
  await page.getByRole('link',{name:'Leads',exact:true}).click();await expect(page.locator('.crm-next-action')).toContainText('Send proposal <draft>');
  await page.getByRole('link',{name:'Pipeline',exact:true}).click();await expect(page.locator('.crm-next-action')).toContainText('Send proposal <draft>');
  await page.getByRole('link',{name:'Follow-ups',exact:true}).click();
  await page.getByRole('button',{name:'Edit / reschedule'}).click();await dialog.getByLabel('Due date and time *').fill('2099-10-25T10:30');
  await dialog.getByRole('button',{name:'Save follow-up'}).click();
  await expect(page.getByRole('region',{name:'Upcoming'}).getByRole('heading',{name:'Send proposal <draft>'})).toBeVisible();
  await page.screenshot({path:'.cache/crm-followups-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/crm-followups-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Mark complete'}).click();
  await expect(page.getByRole('region',{name:'Completed'}).getByRole('heading',{name:'Send proposal <draft>'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mark complete'})).toHaveCount(0);
  await page.getByRole('link',{name:'Nario <studio>',exact:true}).click();
  await expect(page.locator('.crm-next-action')).toContainText('No follow-up scheduled');
  await page.getByRole('tab',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Follow-up completed',exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');
  expect(calls.filter(c=>c.action==='crm-followup-save')).toHaveLength(2);expect(calls.filter(c=>c.action==='crm-followup-complete')).toHaveLength(1);expect(errors).toEqual([]);
});
test('global company picker, load retry, save conflict and mobile dialog preserve entered values',async({page})=>{
  await fixture(page);let failed=false;
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='crm-followups'&&!failed){failed=true;return route.fulfill({status:502,json:{error:'Temporary failure'}});}
    if(action==='crm-followup-save')return route.fulfill({status:409,json:{error:'Changed elsewhere. Refresh and try again.'}});
    return route.fallback();
  });
  await page.goto('/admin/follow-ups');await expect(page.getByRole('alert')).toContainText('Temporary failure');
  await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('region',{name:'Today'})).toBeVisible();
  await page.setViewportSize({width:320,height:760});
  await page.getByRole('button',{name:'Schedule follow-up +'}).click();const dialog=page.locator('#followup-dialog');
  await dialog.getByRole('combobox',{name:'Company *',exact:true}).selectOption(companyId);
  await dialog.getByLabel('Title *',{exact:true}).fill('Call marketing');
  await dialog.getByRole('button',{name:'Save follow-up'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Changed elsewhere');
  await expect(dialog.getByLabel('Title *',{exact:true})).toHaveValue('Call marketing');
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('[data-view=all]').click();await expect(page.locator('#crm')).toBeHidden();
});
test('local midnight refreshes groups, paging is bounded, and failed completion keeps the task',async({page})=>{
  await page.clock.install({time:new Date('2026-03-28T22:59:30Z')});
  const {records}=await fixture(page);
  for(let i=0;i<26;i++)records.push({id:crypto.randomUUID(),company_id:companyId,company_name:company.company_name,pipeline_status:'CONTACTED',title:'Task '+i,due_at:'2026-03-28T23:30:00.000Z',version:1});
  await page.goto('/admin/follow-ups');
  await expect(page.getByRole('region',{name:'Upcoming'}).locator('[data-followup]')).toHaveCount(25);
  await page.getByRole('region',{name:'Upcoming'}).getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('region',{name:'Upcoming'}).locator('[data-followup]')).toHaveCount(1);
  await page.clock.fastForward(61000);
  await expect(page.getByRole('region',{name:'Today'}).locator('[data-followup]')).toHaveCount(25);
  await expect(page.getByRole('region',{name:'Upcoming'}).locator('[data-followup]')).toHaveCount(0);
  await page.route('**/api/admin?*',route=>new URL(route.request().url()).searchParams.get('action')==='crm-followup-complete'?route.fulfill({status:409,json:{error:'Follow-up changed'}}):route.fallback());
  await page.getByRole('button',{name:'Mark complete',exact:true}).first().click();
  await expect(page.getByRole('alert')).toContainText('Follow-up changed');
  await expect(page.getByRole('region',{name:'Today'}).locator('[data-followup]')).toHaveCount(25);
});
