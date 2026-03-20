import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('renders login page with form fields', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('renders social login buttons', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/email/i).fill('invalid@test.com');
    await page.locator('input[type="password"]').fill('WrongPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Error shown: either "Invalid credentials" or "No account was found"
    await expect(
      page.locator('[role="alert"].MuiAlert-colorError'),
    ).toBeVisible();
  });

  test('submit button disabled when fields empty', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    // This test requires a running backend with auth API
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable -- skipping login test');

    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/email/i).fill('admin@pmsync.local');
    await page.locator('input[type="password"]').fill('TestPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  });

  test('forgot password link navigates correctly', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: /forgot/i }).click();

    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test('register link navigates correctly', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    // The footer link in AuthLayout links to register
    await page.getByRole('link', { name: /create|sign up|register/i }).click();

    await expect(page).toHaveURL(/\/auth\/register/);
  });
});
