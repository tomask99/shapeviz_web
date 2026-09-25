import {test,expect} from '@playwright/test';

async function fixture(page){
 const calls=[];
 await page.route('**/api/admin?*',async route=>{
  const params=new URL(route.request().url()).searchParams,action=params.get('action');calls.push({action,params:Object.fromEntries(params)});
  const data={
   me:{email:'owner@example.test'},
   list:{projects:[{deck_slug:'sample',client:'Sample company',title:'Visual direction',status:'published',slide_count:3}]},
   stats:{summary:{visits:7,seconds:180},daily:[],decks:[{deck_slug:'sample',visits:7}],slides:[],sessions:[]},
   'website-stats':{summary:{visits:3},daily:[],devices:[],sources:[],locations:[]},
   'crm-overview':{total_leads:1,stages:{NEW_LEAD:1},followups:{},next_tasks:[]},
   'crm-list':{companies:[],total:0,page:1,pageSize:25},
  }[action]||{};
  await route.fulfill({json:data});
 });return calls;
}

test('Presentation overview groups statistics and library without loading them on Overview',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));const calls=await fixture(page);
 await page.goto('/admin');
 await expect(page.locator('#business-overview')).toContainText('Your business, at a glance.');
 await expect(page.locator('#website-metrics')).toContainText('Website visits3');
 for(const selector of ['#metrics','#presentation-chart','.workspace > .library','.workspace > .toolbar'])await expect(page.locator(selector)).toBeHidden();
 expect(calls.some(call=>['list','stats'].includes(call.action))).toBe(false);
 await page.getByRole('button',{name:'Presentation overview',exact:true}).click();
 await expect(page).toHaveURL('/admin?view=presentations');
 await expect(page.getByRole('heading',{name:'Presentation overview.'})).toBeVisible();
 await expect(page.locator('#metrics')).toContainText('Visits7');
 await expect(page.locator('#presentation-chart')).toBeVisible();
 await expect(page.locator('#projects')).toContainText('Sample company');
 for(const selector of ['#business-overview','#action-center','#website-analytics'])await expect(page.locator(selector)).toBeHidden();
 expect(calls.filter(call=>call.action==='website-stats')).toHaveLength(1);
 await page.locator('#days').selectOption('7');
 await expect(page.locator('#visits-chart button')).toHaveCount(7);
 await page.locator('#search').fill('no match');await expect(page.locator('#projects .project-row')).toHaveCount(0);
 await page.locator('#search').fill('Sample');await expect(page.locator('#projects .project-row')).toHaveCount(1);
 await page.screenshot({path:'.cache/presentation-overview-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'.cache/presentation-overview-mobile.png',fullPage:true});
 await page.reload();await expect(page.locator('[data-view=presentations]')).toHaveClass('active');
 await expect(page.locator('#projects')).toContainText('Sample company');
 await page.locator('#nav-leads').click();await expect(page.locator('#metrics')).toBeHidden();
 await page.goBack();await expect(page.locator('#metrics')).toBeVisible();await expect(page.locator('#website-analytics')).toBeHidden();
 await page.locator('[data-view=templates]').click();await expect(page.locator('#metrics')).toBeHidden();await expect(page.locator('#website-analytics')).toBeHidden();
 await page.locator('[data-view=all]').click();await expect(page).toHaveURL('/admin');await expect(page.locator('#business-overview')).toBeVisible();await expect(page.locator('#projects')).toBeHidden();
 expect(errors).toEqual([]);
});

test('Existing presentation detail links open inside Presentation overview',async({page})=>{
 const calls=await fixture(page);await page.goto('/admin?deck=sample');
 await expect(page.locator('#detail-dialog')).toBeVisible();
 await expect(page.locator('#detail-title')).toHaveText('Sample company');
 await page.locator('#detail-dialog [data-close]').click();
 await expect(page.locator('[data-view=presentations]')).toHaveClass('active');
 await expect(page.locator('#projects')).toBeVisible();await expect(page.locator('#business-overview')).toBeHidden();
 expect(calls.some(call=>call.action==='website-stats'||call.action==='crm-overview')).toBe(false);
});
