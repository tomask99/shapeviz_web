import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';

test('gallery defers media, includes every source and collapses safely from the bottom', async ({ page }) => {
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/media/gallery/')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const toggle = page.locator('#gallery-toggle');
  await toggle.scrollIntoViewIfNeeded();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  expect(requests).toEqual([]);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const sourceFiles = (await readdir('assets/galery')).sort();
  expect((await page.locator('[data-gallery-file]').evaluateAll(items => items.map(item => item.dataset.galleryFile))).sort()).toEqual(sourceFiles);
  await expect(page.locator('.gallery-section')).toHaveCount(4);
  const image = page.locator('.gallery-item .image-button').first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await image.hover();
  await expect.poll(() => image.evaluate(el => getComputedStyle(el).boxShadow)).toContain('70px');
  await expect(image.locator('.media-clip')).toHaveCSS('overflow', 'hidden');
  await image.click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await expect(page.locator('.lightbox img')).toHaveAttribute('alt', await image.locator('img').getAttribute('alt'));
  await page.keyboard.press('Escape');
  const video = page.locator('.gallery-film video').last();
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  const close = page.locator('.gallery-toolbar .gallery-collapse');
  await expect(close).toBeInViewport();
  await close.click();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeInViewport();
  expect(await video.evaluate(v => v.paused)).toBe(true);
  await toggle.click();
  await page.locator('.gallery-end').scrollIntoViewIfNeeded();
  await page.locator('#clients-title').scrollIntoViewIfNeeded();
  await expect(page.locator('#clients-title')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('mobile gallery stays within the page and respects reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#gallery-toggle').click();
  for (const section of await page.locator('.gallery-section').all()) {
    await section.locator('h3').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  const video = page.locator('.gallery-film video').first();
  await video.scrollIntoViewIfNeeded();
  expect(await video.evaluate(v => v.paused && !v.src)).toBe(true);
  const image = page.locator('.gallery-item img').first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveCSS('transform', 'none');
  await expect(page.locator('.gallery-item .image-button').first()).toHaveCSS('transform', 'none');
  await page.locator('.gallery-toolbar .gallery-collapse').click();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  await context.close();
});
