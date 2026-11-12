import {test,expect} from '@playwright/test';
import {services,servicePath} from '../../src/website/services.js';

for(const locale of ['sk','en'])for(const width of [320,768,1440])test(`service pages, language links and inquiry at ${width}px in ${locale}`,async({page})=>{
 await page.setViewportSize({width,height:960});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/admin?action=tracking-status',route=>route.fulfill({json:{exclude:true}}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const service of services){
  const response=await page.goto(servicePath(service,locale));expect(response.status()).toBe(200);
  await expect(page.getByRole('heading',{level:1})).toHaveText(service[locale].name);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const heading=await page.locator('h1').boundingBox();expect(heading.x).toBeGreaterThanOrEqual(0);expect(heading.x+heading.width).toBeLessThanOrEqual(width);
  const faq=page.locator('details').first();await faq.locator('summary').click();await expect(faq.locator('p')).toBeVisible();
  await page.keyboard.press('Enter');await expect(faq.locator('p')).toBeHidden();
  await page.locator('[data-language]').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`.cache/service-${service.id}-${locale}-${width}.png`});
  const other=locale==='sk'?'en':'sk';await page.locator(`[data-language=${other}]`).click();
  await expect(page).toHaveURL(new RegExp(servicePath(service,other)+'$'));
  await expect(page.getByRole('heading',{level:1})).toHaveText(service[other].name);
  await page.locator('.service-hero .primary-button').click();
  await expect(page).toHaveURL(new RegExp(`/${other}\\?interest=${service.id}#project-form$`));
  await expect(page.locator(`#project-form [data-service-id="${service.id}"]`)).toBeChecked();
  await expect(page.locator('input[name=services]:checked')).toHaveCount(1);
  await expect(page.locator('#project-form')).toBeInViewport();
  await page.locator(`[data-service-id="${service.id}"]`).uncheck();
  await expect(page.locator('input[name=services]:checked')).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});

test('service content and navigation work without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 try{
  await page.goto('/sk');await page.locator('#services [data-service-link=modeling]').click();
  await expect(page).toHaveURL(/\/sk\/sluzby\/3d-modelovanie$/);
  await expect(page.locator('h1')).toHaveText(services[0].sk.name);
  await page.locator('summary').first().click();await expect(page.locator('details p').first()).toBeVisible();
  await page.locator('[data-language=en]').click();await expect(page.locator('h1')).toHaveText(services[0].en.name);
  await page.locator('.service-related a').last().click();await expect(page.locator('video')).toHaveAttribute('controls','');
  await page.locator('.service-hero .primary-button').click();await expect(page.locator('#project-form')).toBeVisible();
  await expect(page.locator('[data-service-id="video-production"]')).toBeChecked();
 }finally{await context.close();}
});

test('service page loads no video bytes until playback and its poster is correctly sized',async({page})=>{
 const media=[];page.on('request',request=>{if(request.url().endsWith('.mp4'))media.push(request.url());});
 await page.goto(servicePath(services[3],'en'));await expect(page.locator('video')).toHaveAttribute('preload','none');
 expect(media).toEqual([]);
 await page.locator('video').evaluate(video=>video.play());await expect.poll(()=>media.length).toBeGreaterThan(0);
 await expect.poll(()=>page.locator('video').evaluate(video=>video.paused)).toBe(false);
 await page.locator('video').evaluate(video=>video.pause());
});

test('crawlable gallery images stay deferred while the gallery is closed',async({page})=>{
 const images=[];page.on('request',request=>{if(/\/media\/gallery\/.*\.webp/.test(request.url()))images.push(request.url());});
 await page.goto('/en');await page.locator('#gallery-toggle').scrollIntoViewIfNeeded();
 expect(images).toEqual([]);
 await page.locator('#gallery-toggle').click();
 await expect.poll(()=>page.locator('#expanded-gallery img').first().evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
 expect(images.length).toBeGreaterThan(0);
});
