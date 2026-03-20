import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('renders forgot password form', async ({ page }) => {
    await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });

  test('successful submission shows confirmation', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');
    await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/email/i).fill('admin@pmsync.local');
    await page.getByRole('button', { name: /send reset link/i }).click();

    // Success state shows CheckCircleOutline icon and back to login link
    await expect(page.getByRole('link', { name: /login|sign in/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('back to login link works', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');
    await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/email/i).fill('admin@pmsync.local');
    await page.getByRole('button', { name: /send reset link/i }).click();

    // Wait for success state
    const backLink = page.getByRole('link', { name: /login|sign in/i });
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await backLink.click();

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('submit button disabled for empty email', async ({ page }) => {
    await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });
});
