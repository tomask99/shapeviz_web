import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';
async function fixture(page){
 const state={hidden:false,saved:null,fail:false,failSave:false,hold:null};
 await page.route('**/api/admin?*',async route=>{
  const p=new URL(route.request().url()).searchParams,a=p.get('action'),body=route.request().postDataJSON();let data={};
  if(a==='me')data={email:'owner@example.test'};if(a==='list')data={projects:[]};if(a==='stats')data={summary:{},daily:[],decks:[]};if(a==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(a==='crm-overview')data={total_leads:1,stages:{},followups:{},next_tasks:[]};if(a==='crm-action-center')data={groups:[]};if(a==='crm-recent-activity')data={items:[],next:null};if(a==='crm-contacts')data={items:[],hasMore:false};
  if(a==='crm-suggestions'){
   if(state.hold)await state.hold;
   if(state.fail){state.fail=false;return route.fulfill({status:503,json:{error:'Suggestions unavailable'}});}
   const items=state.saved||state.hidden!==(p.get('hidden')==='true')?[]:[{company_id:id,company_name:'Nario <studio>',rule:'REPLIED_NEEDS_ACTION',dismissed_at:state.hidden?'2026-09-22T12:00:00Z':null}];
   data={items,total:items.length,page:1,pageSize:10,config:{snoozeHours:24,viewedNoReplyDays:3}};
  }
  if(a==='crm-suggestion-state')state.hidden=body.action!=='restore';
  if(a==='crm-followup-save'){
   if(state.failSave){state.failSave=false;return route.fulfill({status:409,json:{error:'Save failed; retry'}});}
   state.saved=body;data={item:body};
  }await route.fulfill({json:data});
 });return state;
}
test('suggestions snooze, restore, dismiss and create an editable follow-up on mobile',async({page})=>{
 const s=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin');const root=page.locator('#crm-suggestions');await expect(root).toContainText('Nario <studio>');await expect(root.getByRole('link')).toHaveAttribute('href','/admin/leads/'+id);
 await page.setViewportSize({width:390,height:844});await root.screenshot({path:'.cache/suggestions-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await root.getByRole('button',{name:'Snooze 24h'}).click();await expect(root).toContainText('No suggestions right now');await page.reload();await expect(root).toContainText('No suggestions right now');
 await root.getByRole('button',{name:'Show snoozed / dismissed'}).click();await root.getByRole('button',{name:'Restore suggestion'}).click();await root.getByRole('button',{name:'Show active suggestions'}).click();await expect(root).toContainText('Nario <studio>');
 await root.getByRole('button',{name:'Dismiss',exact:true}).click();await root.getByRole('button',{name:'Show snoozed / dismissed'}).click();await expect(root).toContainText('Dismissed until restored');await root.getByRole('button',{name:'Restore suggestion'}).click();await root.getByRole('button',{name:'Show active suggestions'}).click();
 await root.getByRole('button',{name:'Create follow-up'}).click();const dialog=page.locator('#action-followup-dialog');await expect(dialog.getByLabel('Title',{exact:false})).toHaveValue('Follow up on reply');expect(await dialog.getByLabel('Due date and time',{exact:false}).inputValue()).toBeTruthy();await expect(dialog).toContainText('Nario <studio>');
 await dialog.getByLabel('Title',{exact:false}).fill('Custom next step');s.failSave=true;await dialog.getByRole('button',{name:'Save follow-up'}).click();await expect(dialog.getByRole('alert')).toContainText('Save failed');await expect(dialog.getByLabel('Title',{exact:false})).toHaveValue('Custom next step');await dialog.getByRole('button',{name:'Save follow-up'}).click();await expect(dialog).toBeHidden();await expect(root).toContainText('No suggestions right now');expect(s.saved.companyId).toBe(id);expect(s.saved.title).toBe('Custom next step');expect(s.saved.id).toBeUndefined();expect(errors).toEqual([]);
});
test('suggestion read error retries and late response cannot repopulate hidden view',async({page})=>{
 const s=await fixture(page);s.fail=true;await page.goto('/admin');const root=page.locator('#crm-suggestions');await expect(root.getByRole('alert')).toContainText('unavailable');await root.getByRole('button',{name:'Retry suggestions'}).click();await expect(root).toContainText('Nario <studio>');
 let release;s.hold=new Promise(r=>release=r);
 try{await root.getByRole('button',{name:'Refresh suggestions'}).click();await expect(root.getByRole('status')).toBeVisible();await page.locator('#nav-leads').click();release();await expect(root).toBeHidden();await expect(root).toBeEmpty();}finally{release();}
});
