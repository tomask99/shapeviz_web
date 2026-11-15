import {test,expect} from '@playwright/test';
import {shopFixture,sampleUrl} from '../helpers/shop-fixture.js';
test('admin SEO editor saves content; product works on desktop, mobile and without JavaScript',async({browser})=>{
  const f=await shopFixture(),context=await browser.newContext({viewport:{width:1440,height:1000}});
  try{
    await context.addCookies([{name:'sv_access',value:'owner',url:f.origin}]);const page=await context.newPage();
    await page.route('https://public-files.gumroad.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#976"/></svg>'}));
    await page.goto(f.origin+'/admin/shop');await page.getByRole('button',{name:'Add product',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Gumroad product URL').fill(sampleUrl);
    await dialog.getByRole('button',{name:'Load name and cover from Gumroad'}).click();await expect(dialog.locator('[name="seo_heading"]')).toHaveValue('Sample product');
    await dialog.getByLabel('Visible in catalog').check();await dialog.getByLabel('Publish product page').check();
    await dialog.locator('[name="seo_heading"]').fill('Blender texture tools');await dialog.locator('[name="seo_slug"]').fill('blender-texture-tools');
    await dialog.locator('[name="seo_description"]').fill('Create seamless PBR textures inside Blender.');await dialog.locator('[name="seo_body"]').fill('Import an image and create PBR maps.');
    await dialog.locator('[name="seo_imageAlt"]').fill('Texture preview in Blender');
    await dialog.getByRole('button',{name:'Add question',exact:true}).click();await dialog.locator('[data-question]').fill('How does it work?');await dialog.locator('[data-answer]').fill('Import your image first.');
    await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await dialog.getByRole('button',{name:'Save product',exact:true}).click();await expect(dialog).toBeHidden();
    await page.getByRole('switch',{name:'Shop live'}).check();await expect(page.getByText('Your shop is live.')).toBeVisible();
    await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(dialog.locator('[name="seo_slug"]')).toHaveAttribute('readonly','');await dialog.getByRole('button',{name:'Close product editor'}).click();
    await page.goto(f.origin+'/en/shop');await page.getByRole('link',{name:/Blender texture tools/}).click();await expect(page).toHaveURL(/\/shop\/blender-texture-tools$/);
    for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await expect(page.getByRole('heading',{level:1})).toHaveText('Blender texture tools');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('link',{name:'Get it on Gumroad'}).first()).toHaveAttribute('href',sampleUrl);await page.screenshot({path:`test-results/shop-seo-${width}.png`,fullPage:true});}
    await page.getByText('How does it work?',{exact:true}).click();await expect(page.getByText('Import your image first.',{exact:true})).toBeVisible();
    const nojs=await browser.newContext({javaScriptEnabled:false}),plain=await nojs.newPage();await plain.goto(f.origin+'/shop/blender-texture-tools');await expect(plain.getByText('Import an image and create PBR maps.')).toBeVisible();await nojs.close();
  }finally{await context.close();await f.close();}
});
