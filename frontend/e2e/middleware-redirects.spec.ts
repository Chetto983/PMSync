/**
 * Middleware Redirect E2E Tests
 *
 * Validates that Next.js middleware correctly:
 * - Redirects unauthenticated users from protected routes to /auth/login with returnTo
 * - Redirects authenticated users from /auth/login to /dashboard
 * - Prevents content flash on protected route redirects
 */

import { test as base, expect } from '@playwright/test';
import { injectAuthCookie } from './fixtures';

const baseUrl = process.env.E2E_STAGING_URL || '';

// --- Unauthenticated tests (no session cookie) ---

const unauthTest = base.extend({});
unauthTest.use({ storageState: { cookies: [], origins: [] } });

unauthTest.describe('Middleware redirects - unauthenticated', () => {
  unauthTest(
    'unauthenticated /dashboard redirects to /auth/login with returnTo',
    async ({ page }) => {
      await page.goto(`${baseUrl}/dashboard`);
      await page.waitForURL(/\/auth\/login/);

      const url = new URL(page.url());
      expect(url.pathname).toBe('/auth/login');
      expect(url.searchParams.get('returnTo')).toBe('/dashboard');
    },
  );

  unauthTest(
    'unauthenticated /onboarding redirects to /auth/login with returnTo',
    async ({ page }) => {
      await page.goto(`${baseUrl}/onboarding`);
      await page.waitForURL(/\/auth\/login/);

      const url = new URL(page.url());
      expect(url.pathname).toBe('/auth/login');
      expect(url.searchParams.get('returnTo')).toBe('/onboarding');
    },
  );

  unauthTest(
    'no content flash on protected route redirect',
    async ({ page }) => {
      // Navigate to /dashboard -- middleware should redirect server-side (307)
      // so no dashboard content ever renders
      await page.goto(`${baseUrl}/dashboard`);
      await page.waitForURL(/\/auth\/login/);

      // Dashboard-specific content should never have appeared
      const dashboardContent = page.locator('[data-testid="dashboard"]');
      await expect(dashboardContent).toHaveCount(0);
    },
  );
});

// --- Authenticated test (session cookie present) ---

const authTest = base.extend({});

authTest.describe('Middleware redirects - authenticated', () => {
  authTest(
    'authenticated /auth/login redirects to /dashboard',
    async ({ page, context }) => {
      // Inject better-auth session cookie + onboarding cookie
      await injectAuthCookie(context, 'test-session-token');
      await context.addCookies([
        {
          name: 'pmsync:onboarding-complete',
          value: '1',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.goto(`${baseUrl}/auth/login`);
      await page.waitForURL(/\/dashboard/);

      const url = new URL(page.url());
      expect(url.pathname).toContain('/dashboard');
    },
  );
});
