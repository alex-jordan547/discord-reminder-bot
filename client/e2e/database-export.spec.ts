import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Database Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the database page in the actual application
    await page.goto('/database');
  });

  test('should export database in JSON format', async ({ page }) => {
    // Select JSON format
    await page.getByTestId('export-format-select').selectOption('json');
    
    // Click export button to open confirmation dialog
    await page.getByTestId('export-button').click();
    
    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirmation-modal')).toBeVisible();
    await expect(page.getByTestId('modal-title')).toContainText('Confirm Database Export');
    
    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('confirm-button').click();
    
    // Wait for export progress to complete
    await expect(page.getByText('Exporting...')).toBeVisible();
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
    
    const download = await downloadPromise;
    
    // Verify download properties
    expect(download.suggestedFilename()).toMatch(/database_export_.*\.json$/);
    
    // Save and verify file content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);
    
    const content = await fs.readFile(downloadPath, 'utf-8');
    const jsonData = JSON.parse(content);
    
    expect(jsonData).toHaveProperty('metadata');
    expect(jsonData).toHaveProperty('tables');
    expect(jsonData.metadata.format).toBe('json');
    expect(jsonData.tables).toHaveProperty('users');
    expect(jsonData.tables).toHaveProperty('reminders');
    expect(jsonData.tables).toHaveProperty('settings');
    
    // Verify realistic data structure
    expect(Array.isArray(jsonData.tables.users)).toBe(true);
    expect(jsonData.tables.users.length).toBeGreaterThan(0);
    expect(jsonData.tables.users[0]).toHaveProperty('id');
    expect(jsonData.tables.users[0]).toHaveProperty('username');
    expect(jsonData.tables.users[0]).toHaveProperty('email');
  });

  test('should export database in SQLite format', async ({ page }) => {
    // Select SQLite format
    await page.getByTestId('export-format-select').selectOption('sqlite');
    
    // Click export button to open confirmation dialog
    await page.getByTestId('export-button').click();
    
    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirmation-modal')).toBeVisible();
    
    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('confirm-button').click();
    
    // Wait for export progress to complete
    await expect(page.getByText('Exporting...')).toBeVisible();
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
    
    const download = await downloadPromise;
    
    // Verify download properties
    expect(download.suggestedFilename()).toMatch(/database_export_.*\.db$/);
    
    // Save and verify file exists and has content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);
    
    const stats = await fs.stat(downloadPath);
    expect(stats.size).toBeGreaterThan(1000); // Should have realistic SQLite data
    
    // Verify it starts with SQLite header
    const buffer = await fs.readFile(downloadPath);
    const header = buffer.toString('ascii', 0, 16);
    expect(header).toBe('SQLite format 3\0');
  });

  test('should export database in CSV format', async ({ page }) => {
    // Select CSV format
    await page.getByTestId('export-format-select').selectOption('csv');
    
    // Click export button to open confirmation dialog
    await page.getByTestId('export-button').click();
    
    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirmation-modal')).toBeVisible();
    
    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('confirm-button').click();
    
    // Wait for export progress to complete
    await expect(page.getByText('Exporting...')).toBeVisible();
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
    
    const download = await downloadPromise;
    
    // Verify download properties
    expect(download.suggestedFilename()).toMatch(/database_export_.*\.csv$/);
    
    // Save and verify file content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);
    
    const content = await fs.readFile(downloadPath, 'utf-8');
    const lines = content.split('\n');
    
    // Verify CSV structure
    expect(lines[0]).toBe('id,username,email,created_at,is_active,reminder_count');
    expect(lines.length).toBeGreaterThan(1);
    expect(content).toContain('user_1');
    expect(content).toContain('@example.com');
    
    // Verify realistic data
    const dataLine = lines[1].split(',');
    expect(dataLine).toHaveLength(6);
    expect(dataLine[0]).toMatch(/^\d+$/); // ID should be numeric
  });

  test('should show error when no format is selected', async ({ page }) => {
    // Try to export without selecting format
    await page.getByTestId('export-button').click();
    
    // Verify error message appears
    await expect(page.getByTestId('format-error')).toBeVisible();
    await expect(page.getByTestId('format-error')).toContainText('Please select an export format');
    
    // Verify confirmation dialog does not appear
    await expect(page.getByTestId('confirmation-modal')).not.toBeVisible();
  });

  test('should hide error when format is selected after error', async ({ page }) => {
    // First trigger error
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('format-error')).toBeVisible();
    
    // Then select format
    await page.getByTestId('export-format-select').selectOption('json');
    
    // Try export again
    await page.getByTestId('export-button').click();
    
    // Verify error is hidden and confirmation dialog appears
    await expect(page.getByTestId('format-error')).toBeHidden();
    await expect(page.getByTestId('confirmation-modal')).toBeVisible();
    
    // Cancel the export
    await page.getByTestId('cancel-button').click();
  });

  test('should generate unique filenames for multiple exports', async ({ page }) => {
    // First export
    await page.getByTestId('export-format-select').selectOption('json');
    await page.getByTestId('export-button').click();
    
    const download1Promise = page.waitForEvent('download');
    await page.getByTestId('confirm-button').click();
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
    const download1 = await download1Promise;
    
    // Wait a moment to ensure different timestamp
    await page.waitForTimeout(1000);
    
    // Second export
    await page.getByTestId('export-button').click();
    const download2Promise = page.waitForEvent('download');
    await page.getByTestId('confirm-button').click();
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
    const download2 = await download2Promise;
    
    // Verify different filenames
    expect(download1.suggestedFilename()).not.toBe(download2.suggestedFilename());
    expect(download1.suggestedFilename()).toMatch(/database_export_.*\.json$/);
    expect(download2.suggestedFilename()).toMatch(/database_export_.*\.json$/);
  });

  test('should allow canceling export from confirmation dialog', async ({ page }) => {
    // Select format and open confirmation dialog
    await page.getByTestId('export-format-select').selectOption('json');
    await page.getByTestId('export-button').click();
    
    // Verify confirmation dialog appears
    await expect(page.getByTestId('confirmation-modal')).toBeVisible();
    
    // Cancel the export
    await page.getByTestId('cancel-button').click();
    
    // Verify dialog is closed and no export happens
    await expect(page.getByTestId('confirmation-modal')).not.toBeVisible();
    await expect(page.getByText('Exporting...')).not.toBeVisible();
  });

  test('should show progress during export', async ({ page }) => {
    // Start export
    await page.getByTestId('export-format-select').selectOption('json');
    await page.getByTestId('export-button').click();
    await page.getByTestId('confirm-button').click();
    
    // Verify progress indicators appear
    await expect(page.getByText('Exporting...')).toBeVisible();
    await expect(page.getByText('Export Progress:')).toBeVisible();
    await expect(page.getByText('Exporting Database')).toBeVisible();
    
    // Wait for completion
    await expect(page.getByText('Export Database')).toBeVisible({ timeout: 10000 });
  });
});