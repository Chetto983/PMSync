/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Uses httpOnly cookie injection (Phase 34 -- no localStorage token).
 */

import { test as setup, expect } from '@playwright/test';
import { injectAuthCookie } from './fixtures';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Inject httpOnly access_token cookie for auth (Phase 34)
  await injectAuthCookie(page.context(), 'test-jwt-token');

  // Pre-accept cookie consent to avoid modal blocking UI
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });

  // Mock essential API endpoints for auth (matches User interface in auth-store.ts)
  // Path matches apiClient baseURL (localhost:3000) - use specific host to avoid matching frontend page routes
  await page.route('**/localhost:3000/auth/me', (route) => {
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

  // Catch-all for any API call during auth setup to prevent network errors
  await page.route('**/localhost:3000/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // Navigate to trigger auth check via /auth/me
  await page.goto('/');

  // Verify auth cookie was set via context cookies
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name === 'access_token');
  expect(authCookie).toBeDefined();
  expect(authCookie!.value).toBe('test-jwt-token');

  // Save auth state for other tests
  await page.context().storageState({ path: authFile });
});
