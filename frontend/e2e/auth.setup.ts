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
    // Use context.addCookies() instead of page.evaluate to avoid
    // "Execution context was destroyed" errors from mid-navigation pages
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

    // Verify cookie was set
    const cookies = await page.context().cookies();
    const obCookie = cookies.find((c) => c.name === 'pmsync:onboarding-complete');
    console.log(`onboarding cookie set: ${!!obCookie}, value: ${obCookie?.value}`);

    // Wait for either the onboarding page to auto-redirect to dashboard,
    // or navigate there explicitly. Use try/catch because goto may ERR_ABORT
    // if the page is already mid-navigation from the onboarding redirect.
    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    } catch {
      // Navigation aborted -- page is likely already redirecting to dashboard
    }
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    console.log(`after goto /dashboard, URL is: ${page.url()}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
