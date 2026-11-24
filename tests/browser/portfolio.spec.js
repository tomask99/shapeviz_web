import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
import {portfolioFixture} from '../helpers/portfolio-fixture.js';

for (const width of [390, 1536]) {
  test(`MCM thumbnails and enlarged photos fill the available width or height at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:940});
    await page.goto('/portfolio');
    const thumbnails = page.locator('#mcm .portfolio-grid img');
    const count = await thumbnails.count();
    expect(count).toBeGreaterThan(1);
    async function expectFit(photo, frame) {
      await photo.evaluate(img => img.decode());
      const ratio = await photo.evaluate(img => img.naturalWidth / img.naturalHeight);
      const box = await frame.boundingBox();
      const expectedWidth = Math.min(box.width, box.height * ratio);
      const actual = await photo.boundingBox();
      expect(Math.abs(actual.width - expectedWidth)).toBeLessThan(1);
      expect(Math.abs(actual.height - expectedWidth / ratio)).toBeLessThan(1);
    }
    for (const photo of await thumbnails.all()) {
      await photo.scrollIntoViewIfNeeded();
      await expectFit(photo, photo.locator('xpath=ancestor::figure'));
    }
    await thumbnails.first().click();
    const dialog = page.getByRole('dialog');
    for (let i = 0; i < count; i++) {
      await expectFit(dialog.locator('img'), dialog.locator('.portfolio-viewer-photo'));
      await dialog.getByRole('button', {name:'Nasledujúci obrázok'}).click();
    }
  });

  test(`portfolio editor publishes ordered blocks and linked images at ${width}px`, async ({page, context}) => {
    const fixture = portfolioFixture();
    const server = createApp(fixture);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const image = await readFile('public/media/portfolio/louis-vuitton-small.webp');
    try {
      await page.setViewportSize({width, height:940});
      await context.addCookies([{name:'sv_access', value:'owner-token', domain:'127.0.0.1', path:'/api/admin'}]);
      await context.route('https://portfolio-test.supabase.co/storage/v1/**', async route => {
        const headers = {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type'};
        const method = route.request().method();
        await route.fulfill(method === 'GET' ? {headers, contentType:'image/webp', body:image} : {headers, status:200});
      });
      await context.route('https://example.com/design', route => route.fulfill({body:'Project destination'}));
      await page.goto(origin + '/admin/site-editing#portfolio');
      const panel = page.getByRole('tabpanel', {name:'Portfolio'});
      const frame = panel.frameLocator('iframe');
      await expect(panel.getByRole('status')).toHaveText('Published portfolio loaded');
      await expect(frame.locator('#intro')).toBeVisible();
      await expect(frame.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

      await panel.getByRole('button', {name:'Add block'}).click();
      await panel.getByLabel('Project name').fill('Nový projekt');
      await panel.getByLabel('Text', {exact:true}).fill('Prvý odsek\n\nDruhý odsek');
      await panel.getByLabel('Image grid').selectOption('triptych');
      await panel.getByLabel('Add images').setInputFiles([
        {name:'grid-one.webp', mimeType:'image/webp', buffer:image},
        {name:'grid-two.webp', mimeType:'image/webp', buffer:image},
      ]);
      await expect(panel.getByRole('status')).toContainText('2 images uploaded', {timeout:20000});
      const linkedImage = panel.locator('[data-image="0"]');
      const unlinkedImage = panel.locator('[data-image="1"]');
      await linkedImage.locator('summary').click();
      await linkedImage.getByLabel('Image link URL').fill('https://example.com/design');
      await linkedImage.getByLabel('Image description').fill('Odkaz na externý projekt');
      await linkedImage.locator('summary').click();
      await unlinkedImage.locator('summary').click();
      await unlinkedImage.getByLabel('Image description').fill('Náhľad bez popisu');
      const row = panel.locator('[data-block]').filter({hasText:'Nový projekt'});
      if (width === 390) {
        await row.getByRole('button', {name:'Move block up'}).click();
      } else {
        await row.locator('[draggable]').dragTo(panel.locator('[data-block="intro"]'));
      }
      await expect(panel.locator('[data-block]').first()).toContainText('Nový projekt');
      await expect(frame.getByRole('heading', {name:'Nový projekt'})).toBeVisible();
      await panel.getByLabel('Viewport').selectOption('mobile');
      await expect.poll(() => frame.locator('html').evaluate(node => node.ownerDocument.defaultView.innerWidth)).toBe(390);
      await expect.poll(() => panel.locator('.portfolio-editor').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);

      await panel.getByLabel('Language', {exact:true}).selectOption('en');
      await panel.getByLabel('Project name').fill('English project');
      await expect(frame.getByRole('heading', {name:'English project'})).toBeVisible();
      await expect(frame.getByText('Prvý odsek')).toHaveCount(0);
      expect(await (await page.request.get(origin + '/portfolio?lang=en')).text()).not.toContain('English project');
      await panel.getByRole('button', {name:'Save and publish'}).click();
      await expect(panel.getByRole('status')).toHaveText('Portfolio published');

      await page.goto(origin + '/portfolio');
      const first = page.locator('main > section').first();
      await expect(first.getByRole('heading', {name:'Nový projekt'})).toBeVisible();
      await expect(first.locator('.portfolio-project-copy p')).toHaveCount(2);
      await expect(first.locator('.portfolio-kicker, .portfolio-credit, figcaption')).toHaveCount(0);
      await expect(first.locator('.portfolio-grid figure')).toHaveCount(2);
      const external = first.getByRole('link', {name:/Otvoriť odkaz obrázka/});
      await expect(external).toHaveAttribute('href', 'https://example.com/design');
      await expect(external.locator('svg[aria-hidden=true][focusable=false]')).toHaveCount(1);
      const [target] = await Promise.all([page.waitForEvent('popup'), external.click()]);
      await expect(target.locator('body')).toHaveText('Project destination');
      await target.close();
      const imagePreview = first.getByRole('link', {name:/Zväčšiť obrázok/});
      await imagePreview.click();
      const dialog = page.getByRole('dialog', {name:'Zväčšiť obrázok'});
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('p')).toBeHidden();
      await expect(dialog.locator('[data-gallery-count]')).toHaveText('2 / 2');
      const next = dialog.getByRole('button', {name:'Nasledujúci obrázok'});
      const previous = dialog.getByRole('button', {name:'Predchádzajúci obrázok'});
      if (width === 390) await next.click();
      else await page.keyboard.press('ArrowRight');
      await expect(dialog.locator('[data-gallery-count]')).toHaveText('1 / 2');
      await expect(dialog.locator('img')).toHaveAttribute('alt', 'Odkaz na externý projekt');
      if (width === 390) await previous.click();
      else await page.keyboard.press('ArrowLeft');
      await expect(dialog.locator('[data-gallery-count]')).toHaveText('2 / 2');
      await expect(dialog.locator('img')).toHaveAttribute('alt', 'Náhľad bez popisu');
      const close = dialog.getByRole('button', {name:'Zavrieť náhľad'});
      await expect(close.locator('img')).toBeVisible();
      if (width === 390) await close.click();
      else await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(imagePreview).toBeFocused();

      await page.goto(origin + '/portfolio?lang=en');
      await expect(page.getByRole('heading', {name:'English project'})).toBeVisible();
      await expect(page.getByText('Prvý odsek')).toHaveCount(0);
      await expect.poll(() => page.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
      await page.goto(origin + '/admin/site-editing#portfolio');
      await expect(panel.locator('[data-block]').first()).toContainText('Nový projekt');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
