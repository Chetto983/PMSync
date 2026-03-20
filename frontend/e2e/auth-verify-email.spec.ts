import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Verify Email', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('shows resend form when no token', async ({ page }) => {
    await page.goto('/auth/verify-email', { waitUntil: 'domcontentloaded' });

    // No token -- page shows resend form with email input and send button
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /send verification email/i }),
    ).toBeVisible();
  });

  test('shows error for invalid token', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');

    await page.goto('/auth/verify-email?token=invalid-token', {
      waitUntil: 'domcontentloaded',
    });

    // Should show error state with XCircle icon or error message
    await expect(
      page.getByText(/verification failed|link may have expired/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('resend form accepts email input', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');

    await page.goto('/auth/verify-email', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/email/i).fill('test@pmsync.local');
    await page.getByRole('button', { name: /send verification email/i }).click();

    // After submission, success message appears (silently succeeds to prevent enumeration)
    await expect(
      page.getByRole('alert').filter({ hasText: /verification link has been sent|verification email/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
