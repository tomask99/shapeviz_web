import {test,expect} from '@playwright/test';

for(const width of [1440,390])test(`privacy controls and legal pages work at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const events=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/admin?action=tracking-status',r=>r.fulfill({json:{exclude:false}}));
  await page.route('**/api/site-events',r=>{events.push(r.request().postDataJSON());return r.fulfill({status:204});});
  await page.clock.install();await page.goto('/sk');
  const dialog=page.getByRole('dialog',{name:'Meranie návštevnosti'});
  await expect(dialog).toBeVisible();await page.clock.runFor(16000);
  expect(events).toHaveLength(0);expect(await page.evaluate(()=>sessionStorage.getItem('sv-website-session-v1'))).toBeNull();
  await page.getByRole('button',{name:'Odmietnuť analytiku'}).click();
  await page.reload();await expect(dialog).not.toBeVisible();expect(events).toHaveLength(0);
  await page.locator('footer [data-privacy-settings]').click();await expect(dialog).toBeVisible();
  await page.getByRole('button',{name:'Povoliť analytiku'}).click();await expect.poll(()=>events.length).toBe(1);
  const id=events[0].sessionId;await page.clock.runFor(16000);expect(events.length).toBeGreaterThan(1);
  await page.locator('footer [data-privacy-settings]').click();await page.getByRole('button',{name:'Odmietnuť analytiku'}).click();
  const count=events.length;await page.clock.runFor(32000);await page.evaluate(()=>dispatchEvent(new Event('pagehide')));expect(events).toHaveLength(count);
  expect(await page.evaluate(()=>sessionStorage.getItem('sv-website-session-v1'))).toBeNull();
  await page.locator('footer [data-privacy-settings]').click();await page.getByRole('button',{name:'Povoliť analytiku'}).click();
  await expect.poll(()=>events.length).toBe(count+1);expect(events.at(-1).sessionId).not.toBe(id);
  for(const path of ['/sk/pravne-informacie','/sk/ochrana-osobnych-udajov','/en/legal','/en/privacy']){
    await page.goto(path);await expect(page.locator('main')).toContainText('57 820 970');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('footer [data-privacy-settings]')).toBeVisible();
  }
  await page.goto('/sk/pravne-informacie');await page.screenshot({path:`test-results/legal-${width}.png`,fullPage:true});
  await page.locator('footer [data-privacy-settings]').click();await expect(dialog).toBeVisible();
  await page.screenshot({path:`test-results/privacy-${width}.png`});
  await page.getByRole('button',{name:'Zavrieť',exact:true}).click();await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('revoking during owner-check request cannot restart analytics',async({page})=>{
  let finish;const wait=new Promise(resolve=>{finish=resolve;});let checks=0;const events=[];
  await page.route('**/api/admin?action=tracking-status',async route=>{checks++;await wait;await route.fulfill({json:{exclude:false}});});
  await page.route('**/api/site-events',r=>{events.push(r.request().postData());return r.fulfill({status:204});});
  await page.goto('/en');await page.getByRole('button',{name:'Allow analytics',exact:true}).click();await expect.poll(()=>checks).toBe(1);
  await page.locator('footer [data-privacy-settings]').click();await page.getByRole('button',{name:'Decline analytics'}).click();finish();
  await expect.poll(()=>page.evaluate(()=>document.cookie)).toContain('sv_analytics=1.no.');await page.waitForTimeout(250);
  expect(events).toEqual([]);expect(await page.evaluate(()=>sessionStorage.getItem('sv-website-session-v1'))).toBeNull();
});
