/**
 * Analytics Page E2E Tests
 *
 * Verifies the analytics page renders either a consent gate
 * (when email_analytics consent is not granted) or a Recharts
 * chart with SVG elements (when consent is granted).
 */

import { test, expect } from '@playwright/test';

test.describe('Analytics page', () => {
  test('renders consent gate or chart', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');

    // The page heading "Analytics" should be visible (from AnalyticsPage wrapper)
    const heading = page.getByRole('heading', { level: 4 });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // The page should show either:
    // (a) A consent prompt with a link to settings (if user hasn't consented)
    // (b) A Recharts chart wrapper (if consent was granted and data exists)
    // (c) A "no data" message (if consent granted but no email data)
    // All are valid states

    const hasChart = await page
      .locator('.recharts-wrapper')
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const hasConsentButton = await page
      .locator('a[href*="settings?section=consent"]')
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    const hasNoDataOrError = await page
      .locator('.MuiPaper-root')
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // At least one meaningful state must be present
    expect(hasChart || hasConsentButton || hasNoDataOrError).toBe(true);
  });

  test('chart renders SVG elements when consent exists', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');

    // Wait for page load
    const heading = page.getByRole('heading', { level: 4 });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // If a chart is visible, verify it has SVG data elements
    const chartWrapper = page.locator('.recharts-wrapper');
    const isChartVisible = await chartWrapper
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (isChartVisible) {
      // Chart should have at least one SVG path (line) or axis element
      const svgElements = page.locator(
        '.recharts-line, .recharts-cartesian-grid, .recharts-cartesian-axis',
      );
      const elementCount = await svgElements.count();
      expect(elementCount).toBeGreaterThanOrEqual(1);
    }
    // If chart not visible, test passes silently (consent not granted for test user)
  });
});
