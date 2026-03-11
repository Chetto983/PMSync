/**
 * Member Authentication Setup Project
 *
 * Creates reusable storageState for tests that require a second (non-admin) user.
 * Authenticates through the real login flow so the frontend test suite stays
 * isolated from backend source imports and direct database access.
 */

import { expect, test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/member.json';
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'member@pmsync.local';
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD ?? 'MemberPassword123!';

setup('authenticate as member', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });

  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"], input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
