import {test,expect} from '@playwright/test';
test.use({timezoneId:'Europe/Bratislava'});
const companyId='22222222-2222-4222-8222-222222222222';
async function fixture(page){
 const state={fail:false,conflict:false,calls:[],records:[{id:'44444444-4444-4444-8444-444444444444',title:'Call director',due_at:'2026-09-22T09:00:00.000Z'},{id:'55555555-5555-4555-8555-555555555555',title:'Send proposal',due_at:'2026-09-22T17:00:00.000Z'}].map(r=>({...r,company_id:companyId,company_name:'Nario <studio>',pipeline_status:'CONTACTED',version:1,description:'Private follow-up note',completed_at:null}))};
 await page.clock.install({time:new Date('2026-09-22T12:00:00Z')});
 await page.route('**/api/admin?*',async route=>{
  const p=new URL(route.request().url()).searchParams,a=p.get('action'),body=route.request().postDataJSON();state.calls.push(a);let data={};
  if(a==='me')data={email:'owner@example.test'};if(a==='list')data={projects:[]};if(a==='stats')data={summary:{visits:9},daily:[],decks:[]};
  if(a==='crm-overview')data={total_leads:1,stages:{CONTACTED:1},followups:{},next_tasks:[]};
  if(a==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(a==='crm-contacts')data={items:[],hasMore:false};
  if(a==='crm-action-center'){
   if(state.fail){state.fail=false;return route.fulfill({status:503,json:{error:'Tasks unavailable'}});}
   const keys=p.get('group')?[p.get('group')]:['overdue','today'],pageNumber=Number(p.get('page')||1);
   data={groups:keys.map(key=>{const rows=state.records.filter(r=>!r.completed_at&&(r.due_at<'2026-09-22T12:00:00.000Z'?'overdue':r.due_at<p.get('tomorrow')?'today':'later')===key);return {key,total:rows.length,page:pageNumber,pageSize:10,items:rows.slice((pageNumber-1)*10,pageNumber*10)};})};
  }
  if(['crm-followup-complete','crm-followup-save'].includes(a)){
   if(state.conflict){state.conflict=false;return route.fulfill({status:409,json:{error:'Follow-up changed. Refresh first.'}});}
   const item=state.records.find(r=>r.id===body.id);Object.assign(item,body,{version:item.version+1,...(a==='crm-followup-complete'?{completed_at:'2026-09-22T12:00:00Z'}:{})});data={item};
  }
  await route.fulfill({json:data});
 });return state;
}
test('Today completes and reschedules in place, refreshes metrics, preserves analytics and mobile layout',async({page})=>{
 const s=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin');const root=page.locator('#action-center');
 await expect(root).toContainText('Call director');await expect(root).toContainText('Send proposal');await expect(root.getByRole('link',{name:'Nario <studio>'}).first()).toHaveAttribute('href','/admin/leads/'+companyId);
 await root.screenshot({path:'.cache/action-center-desktop.png'});await page.setViewportSize({width:390,height:844});await root.screenshot({path:'.cache/action-center-populated-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('#metrics')).toBeHidden();expect(await root.evaluate(el=>el.compareDocumentPosition(document.querySelector('#business-overview'))&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
 await root.getByRole('button',{name:'Mark complete'}).first().click();await expect(root).not.toContainText('Call director');expect(s.calls.filter(a=>a==='crm-overview').length).toBeGreaterThan(1);
 await root.getByRole('button',{name:'Edit / reschedule'}).click();const dialog=page.locator('#action-followup-dialog');await dialog.getByLabel('Due date and time').fill('2026-09-23T11:00');await dialog.getByRole('button',{name:'Save follow-up'}).click();await expect(dialog).toBeHidden();await expect(root).not.toContainText('Send proposal');await expect(page).toHaveURL('/admin');
 await page.reload();await expect(root).toContainText('No overdue follow-ups.');await expect(root).toContainText('No follow-ups today.');
 await page.setViewportSize({width:390,height:844});await root.screenshot({path:'.cache/action-center-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('Action Center errors/conflicts preserve tasks and drafts, retry works, hidden views stop polling',async({page})=>{
 const s=await fixture(page);s.fail=true;await page.goto('/admin');const root=page.locator('#action-center');await expect(root.getByRole('alert')).toContainText('Tasks unavailable');await expect(page.locator('#business-overview')).toContainText('at a glance');await root.getByRole('button',{name:'Try again'}).click();await expect(root).toContainText('Call director');
 s.conflict=true;await root.getByRole('button',{name:'Mark complete'}).first().click();await expect(root.getByRole('alert')).toContainText('Refresh');await expect(root).toContainText('Call director');
 await root.getByRole('button',{name:'Edit / reschedule'}).first().click();const dialog=page.locator('#action-followup-dialog');await dialog.getByLabel('Title',{exact:false}).fill('Preserve draft');s.conflict=true;await dialog.getByRole('button',{name:'Save follow-up'}).click();await expect(dialog.getByRole('alert')).toContainText('Refresh');await expect(dialog.getByLabel('Title',{exact:false})).toHaveValue('Preserve draft');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('[data-view=templates]').click();await expect(root).toBeHidden();const count=s.calls.filter(a=>a==='crm-action-center').length;await page.clock.runFor(61000);expect(s.calls.filter(a=>a==='crm-action-center').length).toBe(count);
 await page.locator('[data-view=all]').click();await expect(root).toContainText('Call director');await page.locator('#nav-leads').click();await expect(root).toBeHidden();await expect(root).toBeEmpty();
});
test('Today paginates bounded queues and refreshes due times without polling an open editor',async({page})=>{
 const s=await fixture(page);for(let i=0;i<11;i++)s.records.push({...s.records[0],id:crypto.randomUUID(),title:'Extra '+i});await page.goto('/admin');const root=page.locator('#action-center'),overdue=root.getByRole('region',{name:'Overdue'});
 await expect(overdue.locator('.crm-entry')).toHaveCount(10);await overdue.getByRole('button',{name:'Next',exact:true}).click();await expect(overdue.locator('.crm-entry')).toHaveCount(2);
 const count=s.calls.filter(a=>a==='crm-action-center').length;await page.clock.runFor(61000);await expect.poll(()=>s.calls.filter(a=>a==='crm-action-center').length).toBeGreaterThan(count);
 await overdue.getByRole('button',{name:'Edit / reschedule'}).first().click();await expect(page.locator('#action-followup-dialog')).toBeVisible();const editingCount=s.calls.filter(a=>a==='crm-action-center').length;await page.clock.runFor(61000);expect(s.calls.filter(a=>a==='crm-action-center').length).toBe(editingCount);
});
test('a task change refreshes metrics even while an older overview response is pending',async({page})=>{
 await fixture(page);let release,calls=0;const held=new Promise(r=>release=r);
 await page.route('**/api/admin?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('action')!=='crm-overview')return route.fallback();
  const current=++calls;if(current===1)await held;
  await route.fulfill({json:{total_leads:current===1?10:20,stages:{},followups:{},next_tasks:[]}});
 });
 try{
  await page.goto('/admin');await expect(page.locator('#action-center')).toContainText('Call director');
  await page.locator('#action-center').getByRole('button',{name:'Mark complete'}).first().click();
  await expect(page.locator('#business-overview .business-cards').first()).toContainText('20');release();
  await expect(page.locator('#business-overview .business-cards').first()).not.toContainText('10');
 }finally{release();}
});
