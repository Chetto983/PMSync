/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Authenticates through the real login flow so the frontend test suite stays
 * isolated from backend source imports and direct database access.
 */

import { expect, test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';
const TEST_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@pmsync.local';
const TEST_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'TestPassword123!';

setup('authenticate', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });

  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"], input[type="email"]', TEST_USER_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
