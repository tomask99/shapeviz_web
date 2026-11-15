import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

test('horizontal drags keep their row and scroll position while neighbouring cards animate', async ({browser}) => {
  const fixture = await siteContentFixture();
  const context = await browser.newContext({viewport:{width:1440, height:1000}});
  try {
    const initial = await (await fixture.request('site-gallery-list')).json();
    const order = [0, 1, 2, 6, 3, 4, 5, 8, 7, 9, 10];
    await fixture.request('site-gallery-save', {version:initial.version, items:order.map(index => initial.items[index])});
    await context.addCookies([{name:'sv_access', value:'owner', url:fixture.origin + '/api/admin'}]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(fixture.origin + '/admin/site-editing');
    await page.getByRole('tab', {name:'Gallery', exact:true}).click();
    const grid = page.locator('.gallery-editor-grid');
    await expect(grid.locator('article')).toHaveCount(11);
    const wide = grid.locator('[data-id="original-7"]');
    const narrow = grid.locator('[data-id="original-3"]');
    // Start on the image in the old auto-scroll zone, then move only horizontally.
    await wide.evaluate(node => window.scrollBy(0, node.getBoundingClientRect().top - 24));
    const handle = await wide.locator('[data-drag]').boundingBox();
    const target = await narrow.boundingBox();
    const beforeScroll = await page.evaluate(() => scrollY);
    const startX = handle.x + handle.width / 2;
    const pointerY = handle.y + 34;
    await page.mouse.move(startX, pointerY);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, pointerY, {steps:18});
    await expect(grid.locator('article').nth(2)).toHaveAttribute('data-id', 'original-7');
    const expected = ['original-1', 'original-2', 'original-7', 'original-3', 'original-4', 'original-5', 'original-6', 'original-9', 'original-8', 'original-10', 'original-11'];
    // Small horizontal movements over the animating neighbour must keep the same slot.
    for (let step = 0; step < 8; step++) {
      await page.mouse.move(target.x + target.width / 2 - step * 4, pointerY);
      expect(await grid.locator('article').evaluateAll(nodes => nodes.map(node => node.dataset.id))).toEqual(expected);
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(beforeScroll, 0);
      const ghost = await page.locator('.gallery-drag-ghost').boundingBox();
      expect(ghost.y).toBeCloseTo(target.y, 0);
    }
    await page.mouse.up();
    await expect(page.locator('.gallery-drag-ghost')).toHaveCount(0);
    const result = await wide.boundingBox();
    expect(result.y).toBeCloseTo(target.y, 0);
    expect(result.x).toBeCloseTo(target.x, 0);
    await page.screenshot({path:'.cache/gallery-horizontal-drag.png'});

    // A narrow card moving left across a wide neighbour follows the same rule.
    const narrowHandle = await narrow.locator('[data-drag]').boundingBox();
    const wideBounds = await wide.boundingBox();
    await page.mouse.move(narrowHandle.x + 20, narrowHandle.y + 20);
    await page.mouse.down();
    await page.mouse.move(wideBounds.x + wideBounds.width / 2, narrowHandle.y + 20, {steps:18});
    await expect(grid.locator('article').nth(2)).toHaveAttribute('data-id', 'original-3');
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(beforeScroll, 0);
    await page.mouse.up();
    await expect(page.locator('.gallery-drag-ghost')).toHaveCount(0);
    await page.locator('#gallery-panel [data-gallery-save]').click();
    await expect(page.locator('[data-gallery-status]')).toHaveText('All changes saved');
    await page.reload();
    await page.getByRole('tab', {name:'Gallery', exact:true}).click();
    await expect(grid.locator('article').nth(2)).toHaveAttribute('data-id', 'original-3');
    expect(errors).toEqual([]);
  } finally {await context.close(); await fixture.close();}
});
