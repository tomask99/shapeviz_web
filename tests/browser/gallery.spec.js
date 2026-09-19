import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';

test('collection filters all assets without scroll effects and retains image hover and enlargement', async ({ page }) => {
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/media/gallery/')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const toggle = page.locator('#gallery-toggle');
  await toggle.scrollIntoViewIfNeeded();
  expect(requests).toEqual([]);
  await toggle.click();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.locator('.gallery-stage, .gallery-track, .gallery-page')).toHaveCount(0);
  const sourceFiles = (await readdir('assets/galery')).sort();
  expect((await page.locator('[data-gallery-file]').evaluateAll(items => items.map(item => item.dataset.galleryFile))).sort()).toEqual(sourceFiles);
  await page.getByRole('tab', { name: /Details/ }).click();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('id', 'collection-details');
  await expect(page.getByRole('tabpanel').locator('.gallery-item')).toHaveCount(6);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Studio/ })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('id', 'collection-studio');
  await expect(page.getByRole('tabpanel').locator('.gallery-item')).toHaveCount(4);
  const image = page.getByRole('tabpanel').locator('.image-button').first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.locator('img').evaluate(img => img.naturalWidth > 0)).toBe(true);
  await image.hover();
  await expect.poll(() => image.evaluate(el => getComputedStyle(el).boxShadow)).toContain('70px');
  await expect(image.locator('.media-clip')).toHaveCSS('overflow', 'hidden');
  await image.click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Lifestyle/ }).click();
  const figure = page.getByRole('tabpanel').locator('.gallery-item').first();
  await figure.scrollIntoViewIfNeeded();
  const before = await figure.boundingBox();
  await page.evaluate(() => scrollBy({ top: 240, behavior: 'instant' }));
  await expect(figure).toHaveCSS('opacity', '1');
  await expect(figure).toHaveCSS('transform', 'none');
  expect((await figure.boundingBox()).y).toBeCloseTo(before.y - 240, 0);
  expect(errors).toEqual([]);
});

test('films pause on category change and closing returns to the gallery trigger', async ({ page }) => {
  await page.goto('/');
  await page.locator('#gallery-toggle').click();
  await page.getByRole('tab', { name: /Films/ }).click();
  const video = page.locator('#collection-videos video').first();
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  await page.getByRole('tab', { name: /Lifestyle/ }).click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  await page.locator('.gallery-end').scrollIntoViewIfNeeded();
  await page.locator('.gallery-toolbar .gallery-collapse').click();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  await expect(page.locator('#gallery-toggle')).toBeFocused();
  await expect(page.locator('#gallery-toggle')).toBeInViewport();
});

for (const width of [320, 390]) test('collection fits touch screens at ' + width, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#gallery-toggle').click();
  for (const name of [/Lifestyle/, /Details/, /Studio/, /Films/]) {
    await page.getByRole('tab', { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
  }
  const video = page.locator('#collection-videos video').first();
  await video.scrollIntoViewIfNeeded();
  expect(await video.evaluate(v => v.paused && !v.src)).toBe(true);
  await page.getByRole('tab', { name: /Lifestyle/ }).click();
  await page.getByRole('tabpanel').locator('.image-button').first().scrollIntoViewIfNeeded();
  await expect(page.getByRole('tabpanel').locator('.image-button').first()).toHaveCSS('transform', 'none');
  await context.close();
});
