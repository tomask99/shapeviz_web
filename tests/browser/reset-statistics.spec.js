import {test,expect} from '@playwright/test';
test('reset beside Edit affects only the confirmed presentation',async({page})=>{
 const resets=[];
 await page.route('**/api/admin?*',route=>{
  const action=new URL(route.request().url()).searchParams.get('action');let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects:['first','second'].map(deck_slug=>({deck_slug,client:deck_slug,title:'Test',status:'published'}))};
  if(action==='stats')data={summary:{},daily:[],decks:[{deck_slug:'first',visits:resets.length?0:5},{deck_slug:'second',visits:9}]};
  if(action==='reset-statistics'){resets.push(route.request().postDataJSON());data={ok:true};}
  return route.fulfill({json:data});
 });
 await page.goto('/admin?view=presentations');
 const button=page.locator('[data-reset-stats=first]');
 await expect(page.locator('[data-edit=first] + [data-reset-stats=first]')).toBeVisible();
 page.once('dialog',d=>d.dismiss());await button.click();expect(resets).toEqual([]);
 page.once('dialog',d=>d.accept());await button.click();
 await expect(page.locator('#notice')).toContainText('Statistics reset for /p/first');
 expect(resets).toEqual([{slug:'first',confirmSlug:'first'}]);
 await expect(page.locator('.project-row').filter({has:button}).locator('.row-stats')).toContainText('0');
 await expect(page.locator('.project-row').filter({has:page.locator('[data-edit=second]')}).locator('.row-stats')).toContainText('9');
});
