import {test,expect} from '@playwright/test';

test('slide transitions send one view event and retain elapsed time and maximum slide',async({page})=>{
  await page.clock.install();const events=[];
  await page.route('**/api/presentation-events',route=>{
    events.push(route.request().postDataJSON());return route.fulfill({status:204});
  });
  await page.route('**/tracker-fixture',route=>route.fulfill({contentType:'text/html',body:`<html><body>
    <section class="slide active">First</section><section class="slide">Second</section>
    <button onclick="document.querySelectorAll('.slide').forEach(s=>s.classList.toggle('active'))">Switch slide</button>
    <script src="/presentation-system/tracker.js" data-analytics="true" data-deck="fixture"></script>
    </body></html>`}));
  await page.goto('/tracker-fixture');await expect.poll(()=>events.length).toBe(2);
  await page.clock.runFor(5000);await page.getByRole('button').click();
  await expect.poll(()=>events.filter(e=>e.eventType==='slide_viewed').length).toBe(2);
  await page.getByRole('button').click();await expect.poll(()=>events.filter(e=>e.eventType==='slide_viewed').length).toBe(3);
  expect(events.some(e=>e.eventType==='slide_reached_max')).toBe(false);
  expect(events.filter(e=>e.eventType==='slide_viewed').map(e=>e.slideIndex)).toEqual([1,2,1]);
  expect(events.filter(e=>e.eventType==='session_heartbeat').reduce((sum,e)=>sum+e.activeSeconds,0)).toBe(5);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(()=>events.find(e=>e.eventType==='session_ended')?.slideIndex).toBe(2);
});
