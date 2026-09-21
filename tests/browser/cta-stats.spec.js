import {test,expect} from '@playwright/test';

test('each presentation and visit displays its own website clicks',async({page})=>{
 await page.route('**/api/admin?*',route=>{
  const url=new URL(route.request().url()),action=url.searchParams.get('action');let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects:['first','second'].map(deck_slug=>({deck_slug,client:deck_slug,title:'Presentation',status:'published',slide_count:1}))};
  if(action==='stats')data={summary:{visits:4,website_clicks:3,website_click_sessions:2},daily:[],slides:[],decks:[{deck_slug:'first',visits:4,website_clicks:3,website_click_sessions:2},{deck_slug:'second',visits:1,website_clicks:0,website_click_sessions:0}],sessions:[{started_at:new Date().toISOString(),website_clicks:2,slides_viewed:1,max_slide:1,user_agent_category:'desktop'}]};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/adminlogin');
 await expect(page.locator('.project-row').filter({has:page.locator('[data-detail=first]')})).toContainText('3 website clicks');
 await expect(page.locator('.project-row').filter({has:page.locator('[data-detail=second]')})).toContainText('0 website clicks');
 await page.locator('[data-detail=first]').click();
 await expect(page.locator('#detail-metrics')).toContainText('50%');
 await expect(page.locator('#sessions')).toContainText('Website clicks2');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
