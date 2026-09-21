import {test,expect} from '@playwright/test';

test('website tracker reuses visits on refresh and expires after idle, without tracking hidden time',async({page})=>{
 const events=[];
 await page.route('**/api/admin?action=tracking-status',r=>r.fulfill({json:{exclude:false}}));
 await page.route('**/api/site-events',r=>{events.push(r.request().postDataJSON());return r.fulfill({status:204});});
 await page.clock.install();
 await page.goto('/');
 await expect.poll(()=>events.length).toBe(1);
 const id=events[0].sessionId;
 await page.clock.runFor(16000);
 await expect.poll(()=>events.some(e=>e.seconds>=14)).toBe(true);
 await page.reload();await expect.poll(()=>events.length).toBeGreaterThan(2);
 expect(events.at(-1).sessionId).toBe(id);
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
 const before=events.at(-1).seconds;
 await page.clock.runFor(32000);
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect.poll(()=>events.at(-1).seconds).toBe(before);
 await page.clock.fastForward(31*60*1000);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>events.at(-1).sessionId).not.toBe(id);
 expect(events.at(-1).seconds).toBe(0);
});

test('website tracker excludes owners and browsers requesting privacy',async({page})=>{
 const events=[];
 await page.route('**/api/admin?action=tracking-status',r=>r.fulfill({json:{exclude:true}}));
 await page.route('**/api/site-events',r=>{events.push(r.request().postDataJSON());return r.fulfill({status:204});});
 await page.goto('/');await page.waitForTimeout(250);expect(events).toEqual([]);
 await page.route('**/api/admin?action=tracking-status',r=>r.fulfill({json:{exclude:false}}));
 await page.addInitScript(()=>Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true}));
 await page.reload();await page.waitForTimeout(250);expect(events).toEqual([]);
});

test('separate website dashboard has period controls, accessible graph and safe breakdowns',async({page})=>{
 const errors=[],periods=[];page.on('pageerror',e=>errors.push(e.message));
 const today=new Date().toISOString().slice(0,10);
 await page.route('**/api/admin?*',r=>{
  const query=new URL(r.request().url()).searchParams,action=query.get('action');
  let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects:[]};
  if(action==='stats')data={summary:{visits:99},daily:[],decks:[]};
  if(action==='website-stats'){
   periods.push(query.get('days'));
   data={summary:{visits:3,seconds:90,average_seconds:30},daily:[{day:today,visits:3,seconds:90}],devices:[{label:'iPhone (mobil)',visits:3}],sources:[{label:'<img src=x onerror=alert(1)>',visits:3}],locations:[{label:'Bratislava, Slovensko',visits:3}]};
  }
  return r.fulfill({json:data});
 });
 await page.goto('/adminlogin');
 await expect(page.locator('#website-metrics')).toContainText('Website visits3');
 await expect(page.locator('#metrics')).toContainText('Visits99');
 await expect(page.locator('#website-sources img')).toHaveCount(0);
 await page.locator('#website-days').selectOption('7');
 await expect(page.locator('#website-chart button')).toHaveCount(7);
 await page.locator('#website-chart button').last().click();
 await expect(page.locator('#website-readout')).toContainText('3 visits');
 await page.locator('#website-days').selectOption('90');
 await expect(page.locator('#website-chart button')).toHaveCount(90);
 expect(periods).toContain('7');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#website-analytics').screenshot({path:'test-results/website-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('#website-analytics').screenshot({path:'test-results/website-mobile.png'});
 expect(errors).toEqual([]);
});
