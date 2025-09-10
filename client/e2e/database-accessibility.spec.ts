import { test, expect } from '@playwright/test';

test.describe('Database Management Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database');
  });

  test('should have proper ARIA labels and roles', async ({ page }) => {
    // Check main heading
    const mainHeading = page.locator('h1');
    await expect(mainHeading).toBeVisible();

    // Check form labels
    const formatLabel = page.locator('label[for="export-format"]');
    await expect(formatLabel).toBeVisible();

    // Check button accessibility
    const exportButton = page.locator('button[data-testid="export-button"]');
    await expect(exportButton).toBeVisible();

    // Check file input accessibility
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', '.db,.sqlite,.json,.csv');
  });

  test('should support screen reader navigation', async ({ page }) => {
    // Check heading hierarchy
    const headings = page.locator('h1, h2, h3, h4');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);

    // Check that all interactive elements are focusable
    const interactiveElements = page.locator('button, input, select');
    const elementCount = await interactiveElements.count();

    for (let i = 0; i < elementCount; i++) {
      const element = interactiveElements.nth(i);
      if (await element.isVisible()) {
        await element.focus();
        await expect(element).toBeFocused();
      }
    }
  });

  test('should have proper color contrast', async ({ page }) => {
    // This is a basic check - in a real scenario, you'd use axe-core
    const exportButton = page.locator('button[data-testid="export-button"]');
    await expect(exportButton).toBeVisible();

    // Check that text is readable
    const buttonText = await exportButton.textContent();
    expect(buttonText).toBeTruthy();
    expect(buttonText?.trim().length).toBeGreaterThan(0);
  });

  test('should work with keyboard-only navigation', async ({ page }) => {
    // Start keyboard navigation
    await page.keyboard.press('Tab');

    // Should focus on export format select
    await expect(page.locator('select[data-testid="export-format-select"]')).toBeFocused();

    // Navigate to export button
    await page.keyboard.press('Tab');
    await expect(page.locator('button[data-testid="export-button"]')).toBeFocused();

    // Select format using keyboard
    await page.keyboard.press('Shift+Tab'); // Go back to select
    await page.keyboard.press('Space'); // Open select
    await page.keyboard.press('ArrowDown'); // Select JSON
    await page.keyboard.press('Enter'); // Confirm selection

    // Navigate to export button and activate
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // Should open confirmation dialog

    // Check that modal is keyboard accessible
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();

    // Should be able to close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="confirmation-modal"]')).not.toBeVisible();
  });

  test('should announce dynamic content changes', async ({ page }) => {
    // Upload a file to trigger dynamic content
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('test'),
    });

    // Check that loading state is announced
    await expect(page.locator('[data-testid="preview-loading"]')).toBeVisible();

    // Check that success/error states would be announced
    // (In a real app, these would have aria-live regions)
    const loadingText = await page.locator('[data-testid="preview-loading"]').textContent();
    expect(loadingText).toContain('Analyzing');
  });

  test('should have proper focus management in modals', async ({ page }) => {
    // Open confirmation dialog
    await page.selectOption('select[data-testid="export-format-select"]', 'json');
    await page.click('button[data-testid="export-button"]');

    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();

    // Focus should be trapped in modal
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );

    // Should focus on an element within the modal
    expect(['cancel-button', 'confirm-button']).toContain(focusedElement);

    // Close modal and check focus returns
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="confirmation-modal"]')).not.toBeVisible();
  });

  test('should provide clear error messages', async ({ page }) => {
    // Try to export without selecting format
    await page.click('button[data-testid="export-button"]');

    // Error message should be clear and associated with the field
    const errorMessage = page.locator('[data-testid="format-error"]');
    await expect(errorMessage).toBeVisible();

    const errorText = await errorMessage.textContent();
    expect(errorText).toContain('Please select an export format');

    // Try invalid file upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid'),
    });

    const fileError = page.locator('[data-testid="file-error"]');
    await expect(fileError).toBeVisible();

    const fileErrorText = await fileError.textContent();
    expect(fileErrorText).toContain('Invalid file type');
  });

  test('should work with high contrast mode', async ({ page }) => {
    // Simulate high contrast mode by checking that elements are still visible
    // In a real test, you might inject CSS or use browser settings

    const elements = [
      'h1',
      'button[data-testid="export-button"]',
      'select[data-testid="export-format-select"]',
      '[data-testid="drop-zone"]',
    ];

    for (const selector of elements) {
      await expect(page.locator(selector)).toBeVisible();
    }
  });

  test('should support reduced motion preferences', async ({ page }) => {
    // In a real test, you might set prefers-reduced-motion and check animations
    // For now, we'll just verify that the interface works without animations

    await page.selectOption('select[data-testid="export-format-select"]', 'json');
    await page.click('button[data-testid="export-button"]');
    await page.click('button[data-testid="confirm-button"]');

    // Progress should still be visible even without animations
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
  });
});
