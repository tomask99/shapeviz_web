import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390, 1440]) {
  test(`project name transitions to an editable description at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport:{width,height:1000}, hasTouch:width === 390, isMobile:width === 390});
    try {
      await context.addCookies([{name:'sv_access',value:'owner',url:fixture.origin + '/api/admin'}, {name:'sv_analytics',value:`1.no.${Date.now()}`,url:fixture.origin}]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(fixture.origin + '/sk');
      const row = page.locator('.client-list > li').first();
      const description = row.locator('.client-description');
      await row.scrollIntoViewIfNeeded();
      await expect(description).toContainText('The New Face / Francúzsko');
      await expect(description).toContainText('širšieho tvorivého tímu');
      await expect(description.locator('.client-contributions li')).toHaveCount(4);
      for (const tool of ['3ds Max', 'Substance Painter', 'Houdini', 'Karma']) await expect(description).toContainText(tool);
      const initialHeight = await row.evaluate(element => element.offsetHeight);
      if (width === 1440) {
        await expect(row.locator('.client-name')).toHaveCSS('opacity', '1');
        await expect(description).toBeHidden();
        await row.hover();
      } else {
        await expect(description).toBeHidden();
        await row.getByRole('button', {name:'PRADA', exact:true}).tap();
      }
      await expect(row.locator('.client-name')).toHaveCSS('opacity', '0');
      await expect(description).toHaveCSS('opacity', '1');
      expect(await row.evaluate(element => element.offsetHeight)).toBe(initialHeight);
      await expect(description.locator('.client-brand')).toHaveText('PRADA');
      await expect(description.locator('.client-brand')).toBeVisible();
      const layout = await row.evaluate(element => {
        const row = element.getBoundingClientRect(), text = element.querySelector('.client-description').getBoundingClientRect();
        return {contained:text.top >= row.top && text.bottom <= row.bottom && text.left >= row.left && text.right <= row.right, overflow:document.documentElement.scrollWidth > innerWidth};
      });
      expect(layout).toEqual({contained:true, overflow:false});
      const blocks = await description.evaluate(element => {
        const facts = element.querySelector('.client-facts').getBoundingClientRect();
        const summary = element.querySelector('.client-summary').getBoundingClientRect();
        return {sideBySide:summary.left > facts.right, stacked:summary.top >= facts.bottom};
      });
      expect(width === 1440 ? blocks.sideBySide : blocks.stacked).toBe(true);
      await expect.poll(() => row.locator('.client-preview img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await page.screenshot({path:`.cache/company-description-${width}.png`});
      if (width === 1440) {
        await page.mouse.move(0, 0);
        await expect(row.locator('.client-name')).toHaveCSS('opacity', '1');
        await expect(description).toBeHidden();
        await page.keyboard.press('Tab');
        await row.focus();
        await expect(description).toHaveCSS('opacity', '1');
      }

      const admin = await context.newPage();
      await admin.goto(fixture.origin + '/admin/site-editing');
      const editor = admin.locator('.site-company-row').first();
      await editor.locator('[data-company-toggle]').click();
      await expect(editor.getByRole('textbox', {name:'Collaboration (SK)', exact:true})).toHaveValue(/The New Face/);
      await editor.getByRole('textbox', {name:'Collaboration (SK)', exact:true}).fill('The New Face / Paríž');
      await editor.getByRole('textbox', {name:'Collaboration (EN)', exact:true}).fill('The New Face / Paris');
      await editor.getByRole('textbox', {name:'My contribution (SK)', exact:true}).fill('3D modely\nTextúry');
      await editor.getByRole('textbox', {name:'My contribution (EN)', exact:true}).fill('3D models\nTextures');
      await editor.getByRole('textbox', {name:'Short description (SK)', exact:true}).fill('Súčasť širšieho tvorivého tímu.');
      await editor.getByRole('textbox', {name:'Short description (EN)', exact:true}).fill('Part of a larger creative team.');
      await admin.getByRole('button', {name:'Save changes',exact:true}).click();
      await expect(admin.locator('[data-save-status]')).toHaveText('All changes saved');
      await admin.reload();
      await editor.locator('[data-company-toggle]').click();
      await expect(editor.getByRole('textbox', {name:'Short description (SK)', exact:true})).toHaveValue('Súčasť širšieho tvorivého tímu.');
      await expect(editor.getByRole('textbox', {name:'My contribution (SK)', exact:true})).toHaveValue('3D modely\nTextúry');
      await expect(editor.getByRole('textbox', {name:'Collaboration (EN)', exact:true})).toHaveValue('The New Face / Paris');
      await editor.scrollIntoViewIfNeeded();
      await admin.screenshot({path:`.cache/company-description-editor-${width}.png`});
      await page.goto(fixture.origin + '/en');
      await expect(description.locator('.client-summary p')).toHaveText('Part of a larger creative team.');
      await expect(description.locator('.client-contributions li')).toHaveText(['3D models', 'Textures']);
      await page.emulateMedia({reducedMotion:'reduce'});
      await expect(description).toHaveCSS('transition-duration', '0s');
      for (const field of ['Short description', 'Collaboration', 'My contribution']) await editor.getByRole('textbox', {name:`${field} (EN)`, exact:true}).fill('');
      await admin.getByRole('button', {name:'Save changes',exact:true}).click();
      await expect(admin.locator('[data-save-status]')).toHaveText('All changes saved');
      await page.reload();
      await row.scrollIntoViewIfNeeded();
      if (width === 1440) await row.hover();
      await expect(description).toHaveCount(0);
      await expect(row.locator('.client-name')).toHaveCSS('opacity', '1');
      expect(errors).toEqual([]);
    } finally {await context.close(); await fixture.close();}
  });
}
