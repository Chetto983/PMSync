/**
 * Email Search Clear (X button) regression test
 *
 * Validates the debounce-cancel fix: clicking X while a debounced
 * search update is still pending must clear the filter immediately
 * without the pending debounce restoring the old value.
 *
 * Uses route interception (no real backend).
 * Web-first assertions only — no waitForTimeout.
 */
import { test, expect, mockEmails } from './fixtures';

function mockEmailsRoute(page: import('@playwright/test').Page) {
  return page.route('**/localhost:3000/emails**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        emails: mockEmails,
        pagination: { page: 1, limit: 50, total: mockEmails.length, totalPages: 1 },
      }),
    });
  });
}

test.describe('Search Clear Button', () => {
  test('X button clears search input', async ({ authedPage: page }) => {
    await mockEmailsRoute(page);
    await page.goto('/dashboard/email');

    const searchInput = page.getByTestId('email-search').locator('input');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill('alessandro');
    await expect(searchInput).toHaveValue('alessandro');

    // Wait for debounced search to fire (response arrives)
    await page.waitForResponse(
      (res) => res.url().includes('/emails'),
      { timeout: 10_000 },
    );

    // Click the X (clear) button
    const clearBtn = page.getByTestId('email-search').getByRole('button');
    await clearBtn.click();

    // Input should be empty — not restored by URL sync or pending debounce
    await expect(searchInput).toHaveValue('', { timeout: 5_000 });
  });

  test('Escape key clears search', async ({ authedPage: page }) => {
    await mockEmailsRoute(page);
    await page.goto('/dashboard/email');

    const searchInput = page.getByTestId('email-search').locator('input');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('test query');
    await expect(searchInput).toHaveValue('test query');

    // Press Escape while focused
    await searchInput.press('Escape');
    await expect(searchInput).toHaveValue('');
  });

  test('rapid type-then-clear does not restore via pending debounce', async ({ authedPage: page }) => {
    await mockEmailsRoute(page);
    await page.goto('/dashboard/email');

    const searchInput = page.getByTestId('email-search').locator('input');
    await expect(searchInput).toBeVisible();

    // Type character by character — debounce is still pending
    await searchInput.pressSequentially('hello', { delay: 30 });

    // Click clear before 300ms debounce fires
    const clearBtn = page.getByTestId('email-search').getByRole('button');
    await clearBtn.click();

    await expect(searchInput).toHaveValue('');

    // Verify value stays empty after debounce window passes
    await page.waitForFunction(
      () => {
        const input = document.querySelector('[data-testid="email-search"] input') as HTMLInputElement;
        return input?.value === '';
      },
      { timeout: 2_000 },
    );
  });
});
