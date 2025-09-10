import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Database Export - Fixed Implementation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the improved test page
    await page.goto('file://' + path.resolve(__dirname, '../test-database-improved.html'));
  });

  test('should export database in JSON format with correct filename and content', async ({
    page,
  }) => {
    // Select JSON format
    await page.getByTestId('export-format-select').selectOption('JSON');

    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();

    const download = await downloadPromise;

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(
      /^discord_bot_database_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
    );

    // Save and verify file content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const content = await fs.readFile(downloadPath, 'utf-8');
    const jsonData = JSON.parse(content);

    // Verify JSON structure
    expect(jsonData).toHaveProperty('metadata');
    expect(jsonData).toHaveProperty('tables');
    expect(jsonData.metadata.format).toBe('json');
    expect(jsonData.metadata.source).toBe('Discord Bot Dashboard');
    expect(jsonData.tables).toHaveProperty('users');
    expect(jsonData.tables).toHaveProperty('reminders');
    expect(jsonData.tables).toHaveProperty('settings');

    // Verify realistic data structure
    expect(Array.isArray(jsonData.tables.users)).toBe(true);
    expect(jsonData.tables.users.length).toBeGreaterThan(0);
    expect(jsonData.tables.users[0]).toHaveProperty('id');
    expect(jsonData.tables.users[0]).toHaveProperty('username');
    expect(jsonData.tables.users[0]).toHaveProperty('email');

    // Verify success message appears
    await expect(page.locator('text=Export réussi!')).toBeVisible();
    await expect(page.locator(`text=${download.suggestedFilename()}`)).toBeVisible();
  });

  test('should export database in CSV format with correct filename and content', async ({
    page,
  }) => {
    // Select CSV format
    await page.getByTestId('export-format-select').selectOption('CSV');

    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();

    const download = await downloadPromise;

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(
      /^discord_bot_database_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/,
    );

    // Save and verify file content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const content = await fs.readFile(downloadPath, 'utf-8');
    const lines = content.split('\n');

    // Verify CSV structure
    expect(lines[0]).toBe('id,username,email,created_at,is_active,reminder_count');
    expect(lines.length).toBeGreaterThan(1);
    expect(content).toContain('john_doe');
    expect(content).toContain('@example.com');

    // Verify realistic data
    const dataLine = lines[1].split(',');
    expect(dataLine).toHaveLength(6);
    expect(dataLine[0]).toMatch(/^\d+$/); // ID should be numeric

    // Verify success message appears
    await expect(page.locator('text=Export réussi!')).toBeVisible();
    await expect(page.locator(`text=${download.suggestedFilename()}`)).toBeVisible();
  });

  test('should export database in SQLite format with correct filename and content', async ({
    page,
  }) => {
    // Select SQLite format
    await page.getByTestId('export-format-select').selectOption('SQLite');

    // Start download and wait for it
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();

    const download = await downloadPromise;

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(
      /^discord_bot_database_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/,
    );

    // Save and verify file exists and has content
    const downloadPath = path.join(__dirname, '../test-results', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const stats = await fs.stat(downloadPath);
    expect(stats.size).toBeGreaterThan(1000); // Should have realistic SQLite data

    // Verify it starts with SQLite header
    const buffer = await fs.readFile(downloadPath);
    const header = buffer.toString('ascii', 0, 16);
    expect(header).toBe('SQLite format 3\0');

    // Verify success message appears
    await expect(page.locator('text=Export réussi!')).toBeVisible();
    await expect(page.locator(`text=${download.suggestedFilename()}`)).toBeVisible();
  });

  test('should show error when no format is selected', async ({ page }) => {
    // Try to export without selecting format
    await page.getByTestId('export-button').click();

    // Verify error message appears
    await expect(page.locator('[data-testid="format-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="format-error"]')).toContainText(
      'Veuillez sélectionner un format',
    );
  });

  test('should generate unique filenames for multiple exports', async ({ page }) => {
    // First export
    await page.getByTestId('export-format-select').selectOption('JSON');

    const download1Promise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download1 = await download1Promise;

    // Wait a moment to ensure different timestamp
    await page.waitForTimeout(1000);

    // Second export
    const download2Promise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download2 = await download2Promise;

    // Verify different filenames
    expect(download1.suggestedFilename()).not.toBe(download2.suggestedFilename());
    expect(download1.suggestedFilename()).toMatch(
      /^discord_bot_database_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
    );
    expect(download2.suggestedFilename()).toMatch(
      /^discord_bot_database_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
    );
  });

  test('should show debug information during export', async ({ page }) => {
    // Select format and export
    await page.getByTestId('export-format-select').selectOption('JSON');
    await page.getByTestId('export-button').click();

    // Verify debug information appears
    await expect(page.locator('text=Informations de débogage:')).toBeVisible();
    await expect(page.locator('text=Format: json')).toBeVisible();
    await expect(page.locator('text=Type MIME: application/json')).toBeVisible();
    await expect(page.locator('text=1042 caractères')).toBeVisible();
    await expect(page.locator('text=Type de contenu: string')).toBeVisible();
  });

  test('should display file generation test results on page load', async ({ page }) => {
    // Verify test results are displayed automatically
    await expect(page.locator('text=Résultats des tests:')).toBeVisible();

    // Check JSON test result
    await expect(page.locator('text=Format: JSON')).toBeVisible();
    await expect(page.locator('text=application/json')).toBeVisible();
    await expect(page.locator('text=1042 octets')).toBeVisible();
    await expect(page.locator('text=✓ OK')).toBeVisible();

    // Check CSV test result
    await expect(page.locator('text=Format: CSV')).toBeVisible();
    await expect(page.locator('text=text/csv')).toBeVisible();
    await expect(page.locator('text=244 octets')).toBeVisible();

    // Check SQLite test result
    await expect(page.locator('text=Format: SQLITE')).toBeVisible();
    await expect(page.locator('text=application/x-sqlite3')).toBeVisible();
    await expect(page.locator('text=1032 octets')).toBeVisible();
  });

  test('should handle all formats correctly in sequence', async ({ page }) => {
    const formats = ['JSON', 'CSV', 'SQLite'];
    const expectedExtensions = ['json', 'csv', 'db'];

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const extension = expectedExtensions[i];

      // Select format
      await page.getByTestId('export-format-select').selectOption(format);

      // Export and verify
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-button').click();
      const download = await downloadPromise;

      // Verify filename
      expect(download.suggestedFilename()).toMatch(
        new RegExp(
          `^discord_bot_database_export_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${extension}$`,
        ),
      );

      // Verify success message
      await expect(page.locator('text=Export réussi!')).toBeVisible();

      // Wait a bit between exports
      if (i < formats.length - 1) {
        await page.waitForTimeout(500);
      }
    }
  });
});
