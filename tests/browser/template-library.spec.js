import {test,expect} from '@playwright/test';

test('save multiple templates first, then choose one to create a client presentation',async({page})=>{
 const projects=[{deck_slug:'milenium',client:'Milenium',title:'Art direction',status:'published',is_template:false}];
 const finalizations=[],variants=[];
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects};
  if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='sign-upload')data={object:'uploads/owner/source.html',url:'/mock-upload'};
  if(action==='finalize'){
   const body=route.request().postDataJSON();finalizations.push(body);
   projects.push({deck_slug:body.slug,client:body.client,title:body.title,is_template:body.isTemplate,status:body.isTemplate?'draft':'published'});
   data={url:'/p/'+body.slug};
  }
  if(action==='variant'){
   const body=route.request().postDataJSON();variants.push(body);
   projects.push({deck_slug:'hrno',client:body.client,title:projects.find(p=>p.deck_slug===body.template).title,status:'published',is_template:false});
   data={url:'/p/hrno'};
  }
  await route.fulfill({json:data});
 });
 await page.route('**/mock-upload',route=>route.fulfill({json:{}}));
 await page.goto('/adminlogin');
 await expect(page.locator('#projects')).toContainText('Milenium');
 await page.locator('#open-template-upload').click();
 await expect(page.locator('#upload-title')).toHaveText('Upload a template.');
 await page.locator('#upload-dialog [data-close]').click();
 await expect(page.locator('#metrics')).toBeHidden();
 for(const name of ['Monthly pitch','Product launch']){
  await page.getByRole('button',{name:'Upload template ＋',exact:true}).click();
  await expect(page.locator('#upload-name-label')).toHaveText('Template name');
  await expect(page.locator('#publish-label')).toBeHidden();
  await page.locator('#html-file').setInputFiles({name:'template.html',mimeType:'text/html',buffer:Buffer.from('<h1 data-embed="client-name">&lt;embed text&gt;</h1><script>window.setShapevizClientName=function(name){document.querySelector("h1").textContent=name}</script>')});
  await page.locator('#upload-form [name=client]').fill(name);
  await page.locator('#upload-form [name=title]').fill(name+' title');
  await page.locator('#upload-form [type=submit]').click();
  await expect(page.locator('#upload-dialog')).not.toBeVisible();
  await expect(page.locator('#projects')).toContainText(name);
 }
 expect(variants).toEqual([]);
 expect(finalizations).toHaveLength(2);
 expect(finalizations.every(body=>body.isTemplate===true&&body.publish===false)).toBe(true);
 await expect(page.locator('#projects .template-row')).toHaveCount(2);
 await expect(page.locator('#projects')).not.toContainText('Milenium');
 await page.locator('[data-view=all]').click();
 await expect(page.locator('#projects .project-row')).toHaveCount(1);
 await expect(page.locator('#projects a.project-icon')).toHaveAttribute('href','/p/milenium');
 await page.locator('#upload-top').click();
 await page.locator('#create-from-template').click();
 const select=page.locator('#variant-form [name=template]');
 await expect(select.locator('option')).toHaveCount(3);
 for(const option of await select.locator('option').all()){
  await expect(option).toHaveCSS('color','rgb(0, 0, 0)');
  await expect(option).toHaveCSS('background-color','rgb(255, 255, 255)');
 }
 await select.selectOption('template-monthly-pitch');
 await select.selectOption('template-product-launch');
 await expect(page.locator('#variant-form input:visible')).toHaveCount(1);
 await page.locator('#variant-form [name=client]').fill('Hrno');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'.cache/template-picker-mobile.png'});
 await page.locator('#variant-form [type=submit]').click();
 await expect(page.locator('#variant-dialog')).not.toBeVisible();
 expect(variants).toEqual([{template:'template-product-launch',client:'Hrno'}]);
 await expect(page.locator('#projects')).toContainText('Product launch title');
 await expect(page.locator('#projects .project-row')).toHaveCount(2);
 await page.locator('[data-view=templates]').click();
 await expect(page.locator('#projects .template-row')).toHaveCount(2);
});

test('template library supports renaming and confirmed deletion with Storage cleanup feedback',async({page})=>{
 let template={deck_slug:'template-monthly',client:'Monthly',title:'Pitch',is_template:true,status:'draft'},deletions=0;
 await page.route('**/api/admin?*',route=>{
  const action=new URL(route.request().url()).searchParams.get('action');let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects:template?[template]:[]};
  if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='update'){const body=route.request().postDataJSON();expect(body).toEqual({slug:'template-monthly',client:'Monthly 2026',title:'New pitch'});Object.assign(template,body);}
  if(action==='delete'){expect(route.request().postDataJSON()).toEqual({slug:'template-monthly',confirmSlug:'template-monthly'});deletions++;template=null;data={ok:true,deletedFiles:4,sharedFiles:0};}
  return route.fulfill({json:data});
 });
 await page.goto('/adminlogin');await page.locator('[data-view=templates]').click();
 await page.getByRole('button',{name:'Edit template Monthly',exact:true}).click();
 await page.locator('#template-edit-form [name=client]').fill('Monthly 2026');
 await page.locator('#template-edit-form [name=title]').fill('New pitch');
 await page.locator('#template-edit-form [type=submit]').click();
 await expect(page.locator('#projects')).toContainText('Monthly 2026');
 await page.getByRole('button',{name:'Delete template Monthly 2026',exact:true}).click();
 await expect(page.locator('#delete-slug')).toHaveText('delete');
 await expect(page.locator('#delete-description')).toContainText('uploaded files and associated records from Supabase');
 await page.getByRole('button',{name:'Keep template',exact:true}).click();expect(deletions).toBe(0);
 await page.getByRole('button',{name:'Delete template Monthly 2026',exact:true}).click();
 await page.locator('#delete-form input').fill('wrong');
 await page.locator('#delete-submit').click();expect(deletions).toBe(0);
 await expect(page.locator('#delete-form [role=alert]')).toContainText('Type delete');
 await page.locator('#delete-form input').fill('delete');await page.locator('#delete-submit').click();
 await expect(page.locator('#projects')).toContainText('No templates saved');
 await expect(page.locator('#notice')).toContainText('Template deleted. 4 Storage files removed.');
 await page.locator('[data-view=all]').click();await expect(page.locator('#metrics')).toBeVisible();
});

test('empty template picker offers an upload without submitting a presentation',async({page})=>{
 await page.route('**/api/admin?*',route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  return route.fulfill({json:action==='me'?{email:'owner@example.com'}:action==='list'?{projects:[]}:{summary:{},daily:[],decks:[]}});
 });
 await page.goto('/adminlogin');await page.locator('#upload-top').click();await page.locator('#create-from-template').click();
 await expect(page.locator('#no-templates')).toBeVisible();
 await expect(page.locator('#variant-form [type=submit]')).toBeDisabled();
 await page.locator('#upload-template-from-create').click();
 await expect(page.locator('#variant-dialog')).not.toBeVisible();
 await expect(page.locator('#upload-title')).toHaveText('Upload a template.');
});
