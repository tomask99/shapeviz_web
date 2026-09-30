import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222',firstId='33333333-3333-4333-8333-333333333333',secondId='44444444-4444-4444-8444-444444444444';
async function fixture(page,{failBrief=false,archived=false,failAction=false}={}){
 const company={id:companyId,company_name:'Studio client',industry:'Furniture',website:'https://studio.example',short_description:'Furniture studio.',version:1,archived_at:archived?'2026-09-30':null};
 const projects=[],tasks=[],notes=[],calls=[];let fail=failBrief,failCardAction=failAction;
 await page.route('**/api/admin?*',async route=>{
  const u=new URL(route.request().url()),action=u.searchParams.get('action'),body=route.request().postDataJSON(),pid=body?.projectId||u.searchParams.get('projectId');calls.push({action,body,projectId:pid});let data={items:[]};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='crm-client')data={company,item:{company_id:companyId,active:true,client_since:'2026-09-30'}};
  if(action==='crm-projects')data={items:projects,hasMore:false};
  if(action==='crm-project')data={item:projects.find(p=>p.id===pid),company};
  if(action==='crm-project-status'||action==='crm-project-delete'){
   if(failCardAction){failCardAction=false;return route.fulfill({status:409,json:{error:'Project changed. Refresh projects before trying again.'}});}
   const project=projects.find(p=>p.id===pid);
   if(action==='crm-project-delete'){projects.splice(projects.indexOf(project),1);data={ok:true};}
   else{Object.assign(project,{status:body.status,version:project.version+1});data={item:project};}
  }
  if(action==='crm-project-save'){
   let project=projects.find(p=>p.id===body.id||p.creation_request_id===body.requestId&&body.requestId);
   if(!project){project={id:projects.length?secondId:firstId,version:0,brief:'',notes:'',creation_request_id:body.requestId};projects.push(project);}
   Object.assign(project,{name:body.name,status:body.status,description:body.description,project_value:body.billing_type==='ONE_TIME'?Number(body.amount):null,monthly_value:body.billing_type==='MONTHLY'?Number(body.amount):null,version:project.version+1});data={item:project};
  }
  if(action==='crm-project-brief-save'){
   if(fail){fail=false;return route.fulfill({status:409,json:{error:'Brief save failed. Your text is still here.'}});}
   const project=projects.find(p=>p.id===pid);Object.assign(project,{brief:body.brief,version:project.version+1});data={item:project};
  }
  if(action==='crm-project-tasks')data={items:tasks.filter(t=>t.project_id===pid)};
  if(action==='crm-project-notes')data={items:notes.filter(n=>n.project_id===pid)};
  if(action==='crm-project-task-save'||action==='crm-project-note-save'){
   const rows=action.includes('-task-')?tasks:notes;let record=rows.find(r=>r.id===body.id&&r.project_id===pid);
   if(record)Object.assign(record,body,{version:record.version+1});else{record={...body,id:crypto.randomUUID(),project_id:pid,completed:false,version:1,created_at:'2026-09-30T10:00:00.000Z'};rows.push(record);}data={item:record};
  }
  if(action==='crm-project-note-delete'){const index=notes.findIndex(n=>n.id===body.id&&n.project_id===pid);notes.splice(index,1);data={ok:true};}
  if(action==='list')data={projects:[]};if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='crm-overview')data={total_leads:1,stages:{WON:1},followups:{today:0,overdue:0,upcoming:0},next_tasks:[],revenue:{currency:'EUR',one_time:{amount:projects.filter(p=>p.status!=='CANCELLED').reduce((s,p)=>s+(p.project_value||0),0).toFixed(2),count:projects.filter(p=>p.status!=='CANCELLED'&&p.project_value!=null).length},monthly:{amount:projects.filter(p=>p.status==='ACTIVE').reduce((s,p)=>s+(p.monthly_value||0),0).toFixed(2),count:projects.filter(p=>p.status==='ACTIVE'&&p.monthly_value!=null).length}}};
  await route.fulfill({json:data});
 });return {projects,calls,tasks,notes};
}
async function create(page,{name='Product renders',amount='1200',billing='ONE_TIME'}={}){
 await page.getByRole('button',{name:'New project',exact:true}).click();const dialog=page.locator('#project-editor');await dialog.getByLabel('Project name',{exact:true}).fill(name);await dialog.getByLabel('Billing',{exact:true}).selectOption(billing);await dialog.getByLabel('Price (EUR)',{exact:true}).fill(amount);await dialog.getByLabel('Short description',{exact:true}).fill('A collection of product images.');await dialog.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.locator('.project-heading')).toContainText(name);
}
test('Client opens project cards below notes on desktop and mobile, with direct card navigation',async({page})=>{
 const {projects}=await fixture(page);projects.push({id:firstId,name:'Product renders',description:'A collection of product images.',status:'ACTIVE',project_value:1200,monthly_value:null,version:1,brief:''},{id:secondId,name:'Monthly content',description:'Social media renders.',status:'ACTIVE',project_value:null,monthly_value:650,version:1,brief:''});
 for(const width of [1600,390]){
  await page.setViewportSize({width,height:1000});await page.goto('/admin/clients/'+companyId);
  const cards=page.locator('.project-card');await expect(cards).toHaveCount(2);await expect(cards.first()).toContainText('Product renders');await expect(cards.first()).toContainText('1,200.00');await expect(cards.first()).toContainText('A collection of product images.');await expect(cards.nth(1)).toContainText('650.00 / month');
  const notes=await page.locator('.client-notes').boundingBox(),projectsPanel=await page.locator('#client-projects-panel').boundingBox();expect(projectsPanel.y).toBeGreaterThanOrEqual(notes.y+notes.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.cache/client-project-cards-${width}.png`,fullPage:true});
 }
 const description=page.locator('.project-card').first().locator('.client-card-description');await description.scrollIntoViewIfNeeded();const bounds=await description.boundingBox();await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await expect(page).toHaveURL('/admin/clients/'+companyId+'?project='+firstId);await expect(page.locator('.project-heading')).toContainText('Product renders');await expect(page.locator('.client-notes')).toBeHidden();
 await page.getByRole('link',{name:'All projects',exact:true}).click();await expect(page.locator('.client-notes')).toBeVisible();const link=page.getByRole('link',{name:'Monthly content',exact:true});await link.focus();await page.keyboard.press('Enter');await expect(page.locator('.project-heading')).toContainText('Monthly content');await page.reload();await expect(page.locator('.project-heading')).toContainText('650.00 / month');
});
test('Project flow saves a brief, scoped tasks and notes, edits billing and updates Overview revenue',async({page})=>{
 const {calls}=await fixture(page,{failBrief:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1600,height:1100});await page.goto('/admin/clients/'+companyId);
 await expect(page.getByRole('heading',{name:'Projects.',exact:true})).toBeVisible();await expect(page.locator('#client-projects-panel')).toContainText('No projects yet.');
 await page.getByLabel('New note',{exact:true}).fill('Company draft');await page.getByRole('button',{name:'New project',exact:true}).click();await page.locator('#project-editor').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByLabel('New note',{exact:true})).toHaveValue('Company draft');await create(page);
 const brief='Deliver 12 renders.\n\nMaterials: oak & steel.\n<Keep these instructions as text>';await page.getByLabel('Detailed brief',{exact:true}).fill(brief);await page.getByRole('button',{name:'Save brief',exact:true}).click();await expect(page.locator('.project-brief')).toContainText('Brief save failed');await expect(page.getByLabel('Detailed brief',{exact:true})).toHaveValue(brief);await page.getByRole('button',{name:'Save brief',exact:true}).click();await expect(page.locator('[data-brief-status]')).toHaveText('Saved');
 const tasks=page.locator('.project-tasks'),notes=page.locator('.project-notes');await tasks.locator('input[name=title]').fill('Model the chair');await tasks.getByRole('button',{name:'Add task',exact:true}).click();await tasks.getByRole('checkbox',{name:'Model the chair'}).check();await expect(tasks.getByRole('checkbox')).toBeChecked();
 await notes.getByLabel('New project note',{exact:true}).fill('Client approved the angle.');await notes.getByRole('button',{name:'Save note',exact:true}).click();await expect(notes.locator('.client-note')).toContainText('Client approved');
 await page.reload();await expect(page.getByLabel('Detailed brief',{exact:true})).toHaveValue(brief);await expect(tasks.getByRole('checkbox')).toBeChecked();await expect(notes.locator('.client-note')).toContainText('Client approved');
 await page.getByLabel('Detailed brief',{exact:true}).fill(brief+'\nUnsaved addition');await page.getByRole('button',{name:'Edit project',exact:true}).click();const editor=page.locator('#project-editor');await editor.getByLabel('Billing',{exact:true}).selectOption('MONTHLY');await editor.getByLabel('Price (EUR)',{exact:true}).fill('650');await editor.getByRole('button',{name:'Save project',exact:true}).click();await expect(page.locator('.project-price').first()).toContainText('650.00 / month');await expect(page.getByLabel('Detailed brief',{exact:true})).toHaveValue(brief+'\nUnsaved addition');
 await page.screenshot({path:'.cache/project-workspace-desktop.png',fullPage:true});await page.getByRole('link',{name:'All projects',exact:true}).click();await expect(page.locator('.project-card')).toContainText('650.00 / month');await create(page,{name:'One-time campaign',amount:'2400'});
 await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=one_time]')).toContainText('2,400.00');await expect(page.locator('[data-revenue=monthly]')).toContainText('650.00 / month');await page.locator('.business-revenue').screenshot({path:'.cache/project-revenue.png'});
 expect(calls.some(c=>c.action==='crm-note-save'||c.action==='crm-client-task-save')).toBe(false);expect(errors).toEqual([]);
});
test('Project notes stay isolated, can be edited/deleted, and the workspace fits mobile',async({page})=>{
 const {projects}=await fixture(page);projects.push({id:firstId,name:'First project',status:'ACTIVE',project_value:1000,monthly_value:null,version:1,brief:'First brief'},{id:secondId,name:'Second project',status:'ACTIVE',project_value:null,monthly_value:400,version:1,brief:''});await page.setViewportSize({width:390,height:844});await page.goto('/admin/clients/'+companyId+'?tab=projects&project='+firstId);
 const notes=page.locator('.project-notes');await notes.getByLabel('New project note',{exact:true}).fill('First project only');await notes.getByRole('button',{name:'Save note',exact:true}).click();await notes.getByRole('button',{name:'Edit note',exact:true}).click();await notes.getByLabel('New project note',{exact:true}).fill('Updated project note');await notes.getByRole('button',{name:'Save changes',exact:true}).click();await expect(notes.locator('.client-note')).toContainText('Updated project note');
 await page.getByRole('link',{name:'All projects',exact:true}).click();await page.getByRole('link',{name:'Second project',exact:true}).click();await expect(notes.locator('.client-note')).toHaveCount(0);await expect(page.locator('.project-tasks')).toContainText('No tasks yet.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.cache/project-workspace-mobile.png',fullPage:true});
 await page.goto('/admin/clients/'+companyId+'?tab=projects&project='+firstId);page.once('dialog',d=>d.accept());await notes.getByRole('button',{name:'Delete note',exact:true}).click();await expect(notes.locator('.client-note')).toHaveCount(0);
});
test('Circular project actions pause, resume, complete, reopen and confirm deletion without opening a card',async({page})=>{
 const {projects,calls}=await fixture(page);projects.push({id:firstId,name:'One-time project',status:'ACTIVE',project_value:350,monthly_value:null,version:1},{id:secondId,name:'Monthly service',status:'ACTIVE',project_value:null,monthly_value:1200,version:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1600,height:1100});await page.goto('/admin/clients/'+companyId);
 await page.getByLabel('New note',{exact:true}).fill('Company draft');const card=page.locator(`[data-project-id="${secondId}"]`);
 await card.getByRole('button',{name:'Pause project: Monthly service',exact:true}).click();await expect(card.locator('.research-tag')).toHaveText('On hold');await expect(card.getByRole('button',{name:'Resume project: Monthly service',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page).toHaveURL('/admin/clients/'+companyId);await expect(page.getByLabel('New note',{exact:true})).toHaveValue('Company draft');
 await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=monthly] strong')).toHaveText('€0.00 / month');await page.goto('/admin/clients/'+companyId);
 await card.getByRole('button',{name:'Resume project: Monthly service',exact:true}).click();await expect(card.locator('.research-tag')).toHaveText('Active');
 await card.getByRole('button',{name:'Complete project: Monthly service',exact:true}).click();await expect(card.locator('.research-tag')).toHaveText('Completed');await expect(card.getByRole('button',{name:'Reopen project: Monthly service',exact:true})).toHaveAttribute('aria-pressed','true');await expect(card.getByRole('button',{name:'Pause project: Monthly service',exact:true})).toBeDisabled();
 await page.reload();await expect(card.locator('.research-tag')).toHaveText('Completed');await page.locator('#client-projects-panel').screenshot({path:'.cache/project-actions-desktop.png'});
 await card.getByRole('button',{name:'Reopen project: Monthly service',exact:true}).focus();await page.keyboard.press('Enter');await expect(card.locator('.research-tag')).toHaveText('Active');
 await page.setViewportSize({width:390,height:844});await card.getByRole('button',{name:'Pause project: Monthly service',exact:true}).click();await expect(card.locator('.research-tag')).toHaveText('On hold');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.locator('#client-projects-panel').screenshot({path:'.cache/project-actions-mobile.png'});
 page.once('dialog',dialog=>dialog.dismiss());await card.getByRole('button',{name:'Delete project: Monthly service',exact:true}).click();await expect(card).toBeVisible();expect(calls.filter(c=>c.action==='crm-project-delete')).toHaveLength(0);
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('Monthly service');expect(dialog.message()).toContain('tasks, notes and brief');dialog.accept();});await card.getByRole('button',{name:'Delete project: Monthly service',exact:true}).click();await expect(card).toHaveCount(0);await expect(page.locator('.project-card')).toHaveCount(1);
 await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=monthly] strong')).toHaveText('€0.00 / month');await expect(page.locator('[data-revenue=one_time]')).toContainText('350.00');
 expect(calls.filter(c=>c.action==='crm-project-status').map(c=>c.body.status)).toEqual(['ON_HOLD','ACTIVE','COMPLETED','ACTIVE','ON_HOLD']);expect(errors).toEqual([]);
});
test('Failed card actions preserve the project and can refresh; archived cards disable all changes',async({page})=>{
 const {projects}=await fixture(page,{failAction:true});projects.push({id:firstId,name:'Retained project',status:'ACTIVE',project_value:900,monthly_value:null,version:1});await page.goto('/admin/clients/'+companyId);
 const card=page.locator('.project-card');await card.getByRole('button',{name:'Pause project: Retained project',exact:true}).click();await expect(card.getByRole('alert')).toContainText('Project changed');await expect(card.locator('.research-tag')).toHaveText('Active');await expect(card.getByRole('button',{name:'Pause project: Retained project',exact:true})).toBeEnabled();
 await card.getByRole('button',{name:'Refresh projects',exact:true}).click();await card.getByRole('button',{name:'Pause project: Retained project',exact:true}).click();await expect(card.locator('.research-tag')).toHaveText('On hold');
 await page.unroute('**/api/admin?*');const archived=await fixture(page,{archived:true});archived.projects.push({...projects[0]});await page.reload();for(const button of await card.locator('.project-icon-button').all())await expect(button).toBeDisabled();
});
