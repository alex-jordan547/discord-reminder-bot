import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for Docker Infrastructure Tests
 * =======================================================
 * Specific configuration for testing the complete Docker setup
 */

export default defineConfig({
  testDir: './tests/infrastructure',

  /* Run tests in files in parallel */
  fullyParallel: false, // Infrastructure tests should run sequentially

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: 1, // Infrastructure tests need exclusive access to Docker

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'infrastructure-test-results' }],
    ['line'],
    ['json', { outputFile: 'infrastructure-test-results/results.json' }],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshots */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'retain-on-failure',

    /* Increased timeouts for Docker operations */
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  /* Global setup and teardown for infrastructure tests */
  globalSetup: path.resolve(__dirname, 'tests/infrastructure/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, 'tests/infrastructure/global-teardown.ts'),

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'docker-infrastructure',
      testMatch: '**/*docker-setup.e2e.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // Increase timeout for Docker operations
        timeout: 120000, // 2 minutes per test
      },
      timeout: 300000, // 5 minutes total per test file
    },
  ],

  /* Global timeout for the entire test run */
  globalTimeout: 600000, // 10 minutes total

  /* Output directory for test results */
  outputDir: 'infrastructure-test-results/artifacts',

  /* Configure expect assertions */
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
});
