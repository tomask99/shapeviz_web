import {test,expect} from '@playwright/test';
import {articlesFixture} from '../helpers/articles-fixture.js';
import {readFile} from 'node:fs/promises';
import {productVisualizationArticle} from '../../src/articles/product-visualization-article.js';
import {productVisualizationArticleEn} from '../../src/articles/product-visualization-article-en.js';

for(const width of [390,1440])test(`Article translations switch and remain editable at ${width}px`,async({browser})=>{
  const f=await articlesFixture({seed:true});
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try {
    for(const article of [productVisualizationArticle,productVisualizationArticleEn])expect((await f.request('articles-save',article)).status).toBe(200);
    const page=await context.newPage();
    await page.goto(f.origin+'/articles');
    await expect(page.locator('.article-public-card')).toHaveCount(2);
    await expect(page.getByRole('heading',{name:productVisualizationArticleEn.title,exact:true})).toBeVisible();
    await page.locator('.article-languages').getByRole('link',{name:'Slovenčina',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang','sk');
    await expect(page.locator('.article-public-card')).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('heading',{name:productVisualizationArticle.title,exact:true}).click();
    await page.locator('.article-languages').getByRole('link',{name:'English',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.locator('h1')).toHaveText(productVisualizationArticleEn.title);
    await expect(page.locator('.article-prose')).toContainText('Photography and 3D can work together');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.cache/article-translation-${width}.png`});
    await page.getByRole('link',{name:'Explore product and interior visualization',exact:true}).click();
    expect(new URL(page.url()).pathname).toBe('/en/services/product-interior-visualization');
    await context.addCookies([{name:'sv_access',value:'owner',url:f.origin+'/api/admin'}]);
    await page.goto(f.origin+'/admin/site-editing#articles');
    await page.getByRole('button',{name:'Edit '+productVisualizationArticleEn.title,exact:true}).click();
    await expect(page.getByLabel('Article language',{exact:true})).toHaveValue('en');
    await expect(page.getByLabel('Translation group (optional)',{exact:true})).toHaveValue(productVisualizationArticleEn.translation_group);
    await page.getByRole('button',{name:'Update live article',exact:true}).click();
    await expect(page.locator('[data-editor-status]')).toHaveText('All changes saved');
    await page.screenshot({path:`.cache/article-translation-admin-${width}.png`});
  }finally{await context.close();await f.close();}
});

for(const width of [390,1440])test(`Slovak article and language editor work at ${width}px`,async({browser})=>{
  const f=await articlesFixture();
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try {
    expect((await f.request('articles-save',productVisualizationArticle)).status).toBe(200);
    const page=await context.newPage();
    await page.goto(f.origin+'/articles/'+productVisualizationArticle.slug);
    await expect(page.locator('html')).toHaveAttribute('lang','sk');
    await expect(page.getByRole('heading',{level:1})).toHaveText(productVisualizationArticle.title);
    for(const image of await page.locator('main img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`.cache/article-products-${width}.png`,fullPage:true});
    await page.getByRole('link',{name:'Pozrieť produktové a interiérové vizualizácie',exact:true}).click();
    expect(new URL(page.url()).pathname).toBe('/sk/sluzby/produktove-interierove-vizualizacie');
    await context.addCookies([{name:'sv_access',value:'owner',url:f.origin+'/api/admin'}]);
    await page.goto(f.origin+'/admin/site-editing#articles');
    await page.getByRole('button',{name:'Edit '+productVisualizationArticle.title,exact:true}).click();
    const language=page.getByLabel('Article language',{exact:true});
    await expect(language).toHaveValue('sk');
    await language.selectOption('en');
    await page.getByRole('button',{name:'Update live article',exact:true}).click();
    await expect(page.locator('[data-editor-status]')).toHaveText('All changes saved');
    await page.getByRole('button',{name:'Close article editor',exact:true}).click();
    await page.getByRole('button',{name:'Edit '+productVisualizationArticle.title,exact:true}).click();
    await expect(language).toHaveValue('en');
    await language.selectOption('sk');
    await page.getByRole('button',{name:'Update live article',exact:true}).click();
    await expect(page.locator('[data-editor-status]')).toHaveText('All changes saved');
    await page.screenshot({path:`.cache/article-language-editor-${width}.png`});
  } finally {await context.close();await f.close();}
});

for(const width of [390,1440])test(`Articles editor publishes, previews, formats and unpublishes at ${width}px`,async({browser})=>{
  test.setTimeout(90000);
  const f=await articlesFixture({seed:true});
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try{
    await context.addCookies([{name:'sv_access',value:'owner',url:f.origin+'/api/admin'}]);
    const uploaded=await readFile('public/media/articles/wood-pbr-material-small.webp');
    let uploads=0;
    await context.route('https://test.supabase.co/storage/**',route=>{if(route.request().method()==='PUT'){uploads++;return route.fulfill({status:200,body:'{}',contentType:'application/json'});}return route.fulfill({status:200,body:uploaded,contentType:'image/webp'});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(f.origin+'/admin/site-editing#articles');
    await expect(page.getByRole('tab',{name:'Articles',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.article-admin-card')).toHaveCount(1);
    await page.getByRole('button',{name:'New article',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Article editor',exact:true});await expect(editor).toBeVisible();
    await editor.getByLabel('ARTICLE TITLE',{exact:true}).fill('My material workflow');
    await editor.getByLabel('Introduction',{exact:true}).fill('A practical workflow for creating a material from a surface photograph.');
    await expect(editor.getByLabel('Article URL',{exact:true})).toHaveValue('my-material-workflow');
    const body=editor.getByRole('textbox',{name:'Article content',exact:true});await body.fill('Start with a clean surface photograph.');
    await editor.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(editor.locator('[data-editor-status]')).toHaveText('All changes saved');
    expect((await context.request.get(f.origin+'/articles/my-material-workflow')).status()).toBe(404);
    await editor.locator('[data-cover-file]').setInputFiles({name:'cover.webp',mimeType:'image/webp',buffer:uploaded});
    await expect(editor.locator('[data-cover-preview] img')).toBeVisible();expect(uploads).toBe(2);
    await editor.getByLabel('Cover description',{exact:true}).fill('Wood material preview');
    await body.press('Control+End');await body.press('Enter');await editor.getByLabel('Text style').selectOption('h2');await body.pressSequentially('A useful heading');await body.press('Enter');await body.pressSequentially('Inspect the finish under different lights.');
    await expect(body.locator('h2')).toHaveText('A useful heading');
    await editor.locator('[data-inline-file]').setInputFiles({name:'detail.webp',mimeType:'image/webp',buffer:uploaded});
    const imageDetails=page.getByRole('dialog',{name:'Image details',exact:true});await expect(imageDetails).toBeVisible();
    await imageDetails.getByLabel('Image description (alt text)').fill('Detail of the grain');await imageDetails.getByLabel('Caption / image credit').fill('My material detail');await imageDetails.getByRole('button',{name:'Apply',exact:true}).click();
    await expect(body.locator('figure')).toHaveCount(1);
    await editor.getByRole('button',{name:'Preview',exact:true}).click();
    const preview=page.getByRole('dialog',{name:'Article preview',exact:true});await expect(preview.getByRole('heading',{level:1})).toHaveText('My material workflow');await expect(preview.locator('figcaption')).toHaveText('My material detail');await preview.getByRole('button',{name:'Close preview',exact:true}).click();
    await editor.getByRole('button',{name:'Publish article',exact:true}).click();await expect(editor.locator('[data-editor-status]')).toHaveText('All changes saved');
    await expect(editor.getByLabel('Article URL',{exact:true})).toHaveAttribute('readonly','');
    await page.screenshot({path:`.cache/articles-editor-${width}.png`,fullPage:true});
    expect(await editor.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await editor.getByRole('button',{name:'Close article editor',exact:true}).click();await expect(page.locator('.article-admin-card')).toHaveCount(2);
    await page.reload();await page.getByRole('button',{name:'Edit My material workflow',exact:true}).click();await expect(page.getByRole('textbox',{name:'Article content'}).locator('h2')).toHaveText('A useful heading');
    const publicPage=await context.newPage();await publicPage.goto(f.origin+'/articles/my-material-workflow');
    await expect(publicPage.getByRole('heading',{level:1})).toHaveText('My material workflow');await expect(publicPage.locator('.article-prose figure img')).toHaveAttribute('alt','Detail of the grain');
    expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'Move to draft',exact:true}).click();await expect(editor.locator('[data-editor-status]')).toHaveText('All changes saved');
    expect((await context.request.get(f.origin+'/articles/my-material-workflow')).status()).toBe(404);
    await editor.getByRole('button',{name:'Close article editor',exact:true}).click();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete My material workflow',exact:true}).click();await expect(page.locator('.article-admin-card')).toHaveCount(1);
    await page.locator('.article-admin-card [data-open]').click();await expect(editor.getByRole('textbox',{name:'Article content'}).locator('figure')).toHaveCount(4);
    await editor.getByRole('button',{name:'Update live article',exact:true}).click();await expect(editor.locator('[data-editor-status]')).toHaveText('All changes saved');
    await page.screenshot({path:`.cache/articles-first-editor-${width}.png`});await editor.getByRole('button',{name:'Close article editor',exact:true}).click();
    await publicPage.goto(f.origin+'/articles');await expect(publicPage.getByRole('heading',{name:'FIELD NOTES.'})).toBeVisible();await publicPage.screenshot({path:`.cache/articles-index-${width}.png`,fullPage:true});
    await publicPage.locator('.article-public-card a').click();await expect(publicPage.locator('.article-prose')).toContainText('SV Textures is a Blender add-on');
    for(const image of await publicPage.locator('main img').all()) {await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);await expect(image).not.toHaveAttribute('alt','');}
    await publicPage.evaluate(()=>scrollTo(0,0));
    await publicPage.screenshot({path:`.cache/articles-detail-${width}.png`,fullPage:true});
    expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  }finally{await context.close();await f.close();}
});
