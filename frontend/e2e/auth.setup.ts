/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Uses better-auth session cookie (httpOnly).
 */

import { test as setup, expect } from '@playwright/test';
import { injectAuthCookie } from './fixtures';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Inject better-auth session cookie for auth
  await injectAuthCookie(page.context(), 'test-session-token');

  // Pre-accept cookie consent to avoid modal blocking UI
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });

  // Catch-all for any API call during auth setup to prevent network errors
  await page.route('**/localhost:3000/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // Navigate to trigger session check
  await page.goto('/');

  // Verify auth cookie was set via context cookies
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name === 'better-auth.session_token');
  expect(authCookie).toBeDefined();
  expect(authCookie!.value).toBe('test-session-token');

  // Save auth state for other tests
  await page.context().storageState({ path: authFile });
});
