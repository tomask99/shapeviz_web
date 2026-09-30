import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222',taskId='33333333-3333-4333-8333-333333333333';
async function fixture(page,{failSave=false,archived=false,delay=0}={}){
 const company={id,company_name:'BRIK a.s.',industry:'Furniture',website:'https://brik.example',short_description:'Furniture manufacturer creating chairs, sofas and interior solutions.',version:1,archived_at:archived?'2026-09-30':null};
 const client={company_id:id,company_name:company.company_name,...company,active:true,client_since:'2026-09-22',account_notes:'Existing account note'};
 const calls=[];let tasks=[],notes=[],failTask=failSave,failNote=failSave,failClient=failSave;
 await page.route('**/api/admin?*',async route=>{
  const u=new URL(route.request().url()),action=u.searchParams.get('action'),body=route.request().postDataJSON();calls.push({action,body,params:Object.fromEntries(u.searchParams)});
  let data={items:[]};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='crm-clients'){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));data={items:[{...client,...company}],total:1};}
  if(action==='crm-client')data={item:client,company};
  if(action==='crm-client-update'||action==='crm-client-create'){
   if(failClient){failClient=false;return route.fulfill({status:409,json:{error:'Client save failed. Try again.'}});}
   Object.assign(company,body,{website:body.website&&!body.website.startsWith('https://')?'https://'+body.website:body.website,version:company.version+1});data={company,item:client};
  }
  if(action==='crm-client-tasks')data={items:tasks,hasMore:false};
  if(action==='crm-client-task-save'){
   if(failTask){failTask=false;return route.fulfill({status:409,json:{error:'Task changed. Please retry.'}});}
   let task=tasks.find(t=>t.id===body.id);if(task)Object.assign(task,body,{version:task.version+1});else{task={id:taskId,title:body.title,completed:false,version:1};tasks.push(task);}data={item:task};
  }
  if(action==='crm-client-task-delete'){tasks=tasks.filter(t=>t.id!==body.id);data={ok:true};}
  if(action==='crm-notes')data={items:notes};
  if(action==='crm-note-save'){
   if(failNote){failNote=false;return route.fulfill({status:502,json:{error:'Notes temporarily unavailable'}});}
   const note={id:taskId,content:body.content,version:1,created_at:'2026-09-30T10:00:00.000Z'};notes.unshift(note);data={item:note};
  }
  return route.fulfill({json:data});
 });return {calls};
}
test('Client cards open a dedicated workspace, preserve history, and support external website links',async({page})=>{
 const {calls}=await fixture(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1600,height:1050});await page.goto('/admin/clients?q=BRIK');
 const card=page.locator('.client-card');await expect(card).toContainText('BRIK a.s.');await expect(card).toContainText('Furniture');await expect(card).toContainText('brik.example');await expect(card.locator('.client-website')).toHaveAttribute('target','_blank');
 await page.screenshot({path:'.cache/clients-cards-desktop.png',fullPage:true});
 const description=await card.locator('.client-card-description').boundingBox();await page.mouse.click(description.x+description.width/2,description.y+description.height/2);await expect(page).toHaveURL('/admin/clients/'+id);await expect(page.locator('#nav-clients')).toHaveClass('active');
 await expect(page.getByRole('heading',{name:'Task list.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Notes.',exact:true})).toBeVisible();
 for(const title of ['Research summary','Suggested pitch angle','Recommended services','Sources','Duplicate check'])await expect(page.getByRole('heading',{name:title,exact:true})).toHaveCount(0);
 expect(calls.some(c=>c.action==='crm-detail'||c.action.startsWith('crm-research'))).toBe(false);
 await page.screenshot({path:'.cache/client-workspace-desktop.png',fullPage:true});
 await page.goBack();await expect(page).toHaveURL('/admin/clients?q=BRIK');await expect(page.getByRole('searchbox')).toHaveValue('BRIK');
 await card.getByRole('link',{name:'BRIK a.s.'}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL('/admin/clients/'+id);await page.reload();await expect(page.getByRole('heading',{name:'Task list.'})).toBeVisible();expect(errors).toEqual([]);
});
test('Notes and tasks preserve failed drafts and persist create, complete, reopen, edit and delete on mobile',async({page})=>{
 const {calls}=await fixture(page,{failSave:true});await page.setViewportSize({width:390,height:844});await page.goto('/admin/clients/'+id);
 const taskPanel=page.locator('.client-tasks'),notePanel=page.locator('.client-notes');
 await taskPanel.getByLabel('New task',{exact:true}).fill('Prepare <renders>');await taskPanel.getByRole('button',{name:'Add task',exact:true}).click();await expect(taskPanel).toContainText('Task changed');await expect(taskPanel.getByLabel('New task',{exact:true})).toHaveValue('Prepare <renders>');
 await taskPanel.getByRole('button',{name:'Add task',exact:true}).click();await expect(taskPanel.getByRole('checkbox',{name:'Prepare <renders>'})).toBeVisible();
 await taskPanel.getByRole('checkbox').check();await expect(taskPanel.getByRole('checkbox')).toBeChecked();await page.reload();await expect(taskPanel.getByRole('checkbox')).toBeChecked();
 await taskPanel.getByRole('checkbox').uncheck();await expect(taskPanel.getByRole('checkbox')).not.toBeChecked();
 await taskPanel.getByRole('button',{name:'Edit task: Prepare <renders>'}).click();await taskPanel.getByLabel('Edit task',{exact:true}).fill('Final renders');await taskPanel.getByRole('button',{name:'Save task',exact:true}).click();await expect(taskPanel.getByRole('checkbox',{name:'Final renders'})).toBeVisible();
 await notePanel.getByLabel('New note',{exact:true}).fill('Client prefers <oak> & warm light.');await notePanel.getByRole('button',{name:'Save note',exact:true}).click();await expect(notePanel).toContainText('Notes temporarily unavailable');await expect(notePanel.getByLabel('New note',{exact:true})).toHaveValue('Client prefers <oak> & warm light.');await notePanel.getByRole('button',{name:'Save note',exact:true}).click();await expect(notePanel.locator('.client-note')).toContainText('Client prefers <oak> & warm light.');
 await page.reload();await expect(notePanel.locator('.client-note')).toContainText('Client prefers <oak> & warm light.');await expect(taskPanel.getByRole('checkbox',{name:'Final renders'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.cache/client-workspace-mobile.png',fullPage:true});
 page.once('dialog',d=>d.accept());await taskPanel.getByRole('button',{name:'Delete task: Final renders'}).click();await expect(taskPanel).toContainText('No tasks yet.');expect(calls.filter(c=>c.action==='crm-client-task-save').map(c=>c.body.completed).filter(v=>typeof v==='boolean')).toEqual([true,false]);
});
test('Archived clients retain their workspace but cannot change tasks',async({page})=>{
 await fixture(page,{archived:true});await page.goto('/admin/clients/'+id);await expect(page.getByLabel('New task',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Edit client',exact:true})).toBeDisabled();await expect(page.getByLabel('New note',{exact:true})).toBeEnabled();
});
test('Edit client updates four fields without replacing note or task drafts',async({page})=>{
 const {calls}=await fixture(page,{failSave:true});await page.setViewportSize({width:1600,height:1000});await page.goto('/admin/clients/'+id);
 await page.getByLabel('New task',{exact:true}).fill('Unfinished task draft');await page.getByLabel('New note',{exact:true}).fill('Unfinished note draft');
 await page.getByRole('button',{name:'Edit client',exact:true}).click();const dialog=page.locator('#client-editor');await expect(dialog.getByLabel('Company name',{exact:true})).toHaveValue('BRIK a.s.');expect(await dialog.locator('input,textarea').count()).toBe(4);
 await dialog.getByLabel('Company name',{exact:true}).fill('BRIK Studio');await dialog.getByLabel('Website',{exact:true}).fill('studio.example');await dialog.getByLabel('What the company does',{exact:true}).fill('Sofa manufacturer');await dialog.getByLabel('Short description',{exact:true}).fill('Makes <custom> sofas.');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toContainText('Client save failed');await expect(dialog.getByLabel('Company name',{exact:true})).toHaveValue('BRIK Studio');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('#crm .page-heading h1')).toContainText('BRIK Studio');await expect(page.locator('.client-summary')).toContainText('Sofa manufacturer');await expect(page.locator('.client-summary .client-website')).toHaveAttribute('href','https://studio.example/');await expect(page.getByLabel('New note',{exact:true})).toHaveValue('Unfinished note draft');await expect(page.getByLabel('New task',{exact:true})).toHaveValue('Unfinished task draft');
 await page.getByRole('button',{name:'Edit client',exact:true}).click();await expect(dialog.getByLabel('Short description',{exact:true})).toHaveValue('Makes <custom> sofas.');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.screenshot({path:'.cache/client-edit-desktop.png',fullPage:true});await page.reload();await expect(page.locator('#crm .page-heading h1')).toContainText('BRIK Studio');
 expect(calls.filter(c=>c.action==='crm-client-update')[0].body.version).toBe(1);expect(calls.some(c=>c.action==='crm-update'||c.action==='crm-status')).toBe(false);
});
test('Add client uses a small mobile form and opens the new client directly, with a stable retry key',async({page})=>{
 const {calls}=await fixture(page,{failSave:true});await page.setViewportSize({width:390,height:844});await page.goto('/admin/clients');await page.getByRole('button',{name:'Add client',exact:true}).click();const dialog=page.locator('#client-editor');
 await dialog.getByLabel('Company name',{exact:true}).fill('Manual client');await dialog.getByLabel('Website',{exact:true}).fill('manual.example');await dialog.getByLabel('What the company does',{exact:true}).fill('Interior design');await dialog.getByLabel('Short description',{exact:true}).fill('An existing studio client.');
 await page.screenshot({path:'.cache/client-add-mobile.png',fullPage:true});expect(await dialog.locator('input,textarea').count()).toBe(4);await expect(dialog.getByLabel('Pipeline status')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Add client',exact:true}).click();await expect(dialog).toContainText('Client save failed');await expect(dialog.getByLabel('Company name',{exact:true})).toHaveValue('Manual client');await dialog.getByRole('button',{name:'Add client',exact:true}).click();
 await expect(page).toHaveURL('/admin/clients/'+id);await expect(page.locator('#crm .page-heading h1')).toContainText('Manual client');await expect(page.getByRole('heading',{name:'Task list.'})).toBeVisible();await expect(page.locator('#client-editor[open]')).toHaveCount(0);
 const creates=calls.filter(c=>c.action==='crm-client-create');expect(creates).toHaveLength(2);expect(creates[0].body.requestId).toBe(creates[1].body.requestId);expect(calls.some(c=>['crm-create','crm-status','crm-client-convert'].includes(c.action))).toBe(false);
 await page.getByRole('link',{name:'← All clients',exact:true}).click();await expect(page.locator('.client-card')).toContainText('Manual client');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('A late clients response cannot overwrite another page',async({page})=>{
 await fixture(page,{delay:500});await page.goto('/admin/clients');await page.locator('#nav-research').click();await expect(page).toHaveURL('/admin/ai-research');await page.waitForTimeout(600);await expect(page.locator('.client-card')).toHaveCount(0);
});
