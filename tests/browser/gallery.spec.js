import { test, expect } from '@playwright/test';

test('curated mosaic has exactly nine images and two uncropped films, without tabs', async ({ page }) => {
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/media/gallery/')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#gallery-toggle').scrollIntoViewIfNeeded();
  expect(requests).toEqual([]);
  await page.locator('#gallery-toggle').click();
  await expect(page.locator('#expanded-gallery .gallery-grid')).toHaveCount(1);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('.gallery-item')).toHaveCount(11);
  for (const kind of ['lifestyle','details','studio']) await expect(page.locator(`[data-kind="${kind}"]`)).toHaveCount(3);
  await expect(page.locator('.gallery-film')).toHaveCount(2);
  const image = page.locator('.gallery-item .image-button').first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.locator('img').evaluate(img => img.naturalWidth > 0)).toBe(true);
  const widths = await page.locator('.gallery-slot').evaluateAll(items => items.slice(0, 2).map(el => el.getBoundingClientRect().width));
  expect(widths[0]).toBeGreaterThan(widths[1] * 1.8);
  await image.hover();
  await expect.poll(() => image.evaluate(el => getComputedStyle(el).boxShadow)).toContain('70px');
  await expect(image.locator('.media-clip')).toHaveCSS('overflow', 'hidden');
  await image.click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(image).toBeFocused();
  for (const video of await page.locator('.gallery-film video').all()) {
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveCSS('object-fit', 'contain');
    await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  }
  await page.locator('.gallery-toolbar .gallery-collapse').click();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  await expect(page.locator('#gallery-toggle')).toBeInViewport();
  expect(await page.locator('.gallery-film video').evaluateAll(videos => videos.every(v => v.paused))).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [320,390,768]) test('mosaic fits at ' + width + ' and preserves film framing', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#gallery-toggle').click();
  for (const slot of await page.locator('.gallery-slot').all()) {
    await slot.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  for (const video of await page.locator('.gallery-film video').all()) {
    await expect(video).toHaveCSS('object-fit', 'contain');
    expect(await video.evaluate(v => v.paused && !v.src)).toBe(true);
    if (width < 600) {
      const ratio = await video.evaluate(v => v.getBoundingClientRect().width / v.getBoundingClientRect().height);
      const intrinsic = await video.evaluate(v => Number(v.getAttribute('width')) / Number(v.getAttribute('height')));
      expect(ratio).toBeCloseTo(intrinsic, 2);
    }
  }
  await page.locator('.gallery-toolbar .gallery-collapse').click();
  await expect(page.locator('#expanded-gallery')).toBeHidden();
  await context.close();
});
