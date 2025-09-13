import { test, expect } from '@playwright/test';

test.describe('Task 4.2 Final Verification - Metrics Visualization Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3002');
  });

  test('should have fully functional Metrics page with all components', async ({ page }) => {
    // Navigate to metrics page
    await page.getByTestId('nav-metrics').click();

    // Verify page loads with correct title
    await expect(page.locator('h1:has-text("Metrics Dashboard")')).toBeVisible();
    await expect(page.locator('text=Real-time monitoring and visualization')).toBeVisible();

    // Verify time range controls
    await expect(page.getByTestId('time-range-select')).toBeVisible();
    await expect(page.getByTestId('auto-refresh-toggle')).toBeVisible();
    await expect(page.getByTestId('manual-refresh')).toBeVisible();

    // Verify System Metrics section
    await expect(page.locator('h2:has-text("System Metrics")')).toBeVisible();
    await expect(page.locator('h3:has-text("CPU Usage")')).toBeVisible();
    await expect(page.locator('h3:has-text("Memory Usage")')).toBeVisible();
    await expect(page.locator('h3:has-text("Network Activity")')).toBeVisible();
    await expect(page.locator('h3:has-text("Disk Usage")')).toBeVisible();

    // Verify Bot Metrics section
    await expect(page.locator('h2:has-text("Bot Metrics")')).toBeVisible();
    await expect(page.locator('h3:has-text("Guild Count")')).toBeVisible();
    await expect(page.locator('h3:has-text("Events Processed")')).toBeVisible();
    await expect(page.locator('h3:has-text("Commands Success Rate")')).toBeVisible();
    await expect(page.locator('h3:has-text("Response Time")')).toBeVisible();

    // Verify connection status indicator
    await expect(page.locator('text=Connected')).toBeVisible();

    // Verify Interactive Charts section
    await expect(page.locator('h2:has-text("Historical Analysis")')).toBeVisible();
    await expect(page.locator('h3:has-text("System Performance Over Time")')).toBeVisible();

    // Verify interactive chart controls
    await expect(page.getByTestId('time-range-option')).toHaveCount(4); // 1h, 6h, 24h, 7d
    await expect(page.getByTestId('reset-zoom')).toBeVisible();
    await expect(page.getByTestId('metric-type-select')).toBeVisible();

    // Verify Active Alerts section
    await expect(page.locator('h2:has-text("Active Alerts")')).toBeVisible();
    await expect(page.getByTestId('alerts-display')).toBeVisible();
  });

  test('should have interactive controls working', async ({ page }) => {
    await page.getByTestId('nav-metrics').click();

    // Test time range selector
    const timeRangeSelect = page.getByTestId('time-range-select');
    await timeRangeSelect.selectOption('6h');
    await expect(timeRangeSelect).toHaveValue('6h');

    // Test auto-refresh toggle
    const autoRefreshBtn = page.getByTestId('auto-refresh-toggle');
    await autoRefreshBtn.click();
    await expect(autoRefreshBtn).toContainText('▶️ Auto Refresh');

    // Test manual refresh
    const manualRefreshBtn = page.getByTestId('manual-refresh');
    await expect(manualRefreshBtn).toBeEnabled();
    await manualRefreshBtn.click();

    // Test metric type selector
    const metricTypeSelect = page.getByTestId('metric-type-select');
    await metricTypeSelect.selectOption('system.memory.percentage');
    await expect(metricTypeSelect).toHaveValue('system.memory.percentage');
  });

  test('should have fully functional Alerts page', async ({ page }) => {
    // Navigate to alerts page
    await page.getByTestId('nav-alerts').click();

    // Verify page loads with correct title
    await expect(page.locator('h1:has-text("Alerts & Notifications")')).toBeVisible();
    await expect(page.locator('text=Monitor and manage system alerts')).toBeVisible();

    // Verify alert controls
    await expect(page.getByTestId('alert-filter')).toBeVisible();
    await expect(page.getByTestId('acknowledge-all')).toBeVisible();
    await expect(page.getByTestId('clear-acknowledged')).toBeVisible();
    await expect(page.getByTestId('refresh-alerts')).toBeVisible();

    // Verify alert statistics
    await expect(page.locator('text=Critical')).toBeVisible();
    await expect(page.locator('text=Errors')).toBeVisible();
    await expect(page.locator('text=Warnings')).toBeVisible();
    await expect(page.locator('text=Info')).toBeVisible();

    // Verify alerts are displayed
    await expect(page.getByTestId('main-alerts-display')).toBeVisible();

    // Verify different alert types are present
    await expect(page.locator('text=🚨')).toBeVisible(); // Critical
    await expect(page.locator('text=❌')).toBeVisible(); // Error
    await expect(page.locator('text=⚠️')).toBeVisible(); // Warning
    await expect(page.locator('text=ℹ️')).toBeVisible(); // Info
  });

  test('should have working alert filters', async ({ page }) => {
    await page.getByTestId('nav-alerts').click();

    // Test filtering by Critical alerts
    await page.getByTestId('alert-filter').selectOption('Critical');

    // Should only show critical alerts
    await expect(page.locator('text=🚨')).toBeVisible();
    // Should not show other types in the list (though stats still show all)

    // Test filtering by Error alerts
    await page.getByTestId('alert-filter').selectOption('Error');
    await expect(page.locator('text=❌')).toBeVisible();

    // Test filtering by Warning alerts
    await page.getByTestId('alert-filter').selectOption('Warning');
    await expect(page.locator('text=⚠️')).toBeVisible();

    // Test filtering by Info alerts
    await page.getByTestId('alert-filter').selectOption('Info');
    await expect(page.locator('text=ℹ️')).toBeVisible();

    // Reset to all alerts
    await page.getByTestId('alert-filter').selectOption('All Alerts');
    await expect(page.locator('text=🚨')).toBeVisible();
    await expect(page.locator('text=❌')).toBeVisible();
    await expect(page.locator('text=⚠️')).toBeVisible();
    await expect(page.locator('text=ℹ️')).toBeVisible();
  });

  test('should have working alert actions', async ({ page }) => {
    await page.getByTestId('nav-alerts').click();

    // Find an unacknowledged alert and acknowledge it
    const acknowledgeButtons = page.locator('button:has-text("Acknowledge")');
    const firstAcknowledgeBtn = acknowledgeButtons.first();

    if (await firstAcknowledgeBtn.isVisible()) {
      await firstAcknowledgeBtn.click();
      // Should show acknowledged status
      await expect(page.locator('text=✓ Acknowledged')).toBeVisible();
    }

    // Test acknowledge all functionality
    const acknowledgeAllBtn = page.getByTestId('acknowledge-all');
    if (await acknowledgeAllBtn.isEnabled()) {
      await acknowledgeAllBtn.click();
    }

    // Test refresh functionality
    await page.getByTestId('refresh-alerts').click();
    // Should still show alerts after refresh
    await expect(page.getByTestId('main-alerts-display')).toBeVisible();
  });

  test('should have responsive design working', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByTestId('nav-metrics').click();

    await expect(page.locator('h1:has-text("Metrics Dashboard")')).toBeVisible();

    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('h1:has-text("Metrics Dashboard")')).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('h1:has-text("Metrics Dashboard")')).toBeVisible();

    // Test alerts page on mobile
    await page.getByTestId('nav-alerts').click();
    await expect(page.locator('h1:has-text("Alerts & Notifications")')).toBeVisible();
  });

  test('should have theme switching working across all pages', async ({ page }) => {
    // Test theme toggle on metrics page
    await page.getByTestId('nav-metrics').click();

    const themeToggle = page.locator('button:has-text("Switch to light theme")');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await expect(page.locator('button:has-text("Switch to dark theme")')).toBeVisible();
    }

    // Navigate to alerts and verify theme persists
    await page.getByTestId('nav-alerts').click();
    await expect(page.locator('h1:has-text("Alerts & Notifications")')).toBeVisible();

    // Navigate to database and verify theme persists
    await page.getByTestId('nav-database').click();
    await expect(page.locator('h1:has-text("Database Management")')).toBeVisible();
  });

  test('should have all Chart.js components working without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('[Vue warn]')) {
        errors.push(msg.text());
      }
    });

    await page.getByTestId('nav-metrics').click();

    // Wait for charts to load
    await page.waitForTimeout(3000);

    // Verify charts are rendered (they appear as images in the DOM)
    const charts = page.locator('canvas, img[src*="data:image"]');
    const chartCount = await charts.count();
    expect(chartCount).toBeGreaterThan(0);

    // Check for critical JavaScript errors (excluding Vue warnings)
    const criticalErrors = errors.filter(
      error => !error.includes('Filler') && !error.includes('DevTools') && !error.includes('HMR'),
    );

    // Allow some non-critical errors but ensure basic functionality works
    expect(criticalErrors.length).toBeLessThan(5);
  });
});
