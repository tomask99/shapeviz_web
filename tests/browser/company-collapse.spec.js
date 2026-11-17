import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390, 1440]) {
  test(`company sections collapse without losing edits at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport:{width, height:1000}, hasTouch:width === 390, isMobile:width === 390});
    try {
      await context.addCookies([{name:'sv_access', value:'owner', url:fixture.origin + '/api/admin'}]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(fixture.origin + '/admin/site-editing');
      const rows = page.locator('.site-company-row');
      const first = rows.first();
      const toggle = first.locator('[data-company-toggle]');
      await expect(rows).toHaveCount(9);
      await expect(page.locator('[data-company-body]:visible')).toHaveCount(0);
      await expect(toggle).toHaveAccessibleName('Expand project PRADA');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('button', {name:'Save changes', exact:true})).toBeDisabled();
      await page.screenshot({path:`.cache/company-collapsed-${width}.png`, fullPage:true});
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-company-body]:visible')).toHaveCount(1);
      await first.getByLabel('Company name').fill('PRADA EDITED');
      await toggle.click();
      await expect(toggle).toHaveAccessibleName('Expand project PRADA EDITED');
      await toggle.press('Enter');
      await expect(first.getByLabel('Company name')).toHaveValue('PRADA EDITED');
      await first.getByRole('combobox', {name:'Project image', exact:true}).selectOption('original-2');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await rows.nth(1).locator('[data-company-toggle]').click();
      await expect(page.locator('[data-company-body]:visible')).toHaveCount(2);
      await toggle.press('Space');
      await expect(first.locator('[data-company-body]')).toBeHidden();
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.reload();
      await expect(toggle).toHaveAccessibleName('Expand project PRADA EDITED');
      await expect(page.locator('[data-company-body]:visible')).toHaveCount(0);
      await page.getByRole('button', {name:'Add company', exact:true}).click();
      const added = rows.last();
      await expect(added.getByLabel('Company name')).toBeFocused();
      await added.locator('[data-company-toggle]').click();
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(added.locator('[data-company-toggle]')).toHaveAttribute('aria-expanded', 'true');
      await expect(added.getByLabel('Company name')).toBeFocused();
      await added.getByLabel('Company name').fill('NEW PROJECT');
      await added.getByLabel('Project link').fill('javascript:alert(1)');
      await added.locator('[data-company-toggle]').click();
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(added.getByLabel('Project link')).toBeFocused();
      await added.getByLabel('Project link').fill('/p/new-project');
      await added.getByRole('button', {name:'Move company 10 up'}).click();
      await expect(rows.nth(8).locator('[data-company-toggle]')).toBeFocused();
      await expect(rows.nth(8).getByLabel('Project link')).toHaveValue('/p/new-project');
      await page.getByRole('button', {name:'Save changes', exact:true}).click();
      await expect(page.locator('[data-save-status]')).toHaveText('All changes saved');
      await toggle.click();
      await first.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path:`.cache/company-expanded-${width}.png`, fullPage:true});
      expect(errors).toEqual([]);
    } finally {await context.close(); await fixture.close();}
  });
}
