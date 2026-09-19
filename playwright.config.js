import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  globalSetup: './tests/browser/global-setup.js',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
