import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Check that the app loads
    await expect(page.locator('body')).toBeVisible();

    // Check for Vue app mount (use first() to handle multiple elements)
    await expect(page.locator('#app').first()).toBeVisible();
  });

  test('should navigate to database page', async ({ page }) => {
    await page.goto('/database');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check that database page loads
    await expect(page.locator('h1')).toContainText('Database Management');

    // Look for section headings within the database sections
    await expect(page.locator('.database-section h2').first()).toContainText('Export Database');
    await expect(page.locator('.database-section h2').nth(1)).toContainText('Import Database');
  });

  test('should display export interface', async ({ page }) => {
    await page.goto('/database');
    await page.waitForLoadState('networkidle');

    // Check export interface elements
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toContainText(
      'Export Database',
    );
  });

  test('should display import interface', async ({ page }) => {
    await page.goto('/database');
    await page.waitForLoadState('networkidle');

    // Check import interface elements
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    // File input is hidden by design (styled with display: none)
    // Check that it exists but don't expect it to be visible
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });
});
