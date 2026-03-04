/**
 * Email List E2E Tests
 *
 * Tests for the email inbox page:
 * - Email list rendering
 * - Loading states
 * - Empty states
 * - Selection and bulk actions
 */

import { test, expect, mockEmails, injectAuthCookie } from './fixtures';

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

    // Second email is flagged - flag icon is in hover actions, need to hover
    const secondEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(1);
    await secondEmail.hover();

    // Wait for hover state to reveal actions
    await authedPage.waitForTimeout(300);

    const flagIcon = secondEmail.locator('[data-testid="flag-icon"]');
    await expect(flagIcon).toBeVisible({ timeout: 5000 });
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
    await authedPage.route('**/localhost:3000/emails?**', (route) => {
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
    await page.route('**/localhost:3000/emails?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: [], total: 0 }),
      });
    });
    await page.route('**/localhost:3000/emails', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: [], total: 0 }),
      });
    });

    // Inject httpOnly cookie for auth (Phase 34 -- no localStorage)
    await injectAuthCookie(page.context(), 'test-jwt-token');
    await page.addInitScript(() => {
      localStorage.setItem(
        'mailagent:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });
    await page.route('**/localhost:3000/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', email: 'test@test.com', role: 'admin', tenantId: 'tenant-1' }),
      });
    });
    await page.route('**/localhost:3000/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ foldersByProvider: {} }),
      });
    });
    await page.route('**/localhost:3000/labels**', (route) => {
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
  test('shows loading indicator while fetching emails', async ({ page }) => {
    // Inject httpOnly cookie for auth (Phase 34 -- no localStorage)
    await injectAuthCookie(page.context(), 'test-jwt-token');
    await page.addInitScript(() => {
      localStorage.setItem(
        'mailagent:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });

    // Delay API response significantly to catch loading state
    await page.route('**/localhost:3000/emails?**', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: mockEmails, total: mockEmails.length }),
      });
    });
    await page.route('**/localhost:3000/emails', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: mockEmails, total: mockEmails.length }),
      });
    });

    await page.route('**/localhost:3000/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', role: 'admin', tenantId: 'tenant-1' }),
      });
    });
    await page.route('**/localhost:3000/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ foldersByProvider: {} }),
      });
    });
    await page.route('**/localhost:3000/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    await page.goto('/dashboard/email');

    // Page shows CircularProgress + "Loading emails..." text while waiting for API
    // (This is page-level loading, not ThreadListSkeleton which is for refresh)
    const loadingText = page.getByText('Loading emails...');
    await expect(loadingText).toBeVisible({ timeout: 2000 });

    // After loading completes (3s delay), loading state should disappear and emails show
    await expect(loadingText).not.toBeVisible({ timeout: 6000 });

    // Emails should now be visible
    const emailItems = page.locator('[data-testid="thread-list-item"]');
    await expect(emailItems.first()).toBeVisible({ timeout: 2000 });
  });
});
