import { test, expect } from '@playwright/test';
import { createDatabaseHelpers } from './utils/test-helpers';

test.describe('Database Management Workflows', () => {
  test('complete export workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    await db.performCompleteExport('json');
    await db.expectSuccessMessage('exported successfully');
  });

  test('complete import workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    await db.performCompleteImport('validSqlite');
    await db.expectSuccessMessage('imported successfully');
  });

  test('file upload with preview workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    await db.performFileUploadWithPreview('validSqlite');
    await db.expectPreviewDataVisible();
    
    // Test preview interactions
    await db.switchPreviewTable('users');
    await expect(page.locator('[data-testid="active-table-name"]')).toContainText('users');
    
    await db.closePreview();
    await db.expectPreviewDataHidden();
  });

  test('error handling workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Test export validation
    await db.clickExportButton();
    await db.expectExportFormValidation();
    
    // Test file validation
    await db.uploadFile('invalidFile');
    await db.expectFileValidationError('Invalid file type');
  });

  test('cancellation workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Start export and cancel
    await db.selectExportFormat('sqlite');
    await db.clickExportButton();
    await db.cancelOperation();
    await db.expectConfirmationDialogHidden();
    
    // Start export, confirm, then cancel progress
    await db.clickExportButton();
    await db.confirmOperation();
    await db.expectProgressVisible();
    await db.cancelProgress();
    await db.expectProgressHidden();
  });

  test('file management workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Upload file
    await db.uploadFile('validJson');
    await db.expectFileSelected('test-data.json');
    await db.expectImportButtonEnabled();
    
    // Clear file
    await db.clearSelectedFile();
    await expect(page.locator('[data-testid="selected-file-info"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
  });

  test('responsive design workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    // Test desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    await db.navigateToDatabase();
    
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toBeVisible();
    
    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toBeVisible();
    
    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button[data-testid="export-button"]')).toBeVisible();
    
    // Test mobile interactions
    await db.selectExportFormat('csv');
    await db.clickExportButton();
    await db.expectConfirmationDialog('Confirm Database Export');
  });

  test('keyboard navigation workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[data-testid="export-button"]')).toBeFocused();
    
    // Test keyboard selection
    await page.keyboard.press('Shift+Tab'); // Back to select
    await page.keyboard.press('ArrowDown'); // Select first option
    await page.keyboard.press('Tab'); // To export button
    await page.keyboard.press('Enter'); // Activate export
    
    await db.expectConfirmationDialog('Confirm Database Export');
    
    // Test escape key
    await page.keyboard.press('Escape');
    await db.expectConfirmationDialogHidden();
  });

  test('concurrent operations workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Start export
    await db.selectExportFormat('json');
    await db.clickExportButton();
    await db.confirmOperation();
    await db.expectProgressVisible();
    
    // Try to upload file during export
    await db.uploadFile('validSqlite');
    await db.expectFileSelected('test-database.db');
    
    // Both operations should be handled appropriately
    // (In a real app, you might prevent concurrent operations)
  });

  test('data validation workflow', async ({ page }) => {
    const db = createDatabaseHelpers(page);
    
    await db.navigateToDatabase();
    
    // Upload file with validation warnings
    await db.performFileUploadWithPreview('validSqlite');
    
    // Check for validation warnings in preview
    const warningsSection = page.locator('[data-testid="validation-warnings"]');
    if (await warningsSection.isVisible()) {
      await expect(warningsSection).toContainText('Validation Warnings');
      
      const warningItems = page.locator('[data-testid^="warning-item-"]');
      const warningCount = await warningItems.count();
      expect(warningCount).toBeGreaterThan(0);
    }
    
    // Proceed with import despite warnings
    await page.click('button[data-testid="import-button"]');
    await db.expectConfirmationDialog('Confirm Database Import');
    
    // Should show backup information
    const backupInfo = page.locator('[data-testid="backup-info"]');
    if (await backupInfo.isVisible()) {
      await expect(backupInfo).toContainText('A backup will be created');
    }
  });
});