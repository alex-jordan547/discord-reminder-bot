import { Page, expect } from '@playwright/test';
import { testFiles } from '../fixtures/test-data';

export class DatabaseTestHelpers {
  constructor(private page: Page) {}

  async navigateToDatabase() {
    await this.page.goto('/database');
    await expect(this.page.locator('h1')).toContainText('Database Management');
  }

  async selectExportFormat(format: 'sqlite' | 'json' | 'csv') {
    await this.page.selectOption('select[data-testid="export-format-select"]', format);
  }

  async clickExportButton() {
    await this.page.click('button[data-testid="export-button"]');
  }

  async confirmOperation() {
    await expect(this.page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await this.page.click('button[data-testid="confirm-button"]');
  }

  async confirmOperationWithText(confirmationText: string) {
    await expect(this.page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await this.page.fill('[data-testid="confirmation-input"]', confirmationText);
    await this.page.click('button[data-testid="confirm-button"]');
  }

  async cancelOperation() {
    await expect(this.page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await this.page.click('button[data-testid="cancel-button"]');
  }

  async uploadFile(fileType: keyof typeof testFiles) {
    const file = testFiles[fileType];
    const fileInput = this.page.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.content),
    });
  }

  async waitForFileProcessing() {
    // Wait for either preview loading or error
    await Promise.race([
      this.page.waitForSelector('[data-testid="preview-loading"]', { timeout: 5000 }),
      this.page.waitForSelector('[data-testid="file-error"]', { timeout: 5000 }),
      this.page.waitForSelector('[data-testid="selected-file-info"]', { timeout: 5000 }),
    ]);
  }

  async waitForPreviewData() {
    await expect(this.page.locator('[data-testid="data-preview-container"]')).toBeVisible({
      timeout: 10000,
    });
  }

  async waitForProgressCompletion() {
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible({
      timeout: 15000,
    });
  }

  async waitForProgressError() {
    await expect(this.page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 10000,
    });
  }

  async cancelProgress() {
    await expect(this.page.locator('button[data-testid="cancel-button"]')).toBeVisible();
    await this.page.click('button[data-testid="cancel-button"]');
  }

  async clearSelectedFile() {
    await this.page.click('button[data-testid="clear-file-button"]');
  }

  async closePreview() {
    await this.page.click('button[data-testid="close-preview-button"]');
  }

  async switchPreviewTable(tableName: string) {
    await this.page.click(`[data-testid="table-tab-${tableName}"]`);
  }

  async expectExportFormValidation() {
    await expect(this.page.locator('[data-testid="format-error"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="format-error"]')).toContainText(
      'Please select an export format',
    );
  }

  async expectFileValidationError(errorText: string) {
    await expect(this.page.locator('[data-testid="file-error"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="file-error"]')).toContainText(errorText);
  }

  async expectProgressVisible() {
    await expect(this.page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="progress-text"]')).toBeVisible();
  }

  async expectProgressHidden() {
    await expect(this.page.locator('[data-testid="progress-bar"]')).not.toBeVisible();
  }

  async expectConfirmationDialog(title: string) {
    await expect(this.page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="modal-title"]')).toContainText(title);
  }

  async expectConfirmationDialogHidden() {
    await expect(this.page.locator('[data-testid="confirmation-modal"]')).not.toBeVisible();
  }

  async expectFileSelected(fileName: string) {
    await expect(this.page.locator('[data-testid="selected-file-info"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="selected-file-info"]')).toContainText(fileName);
  }

  async expectImportButtonEnabled() {
    await expect(this.page.locator('button[data-testid="import-button"]')).toBeEnabled();
  }

  async expectImportButtonDisabled() {
    await expect(this.page.locator('button[data-testid="import-button"]')).toBeDisabled();
  }

  async expectPreviewDataVisible() {
    await expect(this.page.locator('[data-testid="data-preview-container"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="file-summary"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="table-tabs"]')).toBeVisible();
  }

  async expectPreviewDataHidden() {
    await expect(this.page.locator('[data-testid="data-preview-container"]')).not.toBeVisible();
  }

  async expectSuccessMessage(message: string) {
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="success-message"]')).toContainText(message);
  }

  async expectErrorMessage(message: string) {
    await expect(this.page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="error-message"]')).toContainText(message);
  }

  // Utility methods for common workflows
  async performCompleteExport(format: 'sqlite' | 'json' | 'csv') {
    await this.selectExportFormat(format);
    await this.clickExportButton();
    await this.confirmOperation();
    await this.waitForProgressCompletion();
  }

  async performCompleteImport(fileType: keyof typeof testFiles) {
    await this.uploadFile(fileType);
    await this.waitForFileProcessing();
    await this.page.click('button[data-testid="import-button"]');
    await this.confirmOperationWithText('IMPORT');
    await this.waitForProgressCompletion();
  }

  async performFileUploadWithPreview(fileType: keyof typeof testFiles) {
    await this.uploadFile(fileType);
    await this.waitForFileProcessing();
    await this.waitForPreviewData();
  }
}

// Utility function to create test helpers
export function createDatabaseHelpers(page: Page) {
  return new DatabaseTestHelpers(page);
}
