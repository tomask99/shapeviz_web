import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390, 1440]) {
  test(`Site Editing publishes company names and links at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport: {width, height: 1000}, reducedMotion: 'reduce'});
    try {
      await context.addCookies([{name: 'sv_access', value: 'owner', url: fixture.origin + '/api/admin'}]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(fixture.origin + '/admin/site-editing');
      await expect(page.getByRole('heading', {name: 'Site Editing.'})).toBeVisible();
      await expect(page.getByRole('tab', {name: 'Companies'})).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#nav-site-editing')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.site-company-row')).toHaveCount(9);
      await page.locator('[data-company-toggle]').first().click();
      await page.locator('.site-company-row').first().getByLabel('Project link').fill('https://example.com/prada');
      await page.getByRole('button', {name: 'Add company', exact: true}).click();
      const added = page.locator('.site-company-row').last();
      await added.getByLabel('Company name').fill('NEW STUDIO');
      await added.getByLabel('Project link').fill('/p/new-project');
      await added.getByRole('button', {name: 'Move company 10 up'}).click();
      await page.getByRole('button', {name: 'Save changes', exact: true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.reload();
      await expect(page.locator('.site-company-row').nth(8).getByLabel('Company name')).toHaveValue('NEW STUDIO');
      await expect(page.locator('.site-company-row').first().getByLabel('Project link')).toHaveValue('https://example.com/prada');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path: `.cache/site-editing-${width}.png`, fullPage: true});

      const publicPage = await context.newPage();
      await publicPage.goto(fixture.origin + '/en');
      await expect(publicPage.locator('.client-list > li')).toHaveCount(10);
      const link = publicPage.getByRole('link', {name: 'Open PRADA project (new tab)', exact: true});
      await link.scrollIntoViewIfNeeded();
      await link.focus();
      await expect(link).toBeFocused();
      await context.route('https://example.com/prada', route => route.fulfill({body: '<h1>Project destination</h1>', contentType: 'text/html'}));
      const popupPromise = publicPage.waitForEvent('popup');
      await link.press('Enter');
      const popup = await popupPromise;
      await popup.waitForLoadState();
      expect(popup.url()).toBe('https://example.com/prada');
      await popup.close();
      expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await publicPage.screenshot({path: `.cache/site-companies-${width}.png`, fullPage: true});

      fixture.setUnavailable(true);
      await page.locator('[data-company-toggle]').first().click();
      await page.locator('.site-company-row').first().getByLabel('Company name').fill('Edited draft');
      await page.getByRole('button', {name: 'Save changes', exact: true}).click();
      await expect(page.locator('.site-editing [data-error]')).toContainText('could not complete');
      await expect(page.locator('.site-company-row').first().getByLabel('Company name')).toHaveValue('Edited draft');
      fixture.setUnavailable(false);
      await page.getByRole('button', {name: 'Save changes', exact: true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.locator('.site-company-row').nth(8).getByRole('button', {name: 'Remove company 9'}).click();
      await page.getByRole('button', {name: 'Save changes', exact: true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await publicPage.reload();
      await expect(publicPage.locator('.client-list > li')).toHaveCount(9);
      await expect(publicPage.locator('.client-list')).not.toContainText('NEW STUDIO');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await fixture.close();
    }
  });
}
