import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';
test('Recent activity renders safely, pages, retries and clears on navigation',async({page})=>{
 let fail=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin?*',async route=>{
  const p=new URL(route.request().url()).searchParams,a=p.get('action');let data={};
  if(a==='me')data={email:'owner@example.test'};if(a==='list')data={projects:[]};if(a==='stats')data={summary:{},daily:[],decks:[]};if(a==='crm-list')data={companies:[],total:0,page:1,pageSize:25};
  if(a==='crm-overview')data={total_leads:0,stages:{},followups:{},next_tasks:[]};if(a==='crm-action-center')data={groups:[]};
  if(a==='crm-recent-activity'){
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Activity unavailable'}});}
   data={items:[{id,company_id:id,company_name:p.has('beforeId')?'Older company':'Nario <studio>',event_type:'manual_activity',detail:'<img src=x onerror=alert(1)>',created_at:'2026-09-22T12:00:00Z'}],next:p.has('beforeId')?null:{beforeAt:'2026-09-22T12:00:00Z',beforeId:id}};
  }await route.fulfill({json:data});
 });
 await page.goto('/admin');const root=page.locator('#recent-activity');await expect(root).toContainText('Nario <studio>');await expect(root.locator('img')).toHaveCount(0);await expect(root.getByRole('link')).toHaveAttribute('href',`/admin/leads/${id}?tab=activity`);
 await page.setViewportSize({width:390,height:844});await root.screenshot({path:'.cache/recent-activity-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 fail=true;await root.getByRole('button',{name:'Older activities'}).click();await expect(root.getByRole('alert')).toContainText('unavailable');await expect(root).toContainText('Nario <studio>');await root.getByRole('button',{name:'Retry activity'}).click();await expect(root).toContainText('Older company');await root.getByRole('button',{name:'Latest activities',exact:true}).click();await expect(root).toContainText('Nario <studio>');
 await page.locator('#nav-leads').click();await expect(root).toBeHidden();await expect(root).toBeEmpty();expect(errors).toEqual([]);
});
