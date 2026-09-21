import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`digital services render and link to contact at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const section = page.locator('#digital');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('heading')).toHaveText('BE SEEN.WORK SMARTER.');
    await expect(section.locator('.digital-services > div')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const heading = await section.getByRole('heading').boundingBox();
    expect(heading.x).toBeGreaterThanOrEqual(0);
    expect(heading.x + heading.width).toBeLessThanOrEqual(width);
    await section.screenshot({ path: `test-results/digital-${width}.png` });
    await section.getByRole('link', { name: /LET’S BUILD/ }).click();
    await expect(page).toHaveURL(/#contact$/);
    expect(errors).toEqual([]);
  });
}
