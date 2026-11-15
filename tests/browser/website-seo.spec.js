import {test,expect} from '@playwright/test';
test.beforeEach(async({context})=>{await context.addCookies([{name:'sv_analytics',value:`1.no.${Date.now()}`,domain:'127.0.0.1',path:'/'}]);});

for(const locale of ['sk','en'])for(const width of [320,390,1440])test(`SEO services and inquiry in ${locale} at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:960});await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/'+locale);const section=page.locator('#services');
 await page.locator('.site-header nav').getByRole('link',{name:locale==='sk'?'Služby':'Services',exact:true}).click();await expect(page).toHaveURL(/#services$/);
 await expect(page.locator('#about #services')).toHaveCount(1);await expect(section.locator(':scope > div')).toHaveCount(6);await expect(section.locator('[data-service-link]')).toHaveCount(4);await expect(section.locator('p')).toHaveCount(0);await expect(page.locator('.service-detail')).toHaveCount(0);await expect(section).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await section.screenshot({path:`.cache/seo-services-${locale}-${width}.png`});
 await page.locator('#video-production a').click();await expect(page.locator('h1')).toHaveText(locale==='sk'?'Tvorba videí a animácií':'Video production & animation');
 await page.locator('.service-hero .primary-button').click();await expect(page).toHaveURL(/#project-form$/);
 await expect(page.locator('[data-service-id="video-production"]')).toBeChecked();
 for(const id of ['modeling','visualization','architecture','video-production'])await page.locator(`[data-service-id="${id}"]`).check();
 await page.locator('[name=name]').fill('Test visitor');await page.locator('[name=email]').fill('visitor@example.test');await page.locator('[name=message]').fill('We need a detailed architectural model and a product video.');
 let payload;await page.route('**/api/contact',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{ok:true,message:'Thank you. Your inquiry is on its way. We’ll be in touch.'}});});
 await page.locator('#project-form [type=submit]').click();await expect(page.locator('.form-status')).toContainText(locale==='sk'?'Ďakujeme':'Thank you');
 expect(payload.services).toEqual(['High-end 3D modeling','Product & interior visualization','Architectural 3D modeling','Video production & animation']);
 await expect(page.locator('input[name=services]:checked')).toHaveCount(0);
 const schema=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());expect(schema['@graph'].at(-1).itemListElement).toHaveLength(4);
 expect(errors).toEqual([]);
});
