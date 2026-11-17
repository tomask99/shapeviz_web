import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390, 768, 1440]) {
  test(`project brand stays separate from its details at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const touch = width < 1000;
    const context = await browser.newContext({viewport:{width, height:1000}, hasTouch:touch, isMobile:touch});
    try {
      await context.addCookies([{name:'sv_analytics', value:`1.no.${Date.now()}`, url:fixture.origin}]);
      const page = await context.newPage();
      await page.goto(fixture.origin + '/en');
      const row = page.locator('.client-list > li').first();
      const button = row.getByRole('button', {name:'PRADA', exact:true});
      await row.scrollIntoViewIfNeeded();
      await expect(row.locator('.client-description')).toBeHidden();
      const initialHeight = await row.evaluate(row => row.offsetHeight);
      const nextTop = await row.evaluate(row => row.nextElementSibling.offsetTop);
      const originalHeight = await row.evaluate(row => {
        const clone = row.cloneNode(true);
        clone.querySelector('.client-copy').replaceWith(clone.querySelector('.client-name'));
        row.after(clone);
        const height = clone.offsetHeight;
        clone.remove();
        return height;
      });
      expect(initialHeight).toBe(originalHeight);
      if (touch) {
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await button.tap({position:{x:10,y:10}});
        await expect(button).toHaveAttribute('aria-expanded', 'true');
      } else await row.hover();
      await expect(row.locator('.client-description')).toHaveCSS('opacity', '1');
      expect(await row.evaluate(row => row.offsetHeight)).toBe(initialHeight);
      expect(await row.evaluate(row => row.nextElementSibling.offsetTop)).toBe(nextTop);
      const brand = row.locator('.client-brand');
      await expect(brand).toBeVisible();
      const layout = await row.evaluate(row => {
        const box = selector => row.querySelector(selector).getBoundingClientRect();
        const brand=box('.client-brand'), facts=box('.client-facts'), summary=box('.client-summary'), image=box('.client-preview');
        return {brandAbove:brand.bottom <= Math.min(facts.top,summary.top), imageSeparate:image.top >= Math.max(facts.bottom,summary.bottom) || image.left >= Math.max(facts.right,summary.right), overflow:document.documentElement.scrollWidth > innerWidth};
      });
      expect(layout).toEqual({brandAbove:true, imageSeparate:true, overflow:false});
      if (width === 390) {
        const body = row.locator('.client-detail-body');
        const box = await body.boundingBox();
        const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:box.x + box.width / 2, y:box.y + box.height - 3}]});
        for (let step = 1; step <= 6; step++) {
          await session.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:box.x + box.width / 2, y:box.y + box.height - 3 - step * 6}]});
          await page.waitForTimeout(20);
        }
        await session.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
        await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await body.evaluate(element => {element.scrollTop = element.scrollHeight;});
        await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await expect(brand).toBeVisible();
        expect(await row.evaluate(row => row.offsetHeight)).toBe(initialHeight);
        await body.evaluate(element => {element.scrollTop = 0;});
      }
      await page.screenshot({path:`.cache/company-brand-${width}.png`});
      if (touch) {
        await button.tap({position:{x:10,y:10}});
        await expect(row.locator('.client-description')).toBeHidden();
        await expect(row.locator('.client-name')).toHaveCSS('opacity', '1');
        await button.tap({position:{x:10,y:10}});
        const second = page.locator('.client-list > li').nth(1);
        await second.getByRole('button', {name:'PUCCI', exact:true}).tap();
        await expect(button).toHaveAttribute('aria-expanded','false');
        await expect(second).toHaveClass(/is-preview-active/);
        await expect(page.locator('.client-list > .is-preview-active')).toHaveCount(1);
      }
    } finally {await context.close(); await fixture.close();}
  });
}
