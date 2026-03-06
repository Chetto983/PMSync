/**
 * Visual Regression Tests - God File Splits
 *
 * Golden baseline screenshots for all 6 pages affected by the
 * frontend god-file split refactoring (Phase 44).
 *
 * Run with --update-snapshots to generate/refresh baselines:
 *   E2E_NO_WEB_SERVER=1 npx playwright test e2e/visual-regression-splits.spec.ts --project=chromium --update-snapshots
 */

import { test, expect, Page } from '@playwright/test';

// Skip auth setup project -- all auth endpoints are mocked
test.use({
  storageState: undefined,
  viewport: { width: 1440, height: 900 },
});

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.005 } as const;

/**
 * Mock all backend API routes so pages render without a running server.
 */
async function mockAllAPIs(page: Page): Promise<void> {
  // Auth
  await page.route('**/localhost:3000/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u1',
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        tenantId: 't1',
      }),
    }),
  );

  // Providers
  await page.route('**/localhost:3000/providers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );

  // Billing
  await page.route('**/localhost:3000/billing**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'free',
        usage: { percentEmailUsed: 0, percentAIUsed: 0 },
      }),
    }),
  );

  // Catch-all for any other backend calls
  await page.route('**/localhost:3000/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

/**
 * Dismiss cookie consent banner if present (best-effort).
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  try {
    await page.locator('button:has-text("Accetta tutti")').click({ timeout: 3000 });
  } catch {
    /* no banner -- continue */
  }
}

test.describe('Visual Regression - God File Splits', () => {
  test('dashboard page', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto('/dashboard');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard.png', SCREENSHOT_OPTS);
  });

  test('calendar page', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto('/dashboard/calendar');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('calendar.png', SCREENSHOT_OPTS);
  });

  test('contacts page', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto('/dashboard/contacts');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('contacts.png', SCREENSHOT_OPTS);
  });

  test('settings page', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto('/dashboard/settings');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('settings.png', SCREENSHOT_OPTS);
  });

  test('contact detail page', async ({ page }) => {
    await mockAllAPIs(page);
    // Mock a contact list so we can navigate to a detail view
    await page.route('**/localhost:3000/contacts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'c1',
              displayName: 'Jane Doe',
              email: 'jane@example.com',
              company: 'Acme',
            },
          ],
          total: 1,
          page: 1,
          limit: 25,
        }),
      }),
    );
    await page.goto('/dashboard/contacts');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');

    // Click first contact row if available, otherwise screenshot the list
    const firstContact = page.locator('[data-testid="contact-row"]').first();
    if (await firstContact.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstContact.click();
      await page.waitForLoadState('networkidle');
    }
    await expect(page).toHaveScreenshot('contact-detail.png', SCREENSHOT_OPTS);
  });

  test('header component', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto('/dashboard');
    await dismissCookieBanner(page);
    await page.waitForLoadState('networkidle');

    const header = page.locator('header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
    await expect(header).toHaveScreenshot('header.png', SCREENSHOT_OPTS);
  });
});
