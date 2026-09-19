import { test, expect } from '@playwright/test';
const clients = ['PRADA', 'PUCCI', 'MAZDA', 'MILENIUM', 'MCM', 'BERO', 'BRAVE MMA', 'TATRABANKA', 'SORRYWECAN', 'TOLICCI'];

test('hero, anchors and all client names are available without browser errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/SHAPEVIZ/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('SHAPEVIZ');
  await expect(page.locator('.client-name')).toHaveText(clients);
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator('#about-title')).toBeInViewport();
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`fits the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const longest = page.getByText('SORRYWECAN', { exact: true });
    await longest.scrollIntoViewIfNeeded();
    const bounds = await longest.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  });
}

test('hero letters dissolve as the user scrolls and restore on return', async ({ page }) => {
  await page.goto('/');
  const letter = page.locator('#hero-title span').first();
  await expect(letter).toHaveCSS('opacity', '1');
  await page.evaluate(() => window.scrollTo({ top: innerHeight * .4, behavior: 'instant' }));
  await expect.poll(async () => Number(await letter.evaluate(e => getComputedStyle(e).opacity))).toBeLessThan(.2);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(letter).toHaveCSS('opacity', '1');
});

test('video autoplays muted, accepts pause and sound controls, and pauses offscreen', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('video');
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
  expect(await video.evaluate(v => v.muted && v.loop && v.playsInline)).toBe(true);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Unmute video', exact: true }).click();
  expect(await video.evaluate(v => v.muted)).toBe(false);
  await page.locator('#project-form').scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
});

test('lightbox traps keyboard focus, closes with Escape, and returns focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Enlarge Milenium interior visual' });
  await trigger.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('reduced motion keeps text visible and does not autoplay video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#fluid-glow')).toHaveCSS('display', 'none');
  await page.locator('video').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('video').evaluate(v => v.paused)).toBe(true);
  await page.getByText('SORRYWECAN', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator('.client-list li').nth(8)).toHaveCSS('opacity', '1');
  await expect(page.locator('.client-list li').nth(8)).toHaveCSS('filter', 'none');
});

async function fillForm(page) {
  await page.goto('/#project-form');
  await page.getByLabel('Your name').fill('Test Visitor');
  await page.getByLabel('Email address').fill('visitor@example.com');
  await page.getByLabel('CGI & 3D', { exact: true }).check();
  await page.getByLabel('A little about your project').fill('We are planning a new visual identity and motion campaign.');
  await page.getByLabel('You may use my name').check();
}
test('form preserves the inquiry when delivery is unavailable', async ({ page }) => {
  await page.route('**/api/contact', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Your message has not been sent. Please try again later.' }) }));
  await fillForm(page);
  await page.getByRole('button', { name: 'SEND INQUIRY' }).click();
  await expect(page.getByRole('status')).toContainText('has not been sent');
  await expect(page.getByLabel('Your name')).toHaveValue('Test Visitor');
  await expect(page.getByRole('button', { name: 'SEND INQUIRY' })).toBeEnabled();
});
test('form validates required fields and clears only after a confirmed success', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/contact', async route => {
    calls++;
    expect(route.request().postDataJSON().services).toEqual(['CGI & 3D']);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Thank you. Your inquiry is on its way.' }) });
  });
  await page.goto('/#project-form');
  await page.getByRole('button', { name: 'SEND INQUIRY' }).click();
  expect(calls).toBe(0);
  await fillForm(page);
  await page.getByRole('button', { name: 'SEND INQUIRY' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you');
  await expect(page.getByLabel('Your name')).toBeEmpty();
  expect(calls).toBe(1);
});
