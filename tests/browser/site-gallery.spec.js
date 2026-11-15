import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390, 1440]) {
  test(`Gallery uploads, drags, edits and publishes at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport:{width, height:1000}, hasTouch:width === 390});
    try {
      await context.addCookies([{name:'sv_access', value:'owner', url:fixture.origin + '/api/admin'},{name:'sv_analytics',value:`1.no.${Date.now()}`,url:fixture.origin+'/'}]);
      const uploaded = new Map();
      await context.route('https://test.supabase.co/storage/v1/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'PUT') {
          const bytes = request.postDataBuffer();
          expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
          uploaded.set(path.replace('/upload/sign/', '/public/'), bytes);
          await route.fulfill({json:{Key:'uploaded'}, headers:{'access-control-allow-origin':'*'}});
        } else {
          await route.fulfill({body:uploaded.get(path) || await readFile('public/media/gallery/detail_01-640.webp'), contentType:'image/webp', headers:{'access-control-allow-origin':'*'}});
        }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(fixture.origin + '/admin/site-editing');
      await page.getByRole('tab', {name:'Gallery', exact:true}).click();
      const panel = page.locator('#gallery-panel');
      const cards = panel.locator('.gallery-editor-card');
      await expect(cards).toHaveCount(11);
      await expect(panel.locator('.gallery-drag-handle')).toHaveCount(0);
      const firstId = await cards.first().getAttribute('data-id');
      const secondId = await cards.nth(1).getAttribute('data-id');
      const handle = cards.first().locator('[data-drag]');
      await handle.scrollIntoViewIfNeeded();
      const start = await handle.boundingBox();
      const target = await cards.nth(1).boundingBox();
      await page.mouse.move(start.x + start.width * .45, start.y + start.height * .65);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + 80, {steps:20});
      await expect(cards.first()).toHaveAttribute('data-id', secondId);
      await page.mouse.up();
      const draggedOrder = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.id));
      await expect(panel.locator('[data-gallery-status]')).toHaveText('Unsaved changes');
      await expect(page.locator('.gallery-drag-ghost')).toHaveCount(0);
      await cards.first().locator('[data-drag]').focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await expect(cards.first()).toHaveAttribute('data-id', secondId);
      await page.getByRole('tab', {name:'Companies', exact:true}).click();
      await page.getByRole('tab', {name:'Gallery', exact:true}).click();
      expect(await cards.evaluateAll(nodes => nodes.map(node => node.dataset.id))).toEqual(draggedOrder);
      expect(draggedOrder.indexOf(firstId)).toBeGreaterThan(0);
      if (width === 390) {
        const beforeTouch = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.id));
        const touchHandle = cards.first().locator('[data-drag]');
        await touchHandle.evaluate(node => node.scrollIntoView({block:'center'}));
        const from = await touchHandle.boundingBox();
        const to = await cards.nth(1).boundingBox();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:from.x + 15, y:from.y + 20}]});
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:from.x + 15 + (to.x + to.width / 2 - from.x - 15) * step / 12, y:from.y + 20 + (to.y + 80 - from.y - 20) * step / 12}]});
        }
        await expect.poll(() => cards.evaluateAll(nodes => nodes.map(node => node.dataset.id))).not.toEqual(beforeTouch);
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
        await cdp.detach();
        // Commit a keyboard move after the touch interaction.
        const moved = cards.locator('[data-drag]').first();
        await moved.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Space');
      }
      const editedId = await cards.first().getAttribute('data-id');
      await cards.first().locator('[data-edit]').click();
      await page.getByLabel('Caption', {exact:true}).fill('MATERIAL STUDY');
      await page.getByLabel('Image description').fill('Updated chair detail');
      await page.getByLabel('Card width').selectOption('wide');
      await page.getByRole('button', {name:'Apply changes'}).click();
      await expect(cards.first()).toHaveClass(/--wide/);
      await panel.locator('[data-files]').setInputFiles('public/media/gallery/detail_01-640.webp');
      await expect(cards).toHaveCount(12);
      await expect(panel.locator('[data-progress]')).toContainText('1 image added');
      expect(uploaded.size).toBe(2);
      await panel.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(panel.locator('[data-gallery-status]')).toHaveText('All changes saved');
      await page.reload();
      await page.getByRole('tab', {name:'Gallery', exact:true}).click();
      await expect(cards).toHaveCount(12);
      await expect(cards.first()).toHaveAttribute('data-id', editedId);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({path:`.cache/gallery-editor-${width}.png`, fullPage:true});
      const publicPage = await context.newPage();
      await publicPage.goto(fixture.origin + '/en');
      await publicPage.locator('#gallery-toggle').click();
      const gallery = publicPage.locator('.gallery-grid');
      await expect(gallery.locator('.gallery-slot')).toHaveCount(12);
      await expect(gallery.locator('.gallery-slot').first()).toContainText('MATERIAL STUDY');
      await expect(gallery.locator('video')).toHaveCount(2);
      await gallery.locator('.image-button').last().click();
      await expect(publicPage.locator('.lightbox')).toBeVisible();
      await expect(publicPage.locator('.lightbox img')).toHaveJSProperty('naturalWidth', 640);
      await publicPage.keyboard.press('Escape');
      const film = gallery.locator('.gallery-film').first();
      await film.scrollIntoViewIfNeeded();
      const sound = film.locator('.video-sound');
      await sound.click();
      await expect(sound).toHaveAttribute('aria-pressed', 'true');
      await expect(sound).toHaveAttribute('aria-label', 'Mute video');
      await expect(film.locator('.video-play svg')).toHaveCount(1);
      fixture.setUnavailable(true);
      await cards.last().locator('[data-remove]').click();
      await panel.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(panel.locator('[data-gallery-error]')).toContainText('could not complete');
      await expect(cards).toHaveCount(11);
      fixture.setUnavailable(false);
      await panel.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(panel.locator('[data-gallery-status]')).toHaveText('All changes saved');
      expect(errors).toEqual([]);
    } finally {await context.close(); await fixture.close();}
  });
}
