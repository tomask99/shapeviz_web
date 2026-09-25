import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';

async function mock(page,{signedIn=true}={}) {
  let company=null,authenticated=signedIn;
  await page.route('**/api/admin?*',async route=>{
    const url=new URL(route.request().url()),action=url.searchParams.get('action'),body=route.request().postDataJSON();
    let data={};
    if(action==='login')authenticated=true;
    if(!authenticated)return route.fulfill({status:401,json:{error:'Please sign in.'}});
    if(['me','login'].includes(action))data={email:'owner@example.com'};
    if(action==='list')data={projects:[]};
    if(action==='stats')data={summary:{},daily:[],decks:[]};
    if(action==='crm-create')company={...body,id,version:1,country_category:body.country||'INT',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null};
    if(['crm-update','crm-archive'].includes(action)){
      if(body.version!==company.version)return route.fulfill({status:409,json:{error:'This company changed. Reload it before saving again.'}});
      company={...company,...body,version:company.version+1,...(action==='crm-archive'?{archived_at:body.archived?new Date().toISOString():null}:{})};
    }
    if(['crm-create','crm-update','crm-archive','crm-detail'].includes(action))data={company};
    if(action==='crm-list'){
      const match=company&&(!url.searchParams.get('q')||company.company_name.includes(url.searchParams.get('q')))&&(!company.archived_at||url.searchParams.get('archived')!=='active'&&url.searchParams.has('archived'));
      data={companies:match?[company]:[],total:match?1:0,page:1,pageSize:25};
    }
    await route.fulfill({json:data});
  });
}
test('Leads create, edit, refresh, archive, restore and history navigation on desktop/mobile',async({page})=>{
  await mock(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/leads');await expect(page.getByText('No leads here yet.')).toBeVisible();
  await page.locator('#crm .page-heading [data-add]').click();
  const form=page.locator('#lead-form');
  await form.getByLabel('Company name').fill('Nario <studio>');
  await form.getByLabel('Website',{exact:true}).fill('https://nario.example');
  await form.getByRole('combobox',{name:'Country',exact:true}).selectOption('SK');
  await form.getByLabel('Industry',{exact:true}).fill('Furniture');
  await form.getByLabel('Product CGI',{exact:true}).check();
  await form.getByLabel('Social content',{exact:true}).check();
  await form.getByRole('combobox',{name:'Priority',exact:true}).selectOption('HIGH');
  await form.getByRole('button',{name:'Save lead'}).click();
  await expect(page).toHaveURL('/admin/leads/'+id);
  await expect(page.locator('#crm h1')).toContainText('Nario <studio>');
  await page.reload();await expect(page.locator('#crm h1')).toContainText('Nario <studio>');
  await page.getByRole('button',{name:'Edit company'}).click();
  await form.getByRole('combobox',{name:'Pipeline status',exact:true}).selectOption('CONTACTED');
  await form.getByRole('button',{name:'Save lead'}).click();
  await expect(page.locator('#crm .badge').first()).toHaveText('Contacted');
  await page.screenshot({path:'.cache/crm-detail-desktop.png',fullPage:true});
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Archive lead',exact:true}).click();
  await expect(page.getByRole('button',{name:'Restore lead'})).toBeVisible();
  await page.getByRole('link',{name:'All leads'}).click();
  await expect(page.getByText('No leads here yet.')).toBeVisible();
  await page.getByText('Filters & sorting',{exact:true}).click();
  await page.getByRole('combobox',{name:'Show',exact:true}).selectOption('archived');
  await page.locator('a.crm-row').click();
  await page.getByRole('button',{name:'Restore lead'}).click();
  await expect(page.getByRole('button',{name:'Archive lead',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Leads',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('a.crm-row')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/crm-list-mobile.png',fullPage:true});
  await page.locator('a.crm-row').click();await page.goBack();await expect(page.locator('a.crm-row')).toBeVisible();
  await page.locator('[data-view=all]').click();await expect(page.locator('#crm')).toBeHidden();await expect(page.locator('#projects')).toBeHidden();await expect(page.locator('#business-overview')).toBeVisible();
  await page.goBack();await expect(page.locator('a.crm-row')).toBeVisible();expect(errors).toEqual([]);
});
test('deep-link login returns to Leads and styles/scripts are served as assets',async({page})=>{
  await mock(page,{signedIn:false});await page.goto('/admin/leads');
  await expect(page.locator('#signin')).toBeVisible();await expect(page.locator('#studio')).toBeHidden();
  await page.locator('#signin [name=email]').fill('owner@example.com');await page.locator('#signin [name=password]').fill('not-a-real-password');
  await page.locator('#signin button').click();await expect(page.locator('#crm h1')).toContainText('Leads');
  const response=await page.request.get('/admin/crm.js');expect(response.headers()['content-type']).toContain('javascript');
});

test('Leads reports read failures, retries, paginates and preserves filters',async({page})=>{
  await mock(page);let fail=true;
  await page.route('**/api/admin?*',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')!=='crm-list')return route.fallback();
    if(fail)return route.fulfill({status:502,json:{error:'Temporarily unavailable'}});
    const pageNumber=Number(url.searchParams.get('page')||1);
    return route.fulfill({json:{companies:[{id,company_name:'Example '+pageNumber,country:'SK',industry:'Furniture',pipeline_status:'NEW_LEAD',services:[],priority:'HIGH'}],total:26,page:pageNumber,pageSize:25}});
  });
  await page.goto('/admin/leads?country_category=SK&priority=HIGH');
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  fail=false;await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.locator('a.crm-row')).toContainText('Example 1');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('a.crm-row')).toContainText('Example 2');
  expect(new URL(page.url()).searchParams.get('country_category')).toBe('SK');
  expect(new URL(page.url()).searchParams.get('priority')).toBe('HIGH');
  await page.reload();await expect(page.locator('a.crm-row')).toContainText('Example 2');
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('a stale company save keeps the draft and shows a conflict',async({page})=>{
  await mock(page);
  const c={id,version:1,company_name:'Company',country:'CZ',city:'',industry:'',website:'',instagram:'',linkedin:'',short_description:'',services:[],priority:'MEDIUM',lead_source:'Google',pipeline_status:'NEW_LEAD',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='crm-detail')return route.fulfill({json:{company:c}});
    if(action==='crm-update')return route.fulfill({status:409,json:{error:'This company changed. Reload it before saving again.'}});
    return route.fallback();
  });
  await page.goto('/admin/leads/'+id);await page.getByRole('button',{name:'Edit company'}).click();
  await page.locator('#lead-form [name=company_name]').fill('Unsaved draft');
  await page.getByRole('button',{name:'Save lead',exact:true}).click();
  await expect(page.locator('#lead-form [role=alert]')).toContainText('Reload');
  await expect(page.locator('#lead-form [name=company_name]')).toHaveValue('Unsaved draft');
  await expect(page.getByRole('button',{name:'Save lead',exact:true})).toBeEnabled();
});
