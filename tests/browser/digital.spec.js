import {test, expect} from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test('all six services share the main section at ' + width + 'px', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: 1000});
    await page.emulateMedia({reducedMotion: 'reduce'});
    for (const locale of ['en', 'sk']) {
      await page.goto('/' + locale);
      const services = page.locator('#services');
      await services.scrollIntoViewIfNeeded();
      await expect(page.locator('#digital')).toHaveCount(0);
      await expect(services.locator(':scope > div')).toHaveCount(6);
      await expect(services.locator('.micro')).toHaveText(['01', '02', '03', '04', '05', '06']);
      await expect(services.locator('#marketing')).toContainText(locale === 'sk' ? 'Marketing a online prezentácia' : 'Marketing & digital presence');
      await expect(services.locator('#websites')).toContainText(locale === 'sk' ? 'Weby a aplikácie' : 'Websites & applications');
      await expect(services.getByRole('link')).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await services.screenshot({path: 'test-results/services-' + locale + '-' + width + '.png'});
    }
    expect(errors).toEqual([]);
  });
}
