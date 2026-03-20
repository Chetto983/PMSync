import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Reset Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('shows error when no token provided', async ({ page }) => {
    await page.goto('/auth/reset-password', { waitUntil: 'domcontentloaded' });

    // Submit the form without a token -- the page shows password fields but submit
    // triggers "Missing reset token" error
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('NewPassword123!');
    await passwordInputs.nth(1).fill('NewPassword123!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(
      page.locator('[role="alert"].MuiAlert-colorError'),
    ).toBeVisible();
    await expect(page.getByText(/missing reset token/i)).toBeVisible();
  });

  test('shows error for invalid token', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');

    await page.goto('/auth/reset-password?token=invalid-token-abc', {
      waitUntil: 'domcontentloaded',
    });

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('NewPassword123!');
    await passwordInputs.nth(1).fill('NewPassword123!');
    await page.getByRole('button', { name: /update password/i }).click();

    // API returns error for invalid token
    await expect(
      page.locator('[role="alert"].MuiAlert-colorError'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('renders password fields when token present', async ({ page }) => {
    await page.goto('/auth/reset-password?token=some-token', {
      waitUntil: 'domcontentloaded',
    });

    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(2);
    await expect(page.getByRole('button', { name: /update password/i })).toBeVisible();
  });

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/auth/reset-password?token=some-token', {
      waitUntil: 'domcontentloaded',
    });

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('NewPassword123!');
    await passwordInputs.nth(1).fill('DifferentPassword456!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: /passwords do not match/i }),
    ).toBeVisible();
  });
});
