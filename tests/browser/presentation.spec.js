import { test, expect } from '@playwright/test';

test('Milenium deck opens, navigates, and resolves presentation assets', async ({ page }) => {
  const failures = [];
  page.on('response', response => { if (response.url().includes('/p/') && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('/p/milenium');
  await expect(page).toHaveTitle(/Milenium.*Shapeviz/);
  await expect(page.locator('#startOverlay')).toBeVisible();
  await page.locator('#startBtn').click();
  await expect(page.locator('.slide.active')).toBeVisible();
  await expect(page.locator('.slide.active img')).toHaveJSProperty('complete', true);
  await expect.poll(() => page.locator('.slide.active img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#count')).toContainText('/');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#count')).toContainText('02');
  for (let slide = 2; slide <= 25; slide += 1) {
    await expect(page.locator('#count')).toContainText(String(slide).padStart(2, '0'));
    const images = page.locator('.slide.active img');
    if (await images.count()) await expect.poll(() => images.evaluateAll(items => items.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    const videos = page.locator('.slide.active video');
    if (await videos.count()) await expect.poll(() => videos.evaluateAll(items => items.every(video => video.readyState >= 1))).toBe(true);
    if (slide < 25) await page.keyboard.press('ArrowRight');
  }
  expect(failures).toEqual([]);
});

test('Milenium route remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/p/milenium');
  await expect(page.locator('#startBtn')).toBeVisible();
  await page.locator('#startBtn').click();
  await expect(page.locator('.slide.active')).toBeVisible();
  await expect(page.locator('#nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
