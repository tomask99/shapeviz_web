import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222';
const link=(id,title)=>({id,deck_slug:id,created_at:'2026-01-01T10:00:00Z',sent_at:null,project:{title,deck_slug:id,client:'Nario',slide_count:27,status:'published',analytics_enabled:id!=='second'}});
async function fixture(page,{empty=false,listError=false,statsError=false}={}){
  const calls=[];
  await page.route('**/api/admin?*',route=>{
    const p=new URL(route.request().url()).searchParams,action=p.get('action');calls.push({action,params:Object.fromEntries(p),method:route.request().method()});let data={};
    if(action==='me')data={email:'owner@example.test'};
    if(action==='crm-detail')data={company:{id:companyId,company_name:'Nario',services:[],pipeline_status:'WON',created_at:'2026-01-01',updated_at:'2026-01-01'}};
    if(['crm-contacts','crm-notes','crm-activity'].includes(action))data={items:[],hasMore:false};
    if(action==='crm-presentations'){
      if(listError){listError=false;return route.fulfill({status:503,json:{error:'Links unavailable'}});}
      data={items:empty?[]:p.get('page')==='2'?[link('third','Final proposal')]:[link('first','Initial <pitch>'),link('second','Social proposal')],hasMore:!empty&&p.get('page')!=='2'};
    }
    if(action==='crm-presentation-stats'){
      if(statsError){statsError=false;return route.fulfill({status:503,json:{error:'Stats unavailable'}});}
      const empty=p.get('id')==='second';data={stats:{summary:{visits:empty?0:3,seconds:empty?0:268,website_clicks:empty?0:1},slides:empty?[]:[{slide_index:2,views:1},{slide_index:8,views:3}],sessions:empty?[]:[{started_at:'2026-01-01T10:00:00Z',max_slide:8}]}};
    }
    return route.fulfill({json:data});
  });return calls;
}
test('overview shows selected deck only, periods, pagination, disabled tracking and manage navigation',async({page})=>{
  const calls=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin/leads/'+companyId);
  const panel=page.locator('.crm-company-engagement');await expect(panel.getByLabel('Linked presentation')).toHaveValue('first');expect(calls.filter(c=>c.action==='crm-presentation-stats')).toHaveLength(0);
  await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel).toContainText('4m 28s');await expect(panel).toContainText('2 / 27');await expect(panel).toContainText('last 30 days');await expect(panel).toContainText('not a company-wide total');
  await panel.getByLabel('Engagement period').selectOption('7');await expect(panel).not.toContainText('4m 28s');await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel).toContainText('last 7 days');
  await panel.screenshot({path:'.cache/crm-engagement-desktop.png'});
  await panel.getByLabel('Linked presentation').selectOption('second');await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel).toContainText('Tracking is currently disabled');
  await panel.getByRole('button',{name:'More presentations'}).click();await expect(panel.getByLabel('Linked presentation')).toHaveValue('third');await expect(panel.getByRole('button',{name:'More presentations'})).toBeDisabled();await expect(panel).not.toContainText('4m 28s');
  await page.setViewportSize({width:390,height:844});await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel).toContainText('4m 28s');await panel.screenshot({path:'.cache/crm-engagement-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await panel.getByRole('button',{name:'Manage presentations'}).click();await expect(page.getByRole('tab',{name:'Presentations',exact:true})).toHaveAttribute('aria-selected','true');
  expect(calls.every(c=>c.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('empty and failed overview engagement never shows invented metrics and supports retry',async({page})=>{
  await fixture(page,{listError:true,statsError:true});await page.goto('/admin/leads/'+companyId);const panel=page.locator('.crm-company-engagement');
  await expect(panel.getByRole('alert')).toContainText('Links unavailable');await panel.getByRole('button',{name:'Retry linked presentations'}).click();await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Stats unavailable');await expect(panel.locator('dl')).toHaveCount(0);
  await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await expect(panel).toContainText('4m 28s');
  await page.route('**/api/admin?*',route=>new URL(route.request().url()).searchParams.get('action')==='crm-presentations'?route.fulfill({json:{items:[],hasMore:false}}):route.fallback());await panel.getByRole('button',{name:'Refresh linked presentations'}).click();await expect(panel).toContainText('No presentations linked');await expect(panel.locator('dl')).toHaveCount(0);
});
test('slow old analytics cannot overwrite a newer deck selection or a different company tab',async({page})=>{
  await fixture(page);let release,started;const received=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  await page.route('**/api/admin?*',async route=>{const p=new URL(route.request().url()).searchParams;if(p.get('action')==='crm-presentation-stats'){started();await gate;return route.fulfill({json:{stats:{summary:{seconds:9999},slides:[],sessions:[]}}});}return route.fallback();});
  await page.goto('/admin/leads/'+companyId);const panel=page.locator('.crm-company-engagement');await panel.getByRole('button',{name:'Show engagement',exact:true}).click();await received;await panel.getByLabel('Linked presentation').selectOption('second');release();await expect(panel).toContainText('Choose a period');await expect(panel).not.toContainText('166m');
  await page.getByRole('tab',{name:'Contacts',exact:true}).click();await expect(panel).not.toBeVisible();
});
