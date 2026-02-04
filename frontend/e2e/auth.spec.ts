/**
 * Authentication E2E Tests
 *
 * Tests for auth flows:
 * - Login form display and validation
 * - Logout flow from authenticated state
 */

import { test as base, Page, expect } from '@playwright/test';
import { test as authTest, expect as authExpect, mockEmails, mockFolders, mockUser } from './fixtures';

// Override storage state for login tests - we manage our own auth state
base.use({ storageState: { cookies: [], origins: [] } });

// Extend base test with login page fixture (unauthenticated)
const loginTest = base.extend<{ loginPage: Page }>({
  loginPage: async ({ page }, use) => {
    // Mock login API endpoint - paths match apiClient baseURL (localhost:3000)
    // Use specific host to avoid matching frontend page routes
    await page.route('**/localhost:3000/auth/login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      // Simulate successful login
      if (postData?.email === 'user@test.com' && postData?.password === 'password123') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: 'test-jwt-token',
            user: mockUser,
          }),
        });
      } else {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid credentials' }),
        });
      }
    });

    // Mock auth/me for dashboard redirect check
    await page.route('**/localhost:3000/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    // Mock email endpoints for dashboard
    await page.route('**/localhost:3000/emails?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: mockEmails, total: mockEmails.length }),
      });
    });

    await page.route('**/localhost:3000/emails', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: mockEmails, total: mockEmails.length }),
      });
    });

    await page.route('**/localhost:3000/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFolders),
      });
    });

    await page.route('**/localhost:3000/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    await page.route('**/localhost:3000/voltagent/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actions: [], total: 0 }),
      });
    });

    await page.route('**/localhost:3000/contacts/sender-photos**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
    await use(page);
  },
});

loginTest.describe('Authentication - Login Flow', () => {
  loginTest('displays login form correctly', async ({ loginPage }) => {
    await loginPage.goto('/auth/login');

    // Check page form is visible
    await expect(loginPage.locator('form')).toBeVisible();

    // Check email input exists
    const emailInput = loginPage.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible();

    // Check password input exists
    const passwordInput = loginPage.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Check submit button exists (use exact match to avoid "Sign in with Passkey")
    const submitButton = loginPage.getByRole('button', { name: 'Sign in', exact: true });
    await expect(submitButton).toBeVisible();
  });

  loginTest('shows error on invalid credentials', async ({ loginPage }) => {
    await loginPage.goto('/auth/login');

    // Fill with wrong credentials
    const emailInput = loginPage.getByRole('textbox', { name: /email/i });
    await emailInput.fill('wrong@test.com');

    const passwordInput = loginPage.locator('input[type="password"]');
    await passwordInput.fill('wrongpassword');

    // Click sign in
    const submitButton = loginPage.locator('button[type="submit"]');
    await submitButton.click();

    // Should show error message
    const errorAlert = loginPage.locator('.MuiAlert-root[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
  });

  loginTest('shows validation error for short password', async ({ loginPage }) => {
    await loginPage.goto('/auth/login');

    // Fill with short password
    const emailInput = loginPage.getByRole('textbox', { name: /email/i });
    await emailInput.fill('user@test.com');

    const passwordInput = loginPage.locator('input[type="password"]');
    await passwordInput.fill('short'); // Less than 8 chars

    // Click sign in
    const submitButton = loginPage.locator('button[type="submit"]');
    await submitButton.click();

    // Should show validation error
    const errorAlert = loginPage.locator('.MuiAlert-root[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
  });
});

// Use the working authTest fixture for logout tests
authTest.describe('Authentication - Logout Flow', () => {
  authTest('logout clears session and redirects to login', async ({ authedPage }) => {
    // Navigate to email dashboard
    await authedPage.goto('/dashboard/email');

    // Wait for AppBar (header) to load - more reliable than thread list
    await authedPage.waitForSelector('header.MuiAppBar-root', { timeout: 15000 });

    // Find and click user avatar button (the last button with an avatar)
    const userMenuButton = authedPage.locator('button').filter({ has: authedPage.locator('.MuiAvatar-root') }).last();
    await authExpect(userMenuButton).toBeVisible();
    await userMenuButton.click();

    // Wait for menu to appear
    const menu = authedPage.getByRole('menu');
    await authExpect(menu).toBeVisible();

    // Click logout menu item
    const logoutItem = authedPage.getByRole('menuitem', { name: /logout|esci/i });
    await logoutItem.click();

    // Should redirect to login page
    await authedPage.waitForURL(/\/auth\/login/, { timeout: 15000 });
    expect(authedPage.url()).toContain('/auth/login');
  });

  authTest('user menu shows user info', async ({ authedPage }) => {
    await authedPage.goto('/dashboard/email');

    // Wait for AppBar (header) to load
    await authedPage.waitForSelector('header.MuiAppBar-root', { timeout: 15000 });

    // Open user menu
    const userMenuButton = authedPage.locator('button').filter({ has: authedPage.locator('.MuiAvatar-root') }).last();
    await authExpect(userMenuButton).toBeVisible();
    await userMenuButton.click();

    // Should show user email in menu
    await authExpect(authedPage.getByText('user@test.com')).toBeVisible();
  });
});

export { loginTest, authTest };
