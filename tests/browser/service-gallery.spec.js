import {test, expect} from '@playwright/test';

for (const width of [390,1440]) for (const locale of ['sk','en']) {
  test(`service gallery opens full images and restores focus at ${width}px in ${locale}`, async ({page}) => {
    await page.setViewportSize({width,height:960});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(locale==='sk' ? '/sk/sluzby/produktove-interierove-vizualizacie' : '/en/services/product-interior-visualization');
    await page.getByRole('button',{name:locale==='sk' ? /Odmietnuť analytiku/ : /Decline analytics/}).click();
    const links=page.locator('[data-service-image]');
    const dialog=page.locator('.service-lightbox');
    await expect(links).toHaveCount(10);
    for (const link of await links.all()) {
      await expect(link).toHaveAccessibleName(/.+/);
      await link.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('img')).toHaveAttribute('src',await link.evaluate(a=>a.href));
      await dialog.locator('img').evaluate(img=>img.decode());
      expect(await dialog.locator('img').getAttribute('alt')).toBe(await link.locator('img').getAttribute('alt'));
      await expect(page.locator('body')).toHaveClass(/modal-open/);
      await page.keyboard.press('Tab');
      await expect(dialog.locator('button')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(link).toBeFocused();
    }
    const first=links.first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.locator('button').click();
    await expect(first).toBeFocused();
    await first.click();
    await page.mouse.click(1,480);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/modal-open/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}

test('service images remain usable without JavaScript', async ({browser}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  try {
    const page=await context.newPage();
    await page.goto('/en/services/product-interior-visualization');
    await page.locator('[data-service-image]').last().click();
    await expect(page).toHaveURL(/hevi-magnesium-1920\.webp$/);
  } finally { await context.close(); }
});
