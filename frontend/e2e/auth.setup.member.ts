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

  await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
  await page.fill('input[name="email"], input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });

  // If middleware redirected to /onboarding (missing cookie), set the cookie
  // and navigate to /dashboard. The member user has onboardingComplete: true
  // in the DB, so the middleware cookie is the only gate.
  if (page.url().includes('/onboarding')) {
    const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
    const cookieDomain = new URL(baseURL).hostname;
    await page.context().addCookies([
      {
        name: 'pmsync:onboarding-complete',
        value: '1',
        domain: cookieDomain,
        path: '/',
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 31536000,
      },
    ]);

    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    } catch {
      // Navigation aborted -- page may already be redirecting
    }
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
