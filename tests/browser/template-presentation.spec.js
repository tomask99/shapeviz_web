import { test, expect } from '@playwright/test';
import { renderPresentationTemplate } from '../../src/presentations/page.js';

const project = {
  deck_slug: 'minotti', source_type: 'template', template_key: 'shapeviz-introduction-v1',
  client: 'Minotti', title: 'A visual partnership', presentation_date: 'September 2026',
  description: 'Tailored Shapeviz introduction', locale: 'en', content: {
    headline: 'A visual partnership for Minotti.', intro: 'A tailored introduction prepared by Shapeviz.',
    opportunity: 'Build a visual world people recognize and desire.',
    focus: 'Visual direction, CGI, motion and content designed around the brand.',
    cta: 'Let’s discuss where strong visual direction can take Minotti next.'
  }
};

test('universal presentation template renders and navigates', async ({ page }) => {
  await page.setContent(await renderPresentationTemplate(project));
  await expect(page).toHaveTitle(/Minotti.*Shapeviz/);
  await expect(page.locator('.slide.active')).toContainText('A visual partnership for Minotti');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#count')).toContainText('02 / 05');
  await expect(page.locator('.slide.active')).toContainText('Build a visual world');
});

test('universal presentation template fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(await renderPresentationTemplate(project));
  await expect(page.locator('nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
