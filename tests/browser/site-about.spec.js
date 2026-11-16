import {test, expect} from '@playwright/test';
import {siteContentFixture} from '../helpers/site-content-fixture.js';

for (const width of [390,1440]) {
  test(`profile editor saves both languages and preserves failed drafts at ${width}px`, async ({browser}) => {
    const fixture = await siteContentFixture();
    const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    try {
      await context.addCookies([{name:'sv_access',value:'owner',url:fixture.origin+'/api/admin'},{name:'sv_analytics',value:`1.no.${Date.now()}`,url:fixture.origin}]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error=>errors.push(error.message));
      await page.goto(fixture.origin+'/admin/site-editing#about');
      await expect(page.getByRole('tab',{name:'About me',exact:true})).toHaveAttribute('aria-selected','true');
      const panel = page.getByRole('tabpanel',{name:'About me'});
      await panel.getByRole('textbox',{name:'Introduction',exact:true}).fill('Som Tomas. Toto je môj upravený profil.');
      await panel.getByLabel('Editing language').selectOption('en');
      await panel.getByRole('textbox',{name:'Introduction',exact:true}).fill('I am Tomas. This is my updated profile.');
      await panel.getByRole('button',{name:'Save profile',exact:true}).click();
      await expect(panel.locator('[data-about-status]')).toHaveText('All changes saved');
      await expect(panel.getByRole('button',{name:'Save profile',exact:true})).toBeDisabled();
      await page.reload();
      await expect(panel.locator('[name="sk-intro"]')).toHaveValue('Som Tomas. Toto je môj upravený profil.');
      await expect(panel.locator('[name="en-intro"]')).toHaveValue('I am Tomas. This is my updated profile.');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`.cache/about-editor-${width}.png`,fullPage:true});
      await page.getByRole('tab',{name:'About me',exact:true}).focus();
      await page.keyboard.press('Home');
      await expect(page.getByRole('tab',{name:'Companies',exact:true})).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.getByRole('tab',{name:'About me',exact:true})).toBeFocused();
      fixture.setUnavailable(true);
      await panel.locator('[name="sk-intro"]').fill('Draft retained after a failed save.');
      await panel.getByRole('button',{name:'Save profile',exact:true}).click();
      await expect(panel.locator('[data-about-error]')).not.toBeEmpty();
      await expect(panel.locator('[name="sk-intro"]')).toHaveValue('Draft retained after a failed save.');
      fixture.setUnavailable(false);
      page.once('dialog',dialog=>dialog.accept());
      await panel.getByRole('button',{name:'Reload saved profile'}).click();
      await expect(panel.locator('[name="sk-intro"]')).toHaveValue('Som Tomas. Toto je môj upravený profil.');
      const publicPage = await context.newPage();
      for (const locale of ['sk','en']) {
        await publicPage.goto(fixture.origin+'/'+locale+'#tomas');
        const section = publicPage.locator('#tomas');
        await section.scrollIntoViewIfNeeded();
        await expect(section.locator('[data-about="intro"]')).toHaveText(locale==='sk'?'Som Tomas. Toto je môj upravený profil.':'I am Tomas. This is my updated profile.');
        await section.locator('img').evaluate(img=>img.decode());
        const portrait = await section.locator('img').boundingBox();
        expect(portrait.width).toBeLessThanOrEqual(width===390?280:380);
        expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await section.screenshot({path:`.cache/about-public-${locale}-${width}.png`});
        const contact = section.getByRole('link');
        await expect(contact).toHaveAccessibleName(locale==='sk'?'VYTVORME NIEČO SPOLU':'LET’S CREATE SOMETHING');
        await contact.click();
        await expect(publicPage).toHaveURL(/#project-form$/);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); await fixture.close(); }
  });
}
