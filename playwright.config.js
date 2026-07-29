'use strict';

const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/ui-acceptance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: {timeout: 7000},
  reporter: [
    ['list'],
    ['html', {outputFolder: 'playwright-report', open: 'never'}]
  ],
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    headless: true,
    actionTimeout: 7000,
    navigationTimeout: 10000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  }
});
