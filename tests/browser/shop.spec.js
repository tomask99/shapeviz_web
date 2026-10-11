import {test,expect} from '@playwright/test';
import {shopFixture,sampleUrl} from '../helpers/shop-fixture.js';
for(const width of [390,1440])test(`Shop administration and private catalog persist at ${width}px`,async({browser})=>{
 const f=await shopFixture(),context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 try{
  await context.addCookies([{name:'sv_access',value:'owner',url:f.origin+'/api/admin'}]);
  // Exercise the fallback while testing the full app/API/database path.
  await context.route('https://gumroad.com/js/gumroad-embed.js',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(f.origin+'/admin/shop');await expect(page.getByRole('heading',{name:'Build your collection.'})).toBeVisible();
  await page.getByText('Manage categories',{exact:true}).click();await page.getByLabel('New category',{exact:true}).fill('Decals & Textures');await page.getByRole('button',{name:'Add category',exact:true}).click();
  await page.getByRole('button',{name:'Add product',exact:true}).click();const dialog=page.locator('.shop-editor');
  await dialog.getByLabel('Gumroad product URL').fill(sampleUrl);await dialog.getByRole('combobox',{name:'Category',exact:true}).selectOption({label:'Decals & Textures'});
  await dialog.getByRole('button',{name:'Preview product',exact:true}).click();await expect(dialog.getByRole('link',{name:'View on Gumroad'}).last()).toHaveAttribute('href',sampleUrl);
  await dialog.getByRole('button',{name:'Save product',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('.shop-admin-product .badge')).toHaveText('Draft');
  await page.reload();await expect(page.locator('.shop-admin-product .badge')).toHaveText('Draft');
  await page.locator('[data-toggle]').click();await expect(page.locator('.shop-admin-product .badge')).toHaveText('Visible');
  await page.screenshot({path:`.cache/shop-admin-${width}.png`,fullPage:true});
  await page.locator('[data-edit]').click();await dialog.getByLabel('Internal name (optional)').fill('Decal pack');await dialog.getByRole('button',{name:'Save product',exact:true}).click();
  await page.goto(f.origin+'/shop?preview=1');await expect(page.locator('#shop-preview-banner')).toBeVisible();await expect(page.locator('.shop-product')).toHaveCount(1);
  await page.getByRole('button',{name:'Blender Add-ons',exact:true}).click();await expect(page.locator('.shop-empty')).toBeVisible();
  await page.getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.shop-product')).toBeVisible();
  await expect(page.locator('script[src="https://gumroad.com/js/gumroad-embed.js"]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const guest=await browser.newContext({viewport:{width,height:1000}}),publicPage=await guest.newPage();
  await publicPage.goto(f.origin+'/shop');await expect(publicPage.getByRole('heading',{name:'Coming soon.'})).toBeVisible();await expect(publicPage.locator('[data-shop-nav]')).not.toHaveAttribute('href');
  await publicPage.screenshot({path:`.cache/shop-coming-${width}.png`,fullPage:true});
  await publicPage.goto(f.origin+'/');await expect(publicPage.locator('[data-shop-nav]')).toBeVisible();expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await publicPage.goto(f.origin+'/shop?preview=1');await expect(publicPage.locator('#shop-status')).toContainText('Sign in');await expect(publicPage.locator('.shop-product')).toHaveCount(0);
  await page.goto(f.origin+'/admin/shop');await page.getByRole('switch',{name:'Shop live'}).check();await expect(page.getByRole('heading',{name:'Your shop is live.'})).toBeVisible();
  await guest.route('https://gumroad.com/js/gumroad-embed.js',r=>r.abort());
  await publicPage.goto(f.origin+'/shop');await expect(publicPage.locator('[data-shop-nav]')).toHaveAttribute('href','/shop');await expect(publicPage.locator('.shop-product')).toHaveCount(1);
  await page.locator('[data-toggle]').click();await expect(page.locator('.shop-admin-product .badge')).toHaveText('Draft');await publicPage.reload();await expect(publicPage.locator('.shop-product')).toHaveCount(0);
  page.on('dialog',d=>d.accept());await page.locator('[data-delete]').click();await expect(page.locator('.shop-admin-product')).toHaveCount(0);await page.reload();await expect(page.locator('.shop-admin-product')).toHaveCount(0);
  await page.getByRole('switch',{name:'Shop live'}).uncheck();await expect(page.getByRole('heading',{name:'Build your collection.'})).toBeVisible();
  expect(errors).toEqual([]);await guest.close();
 }finally{await context.close();await f.close();}
});
test('Official Gumroad widget loads real product content and opens checkout',async({browser})=>{
 test.skip(process.env.SHOP_LIVE_TEST!=='true','Set SHOP_LIVE_TEST=true to verify Gumroad over the network.');test.setTimeout(90000);const f=await shopFixture(),context=await browser.newContext({viewport:{width:1440,height:1000}});
 try{
  await context.addCookies([{name:'sv_access',value:'owner',url:f.origin+'/api/admin'}]);
  const catalog=await(await f.request('shop-list')).json();catalog.categories.push({id:'decals',name:'Decals & Textures'});
  await f.request('shop-save',{...catalog,products:[{id:'sample',url:sampleUrl,categoryId:'decals',visible:true,name:''}]});
  const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text().slice(0,220));});
  await page.goto(f.origin+'/admin/shop');await page.locator('[data-edit]').click();
  const editor=page.locator('.shop-editor'),editorFrame=editor.frameLocator('iframe');
  await expect(editorFrame.getByRole('heading',{name:'Sci-Fi Decal Pack Vol.2 By TK',exact:true})).toBeVisible({timeout:45000});
  await editor.getByRole('button',{name:'Close product editor'}).click();await page.locator('[data-edit]').click();
  await expect(editorFrame.getByRole('heading',{name:'Sci-Fi Decal Pack Vol.2 By TK',exact:true})).toBeVisible({timeout:20000});
  await expect(page.locator('script[src="https://gumroad.com/js/gumroad-embed.js"]')).toHaveCount(1);await expect(editor.locator('iframe')).toHaveCount(1);
  await page.goto(f.origin+'/shop?preview=1');const frame=page.frameLocator('.shop-embed-slot iframe');
  await expect(frame.getByRole('heading',{name:'Sci-Fi Decal Pack Vol.2 By TK',exact:true})).toBeVisible({timeout:45000});
  await expect(frame.locator('img').first()).toBeVisible();
  expect(await frame.locator('body').innerText()).toMatch(/decal/i);
  await expect(frame.getByText(/^\$[0-9]/).first()).toBeVisible();
  await frame.locator('img').first().scrollIntoViewIfNeeded();
  await expect.poll(()=>frame.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0),{timeout:20000}).toBe(true);
  await page.setViewportSize({width:1440,height:2600});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'.cache/shop-catalog-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Blender Add-ons',exact:true}).click();await page.getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.shop-embed-slot iframe')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});await expect(frame.getByRole('heading',{name:'Sci-Fi Decal Pack Vol.2 By TK',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await frame.getByText('Add to cart',{exact:true}).first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'.cache/shop-catalog-mobile.png'});
  const buy=frame.getByText('Add to cart',{exact:true}).first();await expect(buy).toBeVisible();
  await Promise.all([page.waitForURL('https://gumroad.com/checkout*',{timeout:30000}),buy.click()]);await expect(page.getByRole('heading',{name:'Checkout',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Sci-Fi Decal Pack Vol.2 By TK',exact:true})).toHaveAttribute('href',sampleUrl);console.log('Verified Gumroad checkout for the sample product; no purchase submitted.');
 }finally{await context.close();await f.close();}
});
