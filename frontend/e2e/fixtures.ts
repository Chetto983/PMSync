/**
 * Playwright E2E Test Fixtures
 *
 * Minimal shared utilities for E2E tests:
 * - injectAuthCookie: sets better-auth session cookie on a browser context
 * - expect: re-exported from @playwright/test for convenience
 */

import { BrowserContext } from '@playwright/test';

/**
 * Inject better-auth session cookie for E2E test authentication.
 */
export async function injectAuthCookie(context: BrowserContext, token: string) {
  await context.addCookies([{
    name: 'better-auth.session_token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false, // localhost in test
  }]);
}

export { expect } from '@playwright/test';
