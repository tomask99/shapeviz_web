import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

test('previews follow a stationary pointer while scrolling and release click focus', async ({browser}) => {
  const fixture = await siteContentFixture();
  const context = await browser.newContext({viewport:{width:1440, height:1000}});
  try {
    const initial = await (await fixture.request('site-content-list')).json();
    await fixture.request('site-content-save', {version:initial.version, companies:[...initial.companies, {id:'louis-vuitton', name:'LOUIS VUITTON', url:''}]});
    await context.addCookies([{name:'sv_analytics', value:`1.no.${Date.now()}`, url:fixture.origin}]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(fixture.origin + '/en');
    const rows = page.locator('.client-list > li');
    const first = rows.first();
    await first.scrollIntoViewIfNeeded();
    await first.click({position:{x:200, y:70}});
    await expect(first).toBeFocused();
    await expect(first).toHaveClass(/is-preview-active/);
    await page.mouse.move(0, 0);
    await expect(page.locator('.is-preview-active')).toHaveCount(0);
    await expect(first.locator('.client-preview')).toHaveCSS('clip-path', 'inset(0px 0px 0px 100%)');

    const bounds = await first.boundingBox();
    const point = {x:bounds.x + bounds.width * .7, y:bounds.y + bounds.height / 2};
    await page.mouse.move(point.x, point.y);
    await expect(first).toHaveClass(/is-preview-active/);
    for (let index = 1; index < 10; index++) {
      await rows.nth(index).evaluate((row, y) => {
        const box = row.getBoundingClientRect();
        scrollTo({top:scrollY + box.y + box.height / 2 - y, behavior:'instant'});
      }, point.y);
      await expect(rows.nth(index)).toHaveClass(/is-preview-active/);
      await expect(page.locator('.is-preview-active')).toHaveCount(1);
    }
    const last = rows.last();
    await expect(last).toContainText('LOUIS VUITTON');
    await expect(last.locator('.client-preview')).toHaveCSS('clip-path', 'inset(0px)');
    await expect.poll(() => last.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({path:'.cache/company-preview-louis-vuitton.png'});
    await page.mouse.move(-10, -10);
    await expect(page.locator('.is-preview-active')).toHaveCount(0);
    await expect(last.locator('.client-preview')).toHaveCSS('clip-path', 'inset(0px 0px 0px 100%)');

    // Keyboard navigation still reveals a preview; resuming mouse use releases it.
    await page.keyboard.press('Tab');
    await last.focus();
    await expect(last).toHaveClass(/is-preview-active/);
    await page.mouse.move(0, 0);
    await expect(page.locator('.is-preview-active')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {await context.close(); await fixture.close();}
});

for (const width of [390, 1440]) {
  test(`project previews can be selected, uploaded, cropped and removed at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport:{width, height:1000}, hasTouch:width === 390, isMobile:width === 390});
    const uploads = [];
    const image = await readFile('public/media/gallery/detail_01-640.webp');
    await context.route('https://test.supabase.co/storage/**', async route => {
      if (route.request().method() === 'PUT') {
        expect(route.request().postDataBuffer().subarray(8, 12).toString()).toBe('WEBP');
        uploads.push(route.request().url());
        return route.fulfill({json:{Key:'uploaded'}, headers:{'access-control-allow-origin':'*'}});
      }
      return route.fulfill({body:image, contentType:'image/webp', headers:{'access-control-allow-origin':'*'}});
    });
    try {
      await context.addCookies([{name:'sv_access', value:'owner', url:fixture.origin + '/api/admin'}, {name:'sv_analytics', value:`1.no.${Date.now()}`, url:fixture.origin}]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(fixture.origin + '/admin/site-editing');
      const row = page.locator('.site-company-row').first();
      await row.locator('[data-company-toggle]').click();
      await expect(row.locator('.site-company-preview img')).toBeVisible();
      await row.getByLabel('Project link').fill('https://example.com/prada');
      await row.getByRole('combobox', {name:'Project image', exact:true}).selectOption('original-2');
      await row.getByLabel('Vertical crop').evaluate(input => {input.value = '31'; input.dispatchEvent(new Event('input', {bubbles:true}));});
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.reload();
      await row.locator('[data-company-toggle]').click();
      await expect(row.getByLabel('Vertical crop')).toHaveValue('31');
      await expect(row.locator('.site-company-preview img')).toHaveAttribute('src', '/media/gallery/detail_01-640.webp');

      const publicPage = await context.newPage();
      publicPage.on('pageerror', error => errors.push(error.message));
      await publicPage.goto(fixture.origin + '/en');
      const project = publicPage.locator('.client-list > li').first();
      await project.scrollIntoViewIfNeeded();
      const preview = project.locator('.client-preview');
      if (width === 1440) {
        await expect(preview).toHaveCSS('clip-path', 'inset(0px 0px 0px 100%)');
        await project.hover();
      }
      await expect(preview).toHaveCSS('clip-path', 'inset(0px)');
      await expect(preview.locator('img')).toHaveCSS('object-position', '50% 31%');
      const {box, crop} = await project.evaluate(row => ({box:row.getBoundingClientRect().toJSON(), crop:row.querySelector('.client-preview').getBoundingClientRect().toJSON()}));
      expect(crop.x).toBeGreaterThan(box.x + box.width * .5);
      expect(crop.y).toBeGreaterThanOrEqual(box.y);
      expect(crop.y + crop.height).toBeLessThanOrEqual(box.y + box.height + 1);
      await expect(project.getByRole('link')).toHaveAccessibleName('Open PRADA project (new tab)');
      if (width === 1440) {
        await publicPage.mouse.move(0, 0);
        await expect(preview).toHaveCSS('clip-path', 'inset(0px 0px 0px 100%)');
        await expect(publicPage.locator('.client-preview').nth(1)).toHaveCSS('clip-path', 'inset(0px 0px 0px 100%)');
      }
      await project.getByRole('link').focus();
      await expect(preview).toHaveCSS('clip-path', 'inset(0px)');
      expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await publicPage.screenshot({path:`.cache/company-preview-${width}.png`});

      await row.locator('[data-image-file]').setInputFiles({name:'project.webp', mimeType:'image/webp', buffer:image});
      await expect(page.locator('[data-upload-status]')).toHaveText('Image uploaded. Save changes to update the website.');
      expect(uploads).toHaveLength(2);
      await row.getByLabel('Vertical crop').evaluate(input => {input.value = '72'; input.dispatchEvent(new Event('input', {bubbles:true}));});
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.reload();
      await row.locator('[data-company-toggle]').click();
      await expect(row.locator('.site-company-preview img')).toHaveAttribute('src', /\/uploads\/.*\/thumb.webp$/);
      await expect(row.getByLabel('Vertical crop')).toHaveValue('72');
      await publicPage.reload();
      await expect(preview.locator('img')).toHaveAttribute('src', /\/uploads\/.*\/thumb.webp$/);
      await expect(preview.locator('img')).toHaveCSS('object-position', '50% 72%');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({path:`.cache/company-image-editor-${width}.png`});

      await row.locator('[data-image-file]').setInputFiles({name:'invalid.txt', mimeType:'text/plain', buffer:Buffer.from('not an image')});
      await expect(page.locator('.site-companies [data-error]')).toContainText('Choose a JPG');
      await expect(row.locator('.site-company-preview img')).toHaveAttribute('src', /\/uploads\/.*\/thumb.webp$/);
      await row.getByRole('button', {name:'Remove image', exact:true}).click();
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await publicPage.reload();
      await expect(project.locator('.client-preview')).toHaveCount(0);
      await expect(publicPage.locator('.client-preview')).toHaveCount(8);
      await publicPage.emulateMedia({reducedMotion:'reduce'});
      await expect(publicPage.locator('.client-preview').first()).toHaveCSS('transition-duration', '0s');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await fixture.close();
    }
  });
}
