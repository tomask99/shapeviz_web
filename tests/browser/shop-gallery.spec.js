import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {shopFixture,sampleUrl} from '../helpers/shop-fixture.js';
for(const width of [390,1440])test(`product gallery uploads, sorts, saves and opens images at ${width}px`,async({browser})=>{
  const f=await shopFixture(),context=await browser.newContext({viewport:{width,height:1000}});
  try{
    await context.addCookies([{name:'sv_access',value:'owner',url:f.origin}]);
    const uploaded=new Map(),source=await readFile('public/media/gallery/detail_01-640.webp');
    await context.route('https://test.supabase.co/storage/v1/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;if(r.method()==='PUT'){const bytes=r.postDataBuffer();expect(bytes.subarray(8,12).toString()).toBe('WEBP');uploaded.set(path.replace('/upload/sign/','/public/'),bytes);await route.fulfill({json:{Key:'uploaded'},headers:{'access-control-allow-origin':'*'}});}else await route.fulfill({body:uploaded.get(path)||source,contentType:'image/webp',headers:{'access-control-allow-origin':'*'}});});
    let row=await(await f.request('shop-list')).json();row=await(await f.request('shop-save',{...row,products:[{id:'gallery',url:sampleUrl,categoryId:row.categories[0].id,visible:true,name:'Gallery',seo:{enabled:true,heading:'Gallery product',slug:'gallery-product',title:'Gallery product',description:'Product preview',body:'Details of the product.'}}]})).json();await f.request('shop-launch',{version:row.version,launched:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.origin+'/admin/shop');await page.getByRole('button',{name:'Edit',exact:true}).click();
    const dialog=page.getByRole('dialog'),cards=dialog.locator('.shop-gallery-card');
    await dialog.locator('[data-gallery-files]').setInputFiles([{name:'first.webp',mimeType:'image/webp',buffer:source},{name:'second.webp',mimeType:'image/webp',buffer:source}]);
    await expect(cards).toHaveCount(2);await expect(dialog.locator('[data-gallery-progress]')).toHaveText('2 images added. Save product to publish.');expect(uploaded.size).toBe(4);
    await cards.first().locator('[data-alt]').fill('First texture detail');await cards.first().locator('[data-caption]').fill('Close-up of the texture');
    const originalId=await cards.first().getAttribute('data-id');
    await cards.first().scrollIntoViewIfNeeded();const a=await cards.first().locator('[data-drag]').boundingBox(),b=await cards.nth(1).locator('[data-drag]').boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:16});
    await expect(cards.nth(1)).toHaveAttribute('data-id',originalId);await expect(dialog.locator('.gallery-drag-ghost')).toBeVisible();await page.mouse.up();await expect(dialog.locator('.gallery-drag-ghost')).toHaveCount(0);
    await cards.first().locator('[data-drag]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await expect(cards.first()).toHaveAttribute('data-id',originalId);
    await page.screenshot({path:`test-results/product-gallery-admin-${width}.png`});
    await dialog.getByRole('button',{name:'Save product',exact:true}).click();await expect(dialog).toBeHidden();await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(cards).toHaveCount(2);await expect(cards.first().locator('[data-alt]')).toHaveValue('First texture detail');await dialog.getByRole('button',{name:'Close product editor'}).click();
    await page.goto(f.origin+'/shop/gallery-product');const first=page.getByRole('link',{name:'Enlarge: First texture detail'});await first.scrollIntoViewIfNeeded();await expect(first.locator('img')).toBeVisible();await first.click();
    const viewer=page.getByRole('dialog',{name:'Product image viewer'});await expect(viewer).toBeVisible();await expect(viewer.locator('[data-counter]')).toHaveText('1 / 2');await expect(viewer.locator('img')).toHaveAttribute('alt','First texture detail');
    await viewer.getByRole('button',{name:'Next image',exact:true}).click();await expect(viewer.locator('[data-counter]')).toHaveText('2 / 2');await page.keyboard.press('ArrowLeft');await expect(viewer.locator('[data-counter]')).toHaveText('1 / 2');
    await page.screenshot({path:`test-results/product-gallery-viewer-${width}.png`});await page.keyboard.press('Escape');await expect(viewer).toBeHidden();await expect(first).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto(f.origin+'/admin/shop');await page.getByRole('button',{name:'Edit',exact:true}).click();await dialog.getByRole('button',{name:'Remove image 1',exact:true}).click();await expect(cards).toHaveCount(1);await dialog.getByRole('button',{name:'Save product',exact:true}).click();await expect(dialog).toBeHidden();
    await page.goto(f.origin+'/shop/gallery-product');await expect(page.locator('[data-product-image]')).toHaveCount(1);expect(errors).toEqual([]);
  }finally{await context.close();await f.close();}
});
