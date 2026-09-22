import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222';
async function fixture(page,{linked=false,failLink=false}={}){
  const calls=[];
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();calls.push({action,body});
    let data={};
    if(action==='me')data={email:'owner@example.test'};
    if(action==='list')data={projects:[{deck_slug:'template',client:'Template',title:'Pitch',is_template:true,status:'draft',slide_count:1},{deck_slug:'pitch',client:'Client',title:'Pitch',is_template:false,status:'published',slide_count:1}]};
    if(action==='stats')data={summary:{},daily:[],decks:[]};
    if(action==='crm-list')data={companies:[{id:companyId,company_name:'Nario <studio>'}],total:1};
    if(action==='crm-presentation-company')data={item:linked?{company_id:companyId,company:{company_name:'Nario <studio>'}}:null};
    if(action==='variant')data={project:{deck_slug:'new-pitch'},url:'/p/new-pitch'};
    if(action==='sign-upload')data={uploadId:'test-id',object:'uploads/owner/test-id/source.html',url:'/mock-upload'};
    if(action==='finalize')data={url:'/p/uploaded-pitch'};
    if(action==='crm-presentation-ensure'&&failLink){failLink=false;return route.fulfill({status:503,json:{error:'Temporary failure'}});}
    return route.fulfill({json:data});
  });
  await page.route('**/mock-upload',route=>route.fulfill({json:{}}));
  await page.goto('/admin');return calls;
}
async function choose(form){
  await form.locator('summary').filter({hasText:'CRM company'}).click();
  await form.getByLabel('Search CRM companies').fill('Nario');
  await form.getByLabel('Search CRM companies').press('Enter');
  await form.getByLabel('CRM company',{exact:true}).selectOption(companyId);
}
test('template creation retries only CRM association after deck save, then resets on reopen',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=await fixture(page,{failLink:true});
  await page.locator('[data-view=templates]').click();await page.locator('[data-variant=template]').click();
  const form=page.locator('#variant-form');await form.locator('[name=client]').fill('Nario');await choose(form);
  await page.screenshot({path:'.cache/studio-company-desktop.png',fullPage:true});
  await form.locator('[type=submit]').click();await expect(form.locator('[data-form-error]')).toContainText('Presentation saved at /p/new-pitch');
  await expect(form.locator('[name=client]')).toBeDisabled();await form.locator('[type=submit]').click();await expect(page.locator('#variant-dialog')).not.toBeVisible();
  expect(calls.filter(c=>c.action==='variant')).toHaveLength(1);expect(calls.filter(c=>c.action==='crm-presentation-ensure')).toHaveLength(2);
  expect(calls.find(c=>c.action==='crm-presentation-ensure').body).toEqual({companyId,slug:'new-pitch'});
  await page.locator('[data-view=templates]').click();await page.locator('[data-variant=template]').click();await expect(form.locator('[name=client]')).toBeEnabled();await expect(form.locator('select[data-company-select]')).toHaveValue('');
  await page.setViewportSize({width:390,height:844});await choose(form);await page.screenshot({path:'.cache/studio-company-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('edit can assign an unlinked deck and retry without updating twice',async({page})=>{
  const calls=await fixture(page,{failLink:true});await page.locator('[data-edit=pitch]').click();const form=page.locator('#edit-form');await choose(form);
  await form.locator('[type=submit]').click();await expect(form.locator('[data-form-error]')).toContainText('CRM link failed');await form.locator('[type=submit]').click();await expect(page.locator('#edit-dialog')).not.toBeVisible();
  expect(calls.filter(c=>c.action==='update')).toHaveLength(1);expect(calls.filter(c=>c.action==='crm-presentation-ensure')).toHaveLength(2);
});
test('existing association is retained and template uploads have no company picker',async({page})=>{
  const calls=await fixture(page,{linked:true});await page.locator('[data-edit=pitch]').click();const form=page.locator('#edit-form');await expect(form.getByRole('link',{name:'Nario <studio>'})).toHaveAttribute('href',`/admin/leads/${companyId}?tab=presentations`);await expect(form.locator('details')).toBeHidden();
  await form.locator('[type=submit]').click();await expect(page.locator('#edit-dialog')).not.toBeVisible();expect(calls.filter(c=>c.action==='crm-presentation-ensure')).toHaveLength(0);
  await page.locator('[data-view=templates]').click();await page.locator('#upload-top').click();await expect(page.locator('#upload-form .studio-company')).toBeHidden();
});
test('HTML upload retries the CRM link without uploading or finalizing again',async({page})=>{
  const calls=await fixture(page,{failLink:true});await page.locator('#upload-top').click();await page.locator('#create-from-upload').click();
  const form=page.locator('#upload-form');await page.locator('#html-file').setInputFiles({name:'pitch.html',mimeType:'text/html',buffer:Buffer.from('<h1>Pitch</h1>')});
  await form.locator('[name=client]').fill('Nario');await form.locator('[name=title]').fill('Pitch');await choose(form);
  await form.locator('[type=submit]').click();await expect(form.locator('[data-form-error]')).toContainText('/p/uploaded-pitch');await form.locator('[type=submit]').click();await expect(page.locator('#upload-dialog')).not.toBeVisible();
  for(const action of ['sign-upload','finalize'])expect(calls.filter(c=>c.action===action)).toHaveLength(1);
  expect(calls.filter(c=>c.action==='crm-presentation-ensure')).toHaveLength(2);
});
