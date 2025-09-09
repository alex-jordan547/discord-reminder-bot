import { test, expect } from '@playwright/test';

test.describe('Database Management Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database');
  });

  test('should display database management page with export and import sections', async ({ page }) => {
    // Check page title and description
    await expect(page.locator('h1')).toContainText('Database Management');
    await expect(page.locator('p')).toContainText('Export, import, and manage your database');

    // Check export section
    await expect(page.locator('h2').first()).toContainText('Export Database');
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toBeVisible();

    // Check import section
    await expect(page.locator('h2').nth(1)).toContainText('Import Database');
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
  });

  test('should handle database export flow', async ({ page }) => {
    // Select export format
    await page.selectOption('select[data-testid="export-format-select"]', 'json');
    
    // Click export button
    await page.click('button[data-testid="export-button"]');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="modal-title"]')).toContainText('Confirm Database Export');
    await expect(page.locator('[data-testid="modal-message"]')).toContainText('Export the database in JSON format');
    
    // Confirm export
    await page.click('button[data-testid="confirm-button"]');
    
    // Should show progress indicator
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-text"]')).toBeVisible();
    
    // Wait for export to complete (with timeout)
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="success-message"]')).toContainText('exported successfully');
  });

  test('should validate export format selection', async ({ page }) => {
    // Try to export without selecting format
    await page.click('button[data-testid="export-button"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="format-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="format-error"]')).toContainText('Please select an export format');
  });

  test('should handle file upload via drag and drop', async ({ page }) => {
    // Create a test file
    const fileContent = 'test database content';
    const fileName = 'test-database.db';
    
    // Get the drop zone
    const dropZone = page.locator('[data-testid="drop-zone"]');
    await expect(dropZone).toBeVisible();
    
    // Simulate file drop (we'll use the file input instead for testing)
    const fileInput = page.locator('input[type="file"]');
    
    // Create a temporary file for testing
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from(fileContent)
    });
    
    // Should show selected file info
    await expect(page.locator('[data-testid="selected-file-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="selected-file-info"]')).toContainText(fileName);
    
    // Should show import button
    await expect(page.locator('button[data-testid="import-button"]')).toBeVisible();
    await expect(page.locator('button[data-testid="import-button"]')).toContainText('Import Database');
  });

  test('should show data preview after file selection', async ({ page }) => {
    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-database.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('test content')
    });
    
    // Wait for preview to load
    await expect(page.locator('[data-testid="preview-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-loading"]')).toContainText('Analyzing file');
    
    // Wait for preview data to appear
    await expect(page.locator('[data-testid="data-preview-container"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="file-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="table-tabs"]')).toBeVisible();
  });

  test('should handle import confirmation flow', async ({ page }) => {
    // Upload a file first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-database.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('test content')
    });
    
    // Wait for file to be processed
    await expect(page.locator('button[data-testid="import-button"]')).toBeVisible();
    
    // Click import button
    await page.click('button[data-testid="import-button"]');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="modal-title"]')).toContainText('Confirm Database Import');
    
    // Should require confirmation text
    await expect(page.locator('[data-testid="confirmation-input"]')).toBeVisible();
    
    // Confirm button should be disabled initially
    await expect(page.locator('button[data-testid="confirm-button"]')).toBeDisabled();
    
    // Type confirmation text
    await page.fill('[data-testid="confirmation-input"]', 'IMPORT');
    
    // Confirm button should now be enabled
    await expect(page.locator('button[data-testid="confirm-button"]')).toBeEnabled();
    
    // Confirm import
    await page.click('button[data-testid="confirm-button"]');
    
    // Should show progress indicator
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    
    // Wait for import to complete
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="success-message"]')).toContainText('imported successfully');
  });

  test('should allow canceling operations', async ({ page }) => {
    // Start export
    await page.selectOption('select[data-testid="export-format-select"]', 'sqlite');
    await page.click('button[data-testid="export-button"]');
    await page.click('button[data-testid="confirm-button"]');
    
    // Should show progress with cancel button
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('button[data-testid="cancel-button"]')).toBeVisible();
    
    // Cancel the operation
    await page.click('button[data-testid="cancel-button"]');
    
    // Progress should disappear
    await expect(page.locator('[data-testid="progress-bar"]')).not.toBeVisible();
  });

  test('should handle file validation errors', async ({ page }) => {
    // Try to upload invalid file type
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid content')
    });
    
    // Should show error message
    await expect(page.locator('[data-testid="file-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-error"]')).toContainText('Invalid file type');
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check that elements are still visible and accessible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
    
    // Check that buttons are properly sized for mobile
    const exportButton = page.locator('button[data-testid="export-button"]');
    await expect(exportButton).toBeVisible();
    
    // Test mobile interactions
    await page.selectOption('select[data-testid="export-format-select"]', 'csv');
    await exportButton.click();
    
    // Modal should be responsive
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
  });

  test('should handle keyboard navigation', async ({ page }) => {
    // Test tab navigation
    await page.keyboard.press('Tab');
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[data-testid="export-button"]')).toBeFocused();
    
    // Test escape key in modal
    await page.selectOption('select[data-testid="export-format-select"]', 'json');
    await page.keyboard.press('Enter'); // Should trigger export
    
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    
    // Press escape to close modal
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="confirmation-modal"]')).not.toBeVisible();
  });

  test('should display proper loading states', async ({ page }) => {
    // Upload file to trigger preview loading
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('test')
    });
    
    // Should show loading spinner
    await expect(page.locator('[data-testid="preview-loading"]')).toBeVisible();
    await expect(page.locator('.spinner')).toBeVisible();
    
    // Wait for loading to complete
    await expect(page.locator('[data-testid="data-preview-container"]')).toBeVisible({ timeout: 10000 });
  });

  test('should handle data preview interactions', async ({ page }) => {
    // Upload file and wait for preview
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('test')
    });
    
    await expect(page.locator('[data-testid="data-preview-container"]')).toBeVisible({ timeout: 10000 });
    
    // Check file summary
    await expect(page.locator('[data-testid="file-summary"]')).toBeVisible();
    
    // Check table tabs if multiple tables
    const tableTabs = page.locator('[data-testid="table-tabs"]');
    if (await tableTabs.isVisible()) {
      // Click on different tabs
      const tabs = page.locator('[data-testid^="table-tab-"]');
      const tabCount = await tabs.count();
      
      if (tabCount > 1) {
        await tabs.nth(1).click();
        await expect(tabs.nth(1)).toHaveClass(/active/);
      }
    }
    
    // Close preview
    await page.click('button[data-testid="close-preview-button"]');
    await expect(page.locator('[data-testid="data-preview-container"]')).not.toBeVisible();
  });
});