/**
 * Tasks Page E2E Tests
 *
 * Verifies the Tasks page renders real follow-up data (or empty state),
 * not the old "Coming Soon" placeholder. Sidebar filters are interactive.
 */

import { test, expect } from '@playwright/test';

test.describe('Tasks page', () => {
  test('renders real content, not placeholder', async ({ page }) => {
    await page.goto('/dashboard/tasks');
    await page.waitForLoadState('networkidle');

    // Sidebar renders with filter buttons
    await expect(page.getByText('All Tasks')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Today')).toBeVisible();
    await expect(page.getByText('Upcoming')).toBeVisible();

    // Page does NOT show "Coming Soon" placeholder chip
    await expect(page.getByText('Coming soon')).not.toBeVisible();

    // Page shows either:
    // (a) follow-up data items (if user has follow-ups), OR
    // (b) empty state with updated copy "No follow-ups to track"
    // Both are valid -- the point is it's not the placeholder
    const hasFollowUps = await page.locator('[data-testid="follow-up-item"]').count() > 0;
    const hasEmptyState = await page.getByText('No follow-ups to track').isVisible().catch(() => false);

    expect(hasFollowUps || hasEmptyState).toBe(true);
  });

  test('sidebar filters are clickable', async ({ page }) => {
    await page.goto('/dashboard/tasks');
    await page.waitForLoadState('networkidle');

    // Wait for sidebar to render
    await expect(page.getByText('All Tasks')).toBeVisible({ timeout: 15_000 });

    // Click Today filter
    await page.getByText('Today').click();
    // Click Upcoming filter
    await page.getByText('Upcoming').click();
    // Click All Tasks filter
    await page.getByText('All Tasks').click();

    // No crash, page still shows content
    await expect(page.getByText('Workspace')).toBeVisible();
  });
});
