import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Register', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('renders registration form', async ({ page }) => {
    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Password fields (two input[type="password"])
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(2);
    // Terms checkbox
    await expect(page.getByRole('checkbox')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('submit disabled until all fields filled and terms checked', async ({ page }) => {
    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    const submitBtn = page.getByRole('button', { name: /create account/i });
    const passwordField = page.locator('input[type="password"]').first();
    const confirmField = page.locator('input[type="password"]').nth(1);

    // Initially disabled
    await expect(submitBtn).toBeDisabled();

    // Fill fields progressively
    await page.getByLabel(/first name/i).fill('Test');
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel(/last name/i).fill('User');
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel(/email/i).fill('test@example.com');
    await expect(submitBtn).toBeDisabled();

    await passwordField.fill('TestPassword123!');
    await expect(submitBtn).toBeDisabled();

    await confirmField.fill('TestPassword123!');
    await expect(submitBtn).toBeDisabled();

    // Check terms
    await page.getByRole('checkbox').check();
    await expect(submitBtn).toBeEnabled();
  });

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/first name/i).fill('Test');
    await page.getByLabel(/last name/i).fill('User');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.locator('input[type="password"]').first().fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('DifferentPass456!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByRole('alert').filter({ hasText: /passwords do not match/i })).toBeVisible();
  });

  test('shows error for weak password', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable -- skipping weak password test');

    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/first name/i).fill('Weak');
    await page.getByLabel(/last name/i).fill('Pass');
    await page.getByLabel(/email/i).fill(`test+weak+${Date.now()}@pmsync.local`);
    await page.locator('input[type="password"]').first().fill('123');
    await page.locator('input[type="password"]').nth(1).fill('123');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.locator('.MuiAlert-colorError')).toBeVisible({ timeout: 15_000 });
  });

  test('successful registration shows verification pending', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable -- skipping registration test');
    const timestamp = Date.now();
    const testEmail = `test+${timestamp}@pmsync.local`;

    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/first name/i).fill('Test');
    await page.getByLabel(/last name/i).fill('User');
    await page.getByLabel(/email/i).fill(testEmail);
    await page.locator('input[type="password"]').first().fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('TestPassword123!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    // Should show verification pending UI
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });
  });

  test('shows resend verification button after registration', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable -- skipping registration test');
    const timestamp = Date.now();
    const testEmail = `test+resend+${timestamp}@pmsync.local`;

    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });

    await page.getByLabel(/first name/i).fill('Resend');
    await page.getByLabel(/last name/i).fill('Test');
    await page.getByLabel(/email/i).fill(testEmail);
    await page.locator('input[type="password"]').first().fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('TestPassword123!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /resend verification email/i }),
    ).toBeVisible();
  });
});
