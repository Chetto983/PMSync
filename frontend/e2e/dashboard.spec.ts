/**
 * Dashboard E2E Tests
 *
 * Verifies dashboard widget rendering, customization drawer,
 * widget toggle, and layout persistence across page refresh.
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders default widgets', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dashboard heading should be visible
    const heading = page.getByRole('heading', { name: /dashboard/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Customize button must exist (proves DashboardContainer rendered)
    const customizeBtn = page.getByRole('button', { name: /customize/i });
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });

    // At least 3 widget cards should be rendered (fresh user gets all 10)
    // WidgetCard renders MUI Card variant="outlined" inside the grid
    const widgetCards = page.locator('[class*="MuiCard-root"]');
    await expect(widgetCards.first()).toBeVisible({ timeout: 15_000 });
    const count = await widgetCards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('customization drawer opens and toggles a widget', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for dashboard to fully render
    const customizeBtn = page.getByRole('button', { name: /customize/i });
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });

    // Count widget cards before toggling
    const widgetCards = page.locator('[class*="MuiCard-root"]');
    await expect(widgetCards.first()).toBeVisible({ timeout: 15_000 });
    const countBefore = await widgetCards.count();

    // Open customization drawer
    await customizeBtn.click();

    // Drawer should appear with MUI Switch elements
    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Find the first MUI Switch in the drawer and toggle it OFF
    const switches = drawer.locator('.MuiSwitch-root input[type="checkbox"]');
    await expect(switches.first()).toBeAttached({ timeout: 5_000 });

    // Click the first switch to toggle it
    await switches.first().click();

    // Close the drawer by pressing Escape
    await page.keyboard.press('Escape');

    // After toggling one widget OFF, count should decrease by 1
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    const countAfterToggle = await widgetCards.count();
    expect(countAfterToggle).toBe(countBefore - 1);
  });

  test('widget layout persists after refresh', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for dashboard to render
    const customizeBtn = page.getByRole('button', { name: /customize/i });
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });

    // Toggle a widget off
    const widgetCards = page.locator('[class*="MuiCard-root"]');
    await expect(widgetCards.first()).toBeVisible({ timeout: 15_000 });
    const countBefore = await widgetCards.count();

    await customizeBtn.click();
    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const switches = drawer.locator('.MuiSwitch-root input[type="checkbox"]');
    await expect(switches.first()).toBeAttached({ timeout: 5_000 });
    await switches.first().click();
    await page.keyboard.press('Escape');

    // Verify toggle took effect
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    const countAfterToggle = await widgetCards.count();
    expect(countAfterToggle).toBe(countBefore - 1);

    // Reload the page to test persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });

    // Widget count should persist (same reduced count)
    await expect(widgetCards.first()).toBeVisible({ timeout: 15_000 });
    const countAfterReload = await widgetCards.count();
    expect(countAfterReload).toBe(countAfterToggle);
  });
});
