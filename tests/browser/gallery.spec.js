import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';

test('pinned gallery replaces pairs over a short reversible scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#gallery-toggle').click();
  await expect(page.locator('.gallery-position')).toContainText('01 / 11');
  const top = await page.locator('.gallery-track').evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top);
  const first = page.locator('.gallery-page').nth(0), next = page.locator('.gallery-page').nth(1);
  await expect.poll(() => first.locator('img').evaluateAll(images => images.every(img => img.naturalWidth > 0))).toBe(true);
  await expect.poll(() => page.locator('.gallery-stage').evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(1);
  await first.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  await page.screenshot({ path: '.cache/gallery-pinned-desktop.png' });
  await page.evaluate(top => scrollTo({ top: top + 230, behavior: 'instant' }), top);
  await expect.poll(() => first.locator('.gallery-slot').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.6);
  expect(await first.locator('.gallery-slot').first().evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-50);
  expect(await next.locator('.gallery-slot').first().evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)).toBeGreaterThan(50);
  await expect.poll(() => page.locator('.gallery-stage').evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(1);
  await page.screenshot({ path: '.cache/gallery-pinned-transition.png' });
  await page.evaluate(top => scrollTo({ top: top + 460, behavior: 'instant' }), top);
  await expect(next).not.toHaveAttribute('inert', '');
  await expect(first).toHaveAttribute('inert', '');
  await expect.poll(() => next.locator('.gallery-slot').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.999);
  await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top);
  await expect.poll(() => first.locator('.gallery-slot').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.999);
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
  await expect(page.locator('.gallery-page')).toHaveCount(11);
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
  await page.locator('.gallery-track').evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY + el.offsetHeight - innerHeight - 100, behavior: 'instant' }));
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
  for (const section of await page.locator('.gallery-page').all()) {
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

test('mobile pinned scene stays in place and next changes the active pair', async ({ browser }) => {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
 const page = await context.newPage();
 await page.goto('http://127.0.0.1:4173/');
 await page.locator('#gallery-toggle').click();
 await page.locator('.gallery-next').click();
 await expect(page.locator('.gallery-position')).toContainText('02 / 11');
 await expect.poll(() => page.locator('.gallery-stage').evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(1);
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
 const current = page.locator('.gallery-page').nth(1);
 await current.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
 await page.screenshot({ path: '.cache/gallery-pinned-mobile.png' });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('.gallery-page[inert]')).toHaveCount(0);
 await expect(current.locator('.gallery-slot').nth(1)).toHaveCSS('transform', 'none');
 await context.close();
});
