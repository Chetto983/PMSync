/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Uses mocked authentication pattern (localStorage token + API mocking).
 */

import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Mock authentication - use Zustand persist format for auth-storage
  // The app uses zustand persist middleware with name: 'auth-storage'
  await page.addInitScript(() => {
    // Zustand persist format: { state: { token, ... }, version: 0 }
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { token: 'test-jwt-token' },
        version: 0,
      })
    );
    // Also set auth-token cookie for API routes that read from cookie
    document.cookie = 'auth-token=test-jwt-token; path=/; SameSite=Lax';
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

  // Verify auth was set (check zustand persist format)
  const authStorage = await page.evaluate(() => localStorage.getItem('auth-storage'));
  expect(authStorage).toContain('test-jwt-token');

  // Save auth state for other tests
  await page.context().storageState({ path: authFile });
});
