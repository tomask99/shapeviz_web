import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';

test('gallery rows align and scroll separates and fades the images reversibly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#gallery-toggle').click();
  const slots = page.locator('.gallery-section').first().locator('.gallery-slot');
  const geometry = await slots.evaluateAll(items => items.slice(0, 2).map(item => {
    const box = item.getBoundingClientRect();
    return { top: box.top + scrollY, height: box.height, mediaHeight: item.querySelector('img').getBoundingClientRect().height };
  }));
  expect(geometry[0].top).toBeCloseTo(geometry[1].top, 0);
  expect(geometry[0].mediaHeight).toBeCloseTo(geometry[1].mediaHeight, 0);
  await page.evaluate(top => scrollTo({ top: top - 100, behavior: 'instant' }), geometry[0].top);
  const left = slots.nth(0).locator('figure'), right = slots.nth(1).locator('figure');
  await expect(left).toHaveCSS('opacity', '1');
  await expect.poll(() => slots.evaluateAll(items => items.slice(0, 2).every(item => item.querySelector('img').naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: '.cache/gallery-aligned.png' });
  await page.evaluate(({ top, height }) => scrollTo({ top: top + height * .68, behavior: 'instant' }), geometry[0]);
  await expect.poll(() => left.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.6);
  expect(await left.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-20);
  expect(await right.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.screenshot({ path: '.cache/gallery-scroll-exit.png' });
  await page.evaluate(top => scrollTo({ top: top - 100, behavior: 'instant' }), geometry[0].top);
  await expect(left).toHaveCSS('opacity', '1');
});

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
