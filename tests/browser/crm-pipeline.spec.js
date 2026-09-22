import {test,expect} from '@playwright/test';
import {STATUSES} from '../../public/admin/crm-options.js';
const id='22222222-2222-4222-8222-222222222222';
const company={id,version:1,company_name:'Nario <studio>',country:'SK',industry:'Furniture',services:[],priority:'HIGH',pipeline_status:'NEW_LEAD',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
async function fixture(page) {
  let row={...company};
  await page.route('**/api/admin?*',route=>{
    const url=new URL(route.request().url()),action=url.searchParams.get('action');let data={};
    if(action==='me')data={email:'owner@example.com'};
    if(action==='crm-pipeline'){
      const stages=url.searchParams.get('mode')==='lost'?['LOST']:STATUSES.filter(s=>s!=='LOST');
      data={columns:stages.map(status=>({status,companies:row.pipeline_status===status?[row]:[],total:row.pipeline_status===status?1:0,page:1,pageSize:25}))};
    }
    if(action==='crm-status'){
      const body=route.request().postDataJSON();
      if(body.version!==row.version)return route.fulfill({status:409,json:{error:'Company changed. Refresh before saving.'}});
      row={...row,pipeline_status:body.pipeline_status,version:row.version+1};data={company:row};
    }
    if(action==='crm-detail')data={company:row};
    if(['crm-contacts','crm-notes','crm-activity'].includes(action))data={items:[],hasMore:false,page:1};
    if(action==='list')data={projects:[]};
    if(action==='stats')data={summary:{},daily:[],decks:[]};
    return route.fulfill({json:data});
  });
}
test('pipeline drag, menu, lost view and route history persist without overflow',async({page})=>{
  await fixture(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/pipeline');await expect(page.locator('[data-stage]')).toHaveCount(9);
  await expect(page.locator('[data-stage=LOST]')).toHaveCount(0);
  const card=page.locator('[data-card]');
  await card.dragTo(page.locator('[data-stage=QUALIFIED]'));
  await expect(page.locator('[data-stage=QUALIFIED] [data-card]')).toHaveCount(1);
  await page.reload();await expect(page.locator('[data-stage=QUALIFIED] [data-card]')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Status for Nario <studio>',exact:true}).selectOption('CONTACTED');
  await expect(page.locator('[data-stage=CONTACTED] [data-card]')).toHaveCount(1);
  await page.screenshot({path:'.cache/crm-pipeline-desktop.png',fullPage:true});
  await page.getByRole('combobox',{name:'Status for Nario <studio>',exact:true}).selectOption('LOST');
  await expect(page.locator('[data-card]')).toHaveCount(0);
  await page.getByRole('combobox',{name:'View',exact:true}).selectOption('lost');
  await expect(page.locator('[data-stage=LOST] [data-card]')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/crm-pipeline-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Nario <studio>',exact:true}).click();
  await expect(page.locator('#crm h1')).toContainText('Nario');
  await page.goBack();await expect(page.locator('[data-stage=LOST] [data-card]')).toHaveCount(1);
  await page.locator('[data-view=all]').click();await expect(page.locator('#crm')).toBeHidden();
  await page.getByRole('link',{name:'Pipeline',exact:true}).click();await expect(page.locator('[data-stage]')).toHaveCount(9);
  expect(errors).toEqual([]);
});
test('failed status save restores the visible selection and reports conflict',async({page})=>{
  await fixture(page);
  await page.route('**/api/admin?*',route=>new URL(route.request().url()).searchParams.get('action')==='crm-status'?route.fulfill({status:409,json:{error:'Company changed. Refresh before saving.'}}):route.fallback());
  await page.goto('/admin/pipeline');
  await page.getByRole('combobox',{name:'Status for Nario <studio>',exact:true}).selectOption('WON');
  await expect(page.locator('#pipeline-error')).toContainText('Refresh');
  await expect(page.locator('[data-stage=NEW_LEAD] [data-card]')).toHaveCount(1);
  await expect(page.locator('[data-move]')).toHaveValue('NEW_LEAD');
  await expect(page.locator('[data-move]')).toBeEnabled();
});
test('pipeline retries loading and loads a further stage page without duplicates',async({page})=>{
  await fixture(page);let fail=true;
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='crm-pipeline'){
      if(fail)return route.fulfill({status:502,json:{error:'Pipeline unavailable'}});
      return route.fulfill({json:{columns:[{status:'NEW_LEAD',companies:[company],total:2,page:1,pageSize:1}]}});
    }
    if(action==='crm-list')return route.fulfill({json:{companies:[{...company,id:'33333333-3333-4333-8333-333333333333',company_name:'Second company'}],total:2,page:2,pageSize:1}});
    return route.fallback();
  });
  await page.goto('/admin/pipeline');await expect(page.locator('#pipeline-error')).toContainText('unavailable');
  fail=false;await page.getByRole('button',{name:'Try again'}).click();
  await page.getByRole('button',{name:'Load more'}).click();
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Load more'})).toHaveCount(0);
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
