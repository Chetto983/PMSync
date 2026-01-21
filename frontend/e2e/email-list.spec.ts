/**
 * Email List E2E Tests
 *
 * Tests for the email inbox page:
 * - Email list rendering
 * - Loading states
 * - Empty states
 * - Selection and bulk actions
 */

import { test, expect, mockEmails } from './fixtures';

test.describe('Email List', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/dashboard/email');
  });

  test('displays email list with correct items', async ({ authedPage }) => {
    // Wait for emails to load
    await authedPage.waitForSelector('[data-testid="thread-list-item"]', {
      timeout: 10000,
    });

    // Should show all mock emails
    const emailItems = authedPage.locator('[data-testid="thread-list-item"]');
    await expect(emailItems).toHaveCount(mockEmails.length);

    // First email should show sender and subject
    const firstEmail = emailItems.first();
    await expect(firstEmail).toContainText('Alice Smith');
    await expect(firstEmail).toContainText('Project Update');
  });

  test('shows unread indicator for unread emails', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // First email is unread - should have bold styling or indicator
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();

    // Check for unread visual indicator (background color)
    const styles = await firstEmail.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Unread emails have a light blue background
    expect(styles).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('shows flag icon for flagged emails', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Second email is flagged
    const secondEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(1);
    const flagIcon = secondEmail.locator('[data-testid="flag-icon"]');

    await expect(flagIcon).toBeVisible();
  });

  test('shows attachment indicator for emails with attachments', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Third email has attachment
    const thirdEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(2);
    const attachmentIcon = thirdEmail.locator('[data-testid="attachment-icon"]');

    await expect(attachmentIcon).toBeVisible();
  });

  test('selects email on checkbox click', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Hover to show checkbox
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await firstEmail.hover();

    // Click checkbox
    const checkbox = firstEmail.locator('input[type="checkbox"]');
    await checkbox.click();

    // Should be selected
    await expect(checkbox).toBeChecked();

    // Header should show selection count
    const header = authedPage.locator('[data-testid="thread-list-header"]');
    await expect(header).toContainText('1 selected');
  });

  test('select all checkbox selects all emails', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Click select all in header
    const selectAllCheckbox = authedPage.locator(
      '[data-testid="thread-list-header"] input[type="checkbox"]'
    );
    await selectAllCheckbox.click();

    // All checkboxes should be checked
    const itemCheckboxes = authedPage.locator(
      '[data-testid="thread-list-item"] input[type="checkbox"]'
    );
    const count = await itemCheckboxes.count();

    for (let i = 0; i < count; i++) {
      await expect(itemCheckboxes.nth(i)).toBeChecked();
    }

    // Header should show all selected
    const header = authedPage.locator('[data-testid="thread-list-header"]');
    await expect(header).toContainText(`${mockEmails.length} selected`);
  });

  test('clicking email opens reading pane on desktop', async ({ authedPage }) => {
    // Set desktop viewport
    await authedPage.setViewportSize({ width: 1440, height: 900 });
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Click first email
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await firstEmail.click();

    // Reading pane should appear with email content
    const readingPane = authedPage.locator('[data-testid="reading-pane"]');
    await expect(readingPane).toBeVisible();
    await expect(readingPane).toContainText('Project Update');
    await expect(readingPane).toContainText('Hi team');
  });

  test('refresh button reloads emails', async ({ authedPage }) => {
    await authedPage.waitForSelector('[data-testid="thread-list-item"]');

    // Track API calls
    let apiCalled = false;
    await authedPage.route('**/api/v1/email?**', (route) => {
      apiCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          emails: mockEmails,
          total: mockEmails.length,
        }),
      });
    });

    // Click refresh button
    const refreshButton = authedPage.locator('[data-testid="refresh-button"]');
    await refreshButton.click();

    // Should have called API
    await authedPage.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });
});

test.describe('Email List - Empty States', () => {
  test('shows empty inbox message when no emails', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/v1/email?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: [], total: 0 }),
      });
    });

    // Mock auth
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'test-token');
    });
    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', email: 'test@test.com' }),
      });
    });
    await page.route('**/api/v1/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ foldersByProvider: {} }),
      });
    });
    await page.route('**/api/v1/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    await page.goto('/dashboard/email');

    // Should show empty state
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Email List - Loading States', () => {
  test('shows skeleton while loading', async ({ page }) => {
    // Delay API response
    await page.route('**/api/v1/email?**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: mockEmails, total: mockEmails.length }),
      });
    });

    // Mock auth
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'test-token');
    });
    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1' }),
      });
    });
    await page.route('**/api/v1/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ foldersByProvider: {} }),
      });
    });
    await page.route('**/api/v1/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    await page.goto('/dashboard/email');

    // Should show skeleton immediately
    const skeleton = page.locator('[data-testid="thread-list-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 1000 });

    // After loading, skeleton should disappear
    await expect(skeleton).not.toBeVisible({ timeout: 5000 });
  });
});
