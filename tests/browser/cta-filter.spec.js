import {test,expect} from '@playwright/test';

test('only website destinations count, including keyboard and middle-button activation',async({page,context})=>{
 const events=[];
 await page.route('**/api/presentation-events',route=>{events.push(route.request().postDataJSON());return route.fulfill({status:204});});
 await context.route('https://shapevizweb.vercel.app/**',route=>route.fulfill({contentType:'text/html',body:'Website'}));
 await context.route('https://other.invalid/**',route=>route.fulfill({contentType:'text/html',body:'Other'}));
 await page.goto('/');
 await page.setContent(`<section class="slide active">
 <a id="good" target="_blank" href="https://shapevizweb.vercel.app/#contact"><span>Website</span></a>
 <a id="other" target="_blank" href="https://other.invalid/">Other</a>
 <a id="deck" target="_blank" href="https://shapevizweb.vercel.app/p/another">Another presentation</a>
 <a id="cancel" href="https://shapevizweb.vercel.app/">Cancelled</a>
 </section><script src="/presentation-system/tracker.js" data-deck="cta-test" data-analytics="true"></script>`);
 await expect.poll(()=>events.some(e=>e.eventType==='session_started')).toBe(true);
 await page.evaluate(()=>document.querySelector('#cancel').addEventListener('click',event=>event.preventDefault()));
 for(const selector of ['#other','#deck']) {
  const popupPromise=context.waitForEvent('page');await page.locator(selector).click();await (await popupPromise).close();
 }
 await page.locator('#cancel').click();
 for(const method of ['keyboard','middle']) {
  const popupPromise=context.waitForEvent('page');
  if(method==='keyboard'){await page.locator('#good').focus();await page.keyboard.press('Enter');}
  else await page.locator('#good span').click({button:'middle'});
  await (await popupPromise).close();
 }
 await expect.poll(()=>events.filter(e=>e.eventType==='website_clicked').length).toBe(2);
 expect(new Set(events.map(e=>e.sessionId)).size).toBe(1);
});
