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

  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });

  // If user hasn't completed onboarding, fast-complete via proxied API + cookie
  if (page.url().includes('/onboarding')) {
    // Fetch CSRF token (required for POST requests)
    const csrfResp = await page.request.get('/api/v1/auth/csrf-token');
    const csrfData = await csrfResp.json();
    const csrfToken = csrfData.csrfToken ?? '';

    const postHeaders = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    };

    // 1. Provision workspace (creates tenant if missing)
    const wsResp = await page.request.post('/api/v1/onboarding/provision-workspace', {
      headers: postHeaders,
      data: { workspaceName: 'E2E Workspace' },
    });
    console.log(`provision-workspace: ${wsResp.status()}`);

    // 2. Mark onboarding complete
    const compResp = await page.request.post('/api/v1/onboarding/complete', {
      headers: postHeaders,
    });
    console.log(`onboarding-complete: ${compResp.status()}`);

    // 3. Set the middleware cookie so the redirect check is skipped
    await page.evaluate(() => {
      document.cookie =
        'pmsync:onboarding-complete=1; path=/; max-age=31536000; SameSite=Lax';
    });

    // Verify cookie was set
    const cookies = await page.context().cookies();
    const obCookie = cookies.find((c) => c.name === 'pmsync:onboarding-complete');
    console.log(`onboarding cookie set: ${!!obCookie}, value: ${obCookie?.value}`);

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    console.log(`after goto /dashboard, URL is: ${page.url()}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
