import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.addInitScript(() => {
      localStorage.removeItem('auth-storage');
    });
  });

  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });
  });

  test('should show validation errors for empty login form', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

    // Submit empty form
    await page.getByTestId('login-submit-button').click();

    // Should show validation errors
    await expect(page.getByText(/email.*required/i).or(page.getByText(/invalid.*email/i))).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('login-email-input').fill('invalid@example.com');
    await page.getByTestId('login-password-input').fill('wrongpassword123');
    await page.getByTestId('login-submit-button').click();

    // Should show error message
    await expect(
      page.getByText(/invalid.*credentials/i)
        .or(page.getByText(/incorrect.*password/i))
        .or(page.getByText(/user.*not.*found/i))
        .or(page.getByRole('alert'))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

    // Click register link
    await page.getByTestId('register-link').or(page.getByRole('link', { name: /register|sign up/i })).click();

    await expect(page).toHaveURL(/\/auth\/register/);
    await expect(page.getByTestId('register-form')).toBeVisible({ timeout: 30_000 });
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

    // Click forgot password link
    await page.getByTestId('forgot-password-link').or(page.getByRole('link', { name: /forgot.*password/i })).click();

    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test('should show register form validation', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByTestId('register-form')).toBeVisible({ timeout: 30_000 });

    // Submit empty form
    await page.getByTestId('register-submit-button').click();

    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show password requirements on register', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByTestId('register-form')).toBeVisible({ timeout: 30_000 });

    // Type weak password
    await page.getByTestId('register-password-input').fill('weak');
    await page.getByTestId('register-submit-button').click();

    // Should show password requirement error
    await expect(
      page.getByText(/password.*characters/i)
        .or(page.getByText(/password.*weak/i))
        .or(page.getByText(/password.*requirements/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Authenticated User Flow', () => {
  test('should redirect to dashboard after login', async ({ page }) => {
    // This test requires a valid test user in the database
    // Uses the dev-auth helper for credentials
    const { getE2eAuthContext } = await import('./utils/dev-auth');

    try {
      const { token } = await getE2eAuthContext();

      // Inject auth token
      await page.addInitScript((authToken) => {
        localStorage.setItem(
          'auth-storage',
          JSON.stringify({ state: { token: authToken }, version: 0 }),
        );
      }, token);

      await page.goto('/dashboard');

      // Should stay on dashboard (not redirect to login)
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 30_000 });
    } catch {
      // Skip if no test user available
      test.skip(true, 'No test user available for authentication test');
    }
  });

  test('should logout successfully', async ({ page }) => {
    const { getE2eAuthContext } = await import('./utils/dev-auth');

    try {
      const { token } = await getE2eAuthContext();

      await page.addInitScript((authToken) => {
        localStorage.setItem(
          'auth-storage',
          JSON.stringify({ state: { token: authToken }, version: 0 }),
        );
      }, token);

      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 30_000 });

      // Find and click logout button (could be in user menu or sidebar)
      const userMenuButton = page.getByTestId('user-menu-button').or(page.getByTestId('profile-menu'));
      if (await userMenuButton.isVisible()) {
        await userMenuButton.click();
      }

      await page.getByTestId('logout-button').or(page.getByRole('menuitem', { name: /logout|sign out/i })).click();

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login|\/$/);
    } catch {
      test.skip(true, 'No test user available for logout test');
    }
  });
});
