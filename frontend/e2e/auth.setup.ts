/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Uses mocked authentication pattern (localStorage token + API mocking).
 */

import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Mock authentication - mirror the pattern from fixtures.ts
  await page.addInitScript(() => {
    localStorage.setItem('auth-token', 'test-jwt-token');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
        email: 'user@test.com',
        name: 'Test User',
      })
    );
  });

  // Mock essential API endpoints for auth
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        email: 'user@test.com',
        name: 'Test User',
      }),
    });
  });

  // Navigate to trigger localStorage population
  await page.goto('/');

  // Verify auth was set
  const token = await page.evaluate(() => localStorage.getItem('auth-token'));
  expect(token).toBe('test-jwt-token');

  // Save auth state for other tests
  await page.context().storageState({ path: authFile });
});
