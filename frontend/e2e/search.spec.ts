/**
 * Email Search E2E Tests
 *
 * Tests for search filter functionality:
 * - Filter chip parsing (from:, to:, has:attachment, subject:)
 * - Filter chip removal (X button, clear all)
 * - Combined filters
 * - Invalid filter handling
 *
 * Prerequisites:
 * - Auth state from setup project (playwright/.auth/user.json)
 * - API mocks for email endpoints (included in test)
 *
 * Tests run sequentially to avoid tenant data race conditions.
 * Tests use URL navigation for filter state.
 */

import { test, expect } from '@playwright/test';

// Test data for search filtering
const searchMockEmails = [
  {
    id: 'email-1',
    from: 'alice@example.com',
    to: ['user@test.com'],
    subject: 'Test Project Update',
    snippet: 'This is a test email from Alice',
    bodyText: 'This is a test email from Alice for testing',
    bodyHtml: '<p>This is a test email from Alice for testing</p>',
    receivedAt: new Date().toISOString(),
    isRead: false,
    isFlagged: false,
    isStarred: false,
    providerId: 'provider-1',
    attachments: [],
    emailLabels: [],
  },
  {
    id: 'email-2',
    from: 'bob@example.com',
    to: ['user@test.com'],
    subject: 'Meeting Tomorrow',
    snippet: 'Can we meet tomorrow?',
    bodyText: 'Can we meet tomorrow?',
    bodyHtml: '<p>Can we meet tomorrow?</p>',
    receivedAt: new Date(Date.now() - 1800000).toISOString(),
    isRead: true,
    isFlagged: false,
    isStarred: false,
    providerId: 'provider-1',
    attachments: [{ id: 'att-1', filename: 'agenda.pdf', size: 50000 }],
    emailLabels: [],
  },
  {
    id: 'email-3',
    from: 'alice@example.com',
    to: ['user@test.com'],
    subject: 'Weekly Meeting Notes',
    snippet: 'Here are the meeting notes',
    bodyText: 'Here are the meeting notes',
    bodyHtml: '<p>Here are the meeting notes</p>',
    receivedAt: new Date(Date.now() - 3600000).toISOString(),
    isRead: true,
    isFlagged: true,
    isStarred: false,
    providerId: 'provider-1',
    attachments: [{ id: 'att-2', filename: 'notes.docx', size: 25000 }],
    emailLabels: [],
  },
];

/**
 * Setup mocks for a page - includes auth and email endpoints
 */
async function setupMocks(page: import('@playwright/test').Page) {
  // Mock auth endpoint - use **/* pattern to ensure match
  await page.route('**/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        tenantId: 'tenant-1',
      }),
    });
  });

  // Mock email endpoint with search filtering
  await page.route('**/emails**', (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get('search') || url.searchParams.get('query') || '';

    let filteredEmails = [...searchMockEmails];

    // Filter by "from:" prefix
    const fromMatch = search.match(/from:(\S+)/i);
    if (fromMatch) {
      const fromFilter = fromMatch[1].toLowerCase();
      filteredEmails = filteredEmails.filter((e) =>
        e.from.toLowerCase().includes(fromFilter)
      );
    }

    // Filter by "subject:" prefix
    const subjectMatch = search.match(/subject:(\S+)/i);
    if (subjectMatch) {
      const subjectFilter = subjectMatch[1].toLowerCase();
      filteredEmails = filteredEmails.filter((e) =>
        e.subject.toLowerCase().includes(subjectFilter)
      );
    }

    // Filter by "has:attachment"
    if (search.toLowerCase().includes('has:attachment')) {
      filteredEmails = filteredEmails.filter((e) => e.attachments.length > 0);
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        emails: filteredEmails,
        total: filteredEmails.length,
        page: 1,
        limit: 50,
      }),
    });
  });

  // Mock folders endpoint
  await page.route('**/email/folders**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        foldersByProvider: {
          'provider-1': [
            { id: 'folder-inbox', name: 'INBOX', path: 'INBOX', type: 'INBOX' },
          ],
        },
      }),
    });
  });

  // Mock other required endpoints
  await page.route('**/contacts/sender-photos**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/labels**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ labels: [] }),
    });
  });

}

test.describe('Search Filters', () => {
  // Sequential execution for shared state
  test.describe.configure({ mode: 'serial' });

  // Set up mocks before each test
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('from: filter shows filtered results', async ({ page }) => {

    // Navigate with search param - URL-based filter state
    await page.goto('/dashboard/email?search=from:alice');

    // Wait for API response
    const response = await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );
    expect(response.ok()).toBe(true);

    // Verify chip renders with "From" label (use aria-label for specificity)
    await expect(
      page.getByRole('button', { name: /Remove filter:.*from.*alice/i })
    ).toBeVisible({ timeout: 10000 });

    // Verify filtered results (should show 2 emails from alice)
    const emailList = page.locator('[data-testid="thread-list-item"]');
    await expect(emailList).toHaveCount(2, { timeout: 10000 });
  });

  test('has:attachment filter shows only emails with attachments', async ({ page }) => {
    // Navigate with attachment filter
    await page.goto('/dashboard/email?search=has:attachment');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );

    // Verify chip renders (use aria-label for specificity)
    await expect(
      page.getByRole('button', { name: /Remove filter:.*attachment/i })
    ).toBeVisible({ timeout: 10000 });

    // Verify filtered results (should show 2 emails with attachments)
    const emailItems = page.locator('[data-testid="thread-list-item"]');
    await expect(emailItems).toHaveCount(2, { timeout: 10000 });

    // Each result should have attachment icon
    const attachmentIcons = page.locator('[data-testid="attachment-icon"]');
    await expect(attachmentIcons).toHaveCount(2, { timeout: 5000 });
  });

  test('subject: filter shows filtered results', async ({ page }) => {
    // Navigate with subject filter
    await page.goto('/dashboard/email?search=subject:meeting');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );

    // Verify chip renders with "Subject" label (use aria-label for specificity)
    await expect(
      page.getByRole('button', { name: /Remove filter:.*subject.*meeting/i })
    ).toBeVisible({ timeout: 10000 });

    // Verify filtered results (should show 2 emails with "meeting" in subject)
    const emailList = page.locator('[data-testid="thread-list-item"]');
    await expect(emailList).toHaveCount(2, { timeout: 10000 });
  });

  test('combined filters (from: AND subject:) work together', async ({ page }) => {
    // Navigate with multiple filters
    await page.goto('/dashboard/email?search=from:alice subject:test');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );

    // Both chips should render (use aria-label for specificity)
    await expect(
      page.getByRole('button', { name: /Remove filter:.*from.*alice/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('button', { name: /Remove filter:.*subject.*test/i })
    ).toBeVisible({ timeout: 10000 });

    // Verify combined filter results (alice + "test" in subject = 1 email)
    const emailList = page.locator('[data-testid="thread-list-item"]');
    await expect(emailList).toHaveCount(1, { timeout: 10000 });
  });

  test('chip X button removes filter', async ({ page }) => {
    // Navigate with filter
    await page.goto('/dashboard/email?search=from:alice');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );

    // Find chip (use aria-label for specificity)
    const chip = page.getByRole('button', { name: /Remove filter:.*from.*alice/i });
    await expect(chip).toBeVisible({ timeout: 10000 });

    // Click the delete icon within the chip using Playwright's native locator
    // MUI Chip delete icon has class .MuiChip-deleteIcon
    const deleteIcon = chip.locator('.MuiChip-deleteIcon');
    await deleteIcon.click({ force: true });

    // Wait for state update and URL sync
    await page.waitForTimeout(500);

    // Chip should disappear
    await expect(chip).not.toBeVisible({ timeout: 5000 });

    // URL should update (no search param)
    await expect(page).not.toHaveURL(/search=from/);
  });

  test('clear button removes all filters', async ({ page }) => {
    // Navigate with multiple filters
    await page.goto('/dashboard/email?search=from:alice has:attachment');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails') && res.status() === 200,
      { timeout: 15000 }
    );

    // Verify both chips are visible (use aria-label for specificity)
    const fromChip = page.getByRole('button', { name: /Remove filter:.*from.*alice/i });
    const attachmentChip = page.getByRole('button', { name: /Remove filter:.*attachment/i });
    await expect(fromChip).toBeVisible({ timeout: 10000 });
    await expect(attachmentChip).toBeVisible({ timeout: 10000 });

    // Find and click clear button by aria-label (inside search field's endAdornment)
    const clearButton = page.getByRole('button', { name: /clear/i });
    await expect(clearButton).toBeVisible({ timeout: 5000 });
    await clearButton.click();

    // Wait for state update
    await page.waitForTimeout(500);

    // All chips should disappear
    await expect(fromChip).not.toBeVisible({ timeout: 5000 });
    await expect(attachmentChip).not.toBeVisible({ timeout: 5000 });
  });

  test('invalid filter shows input without chip', async ({ page }) => {
    // Navigate with incomplete filter (no value after colon)
    await page.goto('/dashboard/email?search=from:');

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/emails'),
      { timeout: 15000 }
    );

    // Wait for search field to render
    const searchField = page.getByTestId('email-search');
    await expect(searchField).toBeVisible({ timeout: 10000 });

    // Input should contain raw text "from:" (incomplete filter)
    const searchInput = searchField.locator('input');
    await expect(searchInput).toHaveValue('from:');

    // No chip should render for incomplete filter
    const incompleteChip = page.getByRole('button', { name: /^from:$/i });
    await expect(incompleteChip).not.toBeVisible({ timeout: 2000 });
  });
});
